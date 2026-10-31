#!/usr/bin/env python3
"""Population-dot prototype (prototype only — not used by profile.html / V1).

    python3 prototype_popdots/build_popdots.py [hualien taipei taichung] [--stats]

Inputs (prototype_popdots/raw/):
  vpop_11509*.json                      內政部戶政司 村里戶數、單一年齡人口 (ODRP014, 115年9月)
  twn_pop_2020_CN_100m_R2024B_v1.tif    WorldPop R2024B constrained 100 m population, 2020 (CC BY 4.0)
  osm_<region>_buildings.json           OpenStreetMap buildings (Overpass `out tags bb`, ODbL)
  ../data_vd/<cc>.js                    the project's own village topology (local map coordinates)

lon/lat → the map's local coordinates: the project's fitted affine + 8-NN IDW correction
(village_boundary_fix/coefx.npy, coefy.npy + village centroid pairs; leave-one-out error
median ~50 m, p90 ~200 m). Every point is assigned to a village by point-in-polygon in local
space, so a dot always lands inside the village whose population it carries.

Variants (all carry the same official village population except B):
  A  village population placed on WorldPop 100 m cells (weighted by cell population)
  B  buildings only: region population spread over all buildings by footprint, no village control
  C  village population placed on that village's buildings (by footprint); no building → cells → uniform
  D  ("C+") per-cell hybrid: the village's official population is first spread over its WorldPop
     100 m cells (by cell population); each person-dot then lands on a mapped residential building
     INSIDE ITS OWN CELL (by footprint) when that cell has one, otherwise uniformly in the cell.
     No threshold: well-mapped areas show building detail, sparsely mapped ones fall back to the
     grid cell by cell, and a few mapped buildings can only absorb their own cell's people (pure C
     piled whole villages onto 2–3 buildings in 卓溪/光復). A first attempt used a village-level
     coverage threshold (footprint per resident, then footprint / built-up area); both measure building
     DENSITY, not mapping completeness, and penalised sparse-but-complete rural villages.
     Reported (not used) completeness: share of a village's WorldPop population living in cells that
     contain at least one mapped residential building.

Density: every dot also carries the local population density around it (people per km², from the
finest tier within DENS_R ≈ 175 m), quantised log2 into one byte, so the page can compress bright
cores (tone curve on ground density — zoom- and region-independent, unlike any screen-space fix).

Tiers: P = people per dot, ×4 steps; the finest P is the smallest power of 4 (≥4) that keeps the
finest tier ≲400k dots. Coordinates are stored as uint16 pairs over the region's bbox (base64).
"""
import base64, json, os, sys, collections
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(HERE, 'raw')
SEED = 20261014
REGIONS = {
    'hualien': {'name': '花蓮縣', 'ccs': {'10015': None}, 'pop': ['vpop_11509.json'], 'osm': 'osm_hualien_buildings.json'},
    'taipei': {'name': '台北都會區', 'ccs': {'63000': None, '65000': ['010', '020', '030', '040', '050', '060', '130', '140']},
               'pop': ['vpop_11509_臺北市_1.json', 'vpop_11509_新北市_1.json'], 'osm': 'osm_tpe_buildings.json'},
    'taichung': {'name': '台中市區＋大里太平', 'ccs': {'66000': ['010', '020', '030', '040', '050', '060', '070', '080', '270', '280']},
                 'pop': ['vpop_11509_臺中市_1.json'], 'osm': 'osm_txg_buildings.json'},
}
# OSM building values that are clearly not homes: kept out of the placement weights
NON_RES = {'industrial', 'warehouse', 'greenhouse', 'farm_auxiliary', 'roof', 'school', 'hospital', 'commercial', 'retail',
           'church', 'temple', 'shrine', 'chapel', 'garage', 'garages', 'shed', 'hangar', 'service', 'construction',
           'transportation', 'train_station', 'government', 'public', 'civic', 'sports_hall', 'stadium', 'university',
           'college', 'kindergarten', 'office', 'factory', 'carport', 'storage_tank', 'bridge', 'parking', 'toilets',
           'barn', 'cowshed', 'stable', 'sty', 'ruins', 'container', 'military', 'outbuilding', 'hotel', 'mosque'}
