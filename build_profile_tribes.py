#!/usr/bin/env python3
"""原住民族核定部落 → v2/profile.html TRIBE_DATA (village-layer dots + the township panel's 部落 list).

    python3 build_profile_tribes.py [--dry-run]

Source: data_cip/tribes_A53000000A-111027-001_20261018.json — 原住民族委員會「原住民族部落位置GIS點位表」
(data.gov.tw/dataset/156632, 政府資料開放授權條款第1版; JSON dump of data.cip.gov.tw resource A53000000A-111027-001,
fetched 2026-10-18; 739 rows, 737 dated 20220725). Only the profile counties (build_profile_cec_tables.SEEDS) are kept.

Per tribe: official lon/lat → profile local map units (prototype_popdots ToLocal, the same affine + village-centroid
residual the population dots use), village code by the official 村里 name inside its own township (NM.v names;
village_boundary_fix/missing_villages.txt for villages the map has no shape for), and a flag:
  ''        drawn at the official coordinate
  'away'    official coordinate lies > NEAR outside its own township (relocated tribes, e.g. 好茶 at 禮納里) — NOT drawn
            (the township's map doesn't reach it; same rule the user chose for 三和村), listed with `at` = the village the
            official point falls in
  'coord'   official coordinate is a typo (> 20 map units, i.e. far outside its own township) — drawn at its village's
            representative point instead
  'nogeom'  its village has no shape on the map (瑪家鄉三和村: inside 內埔鄉 on the official 村里界圖) — an indicative
            point inside its own township (drawn as a dashed hollow circle, 「位置示意」; user 2026-10-19)
Source-data repairs are the explicit tables below; anything else unexpected stops the build.
"""
import collections, json, math, os, re, sys
import numpy as np
from shapely.geometry import Point, Polygon, MultiPolygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.join(ROOT, 'prototype_popdots'))
from build_profile_presidential import var_span, js, PROFILE  # noqa: E402
from build_profile_cec_tables import SEEDS  # noqa: E402
from build_popdots import ToLocal  # noqa: E402

SRC = os.path.join(ROOT, 'data_cip', 'tribes_A53000000A-111027-001_20261018.json')
# 村里 written differently in the source than in the 2024 boundary data (renamed, truncated, or a lost rare character)
VILL_FIX = {('10008130', '合作村'): '德鹿谷村',      # 仁愛鄉合作村 renamed 德鹿谷村
            ('64000380', '卡努瓦'): '達卡努瓦里',    # 那瑪夏區 達卡努瓦里, truncated in the source
            ('10013280', '?山村'): '凉山村',         # 瑪家鄉凉山村: 凉 lost as '?' in every CIP dump (JSON/CSV/XML)
            ('10014030', '里?里'): '里壠里',         # 關山鎮里壠里: 壠 lost as '?'
            ('10014150', '台?村'): '台坂村',         # 達仁鄉台坂村: 坂 lost as '?'
            ('10014150', '土?村'): '土坂村'}         # 達仁鄉土坂村
NAME_FIX = {'?山部落': '凉山部落'}
# 族別 spelled differently from the 17-族 list the page colours by
GROUP_FIX = {'雅美族(達悟族)': '達悟族'}
EXPECT_COORD = {'樟山部落', '翠巒部落', '大社部落', '大埔部落'}       # coordinate typos (checked 2026-10-18; 海端 大埔 2026-10-20)
# typos too close to tell from a relocation by distance alone: 海端鄉 廣原村 大埔部落 carries 池上 大埔部落's 緯度 (23.12053)
COORD_TYPO = {('10014120', '大埔部落')}
EXPECT_AWAY = {'好茶部落', '泰武（吾拉魯滋）部落'}   # relocated: 禮納里 (瑪家), 吾拉魯滋 (萬巒); 新七佳 sits < NEAR over the line
EXPECT_NOGEOM = {'玉泉部落', '三和部落', '美園部落'}                  # 瑪家鄉三和村
FAR = 20.0
NEAR = 1.0   # beyond this outside its own township = a relocated tribe; closer = an official point set on the boundary


