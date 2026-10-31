#!/usr/bin/env python3
"""Reconcile v2/profile.html TRIBE_DATA / PINGPU_TC against the raw 原民會 部落位置 file.

    python3 tests/reconcile_tribes.py

Independent of build_profile_tribes.py except for the documented source repairs (VILL_FIX / NAME_FIX / GROUP_FIX)
and the projection (prototype_popdots ToLocal, shared with the population dots):
  T1 every raw row of a profile county appears exactly once (township, name) and nothing else does
  T2 族別, 傳統名制, 村里 (raw or its documented fix) and the village code (NM / missing_villages name inside the township)
  T3 drawn points: flag '' sits at ToLocal(official lon/lat); 'away' is undrawn and ToLocal(official) lies in its `at`
     village; 'coord' / 'nogeom' only for the known rows,
     'coord' inside its own village, 'nogeom' (no village shape) an indicative point within 1 unit of its township
  T4 a flag-'' point lies within 1 map unit of its own township (TC_GJ); an 'away' official point farther
  T5 PINGPU_TC: profile-county townships only, every 族 has a 審議中 / 已申請 / 未申請 status, items are [name, 'g'|'h'|'m'|'r'|'s', x, y(, 里)] with
     the point inside (≤ 1 unit of) its township, and inside (≤ 0.3) the listed villages when a 里 list is given (2025 原民會 report)
  T6 西拉雅 (recognised 2026-07) still has NO 核定部落 in the raw file, nationwide. Its points meanwhile come from the
     hand-compiled 今日聚落 (PINGPU_TC 'legal'; standalone page layer A). When a re-downloaded file lists 西拉雅 tribes this
     FAILS on purpose: switch 西拉雅 to the official tribes (TRIBE_DATA) and demote the hand list, then update this check.
"""
import json, os, re, sys
import numpy as np
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.join(ROOT, 'prototype_popdots'))
from build_profile_presidential import var_span, PROFILE  # noqa: E402
from build_profile_cec_tables import SEEDS  # noqa: E402
from build_profile_tribes import SRC, VILL_FIX, NAME_FIX, GROUP_FIX, load_villages, load_nm  # noqa: E402
from build_popdots import ToLocal  # noqa: E402

fails = 0
def report(ok, what, detail=''):
    global fails
    if ok: print('PASS', what)
    else: fails += 1; print('FAIL', what, detail)


def page_obj(s, name):
    a, b = var_span(s, name); return s[a:b]