DENS_R_KM = 0.175
LOCAL_PER_KM = 1.43   # local map units per km at Taiwan's latitude (affine coefficients ≈1.41 x / 1.46 y)
WP = {'lon0': 116.71083214649002, 'lat0': 26.38500023046, 'st': 0.00083333333}


def load_villages(cc, towns):
    s = open(os.path.join(ROOT, 'data_vd', cc + '.js'), encoding='utf-8').read()
    i = s.index("['%s'] = " % cc) + len("['%s'] = " % cc)
    topo, _ = json.JSONDecoder().raw_decode(s[i:])
    sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
    arcs = []
    for a in topo['arcs']:
        x = y = 0; pts = []
        for dx, dy in a:
            x += dx; y += dy; pts.append((tx + x * sx, ty + y * sy))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for k in idx:
            seg = arcs[k] if k >= 0 else arcs[~k][::-1]
            pts.extend(seg if not pts else seg[1:])
        return pts
    out = {}
    for g in topo['objects']['villages']['geometries']:
        vc = g['properties']['vc']
        if towns and vc[5:8] not in towns: continue
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        parts = []
        for p in polys:   # skip degenerate rings (< 4 points) some county topologies carry
            sh = ring(p[0])
            if len(sh) < 4: continue
            parts.append(Polygon(sh, [h for h in (ring(h) for h in p[1:]) if len(h) >= 4]))
        if parts: out[vc] = MultiPolygon(parts).buffer(0)
    return out


class ToLocal:
    def __init__(self):
        from scipy.spatial import cKDTree
        d = os.path.join(ROOT, 'village_boundary_fix')
        self.cx = np.load(os.path.join(d, 'coefx.npy')); self.cy = np.load(os.path.join(d, 'coefy.npy'))
        L, G = {}, {}
        for f, m in [('vd_local_centroids.txt', L), ('shp_lonlat_centroids.txt', G)]:
            for line in open(os.path.join(d, f)):
                a, b, c = line.split('\t'); m[a] = (float(b), float(c))
        com = sorted(set(L) & set(G)); self.lonlat_of = G
        self.C = np.array([G[v] for v in com]); loc = np.array([L[v] for v in com])
        self.res = loc - self.affine(self.C); self.tree = cKDTree(self.C)

    def affine(self, p):
        return np.column_stack([self.cx[0] * p[:, 0] + self.cx[1] * p[:, 1] + self.cx[2], self.cy[0] * p[:, 0] + self.cy[1] * p[:, 1] + self.cy[2]])

    def __call__(self, lonlat):
        lonlat = np.asarray(lonlat, dtype=float)
        if not len(lonlat): return np.zeros((0, 2))
        d, idx = self.tree.query(lonlat, k=8)
        w = 1.0 / np.maximum(d, 1e-9) ** 2; w /= w.sum(1, keepdims=True)
        return self.affine(lonlat) + (w[:, :, None] * self.res[idx]).sum(1)


def assign(points, vill, tol=0.0):
    codes = list(vill); geoms = [vill[c] for c in codes]
    tree = STRtree(geoms); out = []
    for x, y in points:
        p = Point(x, y); hit = None
        for i in tree.query(p):
            if geoms[i].contains(p): hit = codes[i]; break
        if hit is None and tol:
            i = tree.nearest(p)
            if geoms[i].distance(p) <= tol: hit = codes[i]
        out.append(hit)
    return out


_WPA = None
def worldpop():
    global _WPA
    if _WPA is None:
        Image.MAX_IMAGE_PIXELS = None
        _WPA = np.array(Image.open(os.path.join(RAW, 'twn_pop_2020_CN_100m_R2024B_v1.tif')))
    return _WPA


