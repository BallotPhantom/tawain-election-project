#!/usr/bin/env python3
"""Read-only audit: every election table in v2/profile.html vs the CEC raw files.

    python3 tests/audit_profile_cec.py [-v]

Covers 區域立委, 不分區, 縣市長, 鄉鎮市長, 縣市議員 at county / district / township / village grain.
(總統 and the ball-chart tables have their own tests: reconcile_presidential.py, reconcile_ballcharts.py.)
Each check prints PASS/FAIL per table with a count of mismatching records and a few examples;
exit status 1 if any FAIL.
"""
import collections, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE); sys.path.insert(0, ROOT)
from cec_lib import BYELECTIONS, Election, FORMER_TC_NAMES, MERGED_2008, election_for, merge_rows  # noqa: E402

CC = {'10008': ('NANTOU_SEED', '南投縣'), '10004': ('HSINCHU_SEED', '新竹縣'), '10013': ('PINGTUNG_SEED', '屏東縣'), '10007': ('CHANGHUA_SEED', '彰化縣'), '10009': ('YUNLIN_SEED', '雲林縣'), '63000': ('TAIPEI_SEED', '臺北市'), '10017': ('KEELUNG_SEED', '基隆市'), '68000': ('TAOYUAN_SEED', '桃園市'), '64000': ('KAOHSIUNG_SEED', '高雄市'), '66000': ('TAICHUNG_SEED', '臺中市'), '65000': ('NEWTAIPEI_SEED', '新北市'), '67000': ('TAINAN_SEED', '臺南市'), '10015': ('HUALIEN_SEED', '花蓮縣'), '10014': ('TAITUNG_SEED', '臺東縣')}
OLD = {'2008': {'03004': '10004', '03008': '10008', '03013': '10013', '03007': '10007', '03009': '10009', '01000': '63000', '03017': '10017', '03003': '68000', '02000': '64000', '03012': '64000', '03006': '66000', '03019': '66000', '03001': '65000', '03011': '67000', '03021': '67000', '03015': '10015', '03014': '10014'}, '2012': {'06003': '10004', '06006': '10008', '06009': '10013', '06005': '10007', '06007': '10009', '01000': '63000', '06013': '10017', '06002': '68000', '05000': '64000', '03000': '66000', '02000': '65000', '04000': '67000', '06011': '10015', '06010': '10014'}}
LEG = {'2016': ('2016總統立委/區域立委', '_T1'), '2020': ('2020總統立委/區域立委', ''), '2024': ('2024總統立委/區域立委', ''),
       '2023': ('立委補選(2019年後)', '')}   # by-elections (cec_lib.BYELECTIONS), named on the general election's districts
PL = {'2008': ('2008立委/不分區政黨', ''), '2012': ('20120114-總統及立委/不分區政黨', ''), '2016': ('2016總統立委/不分區政黨', '_T4'),
      '2020': ('2020總統立委/不分區政黨', ''), '2024': ('2024總統立委/不分區政黨', '')}
# 縣市 + 直轄市 folders of one race (cec_lib.Election merges a tuple)
MAYOR = {'2014': ('2014-103年地方公職人員選舉/縣市市長', '2014-103年地方公職人員選舉/直轄市市長'), '2018': ('2018-107年地方公職人員選舉/縣市市長', '2018-107年地方公職人員選舉/直轄市市長'), '2022': ('2022-111年地方公職人員選舉/C1/city', '2022-111年地方公職人員選舉/C1/prv')}
# 鄉鎮市長 + 直轄市山地原住民區長 (復興區 …): the same kind of race (an elected head of a township-level body)
TMAYOR = {'2014': ('2014-103年地方公職人員選舉/縣市鄉鎮市長', '2014-103年地方公職人員選舉/直轄市區長'),
          '2018': ('2018-107年地方公職人員選舉/縣市鄉鎮市長', '2018-107年地方公職人員選舉/直轄市區長'),
          '2022': ('2022-111年地方公職人員選舉/D1', '2022-111年地方公職人員選舉/D2')}