def load_nm(full=False):
    t = open(os.path.join(ROOT, 'data_map_v64_profile_core.js'), encoding='utf-8').read()
    i = t.index('const NM = ') + len('const NM = '); j = t.index('\n', i)
    names = {vc: (n.replace(' ', '') if full else n.split(' ')[-1]) for vc, n in json.loads(t[i:j].rstrip().rstrip(';'))['v'].items()}
    for line in open(os.path.join(ROOT, 'village_boundary_fix', 'missing_villages.txt'), encoding='utf-8'):
        vc, n = line.rstrip('\n').split('\t'); names.setdefault(vc, n)
    return names


def load_villages(cc):
    s = open(os.path.join(ROOT, 'data_vd', cc + '.js'), encoding='utf-8').read()
    tp = json.loads(s[s.index('] = ') + 4:].rstrip().rstrip(';'))
    tr = tp.get('transform'); arcs = []
    for a in tp['arcs']:
        if tr:
            x = y = 0; pts = []
            for dx, dy in a:
                x += dx; y += dy; pts.append((x * tr['scale'][0] + tr['translate'][0], y * tr['scale'][1] + tr['translate'][1]))
        else: pts = [tuple(p) for p in a]
        arcs.append(pts)

    def ring(ix):
        out = []
        for k in ix:
            seg = arcs[k] if k >= 0 else arcs[~k][::-1]
            out += seg if not out else seg[1:]
        return out
    G = {}
    for g in tp['objects']['villages']['geometries']:
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        parts = []
        for p in polys:
            sh = ring(p[0])
            if len(sh) < 4: continue
            q = Polygon(sh, [ring(h) for h in p[1:] if len(ring(h)) >= 4]).buffer(0)
            parts += list(q.geoms) if hasattr(q, 'geoms') else [q]
        G[g['properties']['vc']] = MultiPolygon(parts)
    return G


