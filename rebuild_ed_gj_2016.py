#!/usr/bin/env python3
"""
Rebuild ED_GJ_2016.js using Shapely union/dissolve.
KEY FIX: TopoJSON arc index ~idx (bitwise NOT) for negative indices,
         NOT abs(idx) which was off-by-one and caused streak artifacts.
"""
import csv, json, os, re
from collections import defaultdict
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.validation import make_valid

BASEDIR = os.path.dirname(os.path.abspath(__file__))
HTMLFILE = f'{BASEDIR}/test.html'
VD_FILE  = f'{BASEDIR}/data_vd_v64.js'
OUTFILE  = f'{BASEDIR}/ED_GJ_2016.js'
CSVDIR   = f'{BASEDIR}/votedata/votedata/voteData/2016總統立委/區域立委'

MIN_AREA = 0.005  # only reject microscopic degenerate slivers

# ── Step 0: Load ED_2016 district names ──────────────────────────────────────
print("== Step 0: Load ED_2016 district name keys ==")
with open(HTMLFILE, encoding='utf-8') as f:
    html = f.read()
idx = html.find('const ED_2016 = {')
block = html[idx:idx+50000]
ed2016_keys = set(re.findall(r'"([^"]+選舉區)"\s*:', block))
print(f"  Found {len(ed2016_keys)} keys")

cec_to_ed2016 = {}
for k in ed2016_keys:
    simple = k.replace('選舉區', '選區')
    cec = re.sub(r'第(\d+)', lambda m: f'第{int(m.group(1)):02d}', simple) if '第' in simple else simple
    cec_to_ed2016[cec] = k
for k in ed2016_keys:
    if '第' not in k:
        cec_to_ed2016[k.replace('選舉區', '') + '第01選區'] = k

def norm(name):
    return cec_to_ed2016.get(name, name)

# ── Step 1: Village → district mapping ───────────────────────────────────────
print("== Step 1: village → district mapping ==")
dist_names = {}
with open(f'{CSVDIR}/elbase_T1.csv', encoding='utf-8-sig') as f:
    for row in csv.reader(f):
        c = [x.strip('"') for x in row]
        if len(c) < 6: continue
        if c[3]=='000' and c[4]=='0000' and '選區' in c[5]:
            dist_names[(c[0],c[1],c[2])] = norm(c[5])

village_dist = {}
with open(f'{CSVDIR}/elbase_T1.csv', encoding='utf-8-sig') as f:
    for row in csv.reader(f):
        c = [x.strip('"') for x in row]
        if len(c) < 6: continue
        if c[2]=='00' or c[3]=='000': continue
        key = (c[0],c[1],c[3],c[4][-3:])
        if key not in village_dist:
            village_dist[key] = c[2]

vc_to_ed = {}
for (pr,cg,town,vc_vill), dno in village_dist.items():
    vc = pr+cg+town+vc_vill
    if len(vc) != 11: continue
    dn = dist_names.get((pr,cg,dno))
    if dn: vc_to_ed[vc] = dn
print(f"  {len(vc_to_ed)} village→district mappings (direct)")

# Town-level fallback: villages created after 2016 can be mapped
# by their town code if all other villages in that town belong to one district
town_to_ed = {}
from collections import Counter
tc_eds = {}
for vc, ed in vc_to_ed.items():
    t = vc[:8]
    tc_eds.setdefault(t, set()).add(ed)
for t, eds in tc_eds.items():
    if len(eds) == 1:
        town_to_ed[t] = list(eds)[0]
print(f"  {len(town_to_ed)} unambiguous town→district mappings for fallback")

# Hardcoded overrides for post-2016 villages in split towns (spatial lookup result)
HARDCODED = {
    '68000010077': '桃園市第4選舉區',   # 大樹里(桃園區) — user confirmed 第4
    '68000010078': '桃園市第1選舉區',   # 大業里(桃園區) — per 2020+2024 data
    '68000010079': '桃園市第1選舉區',   # 福元里(桃園區) — per VC_ED
}

# ── Step 2: Load VD and decode arcs ──────────────────────────────────────────
print("== Step 2: Load VD and decode arcs ==")
with open(VD_FILE, encoding='utf-8') as f:
    content = f.read()

s = content.find('const VD = ') + len('const VD = ')
depth = 0
for i in range(s, len(content)):
    if content[i] == '{': depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0: i += 1; break