COUNCIL = {'2014': ('2014-103年地方公職人員選舉/縣市區域議員', '2014-103年地方公職人員選舉/直轄市區域議員'), '2018': ('2018-107年地方公職人員選舉/縣市區域議員', '2018-107年地方公職人員選舉/直轄市區域議員'), '2022': ('2022-111年地方公職人員選舉/T1/city', '2022-111年地方公職人員選舉/T1/prv')}
COUNCIL_P = {'2014': ('2014-103年地方公職人員選舉/縣市平原議員', '2014-103年地方公職人員選舉/直轄市平原議員'), '2018': ('2018-107年地方公職人員選舉/縣市平原議員', '2018-107年地方公職人員選舉/直轄市平原議員'), '2022': ('2022-111年地方公職人員選舉/T2/city', '2022-111年地方公職人員選舉/T2/prv')}
COUNCIL_M = {'2014': ('2014-103年地方公職人員選舉/縣市山原議員', '2014-103年地方公職人員選舉/直轄市山原議員'), '2018': ('2018-107年地方公職人員選舉/縣市山原議員', '2018-107年地方公職人員選舉/直轄市山原議員'), '2022': ('2022-111年地方公職人員選舉/T3/city', '2022-111年地方公職人員選舉/T3/prv')}
# 鄉鎮市民代表 + 直轄市山地原住民區民代表 (復興區 …)
REP = {'2014': ('2014-103年地方公職人員選舉/縣市鄉鎮市民代表', '2014-103年地方公職人員選舉/直轄市區民代表'),
       '2018': ('2018-107年地方公職人員選舉/縣市鄉鎮市民代表', '2018-107年地方公職人員選舉/直轄市區民代表'),
       '2022': ('2022-111年地方公職人員選舉/R1', '2022-111年地方公職人員選舉/R3')}

VARS = ['TOWNSHIP_CENTRAL_GOV', 'LEGIS_TC_DATA', 'LEGIS_TC_SPLIT_DATA', 'LEGIS_VC_DATA', 'LEGIS_VC_LINEAGE', 'PL_TC_DATA', 'PL_VC_DATA',
        'PL_VC_LINEAGE', 'MAYOR_COUNTY_DATA', 'MAYOR_TC_DATA', 'TOWNSHIP_COUNTY_MAYOR_HISTORY', 'TOWNSHIP_LOCAL_GOV', 'TOWNSHIP_REP_COUNCIL',
        'COUNCIL_TC_DATA', 'COUNCIL_VC_DATA', 'COUNCIL_DIST_DATA', 'COUNCIL_IND_DATA', 'COUNCIL_IND_TC_DATA', 'COUNCIL_IND_VC_DATA', 'TOWNSHIP_MAYOR_LINEAGE', 'MAYOR_VC_LINEAGE']


def load_profile():
    from build_profile_presidential import var_span, PROFILE
    import re
    s = open(PROFILE, encoding='utf-8').read()
    src = ''
    for n in VARS + [v[0] for v in CC.values()]:
        a, b = var_span(s, n); src += 'var %s = %s;\n' % (n, s[a:b])
    pl = re.search(r'function partyLabel\(p\) \{\s*return (\{.*?\})\[p\]', s, re.S)
    src += 'var PL_LABEL = %s;\n' % pl.group(1)
    src += 'JSON.stringify({label: PL_LABEL, seeds: {%s}, %s})' % (
        ','.join("'%s':%s" % (cc, v[0]) for cc, v in CC.items()), ','.join('%s:%s' % (n, n) for n in VARS))
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh: fh.write(src); p = fh.name
    try: return json.loads(subprocess.run(['osascript', '-l', 'JavaScript', p], capture_output=True, text=True, check=True).stdout)
    finally: os.unlink(p)


P = load_profile()
LABEL = P['label']
ALIAS = {'中國國民黨': 'kmt', '民主進步黨': 'dpp', '台灣民眾黨': 'tpp', '台灣綠黨': 'gp', '臺灣雙語無法黨': 'tbip', '制度救世島': 'isw', '社會民主黨': 'sdp',
         '無黨籍及未經政黨推薦': 'ind', '無黨籍': 'ind', '無': 'ind', '親民黨': 'pfp', '新黨': 'np', '時代力量': 'npp', '台灣基進': 'tsr',
         '台灣團結聯盟': 'tsu', '民國黨': 'mkt', '勞動黨': 'lp', '中華統一促進黨': 'cupp', '自由台灣黨': 'ftp'}


def code_of(party_name, prefer=()):
    if party_name in ALIAS: return ALIAS[party_name]
    exact = [k for k, l in LABEL.items() if l == party_name]
    for k in exact:
        if k in prefer: return k
    return exact[0] if exact else None


FAILS = 0
VERBOSE = '-v' in sys.argv


def report(tag, bad, total, note=''):
    global FAILS
    ok = not bad
    FAILS += (not ok)
    print(('PASS ' if ok else 'FAIL ') + f'{tag}: {len(bad)}/{total} records differ' + (f'  ({note})' if note else ''))
    for b in (bad if VERBOSE else bad[:6]): print('     ', b)


def m(votes, valid):
    v = sorted(votes, reverse=True) + [0]
    return (v[0] - v[1]) / valid if valid else 0