def prepare(key, to_local):
    R = REGIONS[key]
    vill = {}
    for cc, towns in R['ccs'].items(): vill.update(load_villages(cc, towns))
    pop = {}
    for f in R['pop']:
        for r in json.load(open(os.path.join(RAW, f)))['responseData']: pop[r['district_code']] = int(r['people_total'])
    pop = {v: n for v, n in pop.items() if v[:5] in R['ccs'] and (R['ccs'][v[:5]] is None or v[5:8] in R['ccs'][v[:5]])}
    only_pop = sorted(set(pop) - set(vill))
    # lon/lat window from the region's village centroids (+ margin)
    ll = np.array([to_local.lonlat_of[v] for v in vill if v in to_local.lonlat_of])
    lo0, la0 = ll.min(0) - 0.08; lo1, la1 = ll.max(0) + 0.08
    a = worldpop(); st = WP['st']
    r0, r1 = int((WP['lat0'] - la1) / st), int((WP['lat0'] - la0) / st); c0, c1 = int((lo0 - WP['lon0']) / st), int((lo1 - WP['lon0']) / st)
    sub = a[r0:r1, c0:c1]; rr, cc_ = np.nonzero(sub > 0)
    cell_ll = np.column_stack([WP['lon0'] + (c0 + cc_ + 0.5) * st, WP['lat0'] - (r0 + rr + 0.5) * st])
    cell_xy = to_local(cell_ll); cell_v = assign(cell_xy, vill); keep = np.array([v is not None for v in cell_v])
    cells = {'ll': cell_ll[keep], 'pop': sub[rr, cc_].astype(float)[keep], 'v': [v for v in cell_v if v is not None]}
    cell_m2 = (st * 111_000) * (st * 111_000 * np.cos(np.radians(cells['ll'][:, 1].mean())))
    bl = []
    for e in json.load(open(os.path.join(RAW, R['osm'])))['elements']:
        b = e['bounds']; t = e.get('tags', {}).get('building', 'yes')
        lat = (b['minlat'] + b['maxlat']) / 2; lon = (b['minlon'] + b['maxlon']) / 2
        w_m = (b['maxlon'] - b['minlon']) * 111_000 * np.cos(np.radians(lat)); h_m = (b['maxlat'] - b['minlat']) * 111_000
        bl.append((lon, lat, b['maxlon'] - b['minlon'], b['maxlat'] - b['minlat'], max(20.0, min(w_m * h_m * 0.7, 5000.0)), t))
    b_xy = to_local(np.array([(x[0], x[1]) for x in bl]))
    b_v = assign(b_xy, vill, tol=0.3)
    res = np.array([x[5] not in NON_RES for x in bl]); area = np.array([x[4] for x in bl])
    by_v_b = collections.defaultdict(list); by_v_c = collections.defaultdict(list)
    for i, v in enumerate(b_v):
        if v is not None and res[i]: by_v_b[v].append(i)
    for i, v in enumerate(cells['v']): by_v_c[v].append(i)
    # residential buildings per WorldPop cell (same village only)
    cell_id = {(round((WP['lat0'] - la) / st - 0.5), round((lo - WP['lon0']) / st - 0.5)): i for i, (lo, la) in enumerate(cells['ll'])}
    b_in_cell = collections.defaultdict(list)
    for i, v in enumerate(b_v):
        if v is None or not res[i]: continue
        ci = cell_id.get((int((WP['lat0'] - bl[i][1]) // st), int((bl[i][0] - WP['lon0']) // st)))
        if ci is not None and cells['v'][ci] == v: b_in_cell[ci].append(i)
    cover = {}
    for v in vill:
        ci = by_v_c.get(v, [])
        tot = cells['pop'][ci].sum() if ci else 0
        cover[v] = float(sum(cells['pop'][c] for c in ci if b_in_cell.get(c)) / tot) if tot else None
    print(key, 'villages', len(vill), 'pop villages', len(pop), 'pop-only', only_pop, 'people', sum(pop.get(v, 0) for v in vill),
          '| cells', keep.sum(), '| buildings', len(bl), 'in villages', sum(v is not None for v in b_v), 'residential', sum(1 for v in by_v_b.values() for _ in v))
    return dict(R=R, vill=vill, pop=pop, only_pop=only_pop, cells=cells, bl=bl, b_v=b_v, res=res, area=area, by_v_b=by_v_b, by_v_c=by_v_c, cover=cover, b_in_cell=b_in_cell)


def build(key, X, to_local, ref):
    rng = np.random.default_rng(SEED)
    vill, pop, cells, bl, area, by_v_b, by_v_c = X['vill'], X['pop'], X['cells'], X['bl'], X['area'], X['by_v_b'], X['by_v_c']
    st = WP['st']
    total = sum(pop.get(v, 0) for v in vill)
    fine = 4
    while total / fine > 400_000: fine *= 4
    tiers = [fine * 64, fine * 16, fine * 4, fine]

    def jit_b(idx):
        lon = np.array([bl[i][0] for i in idx]) + (rng.random(len(idx)) - 0.5) * np.array([bl[i][2] for i in idx]) * 0.8
        lat = np.array([bl[i][1] for i in idx]) + (rng.random(len(idx)) - 0.5) * np.array([bl[i][3] for i in idx]) * 0.8
        return to_local(np.column_stack([lon, lat]))

    def jit_c(idx): return to_local(cells['ll'][idx] + (rng.random((len(idx), 2)) - 0.5) * st)

    def uniform_in(geom, n):
        x0, y0, x1, y1 = geom.bounds; pts = []
        while len(pts) < n:
            c = np.column_stack([x0 + rng.random(n * 4) * (x1 - x0), y0 + rng.random(n * 4) * (y1 - y0)])
            pts.extend([p for p in c if geom.contains(Point(p))])
        return np.array(pts[:n])

    def count(people, P):
        f = people / P; n = int(f); return n + (1 if rng.random() < f - n else 0)

    allb = np.array([i for i, v in enumerate(X['b_v']) if v is not None and X['res'][i]])
    X0 = min(g.bounds[0] for g in vill.values()); Y0 = min(g.bounds[1] for g in vill.values())
    X1 = max(g.bounds[2] for g in vill.values()); Y1 = max(g.bounds[3] for g in vill.values())

    def pack(xy):
        q = np.empty((len(xy), 2), dtype='<u2')
        q[:, 0] = np.clip(np.round((xy[:, 0] - X0) / (X1 - X0) * 65535), 0, 65535)
        q[:, 1] = np.clip(np.round((xy[:, 1] - Y0) / (Y1 - Y0) * 65535), 0, 65535)
        return base64.b64encode(q.tobytes()).decode()
    out = {'name': X['R']['name'], 'tiers': tiers, 'bbox': [X0, Y0, X1, Y1], 'variants': {}, 'density': {}, 'stats': {},
           'densityCode': 'people per km² = 2^(byte/15) - 1'}
    from scipy.spatial import cKDTree
    r_loc = DENS_R_KM * LOCAL_PER_KM
    for var in 'ABCD':
        out['variants'][var] = []; out['density'][var] = []; src_count = collections.Counter(); fvals = []; tier_xy = []
        for P in tiers:
            parts = []
            if var == 'B':
                parts.append(jit_b(rng.choice(allb, size=count(total, P), p=area[allb] / area[allb].sum())))
            else:
                for v, geom in vill.items():
                    n = count(pop.get(v, 0), P)
                    if not n: continue
                    bi = np.array(by_v_b.get(v, []), dtype=int); ci = np.array(by_v_c.get(v, []), dtype=int)
                    if var == 'D' and len(ci):
                        pick = rng.choice(ci, size=n, p=cells['pop'][ci] / cells['pop'][ci].sum())
                        onb, offb = [], []
                        for c in pick:
                            bs = X['b_in_cell'].get(c)
                            if bs:
                                bs = np.array(bs); onb.append(rng.choice(bs, p=area[bs] / area[bs].sum()))
                            else: offb.append(c)
                        if onb: parts.append(jit_b(np.array(onb)))
                        if offb: parts.append(jit_c(np.array(offb)))
                        src = 'building' if not offb else ('grid' if not onb else 'mixed')
                        if P == tiers[-1]: fvals.append(len(onb) / n)
                    elif var == 'C' and len(bi):
                        parts.append(jit_b(rng.choice(bi, size=n, p=area[bi] / area[bi].sum()))); src = 'building'
                    elif len(ci):
                        parts.append(jit_c(rng.choice(ci, size=n, p=cells['pop'][ci] / cells['pop'][ci].sum()))); src = 'grid'
                    else:
                        parts.append(uniform_in(geom, n)); src = 'uniform'
                    if P == tiers[-1]: src_count[src] += 1
            xy = np.vstack(parts) if parts else np.zeros((0, 2))
            out['variants'][var].append(pack(xy)); tier_xy.append(xy)
        tree = cKDTree(tier_xy[-1])   # density from the finest tier of the same variant
        for xy in tier_xy:
            dens = tree.query_ball_point(xy, r_loc, return_length=True) * tiers[-1] / (np.pi * DENS_R_KM ** 2)
            out['density'][var].append(base64.b64encode(np.clip(np.round(np.log2(dens + 1) * 15), 0, 255).astype('u1').tobytes()).decode())
        out['stats'][var] = {'dots': [len(base64.b64decode(t)) // 4 for t in out['variants'][var]], 'villageSource': dict(src_count)}
        if fvals: out['stats'][var]['buildingShare'] = round(float(np.mean(fvals)), 3)
        print(' ', key, var, out['stats'][var])
    out['totalPop'] = total
    out['notDrawn'] = [{'vc': v, 'pop': pop[v]} for v in X['only_pop']]
    out['villages'] = {v: {'pop': pop.get(v, 0), 'cover': None if X['cover'][v] is None else round(X['cover'][v], 3),
                           'geom': [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in (g.geoms if hasattr(g, 'geoms') else [g])]}
                       for v, g in vill.items()}
    out['source'] = {'population': '內政部戶政司 村里戶數、單一年齡人口 115年9月（政府資料開放授權條款）',
                     'grid': 'WorldPop R2024B constrained 100 m, 2020 (CC BY 4.0)', 'buildings': '© OpenStreetMap contributors (ODbL), Overpass 2026-10-14'}
    os.makedirs(os.path.join(HERE, 'data'), exist_ok=True)
    p = os.path.join(HERE, 'data', key + '_dots.json')
    json.dump(out, open(p, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('  wrote', p, os.path.getsize(p) // 1024, 'KB')


def main():
    keys = [a for a in sys.argv[1:] if not a.startswith('--')] or list(REGIONS)
    to_local = ToLocal()
    prepared = {k: prepare(k, to_local) for k in REGIONS}   # reference coverage always uses all regions
    allc = np.array([c for X in prepared.values() for c in X['cover'].values() if c is not None])
    ref = None
    print('completeness = share of WorldPop population in cells holding ≥1 mapped residential building')
    for k, X in prepared.items():
        c = np.array([x for x in X['cover'].values() if x is not None])
        print('  %-9s villages %d  p10 %.2f  median %.2f  p90 %.2f  below 0.5: %d' % (k, len(c), *np.percentile(c, [10, 50, 90]), (c < 0.5).sum()))
    if '--stats' in sys.argv: return
    for k in keys: build(k, prepared[k], to_local, ref)


if __name__ == '__main__':
    main()
