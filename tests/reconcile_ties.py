#!/usr/bin/env python3
"""First-place ties between parties (user 2026-10-19: 同票 → 藍綠漸層). Winner tables are [party, margin(, extras…)]; a tie
between different parties appends the tied parties as a final list (cec_lib.tie_tail). Checks:
  T1 every tie list: margin 0, ≥2 distinct parties, winner listed first
  T2 village tables with a full-vote twin (PRES/LEGIS/PL/MAYOR _VC_LINEAGE, COUNCIL_BALL_VC by party): a tie list exactly
     when the top two parties have equal votes > 0, listing exactly those parties
    python3 tests/reconcile_ties.py"""
import collections, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from build_profile_presidential import var_span, PROFILE  # noqa: E402
s = open(PROFILE, encoding='utf-8').read()
load = lambda v: json.loads(s[slice(*var_span(s, v))])
fails = 0
def fail(*a):
    global fails; fails += 1
    if fails <= 20: print('FAIL', *a)
def recs(t):   # yields (key, year(/kind), record)
    for k, ys in t.items():
        for y, r in ys.items():
            if isinstance(r, dict):
                for kind, rr in r.items(): yield k, y + '/' + kind, rr
            elif isinstance(r, list): yield k, y, r
TABLES = ['PRES_CC_DATA', 'PRES_TC_DATA', 'PRES_VC_DATA', 'LEGIS_TC_DATA', 'LEGIS_VC_DATA', 'PL_TC_DATA', 'PL_VC_DATA', 'MAYOR_VC_DATA',
          'COUNCIL_TC_DATA', 'COUNCIL_VC_DATA', 'COUNCIL_DIST_DATA', 'COUNCIL_IND_DATA', 'COUNCIL_IND_TC_DATA', 'COUNCIL_IND_VC_DATA',
          'TMAYOR_VC_DATA', 'LEGIND_TC_DATA', 'LEGIND_VC_DATA']
T = {v: load(v) for v in TABLES}
n = collections.Counter()
for v, t in T.items():
    for k, y, r in recs(t):
        if r and isinstance(r[-1], list):
            n[v] += 1
            if r[1] != 0 or r[-1][0] != r[0] or len(set(r[-1])) != len(r[-1]) or len(r[-1]) < 2: fail('T1', v, k, y, r)
print('tie lists', dict(n))
def top(pairs, by_party):   # candidate races compare candidates; 不分區 / 議員 colour by party sums (as the builders do)
    if by_party:
        c = collections.Counter()
        for p, x in pairs: c[p] += x
        pairs = list(c.items())
    m = max((x for _, x in pairs), default=0)
    out = []
    for p, x in pairs:
        if m > 0 and x == m and p not in out: out.append(p)
    return out
for v, lin, f, bp in [('PRES_VC_DATA', 'PRES_VC_LINEAGE', lambda r: [(c['party'], c['votes']) for c in r['candidates']], False),
                  ('LEGIS_VC_DATA', 'LEGIS_VC_LINEAGE', lambda r: [(c['party'], c['votes']) for c in r['candidates']], False),
                  ('PL_VC_DATA', 'PL_VC_LINEAGE', lambda r: [(c['party'], c['votes']) for c in r['parties']], True),
                  ('MAYOR_VC_DATA', 'MAYOR_VC_LINEAGE', lambda r: [(c['party'], c['votes']) for c in r['candidates']], False),
                  ('COUNCIL_VC_DATA', 'COUNCIL_BALL_VC', lambda r: [(c['party'], c['votes']) for c in r['cands']], True)]:
    L = load(lin); c = 0
    for k, ys in T[v].items():
        for y, r in ys.items():
            if k not in L or y not in L[k]: continue
            exp = top(f(L[k][y]), bp); got = r[-1] if isinstance(r[-1], list) else []
            c += 1
            if len(exp) > 1 and sorted(exp) != sorted(got) or len(exp) <= 1 and got: fail('T2', v, k, y, r, exp)
    print(v, 'checked', c)
print('%d FAIL(s)' % fails)
sys.exit(1 if fails else 0)