def geo(E, oldmap=None, tnames=None):
    """{('county',cc)|('tc',tc)|('vc',vc)|('area',cc,area)|('tcarea',tc,area): row} — modern codes.
    tnames: {(cc, township name): tc} for pre-2014 files (township numbers differ; map by name)."""
    out = {}
    tmap = {}
    if oldmap:
        for (cc, area, dept, li), n in E.name.items():
            if cc in oldmap and dept != '000' and li == '0000':
                tc = tnames.get((oldmap[cc], n.replace('台', '臺'))) or tnames.get((oldmap[cc], n))
                assert tc, ('unmapped old township', cc, dept, n)
                tmap[(cc, dept)] = tc
    for k, e in E.rows.items():
        cc, area, dept, li = k
        mc = oldmap.get(cc) if oldmap else (cc if cc in CC else None)
        if not mc: continue
        lvl = E.level(k)
        if lvl == 'county':
            if ('county', mc) in out:   # 2008 高雄市 + 高雄縣 (cec_lib.MERGED_2008): both old county rows summed
                assert oldmap and mc in MERGED_2008 and cc in MERGED_2008[mc], ('two county rows', mc, cc)
                k0, e0 = out[('county', mc)]; k, e = k0, merge_rows(e0, e)
            out[('county', mc)] = (k, e)
        elif lvl == 'area': out[('area', mc, area)] = (k, e)
        elif lvl == 'tc':
            tc = tmap[(cc, dept)] if oldmap else cc + dept
            out[('tcarea', tc, area)] = (k, e)
            if ('tc', tc) in out:   # a township split across areas: sum the pieces
                k0, e0 = out[('tc', tc)]
                e = {'valid': e0['valid'] + e['valid'], 'invalid': e0['invalid'] + e['invalid'], 'cast': e0['cast'] + e['cast'],
                     'elig': e0['elig'] + e['elig'], 'votes': {**e0['votes'], **{n: e0['votes'].get(n, 0) + v for n, v in e['votes'].items()}}, 'split': True}
            out[('tc', tc)] = (k, e)
        elif lvl == 'vc' and not oldmap:
            out[('vc', cc + dept + li[-3:])] = (k, e)
    return out


def same_village(a, b):
    return len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1


def reissued(E_by_year, vc_key_of):
    """{(vc, year)} whose CEC village name differs from the latest year's name by more than one
    character — a re-issued code (東港 大鵬里→福德里); the profile deliberately leaves those out."""
    names = collections.defaultdict(dict)
    for y, E in E_by_year.items():
        for k in E.rows:
            if E.level(k) == 'vc' and k[0] in CC: names[vc_key_of(k)][y] = E.vname(k)
    return {(vc, y) for vc, ys in names.items() for y, n in ys.items() if not same_village(n, ys[max(ys)])}


def named(E, k, e):
    return {E.cand(k, no)['name']: v for no, v in e['votes'].items()}


TNAMES = {(tc[:5], n.replace('台', '臺')): tc for cc in CC for tc, n, *_ in P['seeds'][cc]['townships']}
TNAMES.update({(tc[:5], o): tc for tc, olds in FORMER_TC_NAMES.items() for o in olds})   # 員林鎮 → 員林市 (2015)
TCS = sorted(t for (_, t) in TNAMES.items())
TCG = P['TOWNSHIP_CENTRAL_GOV']

