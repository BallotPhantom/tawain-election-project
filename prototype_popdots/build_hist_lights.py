#!/usr/bin/env python3
"""Prototype (local only): population lights coloured by the party leading each village, for a historical race
(user 2026-11-08: 「按照人口光點給政黨色的設計可以 apply 到 hist mode 嗎？」→ prototype on 2022 縣市長 →「好」).

Same dots as build_taiwan_a.py (variant A: 115年9月 village population on WorldPop 100 m cells, tiers 1024/256/64,
same seed), but each dot also records its placement unit — a village code, or 'pool:<township>' for the villages
the map and the population table don't share. Coordinates go straight into v2/data_liveflow.js's frame (LF_FRAME,
the mobile map frame) so the prototype page reuses LF_COUNTY / LF_COAST.

    python3 prototype_popdots/build_hist_lights.py      → prototype_popdots/data_hist_lights.js
(2026-11-08: briefly in v2/ for a history-page 人口光點 toggle; removed the same day, user: 「算了好了，先刪掉就當是開票的特色」)

Output (JS consts):
  HL_UNITS   [unit label, ...]                    index = the dot's unit
  HL_TIERS   [{P, n, xy: base64 Uint16 x,y over LF_FRAME (0–65535), u: base64 Uint16 unit index}, ...]
  HL_FRAME / HL_COUNTY / HL_COAST   copies of v2/data_liveflow.js's LF_FRAME / LF_COUNTY / LF_COAST (run
             build_v2_liveflow.py first), so the history page needn't load that 4 MB file for the outlines
"""
import base64, collections, glob, json, os, struct, sys
import numpy as np
import shapely
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_popdots import load_villages, ToLocal, WP, RAW  # noqa: E402

TIERS = [1024, 256, 64]
SEED = 20261014
OUT = os.path.join(HERE, 'data_hist_lights.js')   # prototype only (the history-page toggle was removed 2026-11-08)


def lf_frame():   # build_v2_liveflow.py's frame: data_map_v64.js CD extent, 1000 wide
    s = open(os.path.join(ROOT, 'data_map_v64.js'), encoding='utf-8').read()
    i = s.index('const CD = ') + len('const CD = '); CD = json.loads(s[i:s.index('\n', i)].rstrip().rstrip(';'))
    sx, sy = CD['transform']['scale']; tx, ty = CD['transform']['translate']
    xs, ys = [], []
    for a in CD['arcs']:
        x = y = 0
        for dx, dy in a:
            x += dx; y += dy; xs.append(x * sx + tx); ys.append(y * sy + ty)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    K = 1000 / (x1 - x0)
    return x0, y0, K, 1000, round((y1 - y0) * K)


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

    Image.MAX_IMAGE_PIXELS = None
    a = np.array(Image.open(os.path.join(RAW, 'twn_pop_2020_CN_100m_R2024B_v1.tif')))
    rr, cc = np.nonzero(a > 0); st = WP['st']
    ll = np.column_stack([WP['lon0'] + (cc + 0.5) * st, WP['lat0'] - (rr + 0.5) * st]); cpop = a[rr, cc].astype(float)
    pts = shapely.points(to_local(ll))
    tree = shapely.STRtree(geoms)
    pi, gi = tree.query(pts, predicate='within')
    cell_v = np.full(len(pts), -1); cell_v[pi] = gi
    miss = np.nonzero(cell_v < 0)[0]
    ni, _ = tree.query_nearest(pts[miss], max_distance=0.3, return_distance=True, all_matches=False)
    cell_v[miss[ni[0]]] = ni[1]
    by_v = collections.defaultdict(list)
    for i, v in enumerate(cell_v):
        if v >= 0: by_v[codes[v]].append(i)

    # placement units, in a fixed (sorted) order so a rerun gives the same dots
    units = []
    matched = sorted(set(pop) & set(vill))
    for v in matched:
        if by_v.get(v): units.append((pop[v], np.array(by_v[v]), v))
    pool_people = collections.Counter(); pool_cells = collections.defaultdict(list); tc_cells = collections.defaultdict(list)
    for v in sorted(set(pop) - set(vill)): pool_people[v[:8]] += pop[v]
    for v in sorted(set(vill) - set(pop)): pool_cells[v[:8]] += by_v.get(v, [])
    for v in sorted(by_v): tc_cells[v[:8]] += by_v[v]
    for v in matched:
        if not by_v.get(v): pool_people[v[:8]] += pop[v]
    for tc in sorted(pool_people):
        cs = pool_cells.get(tc) or tc_cells.get(tc)
        if cs: units.append((pool_people[tc], np.array(cs), 'pool:' + tc))
    labels = [u[2] for u in units]
    print('units', len(units), 'villages', len(matched), 'pools', sum(1 for l in labels if l.startswith('pool:')))

    x0, y0, K, W, H = lf_frame()
    def count(people, P):
        f = people / P; n = int(f); return n + (1 if rng.random() < f - n else 0)
    out = []
    for P in TIERS:
        xy_parts, u_parts = [], []
        for ui, (people, cs, _) in enumerate(units):
            n = count(people, P)
            if not n: continue
            pick = rng.choice(cs, size=n, p=cpop[cs] / cpop[cs].sum())
            loc = to_local(ll[pick] + (rng.random((n, 2)) - 0.5) * st)
            xy_parts.append(np.column_stack([(loc[:, 0] - x0) * K, (loc[:, 1] - y0) * K])); u_parts.append(np.full(n, ui))
        xy = np.vstack(xy_parts); u = np.concatenate(u_parts)
        q = np.empty((len(xy), 2), dtype='<u2')
        q[:, 0] = np.clip(np.round(xy[:, 0] / W * 65535), 0, 65535); q[:, 1] = np.clip(np.round(xy[:, 1] / H * 65535), 0, 65535)
        out.append({'P': P, 'n': len(xy), 'xy': base64.b64encode(q.tobytes()).decode(),
                    'u': base64.b64encode(u.astype('<u2').tobytes()).decode()})
        print('tier', P, 'dots', len(xy))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// population lights with their village (prototype) — generated by prototype_popdots/build_hist_lights.py; do not hand-edit.\n')
        f.write('const HL_UNITS = %s;\n' % json.dumps(labels, separators=(',', ':')))
        f.write('const HL_TIERS = %s;\n' % json.dumps(out, separators=(',', ':')))
        for line in open(os.path.join(ROOT, 'v2', 'data_liveflow.js'), encoding='utf-8'):
            for k in ('LF_FRAME', 'LF_COUNTY', 'LF_COAST'):
                if line.startswith('const %s = ' % k): f.write(line.replace('const ' + k, 'const HL_' + k[3:], 1))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