vd = json.loads(content[s:i])

sx, sy = vd['transform']['scale']
tx, ty = vd['transform']['translate']
print(f"  scale: [{sx:.7f}, {sy:.7f}]  translate: [{tx:.2f}, {ty:.2f}]")

geoms = None
for key, obj in vd.get('objects', {}).items():
    if 'geometries' in obj:
        geoms = obj['geometries']
        print(f"  {len(geoms)} VD village geometries")
        break

# Decode arcs: delta accumulate then apply scale+translate
raw_arcs = vd['arcs']
decoded = []
for arc in raw_arcs:
    pts = []; qx = qy = 0
    for dx, dy in arc:
        qx += dx; qy += dy
        pts.append([qx*sx+tx, qy*sy+ty])
    decoded.append(pts)
print(f"  Decoded {len(decoded)} arcs")

def ring_from(arc_indices):
    """
    CORRECT TopoJSON arc index mapping:
      positive idx  → decoded[idx]  forward
      negative idx  → decoded[~idx] reversed   (~idx == -idx-1)
    WRONG (original bug): decoded[abs(idx)]  → off-by-one for all negative indices
    """
    coords = []
    for idx in arc_indices:
        arc_i = idx if idx >= 0 else ~idx   # ~(-1)=0, ~(-2)=1, ~(-3)=2 …
        pts = decoded[arc_i]
        path = pts[::-1] if idx < 0 else pts
        if coords and path and path[0] == coords[-1]:
            coords.extend(path[1:])
        else:
            coords.extend(path)
    return coords

def make_poly(rings):
    if not rings or len(rings[0]) < 3:
        return None
    try:
        p = Polygon(rings[0], rings[1:] if len(rings) > 1 else [])
        if p.is_empty: return None
        if not p.is_valid:
            p = make_valid(p)
        # make_valid may return GeometryCollection; keep polygon parts only
        if p.geom_type == 'GeometryCollection':
            parts = [g for g in p.geoms if 'Polygon' in g.geom_type]
            p = unary_union(parts) if parts else None
        return p if p and not p.is_empty else None
    except Exception:
        return None

def clean(geom):
    """Remove slivers smaller than MIN_AREA."""
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == 'Polygon':
        return geom if geom.area >= MIN_AREA else None
    if geom.geom_type == 'MultiPolygon':
        kept = [g for g in geom.geoms if g.area >= MIN_AREA]
        if not kept: return None
        return kept[0] if len(kept) == 1 else MultiPolygon(kept)
    return geom

def split_artifacts(ed_name, geom, artifact_area_thresh=3.0, dist_thresh=1.0):
    """Return (main_geom, artifact_parts).
    Artifact parts = small MultiPolygon pieces adjacent to the main body
    (remnants of village boundary splits between election years).
    These should be re-assigned to neighboring districts instead of removed.
    """
    if geom is None or geom.geom_type != 'MultiPolygon':
        return geom, []
    parts = list(geom.geoms)
    main = max(parts, key=lambda g: g.area)
    keep, artifacts = [main], []
    for part in parts:
        if part is main: continue
        if part.area < artifact_area_thresh and main.distance(part) <= dist_thresh:
            artifacts.append(part)
        else:
            keep.append(part)
    main_geom = keep[0] if len(keep) == 1 else MultiPolygon(keep)
    return main_geom, artifacts

# ── Step 3: Group village polygons by district ────────────────────────────────
print("== Step 3: Group village polygons by district ==")
dist_polys = defaultdict(list)
# Track HARDCODED village polygons separately for overlap resolution
hardcoded_polys = defaultdict(list)  # ed_name → [shapely polys for HARDCODED vcs only]
matched = unmatched = no_geom = 0

for g in geoms:
    vc = g.get('properties', {}).get('vc', '')
    if not vc:
        unmatched += 1; continue
    is_hardcoded = vc in HARDCODED
    if is_hardcoded:
        ed_name = HARDCODED[vc]
    elif vc in vc_to_ed:
        ed_name = vc_to_ed[vc]
    elif vc[:8] in town_to_ed:
        ed_name = town_to_ed[vc[:8]]
    else:
        unmatched += 1; continue
    gtype   = g.get('type', '')
    arcs_list = g.get('arcs', [])
    added = 0
    try:
        if gtype == 'Polygon':
            p = make_poly([ring_from(r) for r in arcs_list])
            if p:
                dist_polys[ed_name].append(p); added += 1
                if is_hardcoded: hardcoded_polys[ed_name].append(p)
        elif gtype == 'MultiPolygon':
            for pa in arcs_list:
                p = make_poly([ring_from(r) for r in pa])
                if p:
                    dist_polys[ed_name].append(p); added += 1
                    if is_hardcoded: hardcoded_polys[ed_name].append(p)
    except Exception:
        pass
    if added: matched += 1
    else:     no_geom += 1