# ============================== 區域立委 ==============================
leg = {y: election_for(y, d, suf, set(CC)) for y, (d, suf) in LEG.items()}
VCK = lambda k: k[0] + k[2] + k[3][-3:]
REISSUED = reissued(leg, VCK)
print('INFO re-issued village codes left out by design:', sorted(REISSUED))
bad = {k: [] for k in ['seed', 'tcg', 'tcdata', 'split', 'vclin', 'vcdata', 'party']}
n = collections.Counter()
for y, E in leg.items():
    G = geo(E)
    if y not in BYELECTIONS:
        AREAS = {cc: sorted(key[2] for key in G if key[0] == 'area' and key[1] == cc) for cc in CC}
        SPLIT_TCS = {tc for tc in TCS if sum(1 for key in G if key[0] == 'tcarea' and key[1] == tc) > 1}
    def edname(a, cc):
        return CC[cc][1] + ('選舉區' if len(AREAS[cc]) == 1 else '第%d選舉區' % int(a))
    for cc, (seedn, cname) in CC.items():
        areas = AREAS[cc]
        for d in P['seeds'][cc].get('legislativeByYear', {}).get(y, []):
            n['seed'] += 1
            a = next(a for a in areas if edname(a, cc) == d['district'])
            k, e = G[('area', cc, a)]
            v = named(E, k, e); w = max(v, key=v.get)
            exp = {'winner': w, 'totalVotes': e['valid'], 'wpct': round(v[w] / e['valid'] * 100, 1), 'margin': round(m(v.values(), e['valid']), 6)}
            if 'turnout' in d: exp['turnout'] = round(e['cast'] / e['elig'] * 100, 2)
            diff = {f: (d.get(f), x) for f, x in exp.items() if (abs(d.get(f) - x) > (0.0006 if f == 'margin' else 0.051) if isinstance(x, float) else d.get(f) != x)}
            if diff: bad['seed'].append((y, d['district'], diff))
            pc = code_of(E.cand(k, next(no for no, vv in e['votes'].items() if E.cand(k, no)['name'] == w))['party_name'])
            if pc and d['party'] != pc and not (d['party'] in ('other', 'ind') and pc in ('ind',)): bad['party'].append(('seed', y, d['district'], w, d['party'], pc))
    for tc in TCS:
        rec = (TCG.get(tc, {}).get('legislativeByYear') or {}).get(y)
        pieces = [(a, G[key]) for key in G if key[0] == 'tcarea' and key[1] == tc for a in [key[2]]]
        bye_piece = y in BYELECTIONS and tc in SPLIT_TCS and len(pieces) == 1   # 松山區: one fragment of a split township
        if rec:
            n['tcg'] += 1
            assert len(pieces) == 1, (tc, y)
            a, (k, e) = pieces[0]
            v = named(E, k, e); mine = {c['name']: c['votes'] for c in rec['cands']}
            if mine != v or rec.get('total') != e['valid'] or rec.get('ed') != edname(a, tc[:5]):
                bad['tcg'].append((y, tc, rec.get('ed'), {x: mine.get(x, 0) - v.get(x, 0) for x in set(v) | set(mine) if mine.get(x) != v.get(x)}, 'total', rec.get('total'), e['valid']))
            for c in rec['cands']:
                no = next(no for no in e['votes'] if E.cand(k, no)['name'] == c['name']) if c['name'] in v else None
                pc = code_of(E.cand(k, no)['party_name']) if no else None
                if pc and c['party'] != pc and not (c['party'] == 'other' and pc not in ('dpp', 'kmt', 'tpp', 'ind')): bad['party'].append(('tcg', y, tc, c['name'], c['party'], pc))
        elif len(pieces) == 1 and not bye_piece:
            bad['tcg'].append((y, tc, 'MISSING'))
        td = P['LEGIS_TC_DATA'].get(tc, {}).get(y)
        if len(pieces) == 1 and not bye_piece:
            n['tcdata'] += 1
            a, (k, e) = pieces[0]; v = named(E, k, e)
            w = max(v, key=v.get)
            pc = code_of(E.cand(k, next(no for no in e['votes'] if E.cand(k, no)['name'] == w))['party_name'])
            exp = round(m(v.values(), e['valid']), 5)
            if not td or abs(td[1] - exp) > 0.00051 or (pc in ('dpp', 'kmt', 'tpp') and td[0] != pc):
                bad['tcdata'].append((y, tc, td, (pc, exp)))
            if P['LEGIS_TC_DATA'].get(tc, {}).get('ed') not in (None, edname(a, tc[:5])) and y == '2024': bad['tcdata'].append((y, tc, 'ed', P['LEGIS_TC_DATA'][tc]['ed'], edname(a, tc[:5])))
        elif len(pieces) > 1 or bye_piece:
            for a, (k, e) in pieces:
                n['split'] += 1
                key = edname(a, tc[:5]) + '__' + tc
                sd = P['LEGIS_TC_SPLIT_DATA'].get(key, {}).get(y); v = named(E, k, e)
                w = max(v, key=v.get); pc = code_of(E.cand(k, next(no for no in e['votes'] if E.cand(k, no)['name'] == w))['party_name'])
                exp = round(m(v.values(), e['valid']), 6)
                if not sd or abs(sd[1] - exp) > 0.0006 or sd[0] != pc: bad['split'].append((y, key, sd, (pc, exp)))
    for (lvl, *rest), (k, e) in G.items():
        if lvl != 'vc': continue
        vc = rest[0]; n['vclin'] += 1
        lin = P['LEGIS_VC_LINEAGE'].get(vc, {}).get(y)
        v = named(E, k, e)
        if not e['valid']: continue
        if (vc, y) in REISSUED:
            if lin: bad['vclin'].append((y, vc, 'reissued code should be absent'))
            continue
        if lin and ((lin.get('invalid'), lin.get('cast'), lin.get('elig')) != (e['invalid'], e['cast'], e['elig']) or lin.get('ed') != edname(k[1], vc[:5])):
            bad['vclin'].append((y, vc, 'prof/ed', (lin.get('invalid'), lin.get('cast'), lin.get('elig'), lin.get('ed')), (e['invalid'], e['cast'], e['elig'], edname(k[1], vc[:5]))))
        if not lin: bad['vclin'].append((y, vc, E.name.get(k), 'MISSING')); continue
        mine = {c['candidate']: c['votes'] for c in lin['candidates']}
        if mine != v or lin.get('total') != e['valid']:
            bad['vclin'].append((y, vc, E.name.get(k), {x: mine.get(x, 0) - v.get(x, 0) for x in set(v) | set(mine) if mine.get(x) != v.get(x)}, lin.get('total'), e['valid']))
        vd = P['LEGIS_VC_DATA'].get(vc, {}).get(y); n['vcdata'] += 1
        exp = round(m(v.values(), e['valid']), 5)
        w = max(v, key=v.get); pc = code_of(E.cand(k, next(no for no in e['votes'] if E.cand(k, no)['name'] == w))['party_name'])
        if not vd or abs(vd[1] - exp) > 0.00051 or (vd[0] != pc and exp > 0): bad['vcdata'].append((y, vc, vd, (pc, exp)))
