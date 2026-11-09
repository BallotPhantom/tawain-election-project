#!/usr/bin/env python3
"""Fine population lights for v2/live-flow.html's township layer (user 2026-11-09: 「人口光點比 profile 少？」→ B 放大縣市時
換成細光點): 16 people per dot (the flat Taiwan view's finest is 64), every county, each dot with its township.

    python3 prototype_popdots/build_live_fine.py [cc ...]      (default: all 22)

Population model exactly as build_county_fine.py / build_taiwan_a.py (variant A): each village's official population
(內政部戶政司 115年9月) spread over its WorldPop R2024B 100 m cells ∝ their modelled population, villages missing from the
map / table falling back to their township; cells assigned to villages Taiwan-wide first. Dots: stochastic rounding per
unit, cell picked ∝ modelled population, uniform inside it (own seed — the profile files are not touched).
Coordinates go into live-flow's frame (data_map_v64.js CD box, width 1000 — as build_v2_liveflow.py); a dot's township
is the township polygon it falls in (nearest one off the coast), indexed into LF_TOWN_ORDER, like the page's other lights.

Output v2/lf_fine/<cc>.bin:  uint32 n | n × (uint16 x, uint16 y) quantised over the frame (x / 1000 · 65535,
y / h · 65535) | n × uint16 township index
"""
import collections, glob, json, os, re, struct, sys
import numpy as np
import shapely
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_popdots import load_villages, ToLocal, WP, RAW  # noqa: E402

P = 16
SEED = 20261109
OUT_DIR = os.path.join(ROOT, 'v2', 'lf_fine')


def js_const(path, var):
    s = open(os.path.join(ROOT, path), encoding='utf-8').read()
    i = s.index(var + ' = ') + len(var + ' = '); j = s.index('\n', i)
    return json.loads(s[i:j].rstrip().rstrip(';'))


def ccof(tc): return tc[:2] if tc[:2] in ('63', '64', '65', '66', '67', '68') else tc[:5]


def main():
    # ---- live-flow's frame and townships (as build_v2_liveflow.py) ----
    CD = js_const('data_map_v64.js', 'const CD')
    sx, sy = CD['transform']['scale']; tx, ty = CD['transform']['translate']
    xs, ys = [], []
    for a in CD['arcs']:
        x = y = 0
        for dx, dy in a:
            x += dx; y += dy; xs.append(x * sx + tx); ys.append(y * sy + ty)
    x0, x1, y0 = min(xs), max(xs), min(ys)
    K = 1000 / (x1 - x0)
    FR = js_const('v2/data_liveflow.js', 'const LF_FRAME'); W, H = FR['w'], FR['h']
    ORDER = js_const('v2/data_liveflow.js', 'const LF_TOWN_ORDER')
    M_TOWNS = js_const('v2/m/data_geo_m.js', 'const M_TOWNS')
    assert (M_TOWNS['w'], M_TOWNS['h']) == (W, H)
    def poly(d):
        rings = [[tuple(map(float, p.split(','))) for p in r.split('L')] for r in re.findall(r'M([^MZ]+)Z', d)]
        return shapely.make_valid(shapely.union_all([shapely.Polygon(r) for r in rings if len(r) >= 3]))
    tgeom = [poly(M_TOWNS['t'][tc]) for tc in ORDER]
    want = sys.argv[1:] or sorted({ccof(tc) for tc in ORDER})

    # ---- population units (identical rules to build_county_fine.py) ----
    rng = np.random.default_rng(SEED)
    to_local = ToLocal()
    pop = {}
    for f in glob.glob(os.path.join(RAW, 'vpop_all', '*.json')):
        for r in json.load(open(f))['responseData']: pop[r['district_code']] = int(r['people_total'])
    vill = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data_vd', '*.js'))):
        vill.update(load_villages(os.path.basename(f)[:-3], None))
    codes = sorted(vill); geoms = np.array([vill[c] for c in codes])
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
    units = []
    matched = set(pop) & set(vill)
    for v in sorted(matched):
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

    os.makedirs(OUT_DIR, exist_ok=True)
    tot = 0
    for cc in want:
        u5 = cc + '000' if len(cc) == 2 else cc   # village codes: municipalities 63000…, counties 10002…
        mine = [u for u in units if u[2][:5] == u5]
        parts = []
        for n, cs, _ in mine:
            f = n / P; k = int(f) + (1 if rng.random() < f - int(f) else 0)
            if not k: continue
            pick = rng.choice(cs, size=k, p=cpop[cs] / cpop[cs].sum())
            parts.append(to_local(ll[pick] + (rng.random((k, 2)) - 0.5) * st))
        d = np.vstack(parts)
        fx = (d[:, 0] - x0) * K; fy = (d[:, 1] - y0) * K
        fp = shapely.points(np.column_stack([fx, fy]))
        # only this county's townships: a border dot whose (simplified) frame polygon is the neighbour's goes to the nearest
        # township of its own county — it lights with its own county's count
        own = [i for i, tc in enumerate(ORDER) if ccof(tc) == cc]; otree = shapely.STRtree([tgeom[i] for i in own])
        ti = np.full(len(d), -1)
        a_, b_ = otree.query(fp, predicate='within'); ti[a_] = np.array(own)[b_]
        m = np.nonzero(ti < 0)[0]
        if len(m): ti[m] = np.array(own)[otree.query_nearest(fp[m], all_matches=False)[1]]
        wrong = int(len(m))   # dots placed by nearest township (outside every own polygon)
        q = np.empty((len(d), 2), dtype='<u2')
        q[:, 0] = np.clip(np.round(fx / W * 65535), 0, 65535); q[:, 1] = np.clip(np.round(fy / H * 65535), 0, 65535)
        out = os.path.join(OUT_DIR, cc + '.bin')
        with open(out, 'wb') as fh:
            fh.write(struct.pack('<I', len(d))); fh.write(q.tobytes()); fh.write(ti.astype('<u2').tobytes())
        people = sum(u[0] for u in mine); tot += len(d)
        print(cc, 'people', people, 'dots', len(d), 'by nearest township', wrong, os.path.getsize(out) // 1024, 'KB', flush=True)
    print('total dots', tot)


if __name__ == '__main__':
    main()
