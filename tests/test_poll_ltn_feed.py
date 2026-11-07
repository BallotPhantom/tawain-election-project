#!/usr/bin/env python3
"""poll_live2026.py's LTN feed reader (cecVote_{1,2}_{rno}.txt, 2026-11-07) against real LTN files, offline.

Fixtures: tests/fixtures/ltn_feed_2022/wb_{kind}_{rno}.txt — LTN's own 2022 feed files as archived by web.archive.org
(snapshot times in wayback_snapshots.json; LTN itself no longer serves the 2022 numbers: data null since 2026-11-07).
Reference: data_live2026_2022full.js.bak — the same 2022 numbers read from LTN's HTML tables by the old parser on
2026-11-05. The feed reader must give the same candidates, votes, parties and elected marks for every district and
township the fixtures cover. No network: http_get is replaced by the fixtures (the county page by a stub carrying
pageRno). Each council fixture's county is found by its candidates' names in the reference.
    python3 tests/test_poll_ltn_feed.py
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.argv = [sys.argv[0]]
import poll_live2026 as P   # noqa: E402

FIX = os.path.join(ROOT, 'tests', 'fixtures', 'ltn_feed_2022')
REF = {k: P.load_js(os.path.join(ROOT, 'data_live2026_2022full.js.bak'), k) for k in ('LIVE_TRACK_CC', 'LIVE_TRACK_TC', 'LIVE_TRACK_ED')}
def ref_cands(table, key):
    s = (REF[table].get(key) or {}).get('sources', {}).get('auto_poll')
    return [(c['n'], c['v'], c.get('p'), bool(c.get('e'))) for c in s['cands']] if s else None

files = {os.path.basename(f)[3:-4]: f for f in glob.glob(os.path.join(FIX, 'wb_*.txt'))}   # '2_16' -> path
CC2COUNTY = {v: k for k, v in P.CC_MAP.items()}
rno_county = {}
for key, path in files.items():
    kind, rno = key.split('_')
    cec = json.load(open(path, encoding='utf-8'))['data']['cec']
    names = set()
    if kind == '1':
        names = {x['Name'] for x in cec['mayor']['over_all']}
        table = 'LIVE_TRACK_CC'
    else:
        for d in cec.values(): names |= {x['Name'] for x in d['data']}
        table = 'LIVE_TRACK_ED'
    best, hit = None, 0
    for k, e in REF[table].items():
        s = e.get('sources', {}).get('auto_poll')
        if not s: continue
        h = len(names & {c['n'] for c in s['cands']})
        if h > hit: best, hit = k.split('_')[0], h
    rno_county[rno] = CC2COUNTY[best]

def fake_get(url, max_retries=3):
    m = re.search(r'/ajax_vote/outer/cecVote_(\d)_(\d+)\.txt$', url)
    if m:
        f = files.get(m.group(1) + '_' + m.group(2))
        if not f: return '{"code":200,"data":null}'
        return open(f, encoding='utf-8').read()
    m = re.search(r'/realtime/([^/]+)$', url)
    if m:
        county = next(k for k, v in P.LTN_SLUGS.items() if v == m.group(1))
        rno = next((r for r, c in rno_county.items() if c == county), None)
        return "<script>let pageRno = '%s';</script>" % rno if rno else ''
    return ''   # council HTML fallback: nothing
P.http_get = fake_get
P.time.sleep = lambda s: None
P.ONLY_COUNTIES = set(rno_county.values())
seats = {**P._build_council_seats(), **P._build_ind_council_seats()}
cc_out, tc_out, ed_out = P.fetch_ltn(P._build_tc_pool(), seats, year=2022)

fails, n = [], 0
def same(table, key, entry):
    global n
    got = [(c['name'], c['votes'], c['party'], c['elected']) for c in entry['cands']]
    want = ref_cands(table, key)
    if want is None: fails.append('%s %s not in the reference' % (table, key)); return
    n += 1
    if sorted(got) != sorted(want): fails.append('%s %s\n   feed %s\n   html %s' % (table, key, sorted(got)[:4], sorted(want)[:4]))
for k, e in cc_out.items(): same('LIVE_TRACK_CC', k, e)
for k, e in tc_out.items(): same('LIVE_TRACK_TC', k, e)
for k, e in ed_out.items(): same('LIVE_TRACK_ED', k, e)
# every council district in the fixtures was read
want_ed = sum(len(json.load(open(f, encoding='utf-8'))['data']['cec']) for k, f in files.items() if k.startswith('2_'))
if len(ed_out) != want_ed: fails.append('council districts read %d of %d' % (len(ed_out), want_ed))
print('counties', sorted(rno_county.values()))
print('compared', n, '(mayor %d, township %d, council %d)' % (len(cc_out), len(tc_out), len(ed_out)))
print('OK' if not fails else '\n'.join(fails))
sys.exit(1 if fails else 0)