report('LEG seed.legislativeByYear', bad['seed'], n['seed'])
report('LEG TOWNSHIP_CENTRAL_GOV.legislativeByYear', bad['tcg'], n['tcg'])
report('LEG LEGIS_TC_DATA', bad['tcdata'], n['tcdata'])
report('LEG LEGIS_TC_SPLIT_DATA', bad['split'], n['split'])
report('LEG LEGIS_VC_LINEAGE', bad['vclin'], n['vclin'])
report('LEG LEGIS_VC_DATA', bad['vcdata'], n['vcdata'])
report('LEG party codes', bad['party'], n['seed'] + n['tcg'], 'profile code vs CEC party name')
extra = [vc for vc in P['LEGIS_VC_LINEAGE'] if vc[:5] in CC and not any(('vc', vc) in geo(E) for E in [])]

# ============================== 不分區 ==============================
bad = {k: [] for k in ['seed', 'tcg', 'tcdata', 'vclin', 'vcdata']}
n = collections.Counter()
for y, (d, suf) in PL.items():
    E = Election(d, suf, set(OLD[y]) if y in OLD else set(CC))
    G = geo(E, OLD.get(y), TNAMES)
    def pvotes(k, e, prefer):
        out = {}
        for no, v in e['votes'].items():
            c = E.cand(k, no); code = code_of(c['name'], prefer) or c['name']
            out[code] = out.get(code, 0) + v
        return out
    for cc in CC:
        raw = (P['seeds'][cc].get('partyListRawByYear') or {}).get(y)
        k, e = G[('county', cc)]
        exp = pvotes(k, e, raw or {})
        if raw is not None:
            n['seed'] += 1
            r2 = {p: v for p, v in raw.items() if v}; exp = {p: v for p, v in exp.items() if v}
            if r2 != exp: bad['seed'].append((y, cc, {p: r2.get(p, 0) - exp.get(p, 0) for p in set(r2) | set(exp) if r2.get(p) != exp.get(p)}))
    for tc in TCS:
        if ('tc', tc) not in G: continue
        k, e = G[('tc', tc)]
        raw = (TCG.get(tc, {}).get('partyListRawByYear') or {}).get(y)
        exp = pvotes(k, e, raw or {})
        if raw is not None:
            n['tcg'] += 1
            r2 = {p: v for p, v in raw.items() if v}; exp = {p: v for p, v in exp.items() if v}
            if r2 != exp: bad['tcg'].append((y, tc, {p: r2.get(p, 0) - exp.get(p, 0) for p in set(r2) | set(exp) if r2.get(p) != exp.get(p)}))
        elif y in ('2016', '2020', '2024'): bad['tcg'].append((y, tc, 'MISSING'))
        if y in ('2016', '2020', '2024'):
            n['tcdata'] += 1
            td = P['PL_TC_DATA'].get(tc, {}).get(y)
            w = max(exp, key=exp.get); ev = round(m(exp.values(), e['valid']), 5)
            if not td or td[0] != w or abs(td[1] - ev) > 0.00051: bad['tcdata'].append((y, tc, td, (w, ev)))
    if y not in ('2016', '2020', '2024'): continue
    for (lvl, *rest), (k, e) in G.items():
        if lvl != 'vc' or not e['valid']: continue
        vc = rest[0]; n['vclin'] += 1
        lin = P['PL_VC_LINEAGE'].get(vc, {}).get(y)
        exp = pvotes(k, e, {})
        if (vc, y) in REISSUED:
            if lin: bad['vclin'].append((y, vc, 'reissued code should be absent'))
            continue
        if lin and (lin.get('invalid'), lin.get('cast'), lin.get('elig')) != (e['invalid'], e['cast'], e['elig']):
            bad['vclin'].append((y, vc, 'prof', (lin.get('invalid'), lin.get('cast'), lin.get('elig')), (e['invalid'], e['cast'], e['elig'])))
        if not lin: bad['vclin'].append((y, vc, E.name.get(k), 'MISSING')); continue
        mine = {}
        for c in lin['parties']: mine[c['party']] = mine.get(c['party'], 0) + c['votes']
        mine = {p: v for p, v in mine.items() if v}; exp2 = {p: v for p, v in exp.items() if v}
        if mine != exp2 or lin.get('total', sum(mine.values())) != e['valid']:
            bad['vclin'].append((y, vc, E.name.get(k), sum(mine.values()), e['valid']))
        vd = P['PL_VC_DATA'].get(vc, {}).get(y); n['vcdata'] += 1
        w = max(exp, key=exp.get); ev = round(m(exp.values(), e['valid']), 5)
        if not vd or (vd[0] != w and ev > 0) or abs(vd[1] - ev) > 0.00051: bad['vcdata'].append((y, vc, vd, (w, ev)))
