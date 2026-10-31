#!/usr/bin/env python3
"""Reconcile v2/data_township_rep.js (build_v2_township_rep.py) against raw CEC files, independently of cec_lib's reader.

For each year, straight from the csv files of the three races (R regular + 直轄市山地原住民區, P plains-indigenous):
  - the 代表會 set is exactly the townships with an elected head (cec_lib.HAS_TOWNSHIP_HEAD), all 204 of them;
  - per district (township subtotal row of each CEC area): candidate names and votes equal elctks, valid equals elprof,
    votes sum to valid, and the elected marks equal BOTH elctks' '*'/'!' column and elcand's own elected column;
  - per village of the R districts: valid / elig / cast equal elprof, votes equal elctks (lettered joint stations kept,
    the '9999' kind and 臺東市 before 2022 (cec_lib.VILLAGES_REDRAWN) left out), and never above the district's.
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import csv, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VD = os.path.join(ROOT, 'votedata/votedata/voteData')
sys.path.insert(0, HERE)
from cec_lib import HAS_TOWNSHIP_HEAD, JOINT_LI, VILLAGES_REDRAWN  # noqa: E402  (classification only, not the vote reader)

L = {'2014': '2014-103年地方公職人員選舉/', '2018': '2018-107年地方公職人員選舉/', '2022': '2022-111年地方公職人員選舉/'}
RACES = {'2014': [('R', '縣市鄉鎮市民代表'), ('P', '縣市鄉鎮市民平原代表'), ('R', '直轄市區民代表')],
         '2018': [('R', '縣市鄉鎮市民代表'), ('P', '縣市鄉鎮市民平原代表'), ('R', '直轄市區民代表')],
         '2022': [('R', 'R1'), ('P', 'R2'), ('R', 'R3')]}


def rows(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: txt = raw.decode(enc); break
        except UnicodeDecodeError: pass
    return [[c.strip().lstrip("'") for c in r] for r in csv.reader(txt.splitlines()) if r]


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_township_rep.js'), encoding='utf-8').read()
    data = json.loads(re.search(r'const TOWNSHIP_REP = (\{.*\});', s, re.S).group(1))
    fails = []
    for y, races in RACES.items():
        dist, vill = {}, {}
        for kind, folder in races:
            base = os.path.join(VD, L[y] + folder)
            cand = {}
            for r in rows(os.path.join(base, 'elcand.csv')):
                if len(r) >= 8: cand[(r[0], r[1], r[2], r[3], r[5])] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
            look = lambda r: cand.get((r[0], r[1], r[2], r[3], r[6])) or cand.get((r[0], r[1], '00', r[3], r[6]))
            valid, vprof = {}, {}
            for r in rows(os.path.join(base, 'elprof.csv')):
                if r[3] == '000' or r[5] not in ('0', '0000'): continue
                if r[4] == '0000': valid[(r[0] + r[1] + r[3], kind + r[2])] = int(r[6])
                elif r[4] != JOINT_LI: vprof[r[0] + r[1] + r[3] + r[4][1:]] = (int(r[6]), int(r[9]), int(r[8]))
            for r in rows(os.path.join(base, 'elctks.csv')):
                if r[3] == '000' or r[5] not in ('0', '0000'): continue
                c = look(r)
                if c is None: fails.append(f'{y} {folder}: no elcand row for {r[:7]}'); continue
                tc, dk = r[0] + r[1] + r[3], kind + r[2]
                if r[4] == '0000':
                    d = dist.setdefault((tc, dk), {'valid': valid.get((tc, dk)), 'c': {}})
                    mark = len(r) > 9 and r[9] in ('*', '!')
                    if mark != c[1]: fails.append(f'{y} {tc} {dk} {c[0]}: elctks mark {mark} != elcand mark {c[1]}')
                    d['c'][c[0]] = (int(r[7]), mark)
                elif kind == 'R' and r[4] != JOINT_LI:
                    if any(int(y) < cut and (r[0], r[1], r[3]) in keys for keys, cut in VILLAGES_REDRAWN): continue
                    if r[4][0] != '0': fails.append(f'{y}: village code {r[4]} does not fit vc11'); continue
                    vc = tc + r[4][1:]
                    v = vill.setdefault(vc, {'dk': dk, 'prof': vprof.get(vc), 'c': {}})
                    v['c'][c[0]] = v['c'].get(c[0], 0) + int(r[7])
        got = data.get(y, {})
        tcs = {tc for tc, _ in dist}
        if set(got) != tcs: fails.append(f'{y}: 代表會 set differs: only-built={sorted(set(got)-tcs)[:5]} only-raw={sorted(tcs-set(got))[:5]}')
        if len(got) != 204 or any(not HAS_TOWNSHIP_HEAD(tc) for tc in got): fails.append(f'{y}: {len(got)} 代表會, or one without an elected head')
        n_seat = 0
        for (tc, dk), d in dist.items():
            g = (got.get(tc) or {}).get('d', {}).get(dk)
            if not g: fails.append(f'{y} {tc} {dk}: district missing'); continue
            gc = {c[0]: (c[2], bool(c[3])) for c in g[2]}
            if gc != d['c']: fails.append(f'{y} {tc} {dk}: candidates differ built={gc} raw={d["c"]}')
            if g[1] != d['valid'] or sum(c[2] for c in g[2]) != g[1]: fails.append(f'{y} {tc} {dk}: valid {g[1]} / elprof {d["valid"]} / sum')
            n_seat += sum(c[3] for c in g[2])
        if sum(len(b['d']) for b in got.values()) != len(dist): fails.append(f'{y}: extra districts in the built data')
        gv = {vc: (tc, r) for tc, b in got.items() for vc, r in b['v'].items()}
        if set(gv) != set(vill): fails.append(f'{y}: village set differs: only-built={sorted(set(gv)-set(vill))[:5]} only-raw={sorted(set(vill)-set(gv))[:5]}')
        over = {}
        for vc, v in vill.items():
            if vc not in gv: continue
            tc, r = gv[vc]
            if r[0] != v['dk']: fails.append(f'{y} {vc}: district {r[0]} != {v["dk"]}'); continue
            if tuple(r[1:4]) != v['prof']: fails.append(f'{y} {vc}: valid/elig/cast {r[1:4]} != elprof {v["prof"]}')
            cands = got[tc]['d'][r[0]][2]
            gc = {c[0]: r[4 + i] for i, c in enumerate(cands)}
            if gc != {n: v['c'].get(n, 0) for n in gc} or set(v['c']) - set(gc): fails.append(f'{y} {vc}: village votes differ')
            if sum(r[4:]) != r[1]: fails.append(f'{y} {vc}: village votes do not sum to valid')
            acc = over.setdefault((tc, r[0]), [0] * len(cands))
            for i, x in enumerate(r[4:]): acc[i] += x
        for (tc, dk), acc in over.items():
            if any(a > c[2] for a, c in zip(acc, got[tc]['d'][dk][2])): fails.append(f'{y} {tc} {dk}: villages exceed district votes')
        print(f'{y}: {len(got)} 代表會, {len(dist)} districts, {n_seat} seats, {len(gv)} villages checked')
    for f in fails[:30]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
