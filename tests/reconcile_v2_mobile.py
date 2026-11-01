#!/usr/bin/env python3
"""Reconcile the mobile pages' data (build_v2_mobile.py: v2/m/data_hist_m.js, data_place_m.js) against independently
built tables.

    python3 tests/reconcile_v2_mobile.py

  M1 every record: v0+v1+… == valid; counties add up to the nationwide row (總統 / 不分區); each county's townships add
     up to the county (總統 / 不分區 / 縣市長)
  M2 不分區 nationwide row: elig / cast / valid and every kept party's votes equal elprof / elctks read straight from the
     csv files (cec_lib.read only); the pooled 'other' = valid − the kept parties
  M3 區域立委 seats by party per year == the History page's LEGDIST[year].seats (build_v2_legdist.py); 2016 / 2020 / 2024
     district totals per candidate == the profile's BALL_CHART_CEC legislative (build_profile_ballcharts.py, 14 counties)
  M4 縣市長: each profile county's candidates and votes == BALL_CHART_CEC mayor; exactly one elected per county
  M5 縣市議會 seats: each profile county == its <SEED>.councilYYYY byParty (build_profile_cec_tables.py)
  M6 population (戶政 115年9月 村里人口): every county / township == its villages' people_total summed straight from the
     22 vpop_all files (statistic_yyymm 11509 checked). Not the profile header's figure, which is LEGIS_CC_ELIG (2024
     選務登記人口) — a different source, so it differs on purpose.
"""
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402


def const(path, name):
    s = open(path, encoding='utf-8').read()
    return json.loads(re.search(r'const %s = (\{.*\});' % name, s, re.S).group(1))


def var_obj(s, name):
    i = s.index('var %s = ' % name) + len('var %s = ' % name); d = 0
    for k in range(i, len(s)):
        d += s[k] == '{'; d -= s[k] == '}'
        if d == 0: return json.loads(s[i:k + 1])


