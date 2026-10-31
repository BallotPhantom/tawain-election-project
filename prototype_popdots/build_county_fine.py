#!/usr/bin/env python3
"""Per-county fine light data for v2/profile.html's county / township views.

    python3 prototype_popdots/build_county_fine.py [cc ...]      (default: the profile counties)

Same population model as build_taiwan_a.py (variant A) — every village's OFFICIAL population (內政部戶政司,
115年9月) spread over that village's WorldPop R2024B 100 m cells in proportion to the cells' modelled
population; villages missing from the map / population table fall back to their township, exactly as there
(that unit logic is repeated here, not changed). Cells are assigned to villages Taiwan-wide first, so a
border cell lands in the same village as in the Taiwan build; only this county's units are then kept.

Output v2/popdots_cc/<cc>.bin:
  uint32 LE header length | UTF-8 JSON header (padded to 4) |
  dots:  per tier in header.tiers, N×(uint16 x, uint16 y) over header.bbox — P people per dot (stochastic
         rounding per unit), uniform inside a cell picked ∝ its modelled population
  cells: M×(float32 x, float32 y, float32 people) — cell centre in local map units and the people it carries
header.cell = [wx, wy]: one cell's width / height in local units (lon/lat cells are ~10° skewed in local
space; the page draws them as axis-aligned wx × wy rectangles, ≤ ~15 m error).
Dots: 16 and 4 people per dot (the Taiwan view's finest is 64). Cells: an honest 100 m view, currently
switched off on the page (it looked foggy when zoomed in).
"""
import collections, glob, json, os, struct, sys
import numpy as np
import shapely
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_popdots import load_villages, ToLocal, WP, RAW  # noqa: E402

TIERS = [16, 4]   # people per dot, coarse → fine (the page picks one by zoom, like prototype_popdots/index.html)
SEED = 20261015
COUNTIES = ['10008', '10004', '10013', '10007', '10009', '63000', '10017', '68000', '64000', '66000', '65000', '67000', '10015', '10014']
OUT_DIR = os.path.join(ROOT, 'v2', 'popdots_cc')


