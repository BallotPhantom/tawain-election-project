#!/usr/bin/env python3
"""Reconcile v2/data_pres.js (build_v2_pres.py) — 總統 2008/2012/2016/2020/2024 — independently of its reader.

    python3 tests/reconcile_v2_pres.py

  P1 the nationwide row: elig / cast / valid and every candidate's votes equal elprof / elctks, read straight from the csv
     files (cec_lib.read only)
  P2 candidates = elcand's presidential rows, exactly 1 elected (elcand's column), the running mates = elcand's vice rows,
     the party = elpaty's name for the candidate's party number; sorted by nationwide votes
  P3 the counties add up to the nationwide row, and each county's townships add up to the county
  P4 2016 / 2020 / 2024 (codes = today's): every township row equals its own elprof / elctks row; every kept village row
     equals its own row; joint-station pointers name a kept joint row
  P5 the engines' own figures, built separately: council.html PRES_TC_2016 / PRES_TC_2020 (township votes, candidate
     number order), PRES_NATIONAL_2020 / PRES_NATIONAL (2024 national votes); test.html PRES_COUNTY_2008 / _2012 (county
     shares, 2 decimals)
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

RACES = {'2008': ('20080322-總統', ''), '2012': ('20120114-總統及立委/總統', ''), '2016': ('2016總統立委/總統', '_P1'),
         '2020': ('2020總統立委/總統', ''), '2024': ('2024總統立委/總統', '')}
PARTY = {'中國國民黨': 'kmt', '民主進步黨': 'dpp', '親民黨': 'pfp', '台灣民眾黨': 'tpp', '無黨籍及未經政黨推薦': 'ind'}
# test.html PRES_COUNTY_* names counties the old way (台北市 …): today's cc5
CC_NAME = {'台北市': '63000', '新北市': '65000', '桃園市': '68000', '台中市': '66000', '台南市': '67000', '高雄市': '64000',
           '基隆市': '10017', '新竹市': '10018', '嘉義市': '10020', '新竹縣': '10004', '苗栗縣': '10005', '彰化縣': '10007',
           '南投縣': '10008', '雲林縣': '10009', '嘉義縣': '10010', '屏東縣': '10013', '宜蘭縣': '10002', '花蓮縣': '10015',
           '台東縣': '10014', '澎湖縣': '10016', '金門縣': '09020', '連江縣': '09007'}


def js_const(src, var):
    i = src.index('const %s = ' % var) + len('const %s = ' % var)
    if src[i] == '{' and src[i + 1] == '"':
        j = src.index('\n', i); return json.loads(src[i:j].rstrip().rstrip(';'))
    j = src.index('};', i) + 1   # PRES_NATIONAL*: a small hand-written literal
    txt = re.sub(r"([{,]\s*)([a-zA-Z_]+):", r'\1"\2":', src[i:j]).replace("'", '"')
    return json.loads(txt)


def same(a, b):   # 村 ↔ 里 and CEC's variant 臺 / 台
    n = lambda x: x.replace('臺', '台').rstrip('村里')
    return bool(a) and n(a) == n(b)


def main():
    global NMV
    t = open(os.path.join(ROOT, 'data_map_v64.js'), encoding='utf-8').read()
    i = t.index('const NM = ') + len('const NM = '); j = t.index('\n', i)
    NMV = {vc: v.split(' ')[-1] for vc, v in json.loads(t[i:j].rstrip().rstrip(';'))['v'].items()}
    s = open(os.path.join(ROOT, 'v2', 'data_pres.js'), encoding='utf-8').read()
    data = json.loads(re.search(r'const PRES_HIST = (\{.*\});', s, re.S).group(1))
    council = open(os.path.join(ROOT, 'council.html'), encoding='utf-8').read()
    test = open(os.path.join(ROOT, 'test.html'), encoding='utf-8').read()
    fails = []
    for y, (d, suf) in RACES.items():
        f = lambda x: os.path.join(VD, d, x + suf + '.csv') if os.path.exists(os.path.join(VD, d, x + suf + '.csv')) else os.path.join(VD, d, x + '.csv')
        got = data[y]
        paty = {r[0]: r[1] for r in read(f('elpaty'))}
        pres, vice = {}, {}
        for r in read(f('elcand')):
            if len(r) < 8: continue
            if len(r) > 15 and r[15] == 'Y': vice[r[5]] = r[6]
            else: pres[r[5]] = (r[6], PARTY.get(paty.get(r[7], ''), '?'), len(r) > 14 and r[14] in ('*', '!'))
        no_of = {v[0]: no for no, v in pres.items()}
        names = [c[0] for c in got['cands']]
        if sorted(names) != sorted(v[0] for v in pres.values()): fails.append(f'{y}: P2 candidates {names}')
        for c in got['cands']:
            no = no_of.get(c[0])
            if not no: continue
            if c[1] != pres[no][1]: fails.append(f'{y}: P2 party of {c[0]} {c[1]} vs elpaty {pres[no][1]}')
            if bool(c[2]) != pres[no][2]: fails.append(f'{y}: P2 elected mark of {c[0]}')
            if len(c) < 4 or c[3] != vice.get(no): fails.append(f'{y}: P2 running mate of {c[0]}')
        if sum(c[2] for c in got['cands']) != 1: fails.append(f'{y}: P2 elected count != 1')
        # every subtotal row straight from the csv: (cc5, dept, li) -> [elig, cast, valid, votes by name]
        prof, votes = {}, collections.defaultdict(collections.Counter)
        for r in read(f('elprof')):
            if r[5] in ('0', '0000'): prof[(r[0] + r[1], r[3], r[4])] = (int(r[9]), int(r[8]), int(r[6]))
        for r in read(f('elctks')):
            if r[5] in ('0', '0000'): votes[(r[0] + r[1], r[3], r[4])][pres[r[6]][0]] += int(r[7])
        row = lambda k: [prof[k][0], prof[k][1], prof[k][2]] + [votes[k][n] for n in names]
        nat = [k for k in prof if k[0].startswith('00') and k[1] == '000' and k[2] == '0000']
        if len(nat) != 1: fails.append(f'{y}: P1 nationwide rows {len(nat)}'); continue
        if got['nat'] != row(nat[0]): fails.append(f'{y}: P1 nationwide {got["nat"][:5]} vs {row(nat[0])[:5]}')
        nv = got['nat'][3:]
        if nv != sorted(nv, reverse=True): fails.append(f'{y}: P2 not sorted by votes')
        L = len(got['nat'])
        if [sum(r[i] for r in got['cc'].values()) for i in range(L)] != got['nat']: fails.append(f'{y}: P3 county sum')
        for cc, r in got['cc'].items():
            t = [sum(v[i] for tc, v in got['tc'].items() if tc[:5] == cc) for i in range(L)]
            if t != r: fails.append(f'{y}: P3 townships of {cc} {t[:4]} vs {r[:4]}')
        if len(got['cc']) != 22: fails.append(f'{y}: {len(got["cc"])} counties')
        if y in ('2016', '2020', '2024'):
            for tc, r in got['tc'].items():
                k = (tc[:5], tc[5:], '0000')
                if k not in prof: fails.append(f'{y}: P4 township {tc} not in elprof'); continue
                if r != row(k): fails.append(f'{y}: P4 township {tc}')
            # a village row is its own code's row, or — where CEC's code was re-issued since (台南 / 屏東 renumbering) — the
            # row whose elbase name is today's village name in the same township; no csv row is used twice
            bname = {(r[0] + r[1], r[3], r[4]): r[5] for r in read(f('elbase'))}
            vrows = collections.defaultdict(list)
            for k in prof:
                if k[1] != '000' and k[2] != '0000' and k[2].isdigit(): vrows[(k[0], k[1])].append(k)
            used = collections.Counter()
            for vc, r in got['vc'].items():
                own = [k for k in vrows[(vc[:5], vc[5:8])] if k[2][-3:] == vc[8:] and row(k) == r]
                named = [k for k in vrows[(vc[:5], vc[5:8])] if same(bname.get(k, ''), NMV.get(vc, '')) and row(k) == r]
                hit = own or named
                if not hit: fails.append(f'{y}: P4 village {vc} {NMV.get(vc)}'); continue
                used[hit[0]] += 1
            dup = [k for k, n in used.items() if n > 1]
            if dup: fails.append(f'{y}: P4 csv village rows used twice {dup[:3]}')
            for vc, jid in got['jv'].items():
                if jid not in got['jr']: fails.append(f'{y}: P4 joint pointer {vc} -> {jid}')
        # P5: the engines' own tables
        if y in ('2016', '2020'):
            E = js_const(council, 'PRES_TC_' + y)
            order = [pres[no][0] for no in sorted(pres, key=int)]
            n_eq = 0
            for tc, v in E.items():
                if tc not in got['tc']: continue
                mine = [got['tc'][tc][3 + names.index(n)] for n in order]
                if mine != v[:len(order)]: fails.append(f'{y}: P5 PRES_TC_{y} {tc} {v} vs {mine}')
                else: n_eq += 1
            print(f'{y}: P5 {n_eq} townships equal council.html PRES_TC_{y}')
        if y in ('2020', '2024'):
            E = js_const(council, 'PRES_NATIONAL_2020' if y == '2020' else 'PRES_NATIONAL')
            for side in E.values():
                if side['name'] in names and got['nat'][3 + names.index(side['name'])] != side['votes']: fails.append(f'{y}: P5 national {side["name"]}')
        if y in ('2008', '2012'):
            E = js_const(test, 'PRES_COUNTY_' + y)
            for nm, v in E.items():
                r = got['cc'].get(CC_NAME.get(nm))
                if not r: fails.append(f'{y}: P5 county {nm} missing'); continue
                tot = sum(r[3:])
                share = {c[1]: round(r[3 + i] / tot * 100, 2) for i, c in enumerate(got['cands']) if c[1] in ('kmt', 'dpp')}
                if r[2] != v['tot'] and tot != v['tot']: fails.append(f'{y}: P5 {nm} total {tot} vs {v["tot"]}')
                for p in ('kmt', 'dpp'):
                    if abs(share[p] - v[p]) > 0.011: fails.append(f'{y}: P5 {nm} {p} {share[p]} vs {v[p]}')
            print(f'{y}: P5 {len(E)} counties vs test.html PRES_COUNTY_{y}')
        print(f'{y}: nationwide + {len(got["cc"])} counties + {len(got["tc"])} townships + {len(got["vc"])} villages checked')
    for x in fails[:30]: print('FAIL', x)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
