#!/usr/bin/env python3
"""Reconcile v2/data_oldmayor.js (build_v2_oldmayor.py) — 縣市長 1997／98, 2001／02, 2005／06, 2009／10 — against the CEC csv
files read here on their own (cec_lib.read only, no shared reader).

    python3 tests/reconcile_v2_oldmayor.py

  O1 every race: its county row's elig / cast / valid and every candidate's votes == the csv county subtotal rows (area
     code ignored — these files write it as 0 / 00 / 01); exactly one elected, == elcand's elected column
  O2 the townships add up to the race; every record's votes add up to its valid
  O3 races per cycle: 22 (2009／10) / 25 (the three before the 2010 mergers); each race's own year (y) and 直轄市 flag (m)
  O4 the winners named here are the well-known results (a hand list, for a sanity check of the whole chain)
"""
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

FOLDERS = {'2009': ['20091205-縣市長縣市議員及鄉鎮長/縣市長', '20101127-五都市長議員及里長/市長'], '2005': ['2005縣市長', '2006直轄市長'],
           '2001': ['2001縣市長', '2002直轄市長'], '1997': ['1997縣市長', '1998直轄市長']}
KNOWN = {('1997', '臺北縣'): '蘇貞昌', ('1997', '臺北市'): '馬英九', ('1997', '高雄市'): '謝長廷', ('2001', '臺北縣'): '蘇貞昌', ('2001', '臺中市'): '胡志強',
         ('2005', '臺北縣'): '周錫瑋', ('2005', '臺北市'): '郝龍斌', ('2005', '高雄市'): '陳菊', ('2009', '新北市'): '朱立倫', ('2009', '臺南市'): '賴清德',
         ('2009', '高雄市'): '陳菊', ('2009', '臺中市'): '胡志強', ('2009', '宜蘭縣'): '林聰賢'}


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_oldmayor.js'), encoding='utf-8').read()
    D = json.loads(re.search(r'const OLD_MAYOR = (\{.*\});', s, re.S).group(1))
    fails = []
    for cyc, folders in FOLDERS.items():
        races = D[cyc]['races']
        if len(races) != (22 if cyc == '2009' else 25): fails.append(f'O3 {cyc} {len(races)} races')
        csv = {}
        for d in folders:
            name = {}
            for r in read(os.path.join(VD, d, 'elbase.csv')):
                if r[3].lstrip('0') == '' and r[4].lstrip('0') == '': name[r[0] + r[1]] = r[5].replace('台', '臺')
            cand = {}
            for r in read(os.path.join(VD, d, 'elcand.csv')):
                if len(r) > 7 and not (len(r) > 15 and r[15] == 'Y'): cand[(r[0] + r[1], r[5])] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
            prof = {}
            for r in read(os.path.join(VD, d, 'elprof.csv')):
                if r[3].lstrip('0') == '' and r[4].lstrip('0') == '' and r[5] in ('0', '0000') and r[0] != '00':
                    prof.setdefault(r[0] + r[1], (int(r[9]), int(r[8]), int(r[6])))
            votes = collections.defaultdict(dict)
            for r in read(os.path.join(VD, d, 'elctks.csv')):
                if r[3].lstrip('0') == '' and r[4].lstrip('0') == '' and r[5] in ('0', '0000') and r[0] != '00':
                    votes[r[0] + r[1]].setdefault(cand[(r[0] + r[1], r[6])][0], int(r[7]))
            for cc, (elig, cast, valid) in prof.items():
                if cc not in votes: continue
                csv[name.get(cc, cc)] = {'head': [elig, cast, valid], 'votes': votes[cc], 'won': {cand[k][0] for k in cand if k[0] == cc and cand[k][1]}}
        for r in races:
            # O3 too: a race's own year — 直轄市長 (臺北市 / 高雄市, + 新北市 / 臺中市 / 臺南市 in 2010) a year after the cycle
            muni = r['n'] in ('臺北市', '高雄市') or (cyc == '2009' and r['n'] in ('新北市', '臺中市', '臺南市'))
            if (r['y'], r['m']) != (str(int(cyc) + muni), int(muni)): fails.append(f'O3 {cyc} {r["n"]} year {r["y"]} m {r["m"]}')
            ref = csv.get(r['n'])
            if not ref: fails.append(f'O1 {cyc} {r["n"]} not in the csv'); continue
            if r['v'][:3] != ref['head']: fails.append(f'O1 {cyc} {r["n"]} head {r["v"][:3]} vs {ref["head"]}')
            mine = {c[0]: r['v'][3 + i] for i, c in enumerate(r['cands'])}
            if mine != ref['votes']: fails.append(f'O1 {cyc} {r["n"]} candidate votes differ')
            won = {c[0] for c in r['cands'] if c[2]}
            if won != ref['won'] or len(won) != 1: fails.append(f'O1 {cyc} {r["n"]} elected {won} vs {ref["won"]}')
            L = len(r['v'])
            if [sum(t[i] for t in r['tc'].values()) for i in range(L)] != r['v']: fails.append(f'O2 {cyc} {r["n"]} township sum')
            for key in ('tc', 'vc'):
                for c, v in r[key].items():
                    if sum(v[3:]) != v[2]: fails.append(f'O2 {cyc} {r["n"]} {key} {c} votes != valid')
            k = KNOWN.get((cyc, r['n']))
            if k and k not in won: fails.append(f'O4 {cyc} {r["n"]} winner {won} (expected {k})')
        print(f'{cyc}: {len(races)} races, {sum(len(r["tc"]) for r in races)} township rows, {sum(len(r["vc"]) for r in races)} village rows checked')
    for x in fails[:30]: print('FAIL', x)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