def main():
    want = sys.argv[1:] or COUNTIES
    rng = np.random.default_rng(SEED)
    to_local = ToLocal()
    pop = {}
    for f in glob.glob(os.path.join(RAW, 'vpop_all', '*.json')):
        for r in json.load(open(f))['responseData']: pop[r['district_code']] = int(r['people_total'])
    vill = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data_vd', '*.js'))):
        vill.update(load_villages(os.path.basename(f)[:-3], None))
    codes = sorted(vill); geoms = np.array([vill[c] for c in codes])

    # ---- WorldPop cells → local → village (Taiwan-wide, as in build_taiwan_a.py) ----
    Image.MAX_IMAGE_PIXELS = None
    a = np.array(Image.open(os.path.join(RAW, 'twn_pop_2020_CN_100m_R2024B_v1.tif')))
    rr, cc_ = np.nonzero(a > 0); st = WP['st']
    ll = np.column_stack([WP['lon0'] + (cc_ + 0.5) * st, WP['lat0'] - (rr + 0.5) * st]); cpop = a[rr, cc_].astype(float)
    xy = to_local(ll)
    pts = shapely.points(xy)
    tree = shapely.STRtree(geoms)
    pi, gi = tree.query(pts, predicate='within')
    cell_v = np.full(len(xy), -1); cell_v[pi] = gi
    miss = np.nonzero(cell_v < 0)[0]
    ni, nd = tree.query_nearest(pts[miss], max_distance=0.3, return_distance=True, all_matches=False)
    cell_v[miss[ni[0]]] = ni[1]

    by_v = collections.defaultdict(list)
    for i, v in enumerate(cell_v):
        if v >= 0: by_v[codes[v]].append(i)
    # ---- placement units (identical rules to build_taiwan_a.py) ----
    units = []
    matched = set(pop) & set(vill)
    for v in sorted(matched):   # sorted: set order changes per process (hash seed), which made the random draw irreproducible
        if by_v.get(v): units.append((pop[v], np.array(by_v[v]), v[:8]))
    pool_people = collections.Counter(); pool_cells = collections.defaultdict(list); tc_cells = collections.defaultdict(list)
    for v in sorted(set(pop) - set(vill)): pool_people[v[:8]] += pop[v]
    for v in sorted(set(vill) - set(pop)): pool_cells[v[:8]] += by_v.get(v, [])
    for v, cs in by_v.items(): tc_cells[v[:8]] += cs
    for v in sorted(matched):
        if not by_v.get(v): pool_people[v[:8]] += pop[v]
    for tc, n in pool_people.items():
        cs = pool_cells.get(tc) or tc_cells.get(tc)
        if cs: units.append((n, np.array(cs), tc))

    # one cell's size in local units (lon / lat steps through the local affine, ignoring the ~10° skew)
    c0 = to_local(np.array([[121.0, 23.7], [121.0 + st, 23.7], [121.0, 23.7 + st]]))
    wx, wy = float(abs(c0[1][0] - c0[0][0])), float(abs(c0[2][1] - c0[0][1]))
    os.makedirs(OUT_DIR, exist_ok=True)
    for cc in want:
        mine = [u for u in units if u[2][:5] == cc]
        people = sum(u[0] for u in mine)
        # cells: each unit's people spread over its cells by modelled population, summed per cell
        cell_people = collections.Counter()
        for n, cs, _ in mine:
            w = cpop[cs] / cpop[cs].sum()
            for c, p in zip(cs, w * n): cell_people[int(c)] += float(p)
        cidx = np.array(sorted(cell_people)); cp = np.array([cell_people[c] for c in cidx], dtype='<f4')
        cxy = xy[cidx].astype('<f4')
        # dots: P people per dot, stochastic rounding per unit, cell picked ∝ modelled population, uniform in it
        tiers = []
        for P in TIERS:
            parts = []
            for n, cs, _ in mine:
                f = n / P; k = int(f) + (1 if rng.random() < f - int(f) else 0)
                if not k: continue
                pick = rng.choice(cs, size=k, p=cpop[cs] / cpop[cs].sum())
                parts.append(to_local(ll[pick] + (rng.random((k, 2)) - 0.5) * st))
            tiers.append(np.vstack(parts))
        allx = np.vstack(tiers + [cxy.astype(float)])
        X0, Y0 = allx.min(0) - 0.01; X1, Y1 = allx.max(0) + 0.01
        blobs = []
        for d in tiers:
            q = np.empty((len(d), 2), dtype='<u2')
            q[:, 0] = np.round((d[:, 0] - X0) / (X1 - X0) * 65535); q[:, 1] = np.round((d[:, 1] - Y0) / (Y1 - Y0) * 65535)
            blobs.append(q.tobytes())
        header = {'cc': cc, 'bbox': [float(X0), float(Y0), float(X1), float(Y1)], 'tiers': [{'P': P, 'n': int(len(d))} for P, d in zip(TIERS, tiers)],
                  'cells': {'n': int(len(cidx))}, 'cell': [wx, wy], 'people': int(people),
                  'source': {'population': '內政部戶政司 村里戶數、單一年齡人口 115年9月（政府資料開放授權條款）',
                             'grid': 'WorldPop R2024B constrained 100 m, 2020 (CC BY 4.0)'},
                  'method': 'A: official village population placed on WorldPop 100 m cells (prototype_popdots/build_county_fine.py)'}
        hb = json.dumps(header, ensure_ascii=False).encode(); hb += b' ' * ((-(4 + len(hb))) % 4)
        cells = np.empty(len(cidx) * 3, dtype='<f4'); cells[0::3] = cxy[:, 0]; cells[1::3] = cxy[:, 1]; cells[2::3] = cp
        out = os.path.join(OUT_DIR, cc + '.bin')
        with open(out, 'wb') as fh:
            fh.write(struct.pack('<I', len(hb))); fh.write(hb)
            for b in blobs: fh.write(b)
            fh.write(cells.tobytes())
        print(cc, 'people', people, 'dots', {P: len(d) for P, d in zip(TIERS, tiers)}, 'cells', len(cidx), 'cell people sum', round(float(cp.sum())), os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
