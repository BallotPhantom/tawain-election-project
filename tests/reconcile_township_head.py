#!/usr/bin/env python3
"""Reconcile v2/data_township_head.js (build_v2_township_head.py) against raw CEC files, independently of cec_lib.

For each year: re-sum every township subtotal row of elctks.csv straight from the csv (no cec_lib), and check
  - exactly the townships that have an elected head: all 縣 townships + the 6 直轄市山地原住民區, nothing else;
  - per candidate: name and votes match, elected flag matches elctks' '*' mark, exactly one elected;
  - valid votes equal elprof's township row;
  - village layer (v2/data_township_head_vill.js, 2026-10-27): every village subtotal row of the same races,
    per-candidate votes and valid/elig/cast match the raw rows, nothing extra, and village votes never exceed
    the township's (lettered joint stations like 連江 '0A03' are kept as their own rows; the '9999' kind is left out, so
    villages may fall short of the township, never over).
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import csv, json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VD = os.path.join(ROOT, 'votedata/votedata/voteData')
sys.path.insert(0, HERE)
from cec_lib import HAS_TOWNSHIP_HEAD, INDIGENOUS_DISTRICTS, JOINT_LI, VILLAGES_REDRAWN  # noqa: E402  (classification only, not the vote reader)

FOLDERS = {'2014': ('2014-103年地方公職人員選舉/縣市鄉鎮市長', '2014-103年地方公職人員選舉/直轄市區長'),
           '2018': ('2018-107年地方公職人員選舉/縣市鄉鎮市長', '2018-107年地方公職人員選舉/直轄市區長'),
           '2022': ('2022-111年地方公職人員選舉/D1', '2022-111年地方公職人員選舉/D2')}


def rows(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: txt = raw.decode(enc); break
        except UnicodeDecodeError: pass
    return [[c.strip().lstrip("'") for c in r] for r in csv.reader(txt.splitlines()) if r]


def load_js():
    s = open(os.path.join(ROOT, 'v2', 'data_township_head.js'), encoding='utf-8').read()
    return json.loads(re.search(r'const TOWNSHIP_HEAD = (\{.*\});', s, re.S).group(1))


def load_vill():
    s = open(os.path.join(ROOT, 'v2', 'data_township_head_vill.js'), encoding='utf-8').read()
    return json.loads(re.search(r'const TOWNSHIP_HEAD_VILL = (\{.*\});', s, re.S).group(1))


def main():
    data = load_js()
    vdata = load_vill()
    fails = []
    for y, folders in FOLDERS.items():
        truth, vtruth = {}, {}
        for d in folders:
            base = os.path.join(VD, d)
            names = {}
            for r in rows(os.path.join(base, 'elcand.csv')):
                if len(r) >= 8: names[(r[0], r[1], r[2], r[3], r[5])] = r[6]
            valid, vprof = {}, {}
            for r in rows(os.path.join(base, 'elprof.csv')):
                if r[3] != '000' and r[4] == '0000' and r[5] in ('0', '0000'):
                    valid[r[0] + r[1] + r[3]] = int(r[6])
                if r[3] != '000' and r[4] != '0000' and r[4] != JOINT_LI and r[5] in ('0', '0000'):
                    vprof[r[0] + r[1] + r[3] + r[4][1:]] = (int(r[6]), int(r[9]), int(r[8]))   # valid, elig, cast
            for r in rows(os.path.join(base, 'elctks.csv')):
                if r[3] == '000' or r[4] == '0000' or r[4] == JOINT_LI or r[5] not in ('0', '0000'): continue   # lettered joint stations ('0A03') stay
                # villages redrawn wholesale since (臺東市 before 2022) are dropped by project rule, see cec_lib
                if any(int(y) < cut and (r[0], r[1], r[3]) in keys for keys, cut in VILLAGES_REDRAWN): continue
                vc = r[0] + r[1] + r[3] + r[4][1:]   # vc11 = tc8 + last 3 village digits
                if r[4][0] != '0': fails.append(f'{y}: village code {r[4]} does not fit vc11')
                nm = names.get((r[0], r[1], r[2], r[3], r[6])) or names.get((r[0], r[1], '00', r[3], r[6]))
                vt = vtruth.setdefault(vc, {'prof': vprof.get(vc), 'c': {}})
                vt['c'][nm] = vt['c'].get(nm, 0) + int(r[7])
            for r in rows(os.path.join(base, 'elctks.csv')):
                if r[3] == '000' or r[4] != '0000' or r[5] not in ('0', '0000'): continue
                tc = r[0] + r[1] + r[3]
                nm = names.get((r[0], r[1], r[2], r[3], r[6])) or names.get((r[0], r[1], '00', r[3], r[6]))
                t = truth.setdefault(tc, {'valid': valid.get(tc), 'c': {}})
                t['c'][nm] = (int(r[7]), len(r) > 9 and r[9] in ('*', '!'))
        got = data.get(y, {})
        if set(got) != set(truth):
            fails.append(f'{y}: township set differs: only-built={sorted(set(got)-set(truth))[:5]} only-raw={sorted(set(truth)-set(got))[:5]}')
        bad_scope = [tc for tc in got if not HAS_TOWNSHIP_HEAD(tc)]
        if bad_scope: fails.append(f'{y}: townships without an elected head in the data: {bad_scope[:5]}')
        miss_ind = [tc for tc in INDIGENOUS_DISTRICTS if tc not in got]
        if miss_ind: fails.append(f'{y}: 原住民區 missing: {miss_ind}')
        for tc, t in truth.items():
            g = got.get(tc)
            if not g: continue
            if g['valid'] != t['valid']: fails.append(f'{y} {tc}: valid {g["valid"]} != elprof {t["valid"]}')
            gc = {c['n']: (c['v'], bool(c['e'])) for c in g['cands']}
            if gc != t['c']: fails.append(f'{y} {tc}: candidates differ built={gc} raw={t["c"]}')
            if sum(c['e'] for c in g['cands']) != 1: fails.append(f'{y} {tc}: elected count != 1')
            if sum(c['v'] for c in g['cands']) != g['valid']: fails.append(f'{y} {tc}: votes do not sum to valid')
        vgot = vdata.get(y, {})
        if set(vgot) != set(vtruth):
            fails.append(f'{y}: village set differs: only-built={sorted(set(vgot)-set(vtruth))[:5]} only-raw={sorted(set(vtruth)-set(vgot))[:5]}')
        vsum = {}
        for vc, vt in vtruth.items():
            g, t = vgot.get(vc), got.get(vc[:8])
            if not g or not t: continue
            if tuple(g[:3]) != vt['prof']: fails.append(f'{y} {vc}: valid/elig/cast {g[:3]} != elprof {vt["prof"]}')
            gc = {c['n']: g[3 + i] for i, c in enumerate(t['cands'])}
            if gc != {n: vt['c'].get(n, 0) for n in gc} or set(vt['c']) - set(gc):
                fails.append(f'{y} {vc}: village votes differ built={gc} raw={vt["c"]}')
            if sum(g[3:]) != g[0]: fails.append(f'{y} {vc}: village votes do not sum to valid')
            acc = vsum.setdefault(vc[:8], [0] * len(t['cands']))
            for i, v in enumerate(g[3:]): acc[i] += v
        for tc, acc in vsum.items():
            if any(a > c['v'] for a, c in zip(acc, got[tc]['cands'])): fails.append(f'{y} {tc}: villages exceed township votes')
        short = sum(1 for tc, acc in vsum.items() if sum(acc) != got[tc]['valid'])
        print(f'{y}: {len(got)} townships, {len(vgot)} villages checked ({short} townships with joint stations outside the village rows)')
    for f in fails: print('FAIL', f)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