report('PL seed.partyListRawByYear', bad['seed'], n['seed'])
report('PL TOWNSHIP_CENTRAL_GOV.partyListRawByYear', bad['tcg'], n['tcg'])
report('PL PL_TC_DATA', bad['tcdata'], n['tcdata'])
report('PL PL_VC_LINEAGE', bad['vclin'], n['vclin'])
report('PL PL_VC_DATA', bad['vcdata'], n['vcdata'])

# ============================== 縣市長 ==============================
bad = {k: [] for k in ['seedby', 'hist', 'cdata', 'tcdata', 'tch', 'vcdata']}
n = collections.Counter()
for y, d in MAYOR.items():
    E = Election(d, '', set(CC)); G = geo(E)
    for cc in CC:
        k, e = G[('county', cc)]; v = named(E, k, e); w = max(v, key=v.get)
        mb = P['seeds'][cc]['mayorByYear'].get(y); n['seedby'] += 1
        exp = {'name': w, 'votes': v[w], 'totalVotes': e['valid'], 'pct': round(v[w] / e['valid'] * 100, 2)}
        diff = {f: (mb.get(f), x) for f, x in exp.items() if (abs(mb.get(f) - x) > 0.0051 if isinstance(x, float) else mb.get(f) != x)}
        if diff: bad['seedby'].append((y, cc, diff))
        h = next((r for r in P['seeds'][cc]['mayorHistory'] if r['year'] == y), None)
        if not h or h['name'] != w: bad['hist'].append((y, cc, h, w))
        n['cdata'] += 1
        cd = P['MAYOR_COUNTY_DATA'].get(cc, {}).get(y); ev = round(m(v.values(), e['valid']), 6)
        if not cd or abs(cd[1] - ev) > 0.0006: bad['cdata'].append((y, cc, cd, ev))
        party = {c['name']: c['party'] for c in P['seeds'][cc]['mayorLineageByYear'][y]['candidates']}
    for tc in TCS:
        k, e = G[('tc', tc)]; v = named(E, k, e); w = max(v, key=v.get)
        party = {c['name']: c['party'] for c in P['seeds'][tc[:5]]['mayorLineageByYear'][y]['candidates']}
        n['tcdata'] += 1; td = P['MAYOR_TC_DATA'].get(tc, {}).get(y); ev = round(m(v.values(), e['valid']), 6)
        if not td or td[0] != party[w] or abs(td[1] - ev) > 0.0006: bad['tcdata'].append((y, tc, td, (party[w], ev)))
        n['tch'] += 1; th = P['TOWNSHIP_COUNTY_MAYOR_HISTORY'].get(tc, {}).get(y)
        mine = {c['name']: c['votes'] for c in th['candidates']} if th else None
        if not th or mine != v or th.get('total') != e['valid'] or ('elig' in th and th['elig'] != e['elig']):
            bad['tch'].append((y, tc, th and {x: (mine.get(x), v.get(x)) for x in set(v) | set(mine) if mine.get(x) != v.get(x)}, th and (th.get('total'), e['valid'], th.get('elig'), e['elig'])))
report('MAYOR seed.mayorByYear', bad['seedby'], n['seedby'])
report('MAYOR seed.mayorHistory', bad['hist'], n['seedby'])
report('MAYOR MAYOR_COUNTY_DATA', bad['cdata'], n['cdata'])
report('MAYOR MAYOR_TC_DATA', bad['tcdata'], n['tcdata'])
report('MAYOR TOWNSHIP_COUNTY_MAYOR_HISTORY', bad['tch'], n['tch'])

# ============================== 鄉鎮市長 (TOWNSHIP_LOCAL_GOV) ==============================
bad = []; nn = 0
for y, d in TMAYOR.items():
    E = Election(d, '', set(CC)); G = geo(E)
    for tc, rec in P['TOWNSHIP_LOCAL_GOV'].items():
        mb = (rec.get('mayorByYear') or {}).get(y)
        if not mb: continue
        nn += 1
        k, e = G[('tc', tc)]; v = named(E, k, e); w = max(v, key=v.get)
        exp = {'name': w, 'votes': v[w], 'totalVotes': e['valid'], 'pct': round(v[w] / e['valid'] * 100, 2)}
        diff = {f: (mb.get(f), x) for f, x in exp.items() if (abs(mb.get(f) - x) > 0.0051 if isinstance(x, float) else mb.get(f) != x)}
        if diff: bad.append((y, tc, diff))
