#!/usr/bin/env python3
"""County-level ball-chart data for v2/profile.html: 縣市長, 區域立委 (per ED), 不分區政黨, from CEC raw files.

    python3 build_profile_ballcharts.py [--dry-run]

Writes BALL_CHART_CEC = {cc: {mayor: {year: R}, partylist: {year: R}, legislative: {year: {edName: R}}}},
R = {elig, cast, invalid, cands: [{name, party, votes}]} (all candidates / parties, votes desc).
Same shape as PRES_TURNOUT_CEC, so the presidential ball chart renders these unchanged.

Every number comes from a CEC subtotal row (county row for mayor / party list, ED row for
legislative). Party codes are not guessed: legislative candidates take their code from the
profile's own TOWNSHIP_CENTRAL_GOV[tc].legislativeByYear (same people), party-list parties
from the profile's county partyListRawByYear, matched by CEC party name → partyLabel() or, failing
that, by an exactly equal county vote count; anything unmatched aborts the build.
Checks: votes sum to valid; valid+invalid == cast; mayor matches <SEED>.mayorLineageByYear;
legislative ED totals match the per-township sums in TOWNSHIP_CENTRAL_GOV where those exist.
"""
import argparse, collections, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from reconcile_presidential import _rows, SEEDS  # noqa: E402
from build_profile_presidential import var_span, js, PROFILE  # noqa: E402
import build_profile_mayor_vc as mvc  # noqa: E402

VD = os.path.join(ROOT, 'votedata/votedata/voteData')
LEG = {'2016': ('2016總統立委/區域立委', '_T1'), '2020': ('2020總統立委/區域立委', ''), '2024': ('2024總統立委/區域立委', ''),
       '2023': ('立委補選(2019年後)', '')}   # by-elections: read through cec_lib.ByElection (leg_tables)
PL = {'2012': ('20120114-總統及立委/不分區政黨', ''), '2016': ('2016總統立委/不分區政黨', '_T4'), '2020': ('2020總統立委/不分區政黨', ''), '2024': ('2024總統立委/不分區政黨', '')}
from cec_lib import BYELECTIONS, ByElection, FORMER_TC_NAMES, HAS_TOWNSHIP_HEAD  # noqa: E402
CNAME = {'10008': '南投縣', '10004': '新竹縣', '10013': '屏東縣', '10007': '彰化縣', '10009': '雲林縣', '63000': '臺北市', '10017': '基隆市', '68000': '桃園市', '64000': '高雄市', '66000': '臺中市', '65000': '新北市', '67000': '臺南市', '10015': '花蓮縣', '10014': '臺東縣'}
# 2012 CEC files use pre-2014 county codes; verified via that year's elbase names (06003 新竹縣,
# 06006 南投縣, 06009 屏東縣).
OLD_CC_2012 = {'06003': '10004', '06006': '10008', '06009': '10013', '06005': '10007', '06007': '10009', '01000': '63000', '06013': '10017', '06002': '68000', '05000': '64000', '03000': '66000', '02000': '65000', '04000': '67000', '06011': '10015', '06010': '10014'}


def rows(d, f, suf): return [[x.strip().lstrip("'") for x in r] for r in _rows(f'{VD}/{d}/{f}{suf}.csv')]


def profile_tables():
    s = open(PROFILE, encoding='utf-8').read()
    src = ''
    for n in list(SEEDS.values()) + ['TOWNSHIP_CENTRAL_GOV']:
        a, b = var_span(s, n); src += 'var %s = %s;\n' % (n, s[a:b])
    pl = re.search(r'function partyLabel\(p\) \{\s*return (\{.*?\})\[p\]', s, re.S)
    src += 'var PL_LABEL = %s;\n' % pl.group(1)
    a, b = var_span(s, 'TOWNSHIP_MAYOR_LINEAGE'); src += 'var TOWNSHIP_MAYOR_LINEAGE = %s;\n' % s[a:b]
    src += ('JSON.stringify({seeds:{%s}, tcg:Object.fromEntries(Object.entries(TOWNSHIP_CENTRAL_GOV).map(([k,v])=>[k,v.legislativeByYear||null])), label:PL_LABEL, tml:TOWNSHIP_MAYOR_LINEAGE})'
            % ','.join("'%s':{pl:%s.partyListRawByYear||null, mayor:%s.mayorLineageByYear, townships:%s.townships}" % (cc, n, n, n) for cc, n in SEEDS.items()))
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh: fh.write(src); p = fh.name
    try: return s, json.loads(subprocess.run(['osascript', '-l', 'JavaScript', p], capture_output=True, text=True, check=True).stdout)
    finally: os.unlink(p)


