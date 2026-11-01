#!/usr/bin/env python3
"""Reconcile v2/data_council_ind.js (build_v2_council_ind.py) — 縣市議員 平地／山地原住民選區 × 鄉鎮 2014–2022.

    python3 tests/reconcile_v2_council_ind.py

  C1 every district's candidate votes and elected set == the engine's own COUNCIL_IND_P/M_DISTS (council.html: the 2014
     / 2018 JSON constants and the 2022 literal), and the two hold the same districts
  C2 every district's valid == the sum of its candidates; its townships add up to it
  C3 every township code is one of today's townships (data_map_v64.js NM.t)
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def engine():
    s = open(os.path.join(ROOT, 'council.html'), encoding='utf-8').read()
    E = {}
    for y in ('2014', '2018'):
        for k, n in (('p', 'P'), ('m', 'M')):
            m = re.search(r'const COUNCIL_IND_%s_DISTS_%s = (\{.*?\});\n' % (n, y), s)
            E.setdefault(y, {})[k] = {cc + '_' + d['dist']: d for cc, ds in json.loads(m.group(1)).items() for d in ds}
    for k, n in (('p', 'P'), ('m', 'M')):   # 2022: a hand-written literal — read district by district
        i = s.index('let COUNCIL_IND_%s_DISTS = {' % n); j = s.index('\n};', i)
        body, cur, out = s[i:j], None, {}
        for line in body.split('\n'):
            mc = re.match(r"\s*'(\d+)':", line)
            if mc: cur = mc.group(1)
            for dm in re.finditer(r"\{dist:'(\d+)'.*?cands:\[(.*?)\]\}", line):
                cands = [{'n': a, 'v': int(b), 'e': int(c)} for a, b, c in re.findall(r'n:"([^"]*)",p:\'[^\']*\',v:(\d+),pct:[\d.]+,e:(\d)', dm.group(2))]
                out[cur + '_' + dm.group(1)] = {'cands': cands}
        E.setdefault('2022', {})[k] = out
    return E


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_council_ind.js'), encoding='utf-8').read()
    D = json.loads(re.search(r'const COUNCIL_IND = (\{.*\});', s, re.S).group(1))
    m = open(os.path.join(ROOT, 'data_map_v64.js'), encoding='utf-8').read()
    tcs = set(re.findall(r'"(\d{8})":', m[m.index('"t":'):]))
    EN = engine()
    fails = []
    for y in ('2014', '2018', '2022'):
        for k in ('p', 'm'):
            mine, eng = D[y][k], EN[y][k]
            if set(mine) != set(eng): fails.append(f'C1 {y}{k} districts differ: mine-only {sorted(set(mine) - set(eng))}, engine-only {sorted(set(eng) - set(mine))}')
            for key, d in mine.items():
                e = eng.get(key)
                if e:
                    a = sorted(d['v'][3:]); b = sorted(c['v'] for c in e['cands'])
                    if a != b: fails.append(f'C1 {y}{k} {key} votes {a} vs engine {b}')
                    ew = sorted(c['v'] for c in e['cands'] if c['e']); mw = sorted(d['v'][3 + i] for i, c in enumerate(d['cands']) if c[2])
                    if ew != mw: fails.append(f'C1 {y}{k} {key} elected votes {mw} vs engine {ew}')
                if sum(d['v'][3:]) != d['v'][2]: fails.append(f'C2 {y}{k} {key} valid != sum')
                L = len(d['v'])
                if [sum(t[i] for t in d['tc'].values()) for i in range(L)] != d['v']: fails.append(f'C2 {y}{k} {key} township sum')
                bad = [tc for tc in d['tc'] if tc not in tcs]
                if bad: fails.append(f'C3 {y}{k} {key} unknown townships {bad[:3]}')
            print(f'{y} {k}: {len(mine)} districts (engine {len(eng)}), {sum(len(d["tc"]) for d in mine.values())} township rows')
    for f in fails[:40]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
