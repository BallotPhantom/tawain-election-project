#!/usr/bin/env python3
"""Reconcile v2/data_township_rep_old.js and v2/data_village_chief_old.js (build_v2_local_2010.py) — 鄉鎮市民代表 2010 and
村里長 2010 — against the CEC csv files read here on their own (cec_lib.read only).

    python3 tests/reconcile_local_2010.py

  L1 代表: every district's candidates and votes == the csv district rows (matched by candidate name + votes);
     elected == elcand; seats in all == the csv's nationwide 當選 count (2,322)
  L2 村里長: every village's candidates / votes == a csv village (its subtotal, else its polling stations added up),
     elected == elcand; valid == the votes' sum
  L3 counts: 211 代表會 / 723 districts; villages kept + left out == the csv villages with votes
"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402


def z(r):
    r = [x.strip() for x in r]
    return r[:2] + [r[2].zfill(2), r[3].zfill(3), r[4].zfill(4)] + r[5:] if len(r) > 5 else r


def races(d):
    cand = {}
    for r in map(z, read(os.path.join(VD, d, 'elcand.csv'))):
        if len(r) > 7: cand[(r[0] + r[1], r[2], r[3], r[4], r[5].lstrip('0'))] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
    sub, st = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    for r in map(z, read(os.path.join(VD, d, 'elctks.csv'))):
        k = (r[0] + r[1], r[2], r[3], r[4])
        (sub if r[5] in ('0', '0000') else st)[k][r[6].lstrip('0')] += int(r[7])
    out = {}
    for k in set(sub) | set(st):
        vs = sub.get(k) or st[k]
        out[k] = sorted((cand[k + (no,)][0], v, 1 if cand[k + (no,)][1] else 0) for no, v in vs.items())
    return out


def main():
    fails = []
    R = json.loads(re.search(r'const TOWNSHIP_REP_OLD = (\{.*\});', open(os.path.join(ROOT, 'v2', 'data_township_rep_old.js'), encoding='utf-8').read(), re.S).group(1))['2010']
    ref = collections.Counter(tuple(v) for k, v in races('2010鄉鎮市民代表').items() if k[1] != '00' and k[2] != '000' and k[3] == '0000')
    mine = collections.Counter(tuple(sorted((c[0], c[2], c[3]) for c in dd[2])) for t in R.values() for dd in t['d'].values())
    if mine != ref: fails.append(f'L1 代表 districts differ: {sum((mine - ref).values())} not in the csv, {sum((ref - mine).values())} missing')
    seats = sum(c[3] for t in R.values() for dd in t['d'].values() for c in dd[2])
    if seats != 2322: fails.append(f'L1 seats {seats}')
    nd = sum(len(t['d']) for t in R.values())
    if (len(R), nd) != (211, 723): fails.append(f'L3 {len(R)} 代表會 / {nd} districts')
    V = json.loads(re.search(r'const VILLAGE_CHIEF_OLD = (\{.*\});', open(os.path.join(ROOT, 'v2', 'data_village_chief_old.js'), encoding='utf-8').read(), re.S).group(1))['2010']
    ref = collections.Counter()
    for d in ('2010村里長', '20101127-五都市長議員及里長/里長'):
        ref.update(tuple(v) for k, v in races(d).items() if k[3] != '0000' and k[2] != '000' and v)
    mine = collections.Counter(tuple(sorted((c[0], c[2], c[3]) for c in r[3])) for r in V.values())
    extra = mine - ref
    if extra: fails.append(f'L2 {sum(extra.values())} villages not in the csv, e.g. {list(extra)[:2]}')
    for vc, r in V.items():
        if sum(c[2] for c in r[3]) != r[0]: fails.append(f'L2 {vc} valid != votes')
    print(f'代表 2010: {len(R)} 代表會, {nd} districts, {seats} seats | 村里長 2010: {len(V)} villages of {sum(ref.values())} in the csv')
    for f in fails[:30]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