report('TMAYOR TOWNSHIP_LOCAL_GOV.mayorByYear', bad, nn)

# ============================== 縣市議員 ==============================
bad = {k: [] for k in ['seats', 'dist', 'tc', 'vc', 'ind', 'tcdist', 'indvc', 'indtc']}
CREISSUED = reissued({y: Election(COUNCIL[y], '', set(CC)) for y in COUNCIL}, VCK)
n = collections.Counter()
for y in COUNCIL:
    Eg = Election(COUNCIL[y], '', set(CC)); Gg = geo(Eg)
    Ep = Election(COUNCIL_P[y], '', set(CC)); Em = Election(COUNCIL_M[y], '', set(CC))
    def bypty(E, k, e):
        out = collections.Counter()
        for no, v in e['votes'].items(): out[code_of(E.cand(k, no)['party_name']) or 'other'] += v
        return out
    for cc in CC:
        seats = collections.Counter()
        for E in (Eg, Ep, Em):
            for k, e in E.rows.items():
                if k[0] == cc and E.level(k) == 'area':
                    for no in e['elected']: seats[code_of(E.cand(k, no)['party_name']) or 'other'] += 1
        mine = P['seeds'][cc].get('council' + y); n['seats'] += 1
        if not mine or dict(mine['byParty']) != dict(seats) or mine['total'] != sum(seats.values()):
            bad['seats'].append((y, cc, mine, dict(seats), sum(seats.values())))
        gen = ((P['seeds'][cc].get('councilByYear') or {}).get(y) or {}).get('general') or P['seeds'][cc]['councilGeneralDistricts']   # 新北 2022: per-year lists
        for (lvl, *rest), (k, e) in Gg.items():
            if lvl == 'area' and rest[0] == cc:
                a = rest[1]; n['dist'] += 1
                bp = bypty(Eg, k, e); w = max(bp, key=bp.get); ev = m(bp.values(), e['valid'])
                dd = P['COUNCIL_DIST_DATA'].get(cc + '_' + a, {}).get(y)
                if not dd or dd[0] != w or abs(dd[1] - ev) > 0.0000051: bad['dist'].append((y, cc + '_' + a, dd, (w, round(ev, 6))))
                if a not in gen: bad['dist'].append((y, cc + '_' + a, 'not in councilGeneralDistricts'))
        for E, kind in ((Ep, 'P'), (Em, 'M')):
            for k, e in E.rows.items():
                if k[0] == cc and E.level(k) == 'area':
                    n['ind'] += 1
                    bp = bypty(E, k, e); w = max(bp, key=bp.get)
                    dd = P['COUNCIL_IND_DATA'].get(cc + '_' + k[1], {}).get(y)
                    if not dd or dd[0] != w or abs(dd[1] - m(bp.values(), e['valid'])) > 0.0000051: bad['ind'].append((y, kind, cc + '_' + k[1], dd, (w, round(m(bp.values(), e['valid']), 6))))
    for tc in TCS:
        pieces = [(key[2], Gg[key]) for key in Gg if key[0] == 'tcarea' and key[1] == tc]
        if not pieces: continue
        n['tc'] += 1
        a, (k, e) = pieces[0]
        bp = bypty(Eg, k, e); w = max(bp, key=bp.get)
        td = P['COUNCIL_TC_DATA'].get(tc, {})
        want = (td.get('distByYear') or {}).get(y, td.get('dist'))   # per-year district where it changed (新北 2022)
        if want != a or len(pieces) > 1: bad['tcdist'].append((y, tc, want, [p[0] for p in pieces]))
        if not td.get(y) or td[y][0] != w or abs(td[y][1] - m(bp.values(), e['valid'])) > 0.0000051: bad['tc'].append((y, tc, td.get(y), (w, round(m(bp.values(), e['valid']), 6))))
    for (lvl, *rest), (k, e) in Gg.items():
        if lvl != 'vc' or not e['valid']: continue
        vc = rest[0]; n['vc'] += 1
        if (vc, y) in CREISSUED: continue
        bp = bypty(Eg, k, e); w = max(bp, key=bp.get)
        top = sorted(bp.values(), reverse=True)
        tie = len(top) > 1 and top[0] == top[1]
        vd = P['COUNCIL_VC_DATA'].get(vc, {}).get(y)
        if not vd or (vd[0] != w and not tie) or abs(vd[1] - m(bp.values(), e['valid'])) > 0.0000051: bad['vc'].append((y, vc, Eg.name.get(k), vd, (w, round(m(bp.values(), e['valid']), 6))))
    # 平地 / 山地原住民 ballots per village (COUNCIL_IND_VC_DATA): every village / joint-station row with votes, recomputed
    for E, kind in ((Ep, 'p'), (Em, 'm')):
        names = {(k[0] + k[2], E.name.get(k) or E.name.get((k[0], '00', k[2], k[3]), '')): k[0] + k[2] + k[3][-3:] for k in E.rows if k[0] in P['seeds'] and E.level(k) == 'vc'}
        for k, e in E.rows.items():
            lvl = E.level(k)
            if k[0] not in P['seeds'] or lvl not in ('vc', 'joint') or not e['valid']: continue
            tc = k[0] + k[2]
            nm = E.name.get(k) or E.name.get((k[0], '00', k[2], k[3]), '')
            members = [tc + k[3][-3:]] if lvl == 'vc' else [names.get((tc, x)) for x in nm.split('、')]
            if lvl == 'joint': members = [vc for vc in members if vc not in set(names.values())]   # a member with its own row keeps it (臺東 長濱 2014)
            bp = bypty(E, k, e); w = max(bp, key=bp.get); top = sorted(bp.values(), reverse=True); tie = len(top) > 1 and top[0] == top[1]
            for vc in members:
                if (vc, y) in CREISSUED: continue
                n['indvc'] += 1
                vd = ((P['COUNCIL_IND_VC_DATA'].get(vc) or {}).get(y) or {}).get(kind)
                if not vc or not vd or (vd[0] != w and not tie) or abs(vd[1] - m(bp.values(), e['valid'])) > 0.0000051 or vd[2] != k[1]:
                    bad['indvc'].append((y, kind, vc, nm, vd, (w, round(m(bp.values(), e['valid']), 6), k[1])))
    for E, kind in ((Ep, 'p'), (Em, 'm')):   # ... and per township
        for k, e in E.rows.items():
            if k[0] not in P['seeds'] or E.level(k) != 'tc' or not e['valid']: continue
            n['indtc'] += 1
            bp = bypty(E, k, e); w = max(bp, key=bp.get); top = sorted(bp.values(), reverse=True); tie = len(top) > 1 and top[0] == top[1]
            td = ((P['COUNCIL_IND_TC_DATA'].get(k[0] + k[2]) or {}).get(y) or {}).get(kind)
            if not td or (td[0] != w and not tie) or abs(td[1] - m(bp.values(), e['valid'])) > 0.0000051 or td[2] != k[1]:
                bad['indtc'].append((y, kind, k[0] + k[2], td, (w, round(m(bp.values(), e['valid']), 6), k[1])))
    n['indtc_page'] += sum(1 for v in P['COUNCIL_IND_TC_DATA'].values() for kk in (v.get(y) or {}))
    n['indvc_page'] += sum(1 for v in P['COUNCIL_IND_VC_DATA'].values() for kk in (v.get(y) or {}))