def build():
    d = json.load(open(SRC, encoding='utf-8')); d = d[0] if isinstance(d, list) else d
    rows = [r for r in d['result']['records'] if r['縣市別代碼'] in SEEDS]
    names = load_nm(); names_full = load_nm(full=True); to = ToLocal()
    xy = to(np.array([[float(r['經度']), float(r['緯度'])] for r in rows]))
    geo = {}; out = collections.defaultdict(list); seen = collections.defaultdict(set); nog = collections.Counter()
    for r, (x, y) in zip(rows, xy):
        cc, tc = r['縣市別代碼'], r['鄉鎮市區代碼']
        G = geo.setdefault(cc, load_villages(cc))
        # a tribe may span several villages (花蓮 磯固 「民樂里、民運里、民德 里、民立里」, 太巴塱, 馬太鞍; 「國(盛、聯)里」 =
        # 國盛里、國聯里): each must resolve; 'v' = the one holding the point (else the first), 'vs' = all of them
        raw = re.sub(r'\s+', '', r['村里'])
        raw = re.sub(r'^(\S)\((\S+)\)(里|村)$', lambda m: '、'.join(m.group(1) + x + m.group(3) for x in m.group(2).split('、')), raw)
        vns = [VILL_FIX.get((tc, w), w) for w in raw.split('、')]
        vcl = []
        for w in vns:
            vcs = [vc for vc, n in names.items() if vc.startswith(tc) and n == w]
            assert len(vcs) == 1, ('village not found', tc, r['村里'], w, r['部落名稱'])
            vcl.append(vcs[0])
        vn = '、'.join(vns)
        vc = vcl[0]
        name = NAME_FIX.get(r['部落名稱'], r['部落名稱'])
        groups = [g.strip()[:-1] if g.strip().endswith('族') else g.strip() for g in GROUP_FIX.get(r['族別'], r['族別']).split('、')]
        rec = {'n': name.replace('?', '□'), 'r': r['部落傳統名制_羅馬拼音'], 'v': vc, 'vn': vn, 'g': groups, 'f': ''}
        if '?' in name: rec['miss'] = 1   # a rare character lost in the source; shown as □
        p = Point(x, y)
        own = [g for v, g in G.items() if v.startswith(tc)]
        if len(vcl) > 1:
            hit = [v for v in vcl if v in G and G[v].contains(p)]
            vc = hit[0] if hit else vcl[0]; rec['v'] = vc; rec['vs'] = vcl
        if vc not in G and min(g.distance(p) for g in own) <= NEAR and [v for v, g in G.items() if v.startswith(tc) and g.contains(p)]:
            # its 村里 was merged away after the CIP dump (臺東市 2022 redraw: 四維里, 富豐里): the official point is fine — keep
            # it; 'va' = today's village holding it (map fill), 'van' its name (panel note)
            at = [v for v, g in G.items() if v.startswith(tc) and g.contains(p)][0]
            rec['x'], rec['y'] = round(float(x), 3), round(float(y), 3); rec['va'] = at; rec['van'] = names[at]
        elif vc not in G:
            # village not on the map: an indicative point inside the tribe's own township (user: 「只是標示不是詳細位置」),
            # spread on a small ring per township; the page draws it as a dashed hollow circle labelled 位置示意
            q = unary_union(own).representative_point(); k = nog[tc]; nog[tc] += 1
            rec['f'] = 'nogeom'; rec['x'], rec['y'] = round(q.x + 1.2 * math.cos(k * 2.1), 3), round(q.y + 1.2 * math.sin(k * 2.1), 3); seen['nogeom'].add(name)
        elif min(g.distance(p) for g in own) > FAR or (tc, r['部落名稱']) in COORD_TYPO:
            q = G[vc].representative_point(); rec['f'] = 'coord'; rec['x'], rec['y'] = round(q.x, 3), round(q.y, 3); seen['coord'].add(name)
        else:
            rec['x'], rec['y'] = round(float(x), 3), round(float(y), 3)
            if min(g.distance(p) for g in own) > NEAR:
                at = [v for v, g in G.items() if g.contains(p)]
                assert len(at) == 1, ('relocated tribe not inside exactly one village', name, at)
                rec['f'] = 'away'; rec['at'] = names_full[at[0]]; rec['x'] = rec['y'] = None; seen['away'].add(name)
        out[tc].append(rec)
    assert seen['coord'] == EXPECT_COORD, seen['coord']
    assert seen['away'] == EXPECT_AWAY, seen['away']
    assert seen['nogeom'] == EXPECT_NOGEOM, seen['nogeom']
    # the same tribe name in the same village listed once per 族 (吉安 慶豐 / 南華: 阿美 + 太魯閣) = one place: the later
    # row takes the first one's point, so the page draws one dot for them (user 2026-10-20)
    for tc, lst in out.items():
        first = {}
        for rec in lst:
            k = (rec['n'], rec['vn'])
            if k in first and rec['x'] is not None and first[k]['x'] is not None: rec['x'], rec['y'] = first[k]['x'], first[k]['y']
            else: first.setdefault(k, rec)
    # a 核定部落 the CIP list files under one 族 although CIP's own 族群介紹 (or the 2025 report) names it a settlement of
    # another 族 too (撒奇萊雅 北埔/月眉/山興/水璉, 噶瑪蘭 嘉里 …): 'gx' = those 族 (drawn as wedges, they colour the map;
    # 'g' and every count stay the CIP list), 'xs' = the source (user chose split dots, 2026-10-20)
    X = json.load(open(os.path.join(ROOT, 'data_cip', 'tribe_extra_20261020.json'), encoding='utf-8'))
    tname = {r['鄉鎮市區代碼']: r['鄉鎮市區'] for r in rows}
    hit = 0
    for x in X:
        if x['cc'] not in SEEDS: continue
        m = [rec for tc, lst in out.items() if tname.get(tc) == x['town'] and tc.startswith(x['cc']) for rec in lst if rec['n'] == x['n']]
        assert len(m) == 1, ('tribe_extra row matches', len(m), x)
        if x['gx']: m[0]['gx'] = [g for g in x['gx'] if g not in m[0]['g']]
        m[0]['xs'] = x['src']; hit += 1
    print('tribe_extra rows applied', hit)
    data = {tc: v for tc, v in sorted(out.items())}
    return data, len(rows)


def main():
    data, n = build()
    s = open(PROFILE, encoding='utf-8').read()
    a, b = var_span(s, 'TRIBE_DATA')
    new = s[:a] + js(data) + s[b:]
    print('tribes', n, 'townships', len(data), 'changed', new != s)
    if '--dry-run' in sys.argv: return
    if new != s: open(PROFILE, 'w', encoding='utf-8').write(new)


if __name__ == '__main__':
    main()
