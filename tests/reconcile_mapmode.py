#!/usr/bin/env python3
"""Checks the map-mode-only tables written by build_profile_mapmode_data.py.

    python3 tests/reconcile_mapmode.py

1. Every record is internally consistent: candidate votes sum to cast − invalid, cast ≤ elig.
2. COUNCIL_BALL_DIST / COUNCIL_BALL_TC / COUNCIL_BALL_VC, summed by party, give exactly the winner and margin already in
   COUNCIL_DIST_DATA+COUNCIL_IND_DATA / COUNCIL_TC_DATA / COUNCIL_VC_DATA (built independently by build_profile_cec_tables.py), with the
   same township / village-year keys.
3. COUNCIL_BALL_CC covers every county × 2014/2018/2022; TMAYOR_VC_DATA margins lie in [0, 1].
"""
import collections, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from build_profile_presidential import var_span, PROFILE  # noqa: E402

s = open(PROFILE, encoding='utf-8').read()


def load(n):
    a, b = var_span(s, n)
    return json.loads(s[a:b])


fails = 0


def fail(*m):
    global fails
    fails += 1
    print('FAIL', *m)


CC, DI, TC, VC, TM = load('COUNCIL_BALL_CC'), load('COUNCIL_BALL_DIST'), load('COUNCIL_BALL_TC'), load('COUNCIL_BALL_VC'), load('TMAYOR_VC_DATA')
for name, T in [('COUNCIL_BALL_CC', CC), ('COUNCIL_BALL_DIST', DI), ('COUNCIL_BALL_TC', TC), ('COUNCIL_BALL_VC', VC)]:
    for k, ys in T.items():
        for y, r in ys.items():
            if sum(c['votes'] for c in r['cands']) != r['cast'] - r['invalid'] or r['cast'] > r['elig']:
                fail(name, k, y, 'record does not add up')


def by_party(r):
    c = collections.Counter()
    for x in r['cands']: c[x['party']] += x['votes']
    v = sorted(c.items(), key=lambda kv: (-kv[1], kv[0])) + [(None, 0)]
    return v[0][0], (v[0][1] - v[1][1]) / (r['cast'] - r['invalid'])


for new, old_name in [(DI, 'COUNCIL_DIST_DATA+COUNCIL_IND_DATA'), (TC, 'COUNCIL_TC_DATA'), (VC, 'COUNCIL_VC_DATA')]:
    if '+' in old_name:   # merged per year: 新北 '65000_11' is a general district in 2022 but 平地原住民 in 2014/2018
        old = collections.defaultdict(dict)
        for t in (load('COUNCIL_DIST_DATA'), load('COUNCIL_IND_DATA')):
            for k, ys in t.items():
                for y, v in ys.items():
                    assert y not in old[k], ('district-year in both tables', k, y)
                    old[k][y] = v
    else: old = load(old_name)
    ko = {(k, y) for k, ys in old.items() for y in ys if y not in ('dist', 'distByYear')}
    kn = {(k, y) for k, ys in new.items() for y in ys}
    if ko != kn: fail(old_name, 'keys differ', sorted(ko ^ kn)[:10])
    for k, y in ko & kn:
        p, m = by_party(new[k][y])
        if p != old[k][y][0] or abs(m - old[k][y][1]) > 1e-5: fail(old_name, k, y, old[k][y], (p, round(m, 6)))
    print(old_name, 'checked', len(ko & kn))

# 4. elected flags (council ball charts: one ball per elected candidate): every district-year has ≥1 winner, and every
#    township / village record of a district race marks exactly that district's winners
TCD = load('COUNCIL_TC_DATA')
for k, ys in DI.items():
    for y, r in ys.items():
        if not any(c.get('elected') for c in r['cands']): fail('COUNCIL_BALL_DIST no elected candidate', k, y)
won = {(k, y): {c['name'] for c in r['cands'] if c.get('elected')} for k, ys in DI.items() for y, r in ys.items()}
nchk = 0
for name, T, tcof in [('COUNCIL_BALL_TC', TC, lambda k: k), ('COUNCIL_BALL_VC', VC, lambda k: k[:8])]:
    for k, ys in T.items():
        rec = TCD.get(tcof(k)) or {}
        for y, r in ys.items():
            dist = (rec.get('distByYear') or {}).get(y, rec.get('dist'))   # per-year district where it changed (新北 2022)
            mine = {c['name'] for c in r['cands'] if c.get('elected')}
            if not dist or mine != won.get((k[:5] + '_' + dist, y)): fail(name, k, y, 'elected', sorted(mine), dist)
            nchk += 1
print('elected flags checked', nchk)
for cc in ('10008', '10004', '10013', '10007', '10009', '63000', '10017', '68000', '64000', '66000', '65000', '67000', '10015', '10014'):
    for y in ('2014', '2018', '2022'):
        if y not in CC.get(cc, {}): fail('COUNCIL_BALL_CC missing', cc, y)
for vc, ys in TM.items():
    for y, r in ys.items():
        p, m = r[0], r[1]
        if not (0 <= m <= 1) or not p: fail('TMAYOR_VC_DATA', vc, y, p, m)
        # a first-place tie between parties (cec_lib.tie_tail) is a trailing list: margin 0, winner listed first
        if isinstance(r[-1], list) and (m != 0 or r[-1][0] != p or len(r[-1]) < 2): fail('TMAYOR_VC_DATA tie', vc, y, r)
print('TMAYOR_VC_DATA village-years', sum(len(v) for v in TM.values()))
print('%d FAIL(s)' % fails)
sys.exit(1 if fails else 0)