def subtotal_rows(d, suf, key):
    out = {}
    for r in rows(d, 'elprof', suf):
        k = key(r)
        if k: out[k] = {'valid': int(r[6]), 'invalid': int(r[7]), 'cast': int(r[8]), 'elig': int(r[9]), 'votes': {}}
    for r in rows(d, 'elctks', suf):
        k = key(r)
        if k: out[k]['votes'][r[6]] = int(r[7])
    for k, e in out.items():
        assert sum(e['votes'].values()) == e['valid'] and e['valid'] + e['invalid'] == e['cast'], (d, k)
    return out


def leg_tables(y, d, suf, township):
    """(cand, sub) of a legislative year: cand[(cc, area, no)] = name; sub keyed (cc, area) for district
    rows, or (cc, area, dept) for township rows. By-election years (cec_lib.BYELECTIONS) come from
    ByElection, whose rows already carry the same fields as elprof/elctks subtotals."""
    if y in BYELECTIONS:
        B = ByElection(y, cc_filter=set(SEEDS))
        cand = {k: c['name'] for k, c in B._cand.items()}
        lvl = 'tc' if township else 'area'
        sub = {(k[0], k[1], k[2]) if township else (k[0], k[1]): e for k, e in B.rows.items() if B.level(k) == lvl}
        return cand, sub
    cand = {(r[0] + r[1], r[2], r[5]): r[6] for r in rows(d, 'elcand', suf) if r[0] + r[1] in SEEDS}
    if township:
        sub = subtotal_rows(d, suf, lambda r: (r[0] + r[1], r[2], r[3]) if r[0] + r[1] in SEEDS and r[2] != '00' and r[3] != '000' and r[4] == '0000' and r[5] in ('0', '0000') else None)
    else:
        sub = subtotal_rows(d, suf, lambda r: (r[0] + r[1], r[2]) if r[0] + r[1] in SEEDS and r[2] != '00' and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000') else None)
    return cand, sub


def rec(e, cands):
    return {'elig': e['elig'], 'cast': e['cast'], 'invalid': e['invalid'], 'cands': sorted(cands, key=lambda c: -c['votes'])}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    s, P = profile_tables()
    out = {cc: {'mayor': {}, 'partylist': {}, 'legislative': {}} for cc in SEEDS}

    # ---- 縣市長: county subtotal rows (party codes from the seeds, as in build_profile_mayor_vc) ----
    party_of = {cc: {y: {c['name']: c['party'] for c in v['candidates']} for y, v in P['seeds'][cc]['mayor'].items()} for cc in SEEDS}
    for y in mvc.YEARS:
        cec = mvc.load_year(y, party_of)
        for cc in SEEDS:
            e = cec[('county', cc)]
            seed = P['seeds'][cc]['mayor'][y]
            assert {c['name']: c['votes'] for c in e['cands']} == {c['name']: c['votes'] for c in seed['candidates']}, ('mayor', cc, y)
            out[cc]['mayor'][y] = rec(e, [dict(c) for c in e['cands']])

    # ---- 區域立委: one ED subtotal row per district ----
    lva, lvb = var_span(s, 'LEGIS_VC_LINEAGE'); LV = json.loads(s[lva:lvb])
    general_eds = {}
    for y, (d, suf) in LEG.items():
        cand, sub = leg_tables(y, d, suf, township=False)
        for cc in SEEDS:
            # name → party and ED name from the profile's own per-township legislative lineage
            byEd = collections.defaultdict(lambda: collections.Counter()); pmap = {}
            for tc, ly in P['tcg'].items():
                if tc[:5] != cc or not ly or y not in ly: continue
                for c in ly[y]['cands']:
                    pmap[c['name']] = c['party']; byEd[ly[y]['ed']][c['name']] += c['votes']
            # a district made only of split-township pieces (桃園市第4 = part of 桃園區) has no whole-township row:
            # its candidates' codes come from LEGIS_VC_LINEAGE (also CEC party name → code, build_profile_cec_tables)
            vcEds = set()
            for vc, ly in LV.items():
                if vc[:5] == cc and y in ly:
                    for c in ly[y]['candidates']: pmap.setdefault(c['candidate'], c['party'])
                    vcEds.add(ly[y]['ed'])
            eds = sorted(k[1] for k in sub if k[0] == cc)
            if y not in BYELECTIONS: general_eds[cc] = eds
            n_eds = general_eds.get(cc, eds) if y in BYELECTIONS else eds   # by-election: name by the general election's district count
            for area in eds:
                e = sub[(cc, area)]
                names = {cand[(cc, area, no)]: v for no, v in e['votes'].items()}
                edName = CNAME[cc] + ('選舉區' if len(n_eds) == 1 else '第%d選舉區' % int(area))
                missing = [n for n in names if n not in pmap]
                assert not missing, ('legislative party unknown', cc, y, missing)
                if edName in byEd and dict(byEd[edName]) != names:
                    print('INFO legislative', cc, y, edName, 'township-sum differs from CEC ED row:',
                          {n: names[n] - byEd[edName].get(n, 0) for n in names if names[n] != byEd[edName].get(n, 0)})
                assert edName in byEd or edName in vcEds or not byEd, ('ED name not in profile', cc, y, edName, list(byEd))
                out[cc]['legislative'].setdefault(y, {})[edName] = rec(e, [{'name': n, 'party': pmap[n], 'votes': v} for n, v in names.items()])

    # ---- 不分區政黨: county subtotal row; codes via partyLabel() name or an exactly equal county count ----
    # CEC full name -> profile code. Exact partyLabel() match first (preferring a code that this
    # county/year's partyListRawByYear actually uses — 綠黨 is both 'gp' and the 2008 'gpt'), then
    # the CEC full names partyLabel() shortens. Anything else aborts.
    ALIAS = {'中國國民黨': 'kmt', '民主進步黨': 'dpp', '台灣民眾黨': 'tpp', '台灣綠黨': 'gp',
             '臺灣雙語無法黨': 'tbip', '制度救世島': 'isw', '社會民主黨': 'sdp'}
    for y, (d, suf) in PL.items():
        pname = {r[0].strip(): r[1].strip() for r in _rows(f'{VD}/{d}/elpaty.csv')}
        cand = {r[5].strip().lstrip("'"): pname[r[7].strip().lstrip("'")] for r in _rows(f'{VD}/{d}/elcand{suf}.csv')}
        # 2012 files still use the pre-2014 codes (臺灣省 06 + county number), mapped by elbase name
        ccof = (lambda r: OLD_CC_2012.get(r[0] + r[1])) if y == '2012' else (lambda r: r[0] + r[1])
        sub = subtotal_rows(d, suf, lambda r: ccof(r) if ccof(r) in SEEDS and r[3] == '000' and r[4] == '0000' and r[5] in ('0', '0000') else None)
        for cc in SEEDS:
            e = sub[cc]; raw = (P['seeds'][cc]['pl'] or {}).get(y) or {}
            cands = []
            for no, v in e['votes'].items():
                full = cand[no]
                exact = [k for k, lbl in P['label'].items() if lbl == full]
                code = ALIAS.get(full) or next((k for k in exact if k in raw), None) or (exact[0] if exact else None)
                assert code, ('party-list name without code', y, full)
                cands.append({'name': P['label'].get(code, full) if code in P['label'] else full, 'party': code, 'votes': v})
            dup = [c for c, n in collections.Counter(c['party'] for c in cands).items() if n > 1 and c != 'other']
            assert not dup, ('party-list code collision', cc, y, dup, cands)
            diff = {c['party']: c['votes'] - raw.get(c['party'], 0) for c in cands if c['party'] != 'other' and raw and c['votes'] != raw.get(c['party'])}
            if diff: print('INFO party-list', cc, y, 'CEC county − profile partyListRawByYear:', diff)
            out[cc]['partylist'][y] = rec(e, cands)


    # ================= township grain (BALL_CHART_TC_CEC) =================
    tcs = {t[0]: t[1] for cc in SEEDS for t in P['seeds'][cc]['townships']}
    T = collections.defaultdict(lambda: {'presidential': {}, 'legislative': {}, 'partylist': {}, 'mayor': {}, 'townshipMayor': {}, 'council': {}})
    # 總統: township subtotal rows (same rows build_profile_presidential.py uses)
    import build_profile_presidential as bpp
    for y in bpp.YEARS:
        cec = bpp.load_year(y)
        for (lvl, code), e in cec.items():
            if lvl == 'tc': T[code]['presidential'][y] = {'elig': e['elig'], 'cast': e['cast'], 'invalid': e['invalid'], 'cands': e['cands']}
    # 縣長: township rows of the county-mayor files
    for y in mvc.YEARS:
        cec = mvc.load_year(y, party_of)
        for (lvl, code), e in cec.items():
            if lvl == 'tc': T[code]['mayor'][y] = rec(e, [dict(c) for c in e['cands']])
    # 區域立委: one row per (district, township) — 竹北市 2020/2024 has two
    for y, (d, suf) in LEG.items():
        cand, sub = leg_tables(y, d, suf, township=True)
        for cc in SEEDS:
            areas = sorted({k[1] for k in sub if k[0] == cc})
            if y in BYELECTIONS and areas: areas = general_eds[cc]   # district count of the general election (see above)
            for (c2, area, dept), e in sub.items():
                if c2 != cc: continue
                ed = out[cc]['legislative'][y]
                edName = CNAME[cc] + ('選舉區' if len(areas) == 1 else '第%d選舉區' % int(area))
                pmap = {c['name']: c['party'] for c in ed[edName]['cands']}
                T[cc + dept]['legislative'].setdefault(y, {})[edName] = rec(e, [{'name': cand[(cc, area, no)], 'party': pmap[cand[(cc, area, no)]], 'votes': v} for no, v in e['votes'].items()])
    # 不分區: township rows; 2012 uses old county + township numbers, mapped by name
    for y, (d, suf) in PL.items():
        pname = {r[0].strip(): r[1].strip() for r in _rows(f'{VD}/{d}/elpaty.csv')}
        cand = {r[5].strip().lstrip("'"): pname[r[7].strip().lstrip("'")] for r in _rows(f'{VD}/{d}/elcand{suf}.csv')}
        if y == '2012':
            tname = {(OLD_CC_2012[r[0] + r[1]], r[3]): r[5] for r in rows(d, 'elbase', suf) if r[0] + r[1] in OLD_CC_2012 and r[3] != '000' and r[4] == '0000'}
            byname = {(tc[:5], n): tc for tc, n in tcs.items()}
            byname.update({(tc[:5], o): tc for tc, olds in FORMER_TC_NAMES.items() for o in olds})
            tcof = lambda r: byname.get((OLD_CC_2012.get(r[0] + r[1]), tname.get((OLD_CC_2012.get(r[0] + r[1]), r[3]))))
            assert len({v for v in (byname.get((cc, n)) for (cc, _), n in tname.items()) if v}) == len(tname) == len(tcs), 'unmapped 2012 township'
        else:
            tcof = lambda r: (r[0] + r[1] + r[3]) if r[0] + r[1] in SEEDS else None
        sub = subtotal_rows(d, suf, lambda r: tcof(r) if r[3] != '000' and r[4] == '0000' and r[5] in ('0', '0000') and tcof(r) else None)
        for tc, e in sub.items():
            raw = {}
            cands = []
            for no, v in e['votes'].items():
                full = cand[no]
                exact = [k for k, lbl in P['label'].items() if lbl == full]
                countyCodes = {c['party'] for c in out[tc[:5]]['partylist'][y]['cands']}
                code = ALIAS.get(full) or next((k for k in exact if k in countyCodes), None) or (exact[0] if exact else None)
                assert code, ('party-list name without code', y, full)
                cands.append({'name': P['label'].get(code, full) if code in P['label'] else full, 'party': code, 'votes': v})
            T[tc]['partylist'][y] = rec(e, cands)
    # 鄉鎮市長: CEC 縣市鄉鎮市長 / 2022 D1 township rows, plus 直轄市山地原住民區長 (直轄市區長 / 2022 D2, e.g. 桃園 復興區);
    # each folder has its own party codes, so they are read one by one (township keys never overlap)
    TM = {'2014': ('2014-103年地方公職人員選舉/縣市鄉鎮市長', '2014-103年地方公職人員選舉/直轄市區長'),
          '2018': ('2018-107年地方公職人員選舉/縣市鄉鎮市長', '2018-107年地方公職人員選舉/直轄市區長'),
          '2022': ('2022-111年地方公職人員選舉/D1', '2022-111年地方公職人員選舉/D2')}
    TM_ALIAS = dict(ALIAS, **{'無黨籍及未經政黨推薦': 'ind', '無黨籍': 'ind'})
    for y, d in ((y, d) for y, ds in TM.items() for d in ds):
        pname = {r[0].strip().lstrip("'"): r[1].strip() for r in _rows(f'{VD}/{d}/elpaty.csv')}
        cand = {(r[0] + r[1] + r[3], r[5]): (r[6], r[7]) for r in rows(d, 'elcand', '') if r[0] + r[1] in SEEDS}
        sub = subtotal_rows(d, '', lambda r: r[0] + r[1] + r[3] if r[0] + r[1] in SEEDS and r[3] != '000' and r[4] == '0000' and r[5] in ('0', '0000') else None)
        for tc, e in sub.items():
            cands = []
            for no, v in e['votes'].items():
                nm, pc = cand[(tc, no)]
                full = pname.get(pc, '')
                exact = [k for k, lbl in P['label'].items() if lbl == full]
                # a party partyLabel() has no code for (臺灣前進黨 …) is 'other', the convention
                # TOWNSHIP_MAYOR_LINEAGE already used — checked by the Pingtung equality assert below
                code = TM_ALIAS.get(full) or (exact[0] if exact else 'other')
                cands.append({'name': nm, 'party': code, 'votes': v})
            T[tc]['townshipMayor'][y] = rec(e, cands)
    # 縣市議員（區域）: the township's own votes in its council district — one record per (district, township) in case a
    # township is split; council = {year: {district 'NN': R}}, each candidate with e = elected in that district (user
    # 2026-10-31: 「地方選舉的資料夾應該至少是2且應該有市議員」). Both the 縣市 and 直轄市 folders (build_profile_cec_tables.COUNCIL).
    import build_profile_cec_tables as CB
    from cec_lib import Election
    for y, folders in CB.COUNCIL.items():
        E = Election(folders[0], '', set(SEEDS))
        for k, e in E.rows.items():
            if E.level(k) != 'tc' or not e['valid'] or k[0] not in SEEDS: continue
            cc, area, dept, _li = k
            won = E.rows.get((cc, area, '000', '0000'), {}).get('elected', set())
            cands = []
            for no, v in e['votes'].items():
                c = E.cand(k, no); full = c['party_name']
                exact = [kk for kk, lbl in P['label'].items() if lbl == full]
                cands.append({'name': c['name'], 'party': TM_ALIAS.get(full) or (exact[0] if exact else 'other'), 'votes': v, 'e': 1 if (c['elected'] or no in won) else 0})
            assert (cc + dept) in tcs, ('council township not in the profile', k)
            T[cc + dept]['council'].setdefault(y, {})[area] = rec(e, cands)
    # the existing hand-built Pingtung TOWNSHIP_MAYOR_LINEAGE must agree with CEC before it is regenerated
    for tc, ys in P['tml'].items():
        for y, l in ys.items():
            mine = T[tc]['townshipMayor'][y]
            old = sorted((c['name'], c['votes'], c['party']) for c in l['candidates'])
            new = sorted((c['name'], c['votes'], c['party']) for c in mine['cands'])
            ok = [o[:2] == n[:2] and (o[2] == n[2] or o[2] == 'other') for o, n in zip(old, new)]
            assert len(old) == len(new) and all(ok) and l['total'] == mine['cast'] - mine['invalid'] and l['elig'] == mine['elig'], \
                ('TOWNSHIP_MAYOR_LINEAGE differs from CEC', tc, y, old, new)
            for o, n in zip(old, new):
                if o[2] != n[2]: print('INFO township mayor', tc, y, o[0], "party 'other' ->", n[2], '(CEC party name)')
    # 直轄市 / 省轄市 區 have no 鄉鎮市長 race (appointed 區長) — except 直轄市山地原住民區 (elected 區長), so required only there
    missing = [(tc, k, y) for tc in tcs for k in ('presidential', 'partylist', 'mayor') + (('townshipMayor',) if HAS_TOWNSHIP_HEAD(tc) else ()) for y in ({'presidential': ['2016', '2020', '2024'], 'partylist': list(PL), 'mayor': mvc.YEARS, 'townshipMayor': list(TM)}[k]) if y not in T[tc][k]]
    assert not missing and set(T) == set(tcs), (missing[:10], set(T) ^ set(tcs))
    tml = {tc: {y: {'total': r['cast'] - r['invalid'], 'elig': r['elig'], 'candidates': r['cands']} for y, r in sorted(T[tc]['townshipMayor'].items(), reverse=True)} for tc in sorted(T)}
    tcbody = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(T[k])) for k in sorted(T)) + '\n}'
    tmlbody = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in tml.items()) + '\n}'
    body = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in out.items()) + '\n}'
    sp = var_span(s, 'BALL_CHART_CEC')
    if sp: s = s[:sp[0]] + body + s[sp[1]:]
    else:
        a0, b0 = var_span(s, 'PRES_TURNOUT_CEC'); end = s.index(';', b0) + 1
        s = s[:end] + ('\n  // County ball-chart data for 縣市長 / 區域立委 (per ED) / 不分區政黨, same record shape as\n'
                       '  // PRES_TURNOUT_CEC. Generated by build_profile_ballcharts.py from CEC subtotal rows.\n'
                       '  var BALL_CHART_CEC = ' + body + ';') + s[end:]
    sp = var_span(s, 'BALL_CHART_TC_CEC')
    if sp: s = s[:sp[0]] + tcbody + s[sp[1]:]
    else:
        a0, b0 = var_span(s, 'BALL_CHART_CEC'); end = s.index(';', b0) + 1
        s = s[:end] + ('\n  // Township ball-chart data (總統/區域立委 per district fragment/不分區/縣長/鄉鎮市長), same\n'
                       '  // record shape. Generated by build_profile_ballcharts.py from CEC township subtotal rows.\n'
                       '  var BALL_CHART_TC_CEC = ' + tcbody + ';') + s[end:]
    sp = var_span(s, 'TOWNSHIP_MAYOR_LINEAGE'); s = s[:sp[0]] + tmlbody + s[sp[1]:]
    print('townships', len(T), {k: sum(len(T[t][k]) for t in T) for k in ('presidential', 'legislative', 'partylist', 'mayor', 'townshipMayor', 'council')})
    print({cc: {k: {y: (len(v) if k == 'legislative' else len(v['cands'])) for y, v in o[k].items()} for k in o} for cc, o in out.items()})
    if a.dry_run: print('dry run'); return
    open(PROFILE, 'w', encoding='utf-8').write(s); print('wrote', PROFILE)


if __name__ == '__main__':
    main()
