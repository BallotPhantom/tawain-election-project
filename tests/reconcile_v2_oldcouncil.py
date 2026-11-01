#!/usr/bin/env python3
"""Reconcile v2/data_oldcouncil.js (build_v2_oldcouncil.py) — 縣市議員 1998, 2002, 2005／06, 2009／10 — against the CEC csv
files read here on their own (cec_lib.read only).

    python3 tests/reconcile_v2_oldcouncil.py

  K1 every district's candidate votes == the csv district row (直轄市 原住民 before 2010: the city row); the one district
     row CEC wrote wrong (2005 雲林縣第3選區, rebuilt from its townships) == its townships instead
  K2 every district's elected == elcand's elected column; every council's seats == its elected candidates in elcand
  K3 townships never exceed the district; they add up to it unless the district is flagged pt
  K4 the 2010 五都 councils' seat totals (臺北 62, 新北 66, 臺中 63, 臺南 57, 高雄 66)
  K5 the phone file holds the same councils, seats and district results
"""
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

N9, N10 = '20091205-縣市長縣市議員及鄉鎮長/', '20101127-五都市長議員及里長/'
FOLDERS = {'1998': ['1998縣市議員/區域', '1998縣市議員/平原', '1998縣市議員/山原', '1998直轄市議員/區域', '1998直轄市議員/原住民'],
           '2002': ['2002縣市議員/區域', '2002縣市議員/平原', '2002縣市議員/山原', '2002直轄市議員(區域)', '2002直轄市議員(原住民)'],
           '2005': ['2005縣市議員/區域', '2005縣市議員/平原', '2005縣市議員/山原', '2006直轄市議員(區域)', '2006直轄市議員(原住民)'],
           '2009': [N9 + '區域議員', N9 + '平地議員', N9 + '山地議員', N10 + '區域議員', N10 + '平地議員', N10 + '山地議員']}
REBUILT = {('2005', '雲林縣', '03')}
FIVE = {'臺北市': 62, '新北市': 66, '臺中市': 63, '臺南市': 57, '高雄市': 66}


