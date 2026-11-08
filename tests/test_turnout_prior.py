#!/usr/bin/env python3
"""v2/data_turnout_prior.js (build_v2_turnout_prior.py): every township of the live pages has a 2026 prior; the 2026
prior summed per county equals 2022's actual 縣市長 valid votes (it is the 2022 electorate × the 2022 rate) — 嘉義市 from
its 2022 council vote; the 2022 (rehearsal) prior covers every township that voted for 縣市長 in 2022 and differs from the
actual (it is built from 2018 rates, no hindsight).   python3 tests/test_turnout_prior.py"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import build_v2_turnout_prior as B  # noqa: E402

P = json.loads(re.search(r'const TURNOUT_PRIOR = (.*);', open(os.path.join(ROOT, 'v2/data_turnout_prior.js'), encoding='utf-8').read()).group(1))
towns = set(json.loads(re.search(r'const LF_TOWNS = (.*);', open(os.path.join(ROOT, 'v2/data_liveflow.js'), encoding='utf-8').read()).group(1)))
assert towns <= set(P['2026']), sorted(towns - set(P['2026']))
t22 = B.townships(B.C1_22); ch = B.townships(B.T1_22, only='10020')
assert set(t22) <= set(P['2022']), sorted(set(t22) - set(P['2022']))
def cc(tc): return tc[:2] if tc[:2] in ('63', '64', '65', '66', '67', '68') else tc[:5]
act, pri = {}, {}
for tc, (v, e) in list(t22.items()) + list(ch.items()): act[cc(tc)] = act.get(cc(tc), 0) + v
for tc, v in P['2026'].items(): pri[cc(tc)] = pri.get(cc(tc), 0) + v
bad = {c: (pri[c], act[c]) for c in act if abs(pri[c] - act[c]) > 20}
assert not bad, bad
off = sum(abs(P['2022'][tc] - v) for tc, (v, e) in t22.items()) / sum(v for v, e in t22.values())
assert off > 0.03, off   # the rehearsal prior is genuinely a forecast
print('townships', len(P['2026']), '| 2026 prior = 2022 actual in', len(act), 'counties | 2022 prior off by', round(off * 100, 1), '% (mean abs)')
print('OK')
