#!/usr/bin/env python3
"""Reconcile v2/data_legind.js (build_v2_legind.py) — 平地 / 山地原住民立委 2016/2020/2024 — independently of its reader.

    python3 tests/reconcile_v2_legind.py

  N1 the nationwide row, every county row and every township row: elig / cast equal elprof and candidate votes equal
     elctks, read straight from the csv files (cec_lib.read only); valid = the candidate-vote sum
  N2 exactly 3 elected per ballot, equal to elcand's elected column; candidates sorted by nationwide votes
  N3 the counties add up to the nationwide row, and each county's townships add up to the county
  N4 2024: every township's votes equal the engine's own IND_LEG_P / IND_LEG_M (test.html), matched by candidate name
  N5 villages: every kept village row equals its own elctks / elprof row; joint-station pointers name a kept joint row
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

RACES = {'2016': {'p': ('2016總統立委/平地立委', '_T2'), 'm': ('2016總統立委/山地立委', '_T3')},
         '2020': {'p': ('2020總統立委/平地立委', ''), 'm': ('2020總統立委/山地立委', '')},
         '2024': {'p': ('2024總統立委/平地立委', ''), 'm': ('2024總統立委/山地立委', '')}}


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_legind.js'), encoding='utf-8').read()
    data = json.loads(re.search(r'const LEGIND = (\{.*\});', s, re.S).group(1))
    fails = []
    eng = open(os.path.join(ROOT, 'test.html'), encoding='utf-8').read()
    def eng_table(var):
        i = eng.index('const %s=' % var) + len('const %s=' % var); j = eng.index('\n', i)
        txt = eng[i:j].rstrip().rstrip(';')
        txt = re.sub(r'([{,])([a-zA-Z_]+):', r'\1"\2":', txt)
        return json.loads(txt)
    ENG = {'p': eng_table('IND_LEG_P'), 'm': eng_table('IND_LEG_M')}
    for y, kinds in RACES.items():
        for kind, (d, suf) in kinds.items():
            f = lambda x: os.path.join(VD, d, x + suf + '.csv') if os.path.exists(os.path.join(VD, d, x + suf + '.csv')) else os.path.join(VD, d, x + '.csv')
            got = data[y][kind]
            names = [c[0] for c in got['cands']]
            cand = {}
            for r in read(f('elcand')):
                if len(r) >= 8: cand[r[5]] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
            if {n: e for n, e in cand.values()} != {c[0]: bool(c[2]) for c in got['cands']}: fails.append(f'{y}{kind}: candidates / elected marks differ from elcand')
            if sum(c[2] for c in got['cands']) != 3: fails.append(f'{y}{kind}: elected count != 3')
            prof, votes = {}, collections.defaultdict(collections.Counter)
            for r in read(f('elprof')):
                if r[5] in ('0', '0000'): prof[(r[0] + r[1], r[3], r[4])] = (int(r[9]), int(r[8]))   # elig, cast
            for r in read(f('elctks')):
                if r[5] in ('0', '0000'): votes[(r[0] + r[1], r[3], r[4])][cand[r[6]][0]] += int(r[7])
            def check(label, key, vec):
                if key not in prof: fails.append(f'{y}{kind} {label}: no elprof row'); return
                if tuple(vec[:2]) != prof[key]: fails.append(f'{y}{kind} {label}: elig/cast {vec[:2]} != elprof {prof[key]}')
                v = dict(zip(names, vec[3:]))
                if {n: x for n, x in v.items() if x} != {n: x for n, x in votes[key].items() if x}: fails.append(f'{y}{kind} {label}: votes differ')
                if sum(vec[3:]) != vec[2]: fails.append(f'{y}{kind} {label}: valid != candidate sum')
            nat_key = [k for k in prof if k[0].startswith('00') and k[1] == '000' and k[2] == '0000']
            check('nationwide', nat_key[0], got['nat'])
            nat_v = got['nat'][3:]
            if nat_v != sorted(nat_v, reverse=True): fails.append(f'{y}{kind}: candidates not sorted by nationwide votes')
            raw_cc = {k[0] for k in prof if not k[0].startswith('00') and k[1] == '000' and k[2] == '0000'}
            if set(got['cc']) != raw_cc: fails.append(f'{y}{kind}: county set differs')
            for cc, vec in got['cc'].items(): check(cc, (cc, '000', '0000'), vec)
            raw_tc = {k[0] + k[1] for k in prof if not k[0].startswith('00') and k[1] != '000' and k[2] == '0000'}
            if set(got['tc']) != raw_tc: fails.append(f'{y}{kind}: township set differs')
            for tc, vec in got['tc'].items(): check(tc, (tc[:5], tc[5:], '0000'), vec)
            # N3 sums
            tot = [sum(x) for x in zip(*got['cc'].values())]
            if tot[3:] != nat_v: fails.append(f'{y}{kind}: counties do not add up to the nationwide votes')
            by_cc = collections.defaultdict(list)
            for tc, vec in got['tc'].items(): by_cc[tc[:5]].append(vec)
            for cc, vs in by_cc.items():
                if [sum(x) for x in zip(*vs)][3:] != got['cc'][cc][3:]: fails.append(f'{y}{kind} {cc}: townships do not add up to the county')
            # N4 engine 2024
            if y == '2024':
                e = ENG[kind]; en = [c['n'] for c in e['cands']]
                for tc, vec in got['tc'].items():
                    if tc not in e['tc']: continue
                    mine = dict(zip(names, vec[3:])); theirs = dict(zip(en, e['tc'][tc]))
                    if any(mine.get(n, 0) != v for n, v in theirs.items()): fails.append(f'2024{kind} {tc}: votes differ from the engine IND_LEG_{kind.upper()}')
            # N5 villages
            for vc, vec in got['vc'].items():
                key = (vc[:5], vc[5:8], None)
                cands_li = [k for k in prof if k[0] == vc[:5] and k[1] == vc[5:8] and k[2].isdigit() and k[2] != '0000' and k[2][-3:] == vc[8:]]
                if len(cands_li) != 1: fails.append(f'{y}{kind} {vc}: {len(cands_li)} raw rows'); continue
                k = cands_li[0]
                if tuple(vec[:2]) != prof[k] or dict(zip(names, vec[3:])) != {n: votes[k].get(n, 0) for n in names}: fails.append(f'{y}{kind} {vc}: village row differs')
            for vc, jid in got['jv'].items():
                if jid not in got['jr']: fails.append(f'{y}{kind} {vc}: joint pointer {jid} missing')
                if vc in got['vc']: fails.append(f'{y}{kind} {vc}: has its own row and a joint pointer')
            print(f'{y}{kind}: nationwide + {len(got["cc"])} counties + {len(got["tc"])} townships + {len(got["vc"])} villages checked')
    for x in fails[:30]: print('FAIL', x)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