report('COUNCIL seed.councilYYYY seats', bad['seats'], n['seats'])
report('COUNCIL COUNCIL_DIST_DATA winner', bad['dist'], n['dist'])
report('COUNCIL COUNCIL_IND_DATA winner', bad['ind'], n['ind'])
report('COUNCIL COUNCIL_TC_DATA dist', bad['tcdist'], n['tc'])
report('COUNCIL COUNCIL_TC_DATA winner', bad['tc'], n['tc'])
report('COUNCIL COUNCIL_VC_DATA winner', bad['vc'], n['vc'])
report('COUNCIL COUNCIL_IND_TC_DATA winner / district (平地・山地 per township)', bad['indtc'] + ([] if n['indtc_page'] == n['indtc'] else [('page entries', n['indtc_page'], 'recomputed', n['indtc'])]), n['indtc'])
report('COUNCIL COUNCIL_IND_VC_DATA winner / district (平地・山地 per village)', bad['indvc'], n['indvc'])
report('COUNCIL COUNCIL_IND_VC_DATA has no extra entries', [] if n['indvc_page'] == n['indvc'] else [('page', n['indvc_page'], 'recomputed', n['indvc'])], n['indvc'])

# ============================== 鄉鎮市民代表 (elected lists) ==============================
bad = []; nn = 0
for y, d in REP.items():
    E = Election(d, '', set(CC))
    for tc, ys in P['TOWNSHIP_REP_COUNCIL'].items():
        rec = ys.get(y)
        if not rec: continue
        for dist in rec['districts']:
            nn += 1
            area = dist['key'].split('_')[1]
            k = next((k for k in E.rows if k[0] == tc[:5] and k[1] == area and k[2] == tc[5:] and k[3] == '0000'), None) or \
                next((k for k in E.rows if k[0] == tc[:5] and k[1] == area and E.level(k) == 'area'), None)
            el = sorted((E.cand(k, no)['name'], code_of(E.cand(k, no)['party_name']) or 'other') for no in E.rows[k]['elected'])
            mine = sorted((c['name'], c['party']) for c in dist['elected'])
            if el != mine: bad.append((y, dist['key'], mine, el))
report('REP TOWNSHIP_REP_COUNCIL elected', bad, nn)

print('\nTOTAL FAIL TABLES:', FAILS)
sys.exit(1 if FAILS else 0)