def main():
    s = open(PROFILE, encoding='utf-8').read()
    data = json.loads(page_obj(s, 'TRIBE_DATA'))
    raw = json.load(open(SRC, encoding='utf-8')); raw = raw[0] if isinstance(raw, list) else raw
    rows = [r for r in raw['result']['records'] if r['縣市別代碼'] in SEEDS]
    t = open(os.path.join(ROOT, 'data_map_v64_profile_core.js'), encoding='utf-8').read()
    i = t.index('const NM = ') + len('const NM = '); j = t.index('\n', i)
    nmv = json.loads(t[i:j].rstrip().rstrip(';'))['v']
    nm = {vc: n.split(' ')[-1] for vc, n in nmv.items()}; nm_full = {vc: n.replace(' ', '') for vc, n in nmv.items()}
    for line in open(os.path.join(ROOT, 'village_boundary_fix', 'missing_villages.txt'), encoding='utf-8'):
        vc, n = line.rstrip('\n').split('\t'); nm.setdefault(vc, n)
    i = t.index('const TC_GJ = ') + len('const TC_GJ = '); j = t.index('\n', i)
    tcg = {}
    for f in json.loads(t[i:j].rstrip().rstrip(';'))['features']:
        g = f['geometry']
        for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
            rings = [r for r in poly if len(r) >= 4]   # TC_GJ carries a few degenerate 2–3-point rings
            if rings: tcg.setdefault(f['properties']['tc'], []).append(Polygon(rings[0], rings[1:]).buffer(0))
    tcg = {k: unary_union(v) for k, v in tcg.items()}

    # T1
    # key = (township, name, 族): 吉安 南華部落 / 慶豐部落 are two CIP rows each (阿美 + 太魯閣) in one village
    grp = lambda x: tuple(y.strip()[:-1] if y.strip().endswith('族') else y.strip() for y in GROUP_FIX.get(x, x).split('、'))
    page = {(tc, r['n'], tuple(r['g'])): r for tc, lst in data.items() for r in lst}
    report(sum(len(v) for v in data.values()) == len(page), 'T1 no duplicate (township, name, 族) on the page')
    key = lambda r: (r['鄉鎮市區代碼'], NAME_FIX.get(r['部落名稱'], r['部落名稱']).replace('?', '□'), grp(r['族別']))
    want = {key(r): r for r in rows}
    report(len(want) == len(rows) == len(page) and set(want) == set(page), f'T1 page rows == raw rows ({len(rows)})',
           f'missing {sorted(set(want) - set(page))[:5]} extra {sorted(set(page) - set(want))[:5]}')
    # T2
    bad = []
    for k, r in want.items():
        p = page.get(k)
        if not p: continue
        tc = r['鄉鎮市區代碼']
        g = [x.strip()[:-1] if x.strip().endswith('族') else x.strip() for x in GROUP_FIX.get(r['族別'], r['族別']).split('、')]
        # several villages (花蓮 磯固 「民樂里、民運里、民德 里、民立里」, 「國(盛、聯)里」): spaces dropped, (a、b) expanded
        rv = re.sub(r'\s+', '', r['村里'])
        rv = re.sub(r'^(\S)\((\S+)\)(里|村)$', lambda m: '、'.join(m.group(1) + x + m.group(3) for x in m.group(2).split('、')), rv)
        vns = [VILL_FIX.get((tc, x), x) for x in rv.split('、')]; vn = '、'.join(vns)
        vcs = p.get('vs') or [p['v']]
        if p['g'] != g or p['r'] != r['部落傳統名制_羅馬拼音'] or p['vn'] != vn or not p['v'].startswith(tc) or p['v'] not in vcs or [nm.get(v) for v in vcs] != vns or (len(vns) > 1) != bool(p.get('vs')):
            bad.append((k, p['g'], g, p['vn'], vn, p['v']))
    report(not bad, 'T2 族別 / 傳統名制 / 村里 / village code', bad[:4])
    # T3
    to = ToLocal(); xy = to(np.array([[float(r['經度']), float(r['緯度'])] for r in rows]))
    geo = {}; bad = []; flags = {}
    for r, (x, y) in zip(rows, xy):
        p = page.get(key(r))
        if not p: continue
        flags.setdefault(p['f'], set()).add(p['n'])
        if p['f'] == 'away':
            G = geo.setdefault(r['縣市別代碼'], load_villages(r['縣市別代碼']))
            at = [v for v, g in G.items() if g.contains(Point(x, y))]
            if p['x'] is not None or len(at) != 1 or nm_full.get(at[0]) != p.get('at'): bad.append((p['n'], 'away', p.get('at'), at))
            if tcg[r['鄉鎮市區代碼']].distance(Point(x, y)) <= 1.0: bad.append((p['n'], 'away but within 1 unit of its township'))
        elif p['f'] == '':
            # the same name in the same village under a 2nd 族 (吉安 慶豐 / 南華) takes the first row's point: one dot
            twin = [q for (tc2, n2, g2), q in page.items() if tc2 == r['鄉鎮市區代碼'] and n2 == p['n'] and q is not p and q['vn'] == p['vn']]
            ok = any(q['x'] == p['x'] and q['y'] == p['y'] for q in twin)
            if p['x'] is None or (not ok and (abs(p['x'] - x) > 1e-3 or abs(p['y'] - y) > 1e-3)): bad.append((p['n'], p['x'], p['y'], x, y))
        elif p['f'] == 'coord':
            G = geo.setdefault(r['縣市別代碼'], load_villages(r['縣市別代碼']))
            if not G[p['v']].contains(Point(p['x'], p['y'])): bad.append((p['n'], 'coord point not inside its village'))
        elif p['f'] == 'nogeom':   # indicative point inside its own township; its village has no shape
            G = geo.setdefault(r['縣市別代碼'], load_villages(r['縣市別代碼']))
            if p['x'] is None or p['v'] in G or tcg[r['鄉鎮市區代碼']].distance(Point(p['x'], p['y'])) > 1.0: bad.append((p['n'], 'nogeom point missing / outside its township, or village has a shape'))
        else: bad.append((p['n'], 'unknown flag', p['f']))
    report(not bad, 'T3 point positions / flags', bad[:4])
    report(flags.get('coord') == {'樟山部落', '翠巒部落', '大社部落', '大埔部落'}, 'T3 coordinate-typo rows', flags.get('coord'))
    report(flags.get('nogeom') == {'玉泉部落', '三和部落', '美園部落'}, 'T3 瑪家鄉三和村 rows: indicative point only', flags.get('nogeom'))
    # T4
    bad = []
    for tc, lst in data.items():
        for p in lst:
            if p['f'] != '': continue
            d = tcg[tc].distance(Point(p['x'], p['y']))
            if d > 1.0: bad.append((tc, p['n'], p['f'], round(d, 2)))
    report(not bad, 'T4 drawn points vs own township', bad[:4])
    # T5
    pp = page_obj(s, 'PINGPU_TC'); st = page_obj(s, 'PINGPU_STATUS')
    status = dict(re.findall(r"'([^']+)': '(review|applied|none|legal|x)'", st))
    # recognised non-平埔 族 (TRIBE_GROUP_COLOR) are registered as 'legal' at runtime (PP_OTHER: 非核定 settlements, 2026-10-20)
    status.update({g: 'legal' for g in re.findall(r"'([^']+)': '#", page_obj(s, 'TRIBE_GROUP_COLOR')) if g not in status})
    ent = re.findall(r"'(\d{8})': \{([^\n]*)\}", pp)
    bad = []; nm = load_nm()
    for tc, body in ent:
        if tc[:5] not in SEEDS or tc not in tcg: bad.append((tc, 'not a profile-county township'))
        for g, items in re.findall(r"'([^']+)': (\[\[.*?\]\])", body):
            if g not in status: bad.append((tc, g, 'no status'))
            for it in json.loads(items.replace("\\'",'\u0001').replace("'",'"').replace('\u0001',"'")):
                # [name, kind h/m/r/s, x, y(, 里、里)] — x, y an in-township point (shown as 「位置不準確」)
                if len(it) not in (4, 5) or it[1] not in ('g', 'h', 'm', 'r', 's') or not it[0] or not all(isinstance(v, (int, float)) for v in it[2:4]) or (len(it) == 5 and not isinstance(it[4], str)): bad.append((tc, g, it))
                elif tcg[tc].distance(Point(it[2], it[3])) > 1.0: bad.append((tc, g, it[0], 'point not inside its township'))
                elif len(it) == 5:
                    G = geo.setdefault(tc[:5], load_villages(tc[:5]))
                    vcs = [[vc for vc, n in nm.items() if vc.startswith(tc) and n == v] for v in it[4].split('、')]
                    if not all(len(x) == 1 and x[0] in G for x in vcs): bad.append((tc, g, it[0], 'village name not an official village', it[4]))
                    elif unary_union([G[x[0]] for x in vcs]).distance(Point(it[2], it[3])) > 0.3: bad.append((tc, g, it[0], 'point not inside its villages', it[4]))
    report(ent and not bad, f'T5 PINGPU_TC ({len(ent)} townships)', bad[:4])
    rng = re.findall(r"'(\d{8})': \[([^\]]*)\]", page_obj(s, 'PINGPU_RANGE_TC'))
    badr = [(tc, gs) for tc, gs in rng if tc[:5] not in SEEDS or tc not in tcg or any(g not in status for g in re.findall(r"'([^']+)'", gs))]
    report(rng and not badr, f'T5 PINGPU_RANGE_TC ({len(rng)} townships, 審議中／已申請／未申請 groups only)', badr[:4])
    # T6
    sir = [(r['縣市'] + r['鄉鎮市區'], r['部落名稱']) for r in raw['result']['records'] if '西拉雅' in r['族別']]
    report(not sir, 'T6 西拉雅 has no 核定部落 yet (hand-compiled 今日聚落 still the source)',
           f'{len(sir)} 西拉雅 tribes now in the 原民會 file, e.g. {sir[:4]} — switch 西拉雅 to the official tribes (see T6 note)')
    print(f'\n{fails} FAIL(s)'); sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
