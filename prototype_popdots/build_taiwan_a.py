#!/usr/bin/env python3
"""Nationwide population-dot layer, variant A, for v2/profile.html's Taiwan view.

    python3 prototype_popdots/build_taiwan_a.py

Method (variant A of the 花蓮/台北/台中 prototype): every village's OFFICIAL population (內政部戶政司
村里戶數、單一年齡人口, 115年9月) is turned into dots (P people per dot, stochastic rounding) and
each dot is placed in one of that village's WorldPop R2024B constrained 100 m cells (chosen with
probability ∝ the cell's modelled population), uniformly inside the cell.

Village identity: CEC/戶政 code. Where a code exists only in the population table (villages newer
than the map outlines, 47 nationwide) or only in the map, the township is the unit instead: those
villages' people go onto the cells of the township's map-only villages, or onto all of the township's
cells when it has none — nobody is dropped and no village outline is guessed.

lon/lat → local map coordinates: the project's fitted affine + 8-NN IDW correction
(village_boundary_fix/coefx.npy etc.; leave-one-out error median ~50 m, p90 ~200 m). Cells are
assigned to villages by point-in-polygon in local space (snapped up to ~200 m at coasts).

Output v2/popdots_taiwan_a.bin:
  uint32 LE header length | UTF-8 JSON header | per tier: N×(uint16 x, uint16 y) over header.bbox,
  then N×uint8 density code (people per km² within 175 m = 2^(code/15) − 1, from the finest tier)
"""
import collections, glob, json, os, struct
import numpy as np
import shapely
from PIL import Image
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
import sys; sys.path.insert(0, HERE)
from build_popdots import load_villages, ToLocal, WP, RAW  # noqa: E402

TIERS = [1024, 256, 64]
SEED = 20261014
DENS_R_KM = 0.175
LOCAL_PER_KM = 1.43
OUT = os.path.join(ROOT, 'v2', 'popdots_taiwan_a.bin')


def main():
    rng = np.random.default_rng(SEED)
    to_local = ToLocal()
    pop = {}
    for f in glob.glob(os.path.join(RAW, 'vpop_all', '*.json')):
        for r in json.load(open(f))['responseData']: pop[r['district_code']] = int(r['people_total'])
    vill = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data_vd', '*.js'))):
        vill.update(load_villages(os.path.basename(f)[:-3], None))
    codes = sorted(vill); geoms = np.array([vill[c] for c in codes])
    print('villages map', len(vill), 'population', len(pop), 'people', sum(pop.values()))

    # ---- WorldPop cells → local → village ----
    Image.MAX_IMAGE_PIXELS = None
    a = np.array(Image.open(os.path.join(RAW, 'twn_pop_2020_CN_100m_R2024B_v1.tif')))
    rr, cc = np.nonzero(a > 0); st = WP['st']
    ll = np.column_stack([WP['lon0'] + (cc + 0.5) * st, WP['lat0'] - (rr + 0.5) * st]); cpop = a[rr, cc].astype(float)
    xy = to_local(ll)
    pts = shapely.points(xy)
    tree = shapely.STRtree(geoms)
    pi, gi = tree.query(pts, predicate='within')
    cell_v = np.full(len(xy), -1); cell_v[pi] = gi
    miss = np.nonzero(cell_v < 0)[0]
    ni, nd = tree.query_nearest(pts[miss], max_distance=0.3, return_distance=True, all_matches=False)
    cell_v[miss[ni[0]]] = ni[1]
    lost = cell_v < 0
    print('cells', len(xy), 'inside', len(pi), 'snapped', len(ni[0]), 'unassigned', lost.sum(), 'their WorldPop', round(cpop[lost].sum()))

    by_v = collections.defaultdict(list)
    for i, v in enumerate(cell_v):
        if v >= 0: by_v[codes[v]].append(i)
    # ---- placement units: matched villages, else township pools ----
    units = []   # (people, cell index array, label)
    matched = set(pop) & set(vill)
    for v in matched:
        if by_v.get(v): units.append((pop[v], np.array(by_v[v]), v))
    pool_people = collections.Counter(); pool_cells = collections.defaultdict(list); tc_cells = collections.defaultdict(list)
    for v in set(pop) - set(vill): pool_people[v[:8]] += pop[v]
    for v in set(vill) - set(pop): pool_cells[v[:8]] += by_v.get(v, [])
    for v, cs in by_v.items(): tc_cells[v[:8]] += cs
    no_cells = [v for v in matched if not by_v.get(v)]
    for v in no_cells: pool_people[v[:8]] += pop[v]          # matched village with no WorldPop cell → township pool
    unplaced = 0
    for tc, n in pool_people.items():
        cs = pool_cells.get(tc) or tc_cells.get(tc)
        if cs: units.append((n, np.array(cs), 'pool:' + tc))
        else: unplaced += n
    print('units', len(units), 'township pools', len(pool_people), 'matched villages without cells', len(no_cells), 'people with no township cells', unplaced)

    # ---- dots ----
    def count(people, P):
        f = people / P; n = int(f); return n + (1 if rng.random() < f - n else 0)
    tiers_xy = []
    for P in TIERS:
        parts = []
        for people, cs, _ in units:
            n = count(people, P)
            if not n: continue
            pick = rng.choice(cs, size=n, p=cpop[cs] / cpop[cs].sum())
            parts.append(to_local(ll[pick] + (rng.random((n, 2)) - 0.5) * st))
        tiers_xy.append(np.vstack(parts))
        print('tier', P, 'dots', len(tiers_xy[-1]), 'people represented', len(tiers_xy[-1]) * P)
    allxy = np.vstack(tiers_xy)
    X0, Y0 = allxy.min(0) - 0.01; X1, Y1 = allxy.max(0) + 0.01
    ftree = cKDTree(tiers_xy[-1]); r_loc = DENS_R_KM * LOCAL_PER_KM
    blobs, meta = [], []
    for P, t in zip(TIERS, tiers_xy):
        q = np.empty((len(t), 2), dtype='<u2')
        q[:, 0] = np.round((t[:, 0] - X0) / (X1 - X0) * 65535); q[:, 1] = np.round((t[:, 1] - Y0) / (Y1 - Y0) * 65535)
        dens = ftree.query_ball_point(t, r_loc, return_length=True) * TIERS[-1] / (np.pi * DENS_R_KM ** 2)
        code = np.clip(np.round(np.log2(dens + 1) * 15), 0, 255).astype('u1')
        meta.append({'P': P, 'n': len(t)}); blobs.append(q.tobytes() + code.tobytes())
    header = {'tiers': meta, 'bbox': [float(X0), float(Y0), float(X1), float(Y1)], 'totalPop': sum(pop.values()),
              'densityCode': 'people per km² within 175 m = 2^(code/15) - 1',
              'source': {'population': '內政部戶政司 村里戶數、單一年齡人口 115年9月（政府資料開放授權條款）',
                         'grid': 'WorldPop R2024B constrained 100 m, 2020 (CC BY 4.0)'},
              'method': 'A: official village population placed on WorldPop 100 m cells (prototype_popdots/build_taiwan_a.py)'}
    hb = json.dumps(header, ensure_ascii=False).encode()
    pad = (-(4 + len(hb))) % 4
    hb += b' ' * pad
    with open(OUT, 'wb') as fh:
        fh.write(struct.pack('<I', len(hb))); fh.write(hb)
        for b in blobs: fh.write(b)
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
