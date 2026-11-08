#!/usr/bin/env python3
"""poll_live2026.py's 中央社 / TVBS readers (2026-11-07) against their real 2022 files, offline.

Fixtures (tests/fixtures/cna_tvbs_2022/): 中央社 api/council.json and a two-county cut of api/city.json (villages dropped;
the full file is 18.8 MB), TVBS json/2022.json — fetched 2026-11-07 from the outlets' 2022 election pages (still served).
Reference: the CEC's own 2022 council results (council_2022.js summed by district + the 原住民 tables in council.html).
Votes are compared as each district's sorted list of vote counts (names differ in variant characters between the CEC
file and the outlets), elected seats as their count (the sources' known 2022 marking gaps listed: 中央社 marks one winner
too few in 4 districts, TVBS none in 4 新竹縣 districts); party codes and the CJK-compatibility clean-up are checked too.
    python3 tests/test_poll_cna_tvbs.py
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]
import poll_live2026 as P   # noqa: E402

FIX = os.path.join(ROOT, 'tests', 'fixtures', 'cna_tvbs_2022')
def fake_get(url, max_retries=3):
    if 'council.json' in url: return open(os.path.join(FIX, 'cna_council.json'), encoding='utf-8').read()
    if 'city.json' in url: return open(os.path.join(FIX, 'cna_city_subset.json'), encoding='utf-8').read()
    if 'taiwan_election/json/2022.json' in url: return open(os.path.join(FIX, 'tvbs_2022.json'), encoding='utf-8').read()
    raise RuntimeError('no network in tests: ' + url)
P.http_get = fake_get
P._CNA_LAST_CITY[0] = 0

def ccof(tc): return tc[:2] if tc[:2] in ('63', '64', '65', '66', '67', '68') else tc[:5]
cec = {}
for tc, e in P.load_js(os.path.join(ROOT, 'council_2022.js'), 'COUNCIL_2022_TC').items():
    for c in e['cands']:
        dk = '%s_%s' % (ccof(tc), c['d']); r = cec.setdefault(dk, {}).setdefault(c['n'], [0, 0]); r[0] += c['v']; r[1] = max(r[1], c.get('e', 0))
for var in ('COUNCIL_IND_P_DISTS', 'COUNCIL_IND_M_DISTS'):
    for cc, ds in P.load_js(os.path.join(ROOT, 'council.html'), var).items():
        for d in ds: cec['%s_%s' % (cc, d['dist'])] = {c['n']: [c['v'], c.get('e', 0)] for c in d['cands']}
seats = {**P._build_council_seats(), **P._build_ind_council_seats()}
pool = P._build_tc_pool()
fails = []
for name, fetch in (('cna', P.fetch_cna), ('tvbs', P.fetch_tvbs)):
    cc_out, tc_out, ed_out = fetch(pool, seats, 2022)
    if len(ed_out) != 215: fails.append('%s: council districts %d of 215' % (name, len(ed_out)))
    vd = [dk for dk, want in cec.items() if dk in ed_out and sorted(c['votes'] for c in ed_out[dk]['cands']) != sorted(v[0] for v in want.values())]
    sd = [dk for dk, want in cec.items() if dk in ed_out and sum(c['elected'] for c in ed_out[dk]['cands']) != sum(v[1] for v in want.values())]
    # 2022 known: 3 districts where the CEC village sums differ from the published district totals by a few votes
    if len(vd) > 3: fails.append('%s: votes differ from CEC in %d districts %s' % (name, len(vd), vd[:6]))
    # the sources' own 2022 marking gaps (they mark fewer winners than the seats there — the pages keep such districts
    # 'leading', never 'final'): anything beyond these is new
    KNOWN = {'cna': {'10004_02', '10005_05', '67_01', '09020_01'}, 'tvbs': {'10004_01', '10004_11', '10004_12', '10004_13'}}[name]
    over = [dk for dk in ed_out if sum(c['elected'] for c in ed_out[dk]['cands']) > seats.get(dk, 99)]
    if set(sd) - KNOWN or over: fails.append('%s: elected marks differ from CEC beyond the known gaps %s, over the seats %s' % (name, sorted(set(sd) - KNOWN), over))
    if name == 'cna' and len(cc_out) != 2: fails.append('cna: mayor counties %d (fixture has 2)' % len(cc_out))
    if name == 'tvbs' and len(cc_out) != 22: fails.append('tvbs: mayor counties %d of 22' % len(cc_out))
    parties = {c['party'] for e in ed_out.values() for c in e['cands']}
    if not {'kmt', 'dpp', 'tpp', 'ind'} <= parties: fails.append('%s: party codes missing %s' % (name, parties))
    names = [c['name'] for e in list(ed_out.values()) + list(cc_out.values()) for c in e['cands']]
    if any(re.search(r'[豈-﫿　]', n) for n in names): fails.append('%s: names not cleaned' % name)
    print(name, 'mayor', len(cc_out), 'township', len(tc_out), 'council', len(ed_out), 'votes≠CEC', vd, 'elected≠CEC', sd)
print('OK' if not fails else '\n'.join(fails))
sys.exit(1 if fails else 0)
