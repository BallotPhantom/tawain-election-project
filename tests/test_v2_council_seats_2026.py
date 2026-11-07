#!/usr/bin/env python3
"""Checks v2/data_council_seats_2026.js (build_v2_council_seats_2026.py) against the CEC's own totals and against itself.

  - 919 seats: 直轄市 381, 縣市 538 (CEC press release https://web.cec.gov.tw/central/article/63315);
  - every county's districts add up to its 議員總額 in the announcement;
  - districts numbered 1..N in each county, 區域 first, then 平地, then 山地 (the announcement's order);
  - the women's quota column equals 地方制度法第33條's 「名額達四人者，應有婦女當選名額一人；超過四人者，每增加四人增一人」
    (floor(n/4) from 4 seats), blank only where fewer than 4 seats; 原住民 by the whole 平地 / 山地 group (the
    announcement's merged cells);
  - the 區域 districts cover every township of the county once — a township split between districts by village
    (竹北市, 新竹市's 區) has its villages split without overlap;
  - every 原住民 district names townships of its own county.
    python3 tests/test_v2_council_seats_2026.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, 'v2', 'data_council_seats_2026.js'), encoding='utf-8').read()
def const(name):
    i = s.index('const ' + name + ' = ') + len('const ' + name + ' = '); j = s.index(';\n', i)
    return json.loads(s[i:j])
SEATS, TOTAL, IND_W = const('COUNCIL_SEATS_2026'), const('COUNCIL_TOTAL_2026'), const('COUNCIL_IND_WOMEN_2026')
m = open(os.path.join(ROOT, 'data_map_v64.js'), encoding='utf-8').read()
i = m.index('const NM = ') + len('const NM = '); NM = json.loads(m[i:m.index('\n', i)].rstrip().rstrip(';'))
MUNI = {'63', '64', '65', '66', '67', '68'}
fails = []
def check(ok, *msg):
    if not ok: fails.append(' '.join(map(str, msg)))

tot = sum(v[1] for v in SEATS.values())
muni = sum(v[1] for v in SEATS.values() if v[0] in MUNI)
check(tot == 919, 'total', tot); check(muni == 381, 'municipal', muni); check(tot - muni == 538, 'county', tot - muni)
check(len(TOTAL) == 22, 'counties', len(TOTAL))
for cc, t in TOTAL.items():
    ds = sorted((k for k in SEATS if SEATS[k][0] == cc), key=lambda k: int(k.split('_')[1]))
    check(sum(SEATS[k][1] for k in ds) == t, cc, 'sum', sum(SEATS[k][1] for k in ds), '!=', t)
    check([int(k.split('_')[1]) for k in ds] == list(range(1, len(ds) + 1)), cc, 'numbering')
    kinds = ''.join(SEATS[k][3] for k in ds)
    check(kinds == ''.join(sorted(kinds, key='rpm'.index)), cc, 'order', kinds)
    # coverage of the 區域 districts
    towns = {tc for tc in NM['t'] if (tc[:2] if tc[:2] in MUNI else tc[:5]) == cc}
    seen, vseen = {}, {}
    for k in ds:
        c, n, w, kind, tcs, vcs, area = SEATS[k]
        if kind == 'r': check(w == (n // 4 if n >= 4 else 0) if w is not None else n < 4, k, 'women quota', n, w)
        check(tcs and set(tcs) <= towns, k, 'townships outside the county', set(tcs) - towns)
        if kind != 'r': continue
        for tc in tcs:
            vs = [v for v in (vcs or []) if v[:8] == tc]
            if vs:
                for v in vs: check(v not in vseen, k, 'village twice', v, vseen.get(v)); vseen[v] = k
            else:
                check(tc not in seen, k, 'township twice', tc, seen.get(tc)); seen[tc] = k
    for kind in 'pm':   # 原住民: one quota for the whole 平地 / 山地 group
        g = sum(SEATS[k][1] for k in ds if SEATS[k][3] == kind)
        if g: check(IND_W.get(cc, {}).get(kind) == (g // 4 if g >= 4 else 0), cc, kind, 'group quota', g, IND_W.get(cc, {}).get(kind))
    split = {v[:8] for v in vseen}
    check(towns == set(seen) | split, cc, 'townships not covered', towns - set(seen) - split)
    for tc in split:
        allv = {v for v in NM['v'] if v[:8] == tc}
        check(allv == {v for v in vseen if v[:8] == tc}, tc, 'villages not covered', sorted(allv - set(vseen))[:5])
print('OK' if not fails else '\n'.join(fails))
print('districts', len(SEATS), 'seats', tot)
sys.exit(1 if fails else 0)