def rows(d):
    clean = lambda r: [x.strip() for x in r]
    z = lambda r: r[:2] + [r[2].zfill(2), r[3].zfill(3), r[4].zfill(4)] + r[5:]
    base = {}
    for r in map(clean, read(os.path.join(VD, d, 'elbase.csv'))):
        r = z(r)
        if r[3] == '000' and r[4] == '0000' and r[2] == '00': base[r[0] + r[1]] = r[5].replace('台', '臺')
    cand, won = {}, collections.defaultdict(set)
    for r in map(clean, read(os.path.join(VD, d, 'elcand.csv'))):
        if len(r) < 8: continue
        r = z(r)
        cand[(r[0] + r[1], r[2], r[5])] = r[6]
        if len(r) > 14 and r[14] in ('*', '!'): won[(r[0] + r[1], r[2])].add(r[6])
    votes, star = collections.defaultdict(dict), collections.defaultdict(set)
    for r in map(clean, read(os.path.join(VD, d, 'elctks.csv'))):
        r = z(r)
        if r[3] != '000' or r[4] != '0000' or r[5] not in ('0', '0000') or r[0] == '00': continue
        n = cand.get((r[0] + r[1], r[2], r[6])) or cand.get((r[0] + r[1], '00', r[6]))
        if not n and not int(r[7]): continue   # a number elcand does not list, no votes (2002 雲林縣第6選區)
        votes[(r[0] + r[1], r[2])][n] = votes[(r[0] + r[1], r[2])].get(n, 0) + int(r[7])
        if len(r) > 9 and r[9] in ('*', '!'): star[(r[0] + r[1], r[2])].add(n)
    # elcand's elected column; a district elcand elects nobody in (2005 平原／山原 files) falls back to elctks' marks
    for k in votes:
        if not won.get(k) and star.get(k): won[k] = star[k]
    return base, votes, won


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_oldcouncil.js'), encoding='utf-8').read()
    D = json.loads(re.search(r'const OLD_COUNCIL = (\{.*\});', s, re.S).group(1))
    fails = []
    for cyc, folders in FOLDERS.items():
        csv_d, csv_won, csv_seats = {}, {}, collections.Counter()
        for f in folders:
            base, votes, won = rows(f)
            muni_ind = '原住民' in f and cyc != '2009'
            kind = 'p' if muni_ind else 'p' if ('平' in f) else 'm' if ('山' in f) else 'r'
            for (cc, area), vs in votes.items():
                if area == '00': continue   # (直轄市 原住民 files too: votes under area 01)
                csv_d[(base.get(cc, cc), area, kind)] = vs
            for (cc, area), ns in won.items():
                if area == '00': continue   # (直轄市 原住民 files too: votes under area 01)
                csv_won[(base.get(cc, cc), area, kind)] = ns
                csv_seats[base.get(cc, cc)] += len(ns)
        mine_seats = collections.Counter()
        n_d = 0
        for c in D[cyc]['councils']:
            mine_seats[c['n']] += sum(c['seats'].values())
            for kind, ds in c['d'].items():
                for d in ds:
                    n_d += 1
                    key = (c['n'], d['a'], kind)
                    mv = {x[0]: d['v'][3 + i] for i, x in enumerate(d['cands'])}
                    L = len(d['v'])
                    got = [sum(t[i] for t in d['tc'].values()) for i in range(L)] if d['tc'] else None
                    if (cyc, c['n'], d['a']) in REBUILT:
                        if got[2:] != d['v'][2:]: fails.append(f'K1 {cyc} {c["n"]} {d["a"]} rebuilt district != its townships')
                    elif csv_d.get(key) != mv: fails.append(f'K1 {cyc} {c["n"]} {kind} {d["a"]} votes differ from the csv')
                    won = {x[0] for x in d['cands'] if x[2]}
                    if won != csv_won.get(key, set()): fails.append(f'K2 {cyc} {c["n"]} {kind} {d["a"]} elected {sorted(won)} vs {sorted(csv_won.get(key, set()))}')
                    if got:
                        if any(g > v for g, v in zip(got[2:], d['v'][2:])): fails.append(f'K3 {cyc} {c["n"]} {d["a"]} townships exceed the district')
                        if got[2:] != d['v'][2:] and not d.get('pt'): fails.append(f'K3 {cyc} {c["n"]} {d["a"]} townships short, not flagged')
        for n in set(mine_seats) | set(csv_seats):
            if mine_seats[n] != csv_seats[n]: fails.append(f'K2 {cyc} {n} seats {mine_seats[n]} vs elcand {csv_seats[n]}')
        print(f'{cyc}: {len(D[cyc]["councils"])} councils, {n_d} districts, {sum(mine_seats.values())} seats (elcand {sum(csv_seats.values())})')
    for n, k in FIVE.items():
        got = sum(sum(c['seats'].values()) for c in D['2009']['councils'] if c['n'] == n and c['y'] == '2010')
        if got != k: fails.append(f'K4 2010 {n} {got} seats, expected {k}')
    # K5 the phone file (m/data_oldcouncil_m.js) is the same councils, seats and district results
    sm = open(os.path.join(ROOT, 'v2', 'm', 'data_oldcouncil_m.js'), encoding='utf-8').read()
    M = json.loads(re.search(r'const M_OLDCOUNCIL = (\{.*\});', sm, re.S).group(1))
    for cyc in D:
        a = [(c['n'], c['y'], c['seats'], {k: [(d['a'], d['cands'], d['v']) for d in ds] for k, ds in c['d'].items()}) for c in D[cyc]['councils']]
        b = [(c['n'], c['y'], c['seats'], {k: [(d['a'], d['cands'], d['v']) for d in ds] for k, ds in c['d'].items()}) for c in M[cyc]['councils']]
        if a != b: fails.append(f'K5 {cyc} phone file differs')
    for f in fails[:40]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
