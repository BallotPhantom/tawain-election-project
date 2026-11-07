#!/usr/bin/env python3
"""Election-night pipeline rehearsal without the network (user 2026-11-07: 「拿2022的開票數字測pipeline」「開票地圖顏色跟席次
變動能不能正常跑」).

LTN no longer serves the 2022 numbers (data null since 2026-11-07), so this builds LTN-format feed files
(cecVote_1 / cecVote_2, the format of the archived 2022 files in tests/fixtures/ltn_feed_2022) from the 2022 numbers
read off LTN on 2026-11-05 (data_live2026_2022full.js.bak), at counting stages 20 / 50 / 80 / 100 %, and runs the
real poller (poll_live2026.run_once: feed reader → validation → write) once per stage, STEP seconds apart, into the
real data_live2026.js so the open election-night page (v2/live.html, real mode) re-reads it every 30 s.
Stage numbers are SIMULATED from the final ones: each candidate's running count = final × stage^a, a seeded per
county (±0.05) with the eventual loser of a close race (≤ 5 points; council: last seat vs first loser ≤ 5 %) counted
early — so leads change on the way; elected marks only at 100 %. Not real counts — a test of the pipeline and page.

The caller backs up data_live2026.js and data_live2026_margin_log.js first and restores them afterwards.
    python3 tests/pipeline_sim_2022.py [STEP_SECONDS] [STAGES, e.g. 0.2,0.5,0.8,1]
"""
import json, math, os, random, re, sys, time
REAL_SLEEP = time.sleep   # the poller's pauses are switched off below (P.time is this same module)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
STEP = float(sys.argv[1]) if len(sys.argv) > 1 else 35
STAGES = [float(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else [0.2, 0.5, 0.8, 1.0]   # e.g. 0.2,0.9
sys.argv = [sys.argv[0]]
import poll_live2026 as P   # noqa: E402

REF = {k: P.load_js(os.path.join(ROOT, 'data_live2026_2022full.js.bak'), k) for k in ('LIVE_TRACK_CC', 'LIVE_TRACK_TC', 'LIVE_TRACK_ED')}
PNO = {v: k[1:] for k, v in P.LTN_PARTY.items()}   # 'dpp' -> '1'
COUNTY_CC = dict(P.CC_MAP)
RNO = {county: str(i + 1) for i, county in enumerate(P.LTN_SLUGS)}
rnd = random.Random(20221126)
LEAN = {cc: rnd.uniform(-1, 1) for cc in sorted(set(COUNTY_CC.values()))}

def src(table, key):
    s = (REF[table].get(key) or {}).get('sources', {}).get('auto_poll')
    return s['cands'] if s else None

def expo(cands, seats, cc, by_votes_total=None):
    srt = sorted(cands, key=lambda c: -c['v'])
    a = {c['n']: 1 - 0.035 * LEAN[cc] * (1 if c.get('p') == 'dpp' else -1) for c in srt}
    if len(srt) > seats:
        w, l = srt[seats - 1]['v'], srt[seats]['v']
        d = (by_votes_total or w)
        if w > 0 and l > 0 and (w - l) / d <= 0.05:
            k = min(0.09, math.log(l / w) / math.log(0.55))
            a[srt[seats - 1]['n']] = 1 + k / 2; a[srt[seats]['n']] = 1 - k / 2
    return a

EXP_M = {}
for key in REF['LIVE_TRACK_CC']:
    c = src('LIVE_TRACK_CC', key)
    if c: EXP_M[key] = expo(c, 1, key, sum(x['v'] for x in c))

def rows(cands, stage, a, rname, final):
    out = []
    for c in cands:
        v = c['v'] if stage >= 1 else int(c['v'] * stage ** a.get(c['n'], 1))
        out.append({'Name': c['n'], 'V_Num': v, 'PNo': PNO.get(c.get('p'), ''), 'Elected': 1 if (final and c.get('e')) else 0,
                    'RName': rname, 'percent': '0'})
    return out

def other(prog, stage):
    allp = prog[1] if prog else 100
    return {'NowPoNumber': str(int(round(allp * min(stage, 1)))), 'AllPoNumber': str(allp)}

def feeds(stage):
    out, final = {}, stage >= 1
    seats = {**P._build_council_seats(), **P._build_ind_council_seats()}
    for county, cc in COUNTY_CC.items():
        r = RNO[county]
        mc = src('LIVE_TRACK_CC', cc)
        if mc:
            prog = REF['LIVE_TRACK_CC'][cc]['sources']['auto_poll'].get('prog')
            area = {}
            for tc, e in REF['LIVE_TRACK_TC'].items():
                tsrc = e.get('sources', {}).get('auto_poll')
                if not tsrc or not tc.startswith(cc): continue
                name = P._norm(next((n for n, t in P._build_tc_pool.cache.get(cc, {}).items() if t == tc), ''))
                if not name: continue
                area[tc] = {'des': name, 'other': other(tsrc.get('prog'), stage), 'data': rows(tsrc['cands'], stage, EXP_M.get(cc, {}), name, final)}
            out['1_' + r] = {'code': 200, 'data': {'cec': {'mayor': {'over_all': rows(mc, stage, EXP_M.get(cc, {}), county, final),
                                                                     'other': other(prog, stage), 'area': area}}}}
        cec = {}
        for dk, e in REF['LIVE_TRACK_ED'].items():
            s = e.get('sources', {}).get('auto_poll')
            if not s or dk.split('_')[0] != cc: continue
            n = seats.get(dk, 1); a = expo(s['cands'], n, cc)
            o = other(s.get('prog'), stage); o['range_detail'] = '應選出名額：%d席' % n
            cec[dk] = {'data': rows(s['cands'], stage, a, '第%d選舉區' % int(dk.split('_')[1]), final), 'other': o}
        if cec: out['2_' + r] = {'code': 200, 'data': {'cec': cec}}
    return out

pool = P._build_tc_pool()
P._build_tc_pool.cache = pool
CUR = {}
def fake_get(url, max_retries=3):
    m = re.search(r'/ajax_vote/outer/cecVote_(\d)_(\d+)\.txt$', url)
    if m:
        d = CUR.get(m.group(1) + '_' + m.group(2))
        return json.dumps(d, ensure_ascii=False) if d else '{"code":200,"data":null}'
    m = re.search(r'/realtime/([^/]+)$', url)
    if m:
        county = next(k for k, v in P.LTN_SLUGS.items() if v == m.group(1))
        return "<script>let pageRno = '%s';</script>" % RNO[county]
    return ''
P.http_get = fake_get
P.time.sleep = lambda s: None
seats = {**P._build_council_seats(), **P._build_ind_council_seats()}
for i, stage in enumerate(STAGES):
    if i: REAL_SLEEP(STEP)
    CUR.clear(); CUR.update(feeds(stage))
    print('=== stage %d%% ===' % int(stage * 100), flush=True)
    P.run_once('ltn', False, pool, seats, year=2022)
    sys.stdout.flush()
print('done', flush=True)
