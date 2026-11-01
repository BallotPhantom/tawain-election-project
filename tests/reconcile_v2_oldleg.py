#!/usr/bin/env python3
"""Reconcile v2/data_oldleg.js (build_v2_oldleg.py) — 立法委員 第3–6屆 區域 + 原住民 — against the CEC csv files read here
on their own (cec_lib.read only).

    python3 tests/reconcile_v2_oldleg.py

  O1 every 區域 district: its candidates and votes (by name) == the csv's district row, elected == elcand's mark;
     valid == the votes' sum, elig / cast == the csv 選舉人 row
  O2 seats: 區域 122 (1995) / 168 (1998–2004); 平原 + 山原 3 + 3 (1995) / 4 + 4; 僑選 / 不分區 = the 憲法增修條文 6 / 30, 8 / 41
  O3 townships: each district lists as many townships as its elbase township rows (臺南市 中區 + 西區 → one 中西區),
     and every one of today's 368 townships is in exactly one district per year
  O5 不分區 / 僑選 by party (computed — build_v2_oldleg.party_list): seats add up to the law's; 僑選 == the 立法院 roster
     (data.ly.gov.tw 歷屆委員資料, sworn in on the term's first day); 不分區 within the roster's (it lists one or two more
     members than seats on the first day in 1995 / 1998 / 2004 — 31 / 43 / 42 for 30 / 41 / 41 — and later parties:
     1998 陳超明 「無黨籍」, elected for the 國民黨)
  O4 原住民: the nationwide row's candidates / votes / elected == the csv
"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

TERMS = {'1995': '3屆立委', '1998': '4屆立委', '2001': '5屆立委', '2004': '2004第6屆立法委員'}
SEATS = {'1995': (122, 3, 3), '1998': (168, 4, 4), '2001': (168, 4, 4), '2004': (168, 4, 4)}
# 僑選 / 不分區 by the 憲法增修條文 (83年 第三條: 6 / 30; 86年 第四條, 自第四屆起: 8 / 41) — 總統府 Page/324, Page/325
# 立法院 歷屆委員資料 (https://data.ly.gov.tw/odw/usageFile.action?id=16&type=CSV), members with onboardDate = the term's
# first day, by party: 全國不分區 / 僑選
ROSTER = {'1995': ({'kmt': 15, 'dpp': 12, 'np': 4}, {'kmt': 3, 'dpp': 2, 'np': 1}),
          '1998': ({'kmt': 24 + 1, 'dpp': 15, 'np': 3}, {'kmt': 4, 'dpp': 3, 'np': 1}),
          '2001': ({'kmt': 13, 'dpp': 15, 'tsu': 4, 'pfp': 9}, {'kmt': 2, 'dpp': 3, 'tsu': 1, 'pfp': 2}),
          '2004': ({'kmt': 15, 'dpp': 17, 'tsu': 4, 'pfp': 6}, {'kmt': 3, 'dpp': 3, 'tsu': 1, 'pfp': 1})}
LAW = {'1995': (6, 30), '1998': (8, 41), '2001': (8, 41), '2004': (8, 41)}


def rows(d):
    z = lambda r: [x.strip() for x in r[:2]] + [r[2].strip().zfill(2), r[3].strip().zfill(3), r[4].strip().zfill(4)] + [x.strip() for x in r[5:]]
    f = lambda x: os.path.join(VD, d, x + '.csv')
    cand = {}
    for r in map(z, read(f('elcand'))):
        if len(r) > 7: cand[(r[0] + r[1], r[2], r[5])] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
    votes = collections.defaultdict(collections.Counter)
    for r in map(z, read(f('elctks'))):
        if r[5] in ('0', '0000') and r[3] == '000' and r[4] == '0000': votes[(r[0] + r[1], r[2])][r[6]] += int(r[7])
    prof = {}
    for r in map(z, read(f('elprof'))):
        if r[5] in ('0', '0000') and r[3] == '000' and r[4] == '0000': prof.setdefault((r[0] + r[1], r[2]), (int(r[9]), int(r[8]), int(r[6])))
    towns = collections.defaultdict(set)
    for r in map(z, read(f('elbase'))):
        if r[3] != '000' and r[4] == '0000' and r[2] != '00': towns[(r[0] + r[1], r[2])].add(r[5].replace('台', '臺'))
    out = {}
    for k, vs in votes.items():
        c = lambda no: cand.get((k[0], k[1], no)) or cand.get((k[0], '01', no)) or cand.get((k[0], '00', no)) or cand.get(('00000', '01', no))
        out[k] = (sorted((c(no)[0], v, int(c(no)[1])) for no, v in vs.items()), prof.get(k) or prof.get((k[0], '00')))
    return out, towns


def main():
    D = json.loads(re.search(r'const OLD_LEG = (\{.*\});', open(os.path.join(ROOT, 'v2', 'data_oldleg.js'), encoding='utf-8').read(), re.S).group(1))
    fails = []
    for y, d in TERMS.items():
        got = D[y]
        ref, towns = rows(d + '/區域')
        ref = {k: v for k, v in ref.items() if k[1] != '00' and k[0] != '00000'}
        mine = collections.Counter(tuple(sorted((c[0], got_v, c[2]) for c, got_v in zip(e['cands'], e['v'][3:]))) for e in got['eds'])
        want = collections.Counter(tuple(v[0]) for v in ref.values())
        if mine != want: fails.append(f'{y} O1 districts differ: {sum((mine - want).values())} not in the csv, {sum((want - mine).values())} missing')
        by = {tuple(v[0]): (k, v[1]) for k, v in ref.items()}
        tcount = collections.Counter()
        for e in got['eds']:
            key = tuple(sorted((c[0], v, c[2]) for c, v in zip(e['cands'], e['v'][3:])))
            hit = by.get(key)
            if not hit: continue
            k, pr = hit
            if sum(e['v'][3:]) != e['v'][2]: fails.append(f'{y} O1 {e["n"]}{e["a"]} valid != votes')
            if pr and tuple(e['v'][:3]) != pr: fails.append(f'{y} O1 {e["n"]}{e["a"]} 選舉人 {e["v"][:3]} vs {pr}')
            tn = towns[k]
            n_expect = len(tn) - (1 if e['n'] == '臺南市' and {'中區', '西區'} <= tn else 0)
            if len(e['tcs']) != n_expect: fails.append(f'{y} O3 {e["n"]}{e["a"]} {len(e["tcs"])} townships vs elbase {n_expect}')
            tcount.update(e['tcs'])
        if len(tcount) != 368 or any(n != 1 for n in tcount.values()): fails.append(f'{y} O3 townships {len(tcount)}, in two districts: {[t for t, n in tcount.items() if n > 1][:5]}')
        s = got['seats']
        if sum(got['pl'].values()) != s['pl'] or sum(got['ov'].values()) != s['ov']: fails.append(f'{y} O5 seats add up')
        if got['ov'] != ROSTER[y][1]: fails.append(f'{y} O5 僑選 {got["ov"]} vs roster {ROSTER[y][1]}')
        if any(n > ROSTER[y][0].get(p, 0) for p, n in got['pl'].items()): fails.append(f'{y} O5 不分區 {got["pl"]} vs roster {ROSTER[y][0]}')
        if (s['ov'], s['pl']) != LAW[y]: fails.append(f'{y} O2 僑選 / 不分區 {s["ov"]} / {s["pl"]} vs 增修條文 {LAW[y]}')
        if (s['r'], s['p'], s['m']) != SEATS[y] or s['r'] != sum(c[2] for e in got['eds'] for c in e['cands']): fails.append(f'{y} O2 seats {s}')
        for kind, sub in (('p', '平原'), ('m', '山原')):
            r, _ = rows(d + '/' + sub)
            nat = r.get(('00000', '00'))
            g = got['ind'][kind]
            if not nat or sorted((c[0], v, c[2]) for c, v in zip(g['cands'], g['v'][3:])) != nat[0]: fails.append(f'{y} O4 {sub} candidates / votes')
            if nat and nat[1] and tuple(g['v'][:3]) != nat[1]: fails.append(f'{y} O4 {sub} 選舉人')
            if sum(c[2] for c in g['cands']) != s[kind]: fails.append(f'{y} O4 {sub} elected')
        print(f'{y}: {len(got["eds"])} districts, seats {s}, {len(tcount)} townships')
    for f in fails[:30]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
