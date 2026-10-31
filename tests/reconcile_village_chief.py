#!/usr/bin/env python3
"""Reconcile v2/data_village_chief.js (build_v2_village_chief.py) against raw CEC files, independently of cec_lib's reader.

For each year: re-read every village subtotal row of elctks.csv / elprof.csv straight from the csv and check
  - the village set matches (臺東市 villages before 2022 dropped by the project rule cec_lib.VILLAGES_REDRAWN);
  - per village: valid / elig / cast equal elprof, candidate names and votes equal elctks, votes sum to valid;
  - elected flags equal elctks' '*' mark: exactly one, or none only when the first place is a tie (同票, by lot).
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import csv, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VD = os.path.join(ROOT, 'votedata/votedata/voteData')
sys.path.insert(0, HERE)
from cec_lib import JOINT_LI, VILLAGES_REDRAWN  # noqa: E402  (classification only, not the vote reader)

FOLDERS = {'2014': ('2014-103年地方公職人員選舉/村里長',),
           '2018': ('2018-107年地方公職人員選舉/直轄市村里長', '2018-107年地方公職人員選舉/縣市村里長'),
           '2022': ('2022-111年地方公職人員選舉/V1',)}


def rows(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: txt = raw.decode(enc); break
        except UnicodeDecodeError: pass
    return [[c.strip().lstrip("'") for c in r] for r in csv.reader(txt.splitlines()) if r]


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_village_chief.js'), encoding='utf-8').read()
    data = json.loads(re.search(r'const VILLAGE_CHIEF = (\{.*\});', s, re.S).group(1))
    fails = []
    for y, folders in FOLDERS.items():
        truth = {}
        for d in folders:
            base = os.path.join(VD, d)
            names = {}
            for r in rows(os.path.join(base, 'elcand.csv')):
                if len(r) >= 8: names[(r[0], r[1], r[2], r[3], r[4], r[5])] = r[6]
            prof = {}
            for r in rows(os.path.join(base, 'elprof.csv')):
                if r[3] != '000' and r[4] not in ('0000', JOINT_LI) and r[5] in ('0', '0000'):
                    prof[r[0] + r[1] + r[3] + r[4][1:]] = (int(r[6]), int(r[9]), int(r[8]))   # valid, elig, cast
            for r in rows(os.path.join(base, 'elctks.csv')):
                if r[3] == '000' or r[4] in ('0000', JOINT_LI) or r[5] not in ('0', '0000'): continue
                if any(int(y) < cut and (r[0], r[1], r[3]) in keys for keys, cut in VILLAGES_REDRAWN): continue
                if r[4][0] != '0': fails.append(f'{y}: village code {r[4]} does not fit vc11'); continue
                vc = r[0] + r[1] + r[3] + r[4][1:]
                nm = names.get((r[0], r[1], r[2], r[3], r[4], r[6])) or names.get((r[0], r[1], '00', r[3], r[4], r[6]))
                if nm is None: fails.append(f'{y} {vc}: no elcand name for number {r[6]}'); continue
                t = truth.setdefault(vc, {'prof': prof.get(vc), 'c': {}})
                t['c'][nm] = (t['c'].get(nm, (0, False))[0] + int(r[7]), len(r) > 9 and r[9] in ('*', '!'))
        got = data.get(y, {})
        if set(got) != set(truth):
            fails.append(f'{y}: village set differs: only-built={sorted(set(got)-set(truth))[:5]} only-raw={sorted(set(truth)-set(got))[:5]}')
        ties = 0
        for vc, t in truth.items():
            g = got.get(vc)
            if not g: continue
            if tuple(g[:3]) != t['prof']: fails.append(f'{y} {vc}: valid/elig/cast {g[:3]} != elprof {t["prof"]}')
            gc = {c[0]: (c[2], bool(c[3])) for c in g[3]}
            if gc != t['c']: fails.append(f'{y} {vc}: candidates differ built={gc} raw={t["c"]}')
            if sum(c[2] for c in g[3]) != g[0]: fails.append(f'{y} {vc}: votes do not sum to valid')
            n_el = sum(c[3] for c in g[3])
            top = sorted((c[2] for c in g[3]), reverse=True)
            if n_el == 0:
                ties += 1
                if not (len(top) > 1 and top[0] == top[1]): fails.append(f'{y} {vc}: no elected chief and no first-place tie')
            elif n_el != 1: fails.append(f'{y} {vc}: elected count {n_el}')
        print(f'{y}: {len(got)} villages checked ({ties} first-place ties without an elected mark)')
    for f in fails[:30]: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
