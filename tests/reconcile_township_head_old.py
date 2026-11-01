#!/usr/bin/env python3
"""Reconcile v2/data_township_head_old.js (build_v2_township_head_old.py) — 鄉鎮市長 1998 / 2002 / 2005 / 2009 — against the
CEC csv files read here on their own (cec_lib.read only).

    python3 tests/reconcile_township_head_old.py

  H1 every township race: its candidates' votes == the csv township rows (by township name), one elected == elcand
  H2 valid == the candidates' sum; elig / cast == the csv 選舉人 row where it has one
  H3 villages: each row's votes add up to its valid, and a township's villages never exceed it
  H4 races per year: 319 (1998 / 2002 / 2005), 211 (2009 — 臺北縣 / 臺中縣 / 臺南縣 / 高雄縣 held none before the 2010 mergers)
"""
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

FOLDERS = {'1998': '1998鄉鎮市長', '2002': '2002鄉鎮市長選舉', '2005': '2005鄉鎮市長', '2009': '20091205-縣市長縣市議員及鄉鎮長/鄉鎮市長'}
COUNT = {'1998': 319, '2002': 319, '2005': 319, '2009': 211}


def csv_races(d):
    z = lambda r: [x.strip() for x in r[:2]] + [r[2].strip().zfill(2), r[3].strip().zfill(3), r[4].strip().zfill(4)] + [x.strip() for x in r[5:]]
    county, town = {}, {}
    for r in map(z, read(os.path.join(VD, d, 'elbase.csv'))):
        if r[3] == '000' and r[4] == '0000': county[r[0] + r[1]] = r[5].replace('台', '臺')
        elif r[4] == '0000': town[(r[0] + r[1], r[3])] = r[5].replace('台', '臺')
    cand = {}
    for r in map(z, read(os.path.join(VD, d, 'elcand.csv'))):
        if len(r) > 7: cand[(r[0] + r[1], r[3], r[5])] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
    prof = {}
    for r in map(z, read(os.path.join(VD, d, 'elprof.csv'))):
        if r[4] == '0000' and r[3] != '000' and r[5] in ('0', '0000'): prof.setdefault((r[0] + r[1], r[3]), (int(r[9]), int(r[8]), int(r[6])))
    out = collections.defaultdict(dict)
    for r in map(z, read(os.path.join(VD, d, 'elctks.csv'))):
        if r[3] == '000' or r[4] != '0000' or r[5] not in ('0', '0000') or r[0] == '00': continue
        k = (r[0] + r[1], r[3])
        out[k][cand[(k[0], k[1], r[6])][0]] = out[k].get(cand[(k[0], k[1], r[6])][0], 0) + int(r[7])
    won = {k: {n for (c, t, no), (n, e) in cand.items() if (c, t) == k and e} for k in out}
    return {(county.get(k[0], k[0]), town.get(k, '')): (v, won[k], prof.get(k)) for k, v in out.items()}


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_township_head_old.js'), encoding='utf-8').read()
    D = json.loads(re.search(r'const TOWNSHIP_HEAD_OLD = (\{.*?\});\n', s, re.S).group(1))
    V = json.loads(re.search(r'const TOWNSHIP_HEAD_OLD_VILL = (\{.*?\});\n', s, re.S).group(1))
    m = open(os.path.join(ROOT, 'data_map_v64.js'), encoding='utf-8').read()
    fails = []
    for y, d in FOLDERS.items():
        ref = csv_races(d)
        mine = D[y]
        if len(mine) != COUNT[y]: fails.append(f'H4 {y} {len(mine)} races')
        if len(ref) != len(mine): fails.append(f'H1 {y} {len(mine)} races vs csv {len(ref)}')
        by_votes = {tuple(sorted(v.items())): (k, w, p) for k, (v, w, p) in ref.items()}
        for tc, t in mine.items():
            key = tuple(sorted((c['n'], c['v']) for c in t['cands']))
            hit = by_votes.get(key)
            if not hit: fails.append(f'H1 {y} {tc} {t["name"]} candidates/votes not found in the csv'); continue
            (cn, tn), won, pr = hit
            if tn.replace('台', '臺') != t['name']: fails.append(f'H1 {y} {tc} name {t["name"]} vs csv {tn}')
            mw = {c['n'] for c in t['cands'] if c['e']}
            if mw != won or len(mw) != 1: fails.append(f'H1 {y} {tc} elected {mw} vs {won}')
            if sum(c['v'] for c in t['cands']) != t['valid']: fails.append(f'H2 {y} {tc} valid')
            if pr and (t['elig'], t['cast'], t['valid']) != pr: fails.append(f'H2 {y} {tc} 選舉人 {(t["elig"], t["cast"], t["valid"])} vs {pr}')
            vs = [v for vc, v in V[y].items() if vc[:8] == tc]
            if vs:
                tot = [sum(v[3 + i] for v in vs) for i in range(len(t['cands']))]
                if any(a > c['v'] for a, c in zip(tot, t['cands'])): fails.append(f'H3 {y} {tc} villages exceed the township')
        for vc, v in V[y].items():
            if sum(v[3:]) != v[0]: fails.append(f'H3 {y} {vc} votes != valid')
        print(f'{y}: {len(mine)} races, {len(V[y])} villages')
    for f in fails[:40]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
