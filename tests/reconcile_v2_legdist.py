#!/usr/bin/env python3
"""Reconcile v2/data_legdist.js (build_v2_legdist.py) — 區域立委 2008 / 2012 on the 2016 district map.

    python3 tests/reconcile_v2_legdist.py

  D1 every district row: elig / cast / valid equal its elprof row and every candidate's votes its elctks row, read
     straight from the csv files (cec_lib.read only), the district found by its CEC name in elbase
  D2 exactly one elected per district, equal to elcand's elected column; 73 districts; the seat table adds up to them
  D3 each district's townships add up to the district row
  D4 the same winner and valid votes as the 2028 model's own history table (v2/data_2028_hist.json, built by
     build_v2_2028_hist.py through a different path: township keys by name, camps), matched by CEC district name
  D5 villages: every village / joint row of a township is at most the township (votes and valid), the kept rows cover
     ≥ 95 % of each year's valid votes, and every joint pointer names a kept joint row of the same district
  D6 every district name is one of the 2016 district map's (data_ed_gj_2016.js)
  D8 2008 / 2012 總統 / 不分區 (the comparison box): the districts add up to CEC's nationwide row per candidate / party
  D7 2016 / 2020 / 2024 seat tables: 民進黨 / 國民黨 / the rest equal the engine's own HIST_REGION_SEATS_* (test.html)
Prints one line per failure and a final "N FAIL(s)" like the other reconcile_* tests.
"""
import collections, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from cec_lib import read, VD  # noqa: E402

GEN = {'2008': '2008立委/區域', '2012': '20120114-總統及立委/區域立委'}
norm = lambda s: (s or '').replace('台', '臺').strip()