print(f"  Matched: {matched}, Unmatched: {unmatched}, No valid geom: {no_geom}")
print(f"  Districts: {len(dist_polys)}")

# ── Step 4: Dissolve per district ────────────────────────────────────────────
print("== Step 4: Union (dissolve) per district ==")
errors = []

def round_coords(obj):
    if isinstance(obj, list):
        if len(obj)==2 and all(isinstance(v,(int,float)) for v in obj):
            return [round(obj[0],4), round(obj[1],4)]
        return [round_coords(x) for x in obj]
    return obj

# First pass: dissolve each district
dissolved = {}   # ed_name → shapely geom

for ed_name in sorted(dist_polys.keys()):
    polys = dist_polys[ed_name]
    try:
        merged = unary_union(polys)
        if not merged.is_valid:
            merged = make_valid(merged)
        merged = clean(merged)
        if merged is None or merged.is_empty:
            errors.append(f"{ed_name}: empty after clean"); continue
        dissolved[ed_name] = merged
    except Exception as e:
        errors.append(f"{ed_name}: {e}")
        print(f"  ✗ {ed_name}: {e}")

# Second pass: subtract HARDCODED village areas from districts that shouldn't have them.
# When a new post-election village (HARDCODED) was carved out of an older village,
# the old village's polygon may still cover the new village's area, causing the old
# district's dissolved polygon to "bleed" into the new village's territory.
# Fix: for each district, remove any area claimed by HARDCODED villages in OTHER districts.
if hardcoded_polys:
    print(f"\n  Resolving HARDCODED village overlaps...")
    # Build subtraction mask per district: union of HARDCODED polys from OTHER districts
    for ed_name in list(dissolved.keys()):
        subtractors = []
        for other_ed, hpolys in hardcoded_polys.items():
            if other_ed != ed_name:
                subtractors.extend(hpolys)
        if not subtractors: continue
        mask = unary_union(subtractors)
        if not dissolved[ed_name].intersects(mask): continue
        try:
            trimmed = dissolved[ed_name].difference(mask)
            if not trimmed.is_valid:
                trimmed = make_valid(trimmed)
            trimmed = clean(trimmed)
            if trimmed and not trimmed.is_empty:
                overlap_area = dissolved[ed_name].intersection(mask).area
                if overlap_area > 0.001:
                    print(f"  [{ed_name}] trimmed overlap area={overlap_area:.3f}")
                dissolved[ed_name] = trimmed
        except Exception as e:
            print(f"  [{ed_name}] difference failed: {e}")

# Build final features
features = []
for ed_name in sorted(dissolved.keys()):
    geom = dissolved[ed_name]
    gj = dict(geom.__geo_interface__)
    gj['coordinates'] = round_coords(gj['coordinates'])
    features.append({'type':'Feature','properties':{'ed':ed_name},'geometry':gj})
    n = len(list(geom.geoms)) if geom.geom_type=='MultiPolygon' else 1
    print(f"  ✓ {ed_name}: {n} part(s)")

print(f"\n  Generated {len(features)} district features")
for e in errors: print(f"  ERROR: {e}")

# ── Step 5: Write output ──────────────────────────────────────────────────────
print("== Step 5: Write output ==")
fc  = {'type':'FeatureCollection','features':features}
out = 'const ED_GJ_2016 = ' + json.dumps(fc, ensure_ascii=False, separators=(',',':')) + ';\n'
with open(OUTFILE, 'w', encoding='utf-8') as f:
    f.write(out)
print(f"  Written {len(out)/1024/1024:.2f} MB to {OUTFILE}")

exp = set(ed2016_keys)
act = set(f['properties']['ed'] for f in features)
miss = exp - act
print(f"  {'All 73 districts ✓' if not miss else f'MISSING: {miss}'}")
print("Done!")
