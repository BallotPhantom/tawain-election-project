"""Split VD (nationwide village TopoJSON) into one file per county for v2/profile.html
(Phase 3, AUDIT_WEBSITE_PERFORMANCE.md). data_map_v64.js is read, never modified.

Output: data_vd/<cc>.js for every county present in VD, each a self-registering script:
    (window.VD_COUNTY = window.VD_COUNTY || {})['<cc>'] = <TopoJSON>;
<cc> is the first 5 digits of each village's `vc` code and is checked against CD's
county codes — no county is hardcoded, so the set of files follows the data.

Each county topology keeps the original `transform` and `bbox`, every geometry's
`type` / `id` / `properties`, and only the arcs that county uses, renumbered in
original order (reversed refs ~i keep their direction). Arcs are copied verbatim.

After writing, the files are re-read and validated against the original VD:
counts / no duplicates / no omissions, per-village type / id / properties / arc
structure, and fully decoded absolute coordinates. Any mismatch -> exit 1.
"""
import collections, glob, json, os, sys

SRC = 'data_map_v64.js'
OUT_DIR = 'data_vd'
PREFIX = "(window.VD_COUNTY = window.VD_COUNTY || {})['%s'] = "


def load_const(raw_lines, name):
    tag = ('const %s =' % name).encode()
    hits = [ln for ln in raw_lines if ln.startswith(tag)]
    if len(hits) != 1:
        sys.exit('%s: expected exactly one line, found %d' % (name, len(hits)))
    ln = hits[0]
    return json.loads(ln[ln.index(b'=') + 1:].strip().rstrip(b';'))


def county_of(vc):
    return vc[:5]


def walk_refs(g):
    """Every arc reference of a Polygon/MultiPolygon geometry, in order."""
    a = g['arcs']
    if g['type'] == 'Polygon':
        return [i for ring in a for i in ring]
    if g['type'] == 'MultiPolygon':
        return [i for poly in a for ring in poly for i in ring]
    sys.exit('unsupported geometry type %s' % g['type'])


def map_refs(g, f):
    a = g['arcs']
    if g['type'] == 'Polygon':
        return [[f(i) for i in ring] for ring in a]
    return [[[f(i) for i in ring] for ring in poly] for poly in a]