def main():
    s = open(os.path.join(ROOT, 'v2', 'data_legdist.js'), encoding='utf-8').read()
    data = json.loads(re.search(r'const LEGDIST = (\{.*\});', s, re.S).group(1))
    hist = json.load(open(os.path.join(ROOT, 'v2', 'data_2028_hist.json'), encoding='utf-8'))['dist']
    eds16 = set(re.findall(r'"ed":"([^"]+)"', open(os.path.join(ROOT, 'data_ed_gj_2016.js'), encoding='utf-8').read()))
    fails = []
    for y, d in GEN.items():
        got = data[y]
        f = lambda x: os.path.join(VD, d, x + '.csv')
        base = read(f('elbase'))
        area_of = {}
        for r in base:
            if r[3] == '000' and r[4] == '0000' and r[2] != '00': area_of[norm(r[5])] = (r[0] + r[1], r[2])
        prof = {(r[0] + r[1], r[2], r[3], r[4]): r for r in read(f('elprof')) if r[5] in ('0', '0000')}
        ctks = collections.defaultdict(dict)
        for r in read(f('elctks')):
            if r[5] in ('0', '0000'): ctks[(r[0] + r[1], r[2], r[3], r[4])][r[6]] = int(r[7])
        cand = {}
        for r in read(f('elcand')):
            if len(r) >= 8: cand[(r[0] + r[1], r[2], r[5])] = (r[6], len(r) > 14 and r[14] in ('*', '!'))
        if len(got['eds']) != 73: fails.append((y, 'D2 districts', len(got['eds'])))
        seats = collections.Counter()
        hist_by = {(v['winner'], v['valid']) for v in hist[y].values()}
        cover, total = 0, 0
        for ed, rec in got['eds'].items():
            if ed not in eds16: fails.append((y, ed, 'D6 not a 2016 district name'))
            key = area_of.get(rec['name'])
            if not key: fails.append((y, ed, 'D1 CEC name not found', rec['name'])); continue
            cc, area = key
            p = prof[(cc, area, '000', '0000')]
            if rec['ed'][:3] != [int(p[9]), int(p[8]), int(p[6])]: fails.append((y, ed, 'D1 elig/cast/valid', rec['ed'][:3], p[6:10]))
            raw = ctks[(cc, area, '000', '0000')]
            byname = {cand[(cc, area, no)][0]: v for no, v in raw.items()}
            for i, c in enumerate(rec['cands']):
                if byname.get(c[0]) != rec['ed'][3 + i]: fails.append((y, ed, 'D1 votes', c[0], rec['ed'][3 + i], byname.get(c[0])))
            el = [c[0] for c in rec['cands'] if c[2]]
            raw_el = [n for (c2, a2, no), (n, e) in cand.items() if (c2, a2) == (cc, area) and e]
            if len(el) != 1 or el != raw_el: fails.append((y, ed, 'D2 elected', el, raw_el))
            seats[[c[1] for c in rec['cands'] if c[2]][0]] += 1
            sums = [sum(t[i] for t in rec['tc'].values()) for i in range(len(rec['ed']))]
            if sums != rec['ed']: fails.append((y, ed, 'D3 township sum'))
            if el and (el[0], rec['ed'][2]) not in hist_by: fails.append((y, ed, 'D4 not in data_2028_hist', el[0], rec['ed'][2]))
            per_tc = collections.defaultdict(lambda: [0] * len(rec['ed']))
            for vc, v in rec['vc'].items():
                per_tc[vc[:8]] = [a + b for a, b in zip(per_tc[vc[:8]], v)]
            for jid, j in rec['jr'].items():
                per_tc[jid[:8]] = [a + b for a, b in zip(per_tc[jid[:8]], j[1:])]
            for tc, v in per_tc.items():
                t = rec['tc'].get(tc)
                if not t or any(a > b for a, b in zip(v[2:], t[2:])): fails.append((y, ed, 'D5 villages exceed township', tc))
                cover += v[2]
            for vc, jid in rec['jv'].items():
                if jid not in rec['jr']: fails.append((y, ed, 'D5 joint pointer', vc, jid))
            total += rec['ed'][2]
        if dict(seats) != got['seats']: fails.append((y, 'D2 seat table', dict(seats), got['seats']))
        if sum(got['seats'].values()) != 73: fails.append((y, 'D2 seats', sum(got['seats'].values())))
        print(y, 'districts', len(got['eds']), 'seats', got['seats'], 'village coverage %.2f%%' % (cover / total * 100))
        if cover / total < 0.95: fails.append((y, 'D5 coverage', cover / total))
    # D8 the comparison box's 總統 / 不分區 rows: the 73 districts add up to CEC's nationwide row (raw elprof / elctks),
    # per candidate and per 不分區 party (the seat parties; the rest 'other'); every district has both
    SIDE = {'2008': {'pres': '20080322-總統', 'pl': '2008立委/不分區政黨'}, '2012': {'pres': '20120114-總統及立委/總統', 'pl': '20120114-總統及立委/不分區政黨'}}
    pln = json.loads(re.search(r'const PL_NATIONAL_V2 = (\{.*\});', open(os.path.join(ROOT, 'v2', 'data_pl_national.js'), encoding='utf-8').read(), re.S).group(1))
    for y, sides in SIDE.items():
        D = data[y]
        for side, d in sides.items():
            if any(not r.get(side) or not r[side]['ed'] for r in D['eds'].values()): fails.append((y, side, 'D8 a district without the row')); continue
            tot = [sum(r[side]['ed'][i] for r in D['eds'].values()) for i in range(len(next(iter(D['eds'].values()))[side]['ed']))]
            f = lambda x: os.path.join(VD, d, x + '.csv')
            nat = [r for r in read(f('elprof')) if r[0] + r[1] == '00000' and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000')]
            if not nat or int(nat[0][6]) != tot[0]: fails.append((y, side, 'D8 valid', tot[0], nat[0][6] if nat else None))
            if side == 'pres':
                names = {r[5]: r[6] for r in read(f('elcand')) if len(r) > 6 and not (len(r) > 15 and r[15] == 'Y')}
                raw = {names.get(r[6]): int(r[7]) for r in read(f('elctks')) if r[0] + r[1] == '00000' and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000')}
                for i, c in enumerate(D['presCands']):
                    if raw.get(c[0]) != tot[1 + i]: fails.append((y, 'D8 pres', c[0], tot[1 + i], raw.get(c[0])))
            else:
                byk = collections.Counter()
                for name, key, v, seats in pln[y]['parties']: byk[key if key in D['plKeys'] else 'other'] += v
                for i, k in enumerate(D['plKeys']):
                    if byk[k] != tot[1 + i]: fails.append((y, 'D8 pl', k, tot[1 + i], byk[k]))
            print(y, side, 'districts add up', tot)
    # D7 2016 / 2020 / 2024 seat tables (district winners by own party) = the engine's HIST_REGION_SEATS_* (test.html)
    eng = open(os.path.join(ROOT, 'test.html'), encoding='utf-8').read()
    for y in ('2016', '2020', '2024'):
        m = re.search(r'const HIST_REGION_SEATS_%s = (\{[^}]*\})' % y, eng)
        h = json.loads(re.sub(r'(\w+):', r'"\1":', m.group(1)))
        got = data[y]['seats']
        mine = {'green': got.get('dpp', 0), 'blue': got.get('kmt', 0), 'rest': sum(v for k, v in got.items() if k not in ('dpp', 'kmt'))}
        theirs = {'green': h.get('green', 0), 'blue': h.get('blue', 0), 'rest': sum(v for k, v in h.items() if k not in ('green', 'blue'))}
        if mine != theirs: fails.append((y, 'D7 seats vs HIST_REGION_SEATS', mine, theirs))
        print(y, 'seats', got)
    for x in fails: print('FAIL', *x)
    print('%d FAIL(s)' % len(fails))


if __name__ == '__main__':
    main()