def main():
    H = const(os.path.join(ROOT, 'v2', 'm', 'data_hist_m.js'), 'M_HIST')
    PL = const(os.path.join(ROOT, 'v2', 'm', 'data_place_m.js'), 'M_PLACE')
    LEGDIST = const(os.path.join(ROOT, 'v2', 'data_legdist.js'), 'LEGDIST')
    prof = open(os.path.join(ROOT, 'v2', 'profile.html'), encoding='utf-8').read()
    BC = var_obj(prof, 'BALL_CHART_CEC')
    fails = []
    # M1
    for race in ('pres', 'pl'):
        for y, d in H[race].items():
            L = len(d['nat'])
            for key, rows in (('cc', d['cc']), ('tc', d['tc'])):
                for c, v in rows.items():
                    if sum(v[3:]) != v[2]: fails.append(f'M1 {race} {y} {key} {c} votes != valid')
            if [sum(v[i] for v in d['cc'].values()) for i in range(L)] != d['nat']: fails.append(f'M1 {race} {y} county sum')
            for cc, v in d['cc'].items():
                if [sum(t[i] for tc, t in d['tc'].items() if tc[:5] == cc) for i in range(L)] != v: fails.append(f'M1 {race} {y} townships of {cc}')
    for y, cs in H['mayor'].items():
        for c in cs:
            if sum(c['v'][3:]) != c['v'][2]: fails.append(f'M1 mayor {y} {c["n"]} votes != valid')
            if [sum(t[i] for t in c['tc'].values()) for i in range(len(c['v']))] != c['v']: fails.append(f'M1 mayor {y} {c["n"]} township sum')
            if sum(x[2] for x in c['cands']) != 1: fails.append(f'M4 mayor {y} {c["n"]} elected count')
    # M2
    PLD = {'2008': ('2008立委/不分區政黨', ''), '2012': ('20120114-總統及立委/不分區政黨', ''), '2016': ('2016總統立委/不分區政黨', '_T4'),
           '2020': ('2020總統立委/不分區政黨', ''), '2024': ('2024總統立委/不分區政黨', '')}
    for y, (d, suf) in PLD.items():
        f = lambda x: os.path.join(VD, d, x + suf + '.csv') if os.path.exists(os.path.join(VD, d, x + suf + '.csv')) else os.path.join(VD, d, x + '.csv')
        cname = {r[5]: r[6] for r in read(f('elcand')) if len(r) > 7}
        nat = [r for r in read(f('elprof')) if r[0] == '00' and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000')]
        votes = collections.Counter()
        for r in read(f('elctks')):
            if r[0] == '00' and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000'): votes[cname[r[6]]] += int(r[7])
        got = H['pl'][y]; valid = sum(votes.values())
        if got['nat'][:3] != [int(nat[0][9]), int(nat[0][8]), valid]: fails.append(f'M2 pl {y} nationwide head {got["nat"][:3]}')
        kept = 0
        for i, c in enumerate(got['cands']):
            if c[1] == 'other' and c[0] == '其他': continue
            if got['nat'][3 + i] != votes[c[0]]: fails.append(f'M2 pl {y} {c[0]} {got["nat"][3 + i]} vs {votes[c[0]]}')
            kept += votes[c[0]]
        if got['cands'][-1][0] == '其他' and got['nat'][-1] != valid - kept: fails.append(f'M2 pl {y} other pool')
    # M3
    for y, eds in H['leg'].items():
        seats = collections.Counter(c[1] for e in eds for c in e['cands'] if c[2])
        if dict(seats) != LEGDIST[y]['seats']: fails.append(f'M3 leg {y} seats {dict(seats)} vs {LEGDIST[y]["seats"]}')
        if y in ('2016', '2020', '2024'):
            for e in eds:
                ref = (BC.get(e['cc'], {}).get('legislative', {}).get(y) or {}).get(e['n'])
                if not ref: continue
                mine = {c[0]: e['v'][3 + i] for i, c in enumerate(e['cands'])}
                if mine != {c['name']: c['votes'] for c in ref['cands']}: fails.append(f'M3 leg {y} {e["n"]} votes differ from BALL_CHART_CEC')
    # M4
    n4 = 0
    for y, cs in H['mayor'].items():
        for c in cs:
            ref = BC.get(c['cc'], {}).get('mayor', {}).get(y)
            if not ref: continue
            n4 += 1
            mine = {x[0]: c['v'][3 + i] for i, x in enumerate(c['cands'])}
            if mine != {x['name']: x['votes'] for x in ref['cands']}: fails.append(f'M4 mayor {y} {c["n"]} votes differ from BALL_CHART_CEC')
    # M5
    seeds = re.findall(r"cc: '(\d{5})',", prof)
    n5 = 0
    for y, seats in H['council'].items():
        for cc in seeds:
            m = re.search(r"cc: '%s',.*?council%s: \{ total: (\d+), byParty: \{ ([^}]*) \} \}" % (cc, y), prof, re.S)
            if not m: continue
            ref = {k: int(v) for k, v in re.findall(r'(\w+): (\d+)', m.group(2))}
            n5 += 1
            if seats.get(cc) != ref: fails.append(f'M5 council {y} {cc} {seats.get(cc)} vs {ref}')
    # M6
    import glob
    ref = collections.Counter(); months = set()
    for fn in glob.glob(os.path.join(ROOT, 'prototype_popdots', 'raw', 'vpop_all', '*.json')):
        for r in json.load(open(fn, encoding='utf-8'))['responseData']:
            months.add(r['statistic_yyymm']); ref[r['district_code'][:5]] += int(r['people_total']); ref[r['district_code'][:8]] += int(r['people_total'])
    if months != {'11509'}: fails.append(f'M6 population months {months}')
    bad = [k for k in ref if PL['pop'].get(k) != ref[k]] + [k for k in PL['pop'] if k not in ref]
    if bad: fails.append(f'M6 population differs at {bad[:5]}')
    print('M6 population areas', len(ref), 'Taiwan', sum(v for k, v in ref.items() if len(k) == 5))
    print(f'M4 mayor checked vs BALL_CHART_CEC: {n4}; M5 council counties checked: {n5}')
    for x in fails[:30]: print('FAIL', x)
    print(f'{len(fails)} FAIL(s)')


if __name__ == '__main__':
    main()