def decode(topo, g):
    """Absolute coordinates, same algorithm as topojson-client's feature():
    delta-decode each quantized arc, apply transform, reverse ~i, drop the
    duplicated join point between consecutive arcs of a ring."""
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    cache = {}

    def arc(i):
        if i not in cache:
            x = y = 0
            pts = []
            for p in topo['arcs'][i]:
                x += p[0]; y += p[1]
                pts.append((x * sx + tx, y * sy + ty) + tuple(p[2:]))
            cache[i] = pts
        return cache[i]

    def ring(refs):
        out = []
        for k, i in enumerate(refs):
            pts = arc(i) if i >= 0 else arc(~i)[::-1]
            out.extend(pts if k == 0 else pts[1:])
        return out

    if g['type'] == 'Polygon':
        return [ring(r) for r in g['arcs']]
    return [[ring(r) for r in poly] for poly in g['arcs']]


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    raw_lines = open(SRC, 'rb').read().split(b'\n')
    VD = load_const(raw_lines, 'VD')
    CD = load_const(raw_lines, 'CD')
    extra = set(VD) - {'type', 'objects', 'arcs', 'transform', 'bbox'}
    if extra or list(VD['objects']) != ['villages']:
        sys.exit('unexpected VD shape: %s %s' % (extra, list(VD['objects'])))
    geoms = VD['objects']['villages']['geometries']

    # ---- group by county (derived from vc, checked against CD) ----
    groups = collections.OrderedDict()
    for g in geoms:
        groups.setdefault(county_of(g['properties']['vc']), []).append(g)
    cd_codes = {(x.get('properties') or {}).get('cc') for x in CD['objects']['counties']['geometries']}
    if set(groups) != cd_codes:
        sys.exit('county codes derived from vc %s != CD county codes %s' % (sorted(groups), sorted(cd_codes)))

    # ---- write ----
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, '*.js')):
        os.remove(old)
    for cc, gs in groups.items():
        used = sorted({i if i >= 0 else ~i for g in gs for i in walk_refs(g)})
        remap = {a: k for k, a in enumerate(used)}
        sub_geoms = []
        for g in gs:
            ng = dict(g)  # keeps type / id / properties (and key order)
            ng['arcs'] = map_refs(g, lambda i: remap[i] if i >= 0 else ~remap[~i])
            sub_geoms.append(ng)
        topo = collections.OrderedDict()
        for k in VD:  # same key order as the original topology
            if k == 'objects':
                coll = dict(VD['objects']['villages']); coll['geometries'] = sub_geoms
                topo[k] = {'villages': coll}
            elif k == 'arcs':
                topo[k] = [VD['arcs'][a] for a in used]
            else:
                topo[k] = VD[k]
        body = json.dumps(topo, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(OUT_DIR, cc + '.js'), 'w', encoding='utf-8') as fh:
            fh.write(PREFIX % cc + body + ';\n')

    # ---- validate by re-reading what was written ----
    orig_by_vc = {g['properties']['vc']: g for g in geoms}
    seen = collections.Counter()
    n_arcs_checked = n_pts = n_rev = 0
    files = sorted(glob.glob(os.path.join(OUT_DIR, '*.js')))
    for path in files:
        cc = os.path.basename(path)[:-3]
        text = open(path, encoding='utf-8').read()
        head = PREFIX % cc
        if not text.startswith(head) or not text.endswith(';\n'):
            sys.exit('%s: bad wrapper' % path)
        sub = json.loads(text[len(head):-2])
        if sub['transform'] != VD['transform'] or sub['bbox'] != VD['bbox'] or sub['type'] != VD['type']:
            sys.exit('%s: transform/bbox/type differ' % path)
        for sg in sub['objects']['villages']['geometries']:
            vc = sg['properties']['vc']
            seen[vc] += 1
            if county_of(vc) != cc:
                sys.exit('%s: village %s belongs to another county' % (path, vc))
            og = orig_by_vc.get(vc)
            if og is None:
                sys.exit('%s: unknown village %s' % (path, vc))
            if {k: v for k, v in sg.items() if k != 'arcs'} != {k: v for k, v in og.items() if k != 'arcs'}:
                sys.exit('%s: %s type/id/properties differ' % (path, vc))
            o_refs, s_refs = walk_refs(og), walk_refs(sg)
            if len(o_refs) != len(s_refs) or any((a < 0) != (b < 0) for a, b in zip(o_refs, s_refs)):
                sys.exit('%s: %s arc structure/direction differs' % (path, vc))
            for a, b in zip(o_refs, s_refs):
                oa, sa = (a if a >= 0 else ~a), (b if b >= 0 else ~b)
                if VD['arcs'][oa] != sub['arcs'][sa]:
                    sys.exit('%s: %s arc content differs' % (path, vc))
                n_arcs_checked += 1
                n_rev += a < 0
            od, sd = decode(VD, og), decode(sub, sg)
            if od != sd:
                sys.exit('%s: %s decoded coordinates differ' % (path, vc))
            n_pts += sum(len(r) for poly in sd for r in poly) if sg['type'] == 'MultiPolygon' else sum(len(r) for r in sd)
    dup = [vc for vc, n in seen.items() if n > 1]
    missing = set(orig_by_vc) - set(seen)
    if dup or missing or sum(seen.values()) != len(geoms):
        sys.exit('dup=%d missing=%d total=%d/%d' % (len(dup), len(missing), sum(seen.values()), len(geoms)))

    total = 0
    for path in files:
        sz = os.path.getsize(path); total += sz
        print('%-18s %5d villages %10d bytes' % (path, len(groups[os.path.basename(path)[:-3]]), sz))
    print('files=%d villages=%d (unique, none missing) total=%d bytes' % (len(files), sum(seen.values()), total))
    print('OK: %d arc refs (%d reversed) and %d decoded points identical to VD in %s' % (n_arcs_checked, n_rev, n_pts, SRC))


if __name__ == '__main__':
    main()
