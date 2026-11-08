#!/usr/bin/env python3
"""prototype_popdots/data_hist_res.js / data_hist_lights.js (人口光點 prototype; the history-page toggle was removed 2026-11-08): every light unit has a result in every race; the
2024 presidential village rows (incl. joint stations) add up to their township totals (3 known gaps); summing 2022 mayoral village votes
per county gives each county's actual winner (data_mayor_2022_actual.js).   python3 tests/test_hist_lights_res.py"""
import collections, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from poll_live2026 import load_js  # noqa: E402
from loadjs import load  # noqa: E402

def cj(path, var):
    s = open(os.path.join(ROOT, path), encoding='utf-8').read(); i = re.search(r'const %s\s*=\s*' % var, s).end()
    return json.JSONDecoder().raw_decode(s[i:])[0]

units = cj('prototype_popdots/data_hist_lights.js', 'HL_UNITS'); R = cj('prototype_popdots/data_hist_res.js', 'HL_RES')
tiers = cj('prototype_popdots/data_hist_lights.js', 'HL_TIERS')
assert [t['P'] for t in tiers] == [1024, 256, 64]
for k in ('mayor2022', 'pres2024', 'leg2024'):
    assert len(R[k]) == len(units), k
    assert all(r and r[0] and 0 <= r[1] <= 100 for r in R[k]), (k, 'unit without a result')
P = cj('v2/data_pres.js', 'PRES_HIST')['2024']
# villages + joint stations vs each township's own total: equal except 3 townships whose some villages have no village
# row in data_pres.js (codes changed; known gap of that file — those units take the township result here)
KNOWN_GAP = {'10013280', '10020010', '10020020'}
vt = collections.defaultdict(lambda: [0] * len(P['cands']))
for vc, row in P['vc'].items(): vt[vc[:8]] = [a + b for a, b in zip(vt[vc[:8]], row[3:])]
for jid, row in P['jr'].items(): vt[jid[:8]] = [a + b for a, b in zip(vt[jid[:8]], row[4:])]
off = {tc for tc, row in P['tc'].items() if vt[tc] != row[3:]}
assert off == KNOWN_GAP, sorted(off ^ KNOWN_GAP)
assert [sum(r[3 + i] for r in P['tc'].values()) for i in range(len(P['cands']))] == P['nat'][3:]
V = load_js(os.path.join(ROOT, 'mayor_2022_tc_data.js'), 'MAYOR_2022_VILL')
def ccof(vc): return vc[:2] if vc[:2] in ('63', '64', '65', '66', '67', '68') else vc[:5]
by = collections.defaultdict(collections.Counter)
for vc, e in V.items():
    for c in e['cands']: by[ccof(vc)][c['n']] += c['v']
A = load(os.path.join(ROOT, 'data_mayor_2022_actual.js'), 'const MAYOR_2022_ACTUAL')
win = {v['code'][:2] if v['code'][:2] in ('63', '64', '65', '66', '67', '68') else v['code'][:5]: next(c['n'] for c in v['cands'] if c.get('e')) for v in A.values()}
bad = [cc for cc, w in win.items() if cc in by and by[cc].most_common(1)[0][0] != w]
assert not bad, ('county winner mismatch', bad)
print('units', len(units), 'races 3 complete; pres2024 village sums match townships (3 known gaps); mayor2022 winners match in', len(win), 'counties')
print('OK')
