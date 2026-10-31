#!/usr/bin/env python3
"""Regenerate v2/profile.html's 區域立委 / 不分區 / 縣市長 / 縣市議員 tables straight from CEC raw files.

    python3 build_profile_cec_tables.py [--dry-run]

Same policy as build_profile_presidential.py: every number comes from a CEC subtotal row of the
right grain (county / district / township / village), never summed up from a finer table; villages
are keyed by CEC code (a code whose CEC name changes between years is a re-issued code and that
village-year is left out); joint polling stations stay out of village rows. Party codes come from
the CEC party name (partyLabel() names + ALIAS); a candidate whose party has no profile code is
'other', 無黨籍 is 'ind'.

Rewritten (each literal located by bracket matching, everything else byte-identical):
  <SEED>.legislativeByYear[y]   district/winner/party/wpct/totalVotes/margin (+turnout where present; distPvi kept)
  <SEED>.partyListRawByYear[y], TOWNSHIP_CENTRAL_GOV[tc].partyListRawByYear[y]   2008-2024
  TOWNSHIP_CENTRAL_GOV[tc].legislativeByYear[y]   (townships inside one district only; 竹北市 2020/2024 stays split)
  LEGIS_TC_DATA, LEGIS_TC_SPLIT_DATA, LEGIS_VC_DATA, LEGIS_VC_LINEAGE (+invalid/cast/elig/ed), all 3 counties
  PL_TC_DATA, PL_VC_DATA, PL_VC_LINEAGE (+invalid/cast/elig), all 3 counties
  <SEED>.mayorByYear, <SEED>.mayorLineageByYear[y].total (= valid votes), MAYOR_COUNTY_DATA
  TOWNSHIP_LOCAL_GOV[tc].mayorByYear
  <SEED>.councilYYYY (all seats incl. 平地/山地原住民), COUNCIL_DIST_DATA, COUNCIL_IND_DATA, COUNCIL_TC_DATA,
  COUNCIL_VC_DATA, COUNCIL_IND_TC_DATA / COUNCIL_IND_VC_DATA (平地 / 山地原住民 ballots per township / village) — margin is now the REAL (top1-top2)/valid by party (ind = one bucket); the map applies
  V1's councilDistColor saturation (clamp .05-.5, ×1.5, cap .5) at render time (_councilFillMargin).
Verify afterwards with tests/audit_profile_cec.py (must be 0 FAIL), then re-run build_profile_ballcharts.py.
"""
import argparse, collections, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from cec_lib import BYELECTIONS, Election, FORMER_TC_NAMES, MERGED_2008, election_for, merge_rows, tie_tail  # noqa: E402
from build_profile_presidential import var_span, depth1_keys, js, PROFILE  # noqa: E402
from build_profile_mayor_vc import same_village  # noqa: E402

SEEDS = {'10008': 'NANTOU_SEED', '10004': 'HSINCHU_SEED', '10013': 'PINGTUNG_SEED', '10007': 'CHANGHUA_SEED', '10009': 'YUNLIN_SEED', '63000': 'TAIPEI_SEED', '10017': 'KEELUNG_SEED', '68000': 'TAOYUAN_SEED', '64000': 'KAOHSIUNG_SEED', '66000': 'TAICHUNG_SEED', '65000': 'NEWTAIPEI_SEED', '67000': 'TAINAN_SEED', '10015': 'HUALIEN_SEED', '10014': 'TAITUNG_SEED'}
CNAME = {'10008': '南投縣', '10004': '新竹縣', '10013': '屏東縣', '10007': '彰化縣', '10009': '雲林縣', '63000': '臺北市', '10017': '基隆市', '68000': '桃園市', '64000': '高雄市', '66000': '臺中市', '65000': '新北市', '67000': '臺南市', '10015': '花蓮縣', '10014': '臺東縣'}
OLD = {'2008': {'03004': '10004', '03008': '10008', '03013': '10013', '03007': '10007', '03009': '10009', '01000': '63000', '03017': '10017', '03003': '68000', '02000': '64000', '03012': '64000', '03006': '66000', '03019': '66000', '03001': '65000', '03011': '67000', '03021': '67000', '03015': '10015', '03014': '10014'}, '2012': {'06003': '10004', '06006': '10008', '06009': '10013', '06005': '10007', '06007': '10009', '01000': '63000', '06013': '10017', '06002': '68000', '05000': '64000', '03000': '66000', '02000': '65000', '04000': '67000', '06011': '10015', '06010': '10014'}}
LEG = {'2016': ('2016總統立委/區域立委', '_T1'), '2020': ('2020總統立委/區域立委', ''), '2024': ('2024總統立委/區域立委', ''),
       '2023': ('立委補選(2019年後)', '')}   # by-elections (cec_lib.BYELECTIONS); after 2024 so its district count is known
PL = {'2008': ('2008立委/不分區政黨', ''), '2012': ('20120114-總統及立委/不分區政黨', ''), '2016': ('2016總統立委/不分區政黨', '_T4'),
      '2020': ('2020總統立委/不分區政黨', ''), '2024': ('2024總統立委/不分區政黨', '')}
# 縣市 + 直轄市 folders of the same race (cec_lib.Election merges a tuple of folders)
MAYOR = {'2014': ('2014-103年地方公職人員選舉/縣市市長', '2014-103年地方公職人員選舉/直轄市市長'),
         '2018': ('2018-107年地方公職人員選舉/縣市市長', '2018-107年地方公職人員選舉/直轄市市長'),
         '2022': ('2022-111年地方公職人員選舉/C1/city', '2022-111年地方公職人員選舉/C1/prv')}
# 鄉鎮市長 + 直轄市山地原住民區長 (復興區 …): the same kind of race (an elected head of a township-level body)
TMAYOR = {'2014': ('2014-103年地方公職人員選舉/縣市鄉鎮市長', '2014-103年地方公職人員選舉/直轄市區長'),
          '2018': ('2018-107年地方公職人員選舉/縣市鄉鎮市長', '2018-107年地方公職人員選舉/直轄市區長'),
          '2022': ('2022-111年地方公職人員選舉/D1', '2022-111年地方公職人員選舉/D2')}
COUNCIL = {y: [(b + s1, b + s2) for s1, s2 in ss] for y, b, ss in [
    ('2014', '2014-103年地方公職人員選舉/', [('縣市區域議員', '直轄市區域議員'), ('縣市平原議員', '直轄市平原議員'), ('縣市山原議員', '直轄市山原議員')]),
    ('2018', '2018-107年地方公職人員選舉/', [('縣市區域議員', '直轄市區域議員'), ('縣市平原議員', '直轄市平原議員'), ('縣市山原議員', '直轄市山原議員')]),
    ('2022', '2022-111年地方公職人員選舉/', [('T1/city', 'T1/prv'), ('T2/city', 'T2/prv'), ('T3/city', 'T3/prv')])]}
ALIAS = {'中國國民黨': 'kmt', '民主進步黨': 'dpp', '台灣民眾黨': 'tpp', '台灣綠黨': 'gp', '臺灣雙語無法黨': 'tbip', '制度救世島': 'isw', '社會民主黨': 'sdp',
         '無黨籍及未經政黨推薦': 'ind', '無黨籍': 'ind', '無': 'ind', '親民黨': 'pfp', '新黨': 'np', '時代力量': 'npp', '台灣基進': 'tsr',
         '台灣團結聯盟': 'tsu', '民國黨': 'mkt', '勞動黨': 'lp', '中華統一促進黨': 'cupp', '自由台灣黨': 'ftp'}


def load_label(s):
    pl = re.search(r'function partyLabel\(p\) \{\s*return (\{.*?\})\[p\]', s, re.S)
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh:
        fh.write('JSON.stringify(%s)' % pl.group(1)); p = fh.name
    try: return json.loads(subprocess.run(['osascript', '-l', 'JavaScript', p], capture_output=True, text=True, check=True).stdout)
    finally: os.unlink(p)


def margin(vals, valid):
    v = sorted(vals, reverse=True) + [0]
    return (v[0] - v[1]) / valid if valid else 0.0


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    s = open(PROFILE, encoding='utf-8').read()
    LABEL = load_label(s)

    def code_of(name, prefer=(), strict=False):
        if name in ALIAS: return ALIAS[name]
        exact = [k for k, l in LABEL.items() if l == name]
        for k in exact:
            if k in prefer: return k
        if exact: return exact[0]
        assert not strict, ('party without a profile code', name)
        return 'other'

    edits = []

    def put(span, text): edits.append((span[0], span[1], text))

    def append_key(span, key, lit):
        """Add `'key': lit` as a new last entry of the object literal s[span[0]:span[1]] (2008/2012 for 屏東)."""
        j = span[1] - 2
        while s[j] in ' \t\r\n': j -= 1
        put((j + 1, j + 1), ",\n      '%s': %s" % (key, lit))
    seed_keys = {cc: depth1_keys(s, *var_span(s, n)) for cc, n in SEEDS.items()}
    a0, b0 = var_span(s, 'TOWNSHIP_CENTRAL_GOV'); tcg = depth1_keys(s, a0, b0)
    tcs = sorted(k for k in tcg if k[:5] in SEEDS)
    tname = {}
    for cc, n in SEEDS.items():
        x, y = seed_keys[cc]['townships']
        for tc, nm in re.findall(r"\['(\d{8})',\s*'([^']+)'", s[x:y]): tname[(cc, nm.replace('台', '臺'))] = tc
    assert sorted(tname.values()) == tcs
    for tc, olds in FORMER_TC_NAMES.items(): tname.update({(tc[:5], o): tc for o in olds})

    def geo(E, oldmap=None):
        """modern-code view of E.rows: county / area / (tc, area) / tc (pieces summed) / vc."""
        tmap = {}
        if oldmap:
            for (cc, area, dept, li), nm in E.name.items():
                if cc in oldmap and dept != '000' and li == '0000':
                    tmap[(cc, dept)] = tname[(oldmap[cc], nm.replace('台', '臺'))]
        out = {}
        for k, e in E.rows.items():
            cc, area, dept, li = k
            mc = oldmap.get(cc) if oldmap else (cc if cc in SEEDS else None)
            if not mc: continue
            lvl = E.level(k)
            if lvl == 'county':
                if ('county', mc) in out:   # 2008 高雄市 + 高雄縣 = today's 高雄市 (cec_lib.MERGED_2008): sum both old county rows
                    assert oldmap and mc in MERGED_2008 and cc in MERGED_2008[mc], ('two county rows', mc, cc)
                    k0, e0 = out[('county', mc)]; k, e = k0, merge_rows(e0, e)
                out[('county', mc)] = (k, e)
            elif lvl == 'area': out[('area', mc, area)] = (k, e)
            elif lvl == 'tc':
                tc = tmap[(cc, dept)] if oldmap else cc + dept
                out.setdefault(('tcareas', tc), []).append((area, k, e))
            elif lvl == 'vc' and not oldmap: out[('vc', cc + dept + li[-3:])] = (k, e)
        return out

    def cands(E, k, e):
        """[{name, party, votes}] desc, party from the CEC party name."""
        out = [{'name': E.cand(k, no)['name'], 'party': code_of(E.cand(k, no)['party_name']), 'votes': v} for no, v in e['votes'].items()]
        return sorted(out, key=lambda c: (-c['votes'], c['name']))

    def keep_village(names_by_year, y):
        latest = names_by_year[max(names_by_year)]
        return same_village(names_by_year[y], latest)

    # ================= 區域立委 =================
    legis_tc, legis_split, legis_vc, legis_lin = {}, {}, {}, {}
    vnames = collections.defaultdict(dict); vrecs = {}
    general_areas = {}
    for y, (d, suf) in LEG.items():
        bye = y in BYELECTIONS
        E = election_for(y, d, suf, set(SEEDS)); G = geo(E)
        areas = {cc: sorted(k[2] for k in G if k[0] == 'area' and k[1] == cc) for cc in SEEDS}
        if not bye: general_areas = areas
        # a by-election covers one district: name it by the general election's district count (南投縣第2選舉區, not 南投縣選舉區)
        n_areas = general_areas if bye else areas
        edname = lambda cc, ar: CNAME[cc] + ('選舉區' if len(n_areas[cc]) == 1 else '第%d選舉區' % int(ar))
        for cc in SEEDS:
            if bye and not areas[cc]:
                continue                                     # no by-election in this county that year
            x, z = seed_keys[cc]['legislativeByYear']; yk = depth1_keys(s, x, z)
            old = {m.group(1): m.group(0) for m in re.finditer(r"\{\s*district:\s*'([^']+)'[^}]*\}", s[yk[y][0]:yk[y][1]])}
            rows = []
            for ar in areas[cc]:
                k, e = G[('area', cc, ar)]; cs = cands(E, k, e); w = cs[0]; nm = edname(cc, ar)
                o = old.get(nm, '')
                f = ["district: '%s'" % nm, "winner: '%s'" % w['name'], "party: '%s'" % w['party'], 'wpct: %s' % round(w['votes'] / e['valid'] * 100, 2),
                     'totalVotes: %d' % e['valid']]
                if 'turnout:' in o: f.append('turnout: %s' % round(e['cast'] / e['elig'] * 100, 2))
                pv = re.search(r'distPvi:\s*(-?[\d.]+)', o)
                if pv: f.append('distPvi: ' + pv.group(1))
                f.append('margin: %s' % round(margin([c['votes'] for c in cs], e['valid']), 6))
                rows.append('        { ' + ', '.join(f) + ' }')
                assert o or not old, ('district not in seed', cc, y, nm)
            put(yk[y], '[\n' + ',\n'.join(rows) + '\n      ]')
        for key, pieces in G.items():
            if key[0] != 'tcareas': continue
            tc = key[1]
            # a by-election covers only one district, so a township the general elections split
            # (臺北市松山區: 第3 + 第7選舉區) shows up as a single piece — it is still only that part
            split_in_general = bye and any(k.endswith('__' + tc) for k in legis_split)
            for ar, k, e in pieces:
                cs = cands(E, k, e); val = [cs[0]['party'], round(margin([c['votes'] for c in cs], e['valid']), 6)] + tie_tail((c['party'], c['votes']) for c in cs)
                if len(pieces) == 1 and not split_in_general:
                    legis_tc.setdefault(tc, {})[y] = val
                    if y == '2024': legis_tc[tc]['ed'] = edname(tc[:5], ar)
                    vrecs[('tcg', tc, y)] = {'ed': edname(tc[:5], ar), 'total': e['valid'], 'cands': cs}
                else:
                    legis_split.setdefault(edname(tc[:5], ar) + '__' + tc, {})[y] = val
        for key, ke in G.items():
            if key[0] != 'vc' or not ke[1]['valid']: continue
            k, e = ke; vc = key[1]; vnames[vc][y] = E.vname(k)
            cs = cands(E, k, e)
            vrecs[('vc', vc, y)] = ({'candidates': [{'candidate': c['name'], 'party': c['party'], 'votes': c['votes']} for c in cs],
                                     'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig'], 'ed': edname(vc[:5], k[1])},
                                    [cs[0]['party'], round(margin([c['votes'] for c in cs], e['valid']), 5)] + tie_tail((c['party'], c['votes']) for c in cs))
    skipped = []
    for vc in sorted(vnames):
        for y in LEG:
            if y not in vnames[vc]: continue
            if not keep_village(vnames[vc], y): skipped.append(('legis', vc, y, vnames[vc][y])); continue
            lin, val = vrecs[('vc', vc, y)]
            legis_lin.setdefault(vc, {})[y] = lin; legis_vc.setdefault(vc, {})[y] = val
    # TOWNSHIP_CENTRAL_GOV legislativeByYear: rebuild each township's object (one entry per year)
    for tc in tcs:
        inner = depth1_keys(s, *tcg[tc])
        ys = {y: vrecs[('tcg', tc, y)] for y in ('2024', '2023', '2020', '2016') if ('tcg', tc, y) in vrecs}
        body = '{\n' + ',\n'.join("        '%s': { ed: '%s', total: %d, cands: [\n%s\n        ] }" % (
            y, r['ed'], r['total'], ',\n'.join("          { name: '%s', party: '%s', votes: %d }" % (c['name'], c['party'], c['votes']) for c in r['cands']))
            for y, r in ys.items()) + '\n      }'
        assert 'legislativeByYear' in inner, tc
        put(inner['legislativeByYear'], body)
    # 竹北市 2016: one county-wide district that year, whole-township cell without an "ed" (see the comment there)
    for tc in list(legis_tc):
        if any(k.endswith('__' + tc) for k in legis_split): legis_tc[tc].pop('ed', None)

    # ================= 不分區 =================
    pl_tc, pl_vc, pl_lin = {}, {}, {}
    pnames = collections.defaultdict(dict); precs = {}
    for y, (d, suf) in PL.items():
        E = Election(d, suf, set(OLD[y]) if y in OLD else set(SEEDS)); G = geo(E, OLD.get(y))

        def pv(k, e, prefer):
            out = collections.Counter()
            for no, v in e['votes'].items():
                if v: out[code_of(E.cand(k, no)['name'], prefer, strict=True)] += v   # 0-vote parties left out
            assert all(n == 1 for n in collections.Counter(code_of(E.cand(k, no)['name'], prefer) for no in e['votes']).values()), ('code collision', y)
            return dict(sorted(out.items(), key=lambda kv: (-kv[1], kv[0])))
        for cc in SEEDS:
            yk = depth1_keys(s, *seed_keys[cc]['partyListRawByYear'])
            prefer = set(re.findall(r'(\w+):', s[yk[y][0]:yk[y][1]])) if y in yk else set()
            if y in OLD: prefer = (prefer - {'gp'}) | {'gpt'}   # 2008/2012 綠黨 is 'gpt' in this file (gp = later 台灣綠黨)
            k, e = G[('county', cc)]; raw = pv(k, e, prefer)
            lit = '{ ' + ', '.join('%s: %d' % kv for kv in raw.items()) + ' }'
            if y in yk: put(yk[y], lit)
            else: append_key(seed_keys[cc]['partyListRawByYear'], y, lit)
        for tc in tcs:
            pieces = G[('tcareas', tc)]
            assert len(pieces) == 1, (y, tc)
            _, k, e = pieces[0]
            inner = depth1_keys(s, *tcg[tc]); yk = depth1_keys(s, *inner['partyListRawByYear'])
            prefer = set(re.findall(r'(\w+):', s[yk[y][0]:yk[y][1]])) if y in yk else set()
            if y in OLD: prefer = (prefer - {'gp'}) | {'gpt'}
            raw = pv(k, e, prefer)
            lit = '{ ' + ', '.join('%s: %d' % kv for kv in raw.items()) + ' }'
            if y in yk: put(yk[y], lit)
            else: append_key(inner['partyListRawByYear'], y, lit)
            if y in LEG:
                vals = list(raw.values()); pl_tc.setdefault(tc, {})[y] = [next(iter(raw)), round(margin(vals, e['valid']), 6)] + tie_tail(raw.items())
        if y not in LEG: continue
        for key, ke in G.items():
            if key[0] != 'vc' or not ke[1]['valid']: continue
            k, e = ke; vc = key[1]; pnames[vc][y] = E.vname(k); raw = pv(k, e, ())
            precs[(vc, y)] = ({'parties': [{'party': p, 'votes': v} for p, v in raw.items()], 'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig']},
                              [next(iter(raw)), round(margin(list(raw.values()), e['valid']), 5)] + tie_tail(raw.items()))
    for vc in sorted(pnames):
        for y in LEG:
            if y not in pnames[vc]: continue
            if not keep_village(pnames[vc], y): skipped.append(('pl', vc, y, pnames[vc][y])); continue
            pl_lin.setdefault(vc, {})[y] = precs[(vc, y)][0]; pl_vc.setdefault(vc, {})[y] = precs[(vc, y)][1]

    # ================= 縣市長 =================
    mayor_cc = {}
    for y, d in MAYOR.items():
        E = Election(d, '', set(SEEDS)); G = geo(E)
        for cc in SEEDS:
            k, e = G[('county', cc)]; cs = cands(E, k, e)
            lk = depth1_keys(s, *seed_keys[cc]['mayorLineageByYear']); ly = s[lk[y][0]:lk[y][1]]
            party = dict(re.findall(r"name:\s*'([^']+)',\s*party:\s*'(\w+)'", ly))
            assert {c['name']: c['votes'] for c in cs} == {n: int(v) for n, v in re.findall(r"name:\s*'([^']+)',\s*party:\s*'\w+',\s*votes:\s*(\d+)", ly)}, ('mayor votes', cc, y)
            w = cs[0]
            mk = depth1_keys(s, *seed_keys[cc]['mayorByYear'])
            put(mk[y], "{ name: '%s', party: '%s', electedYear: '%s', votes: %d, pct: %.2f, totalVotes: %d }" % (w['name'], party[w['name']], y, w['votes'], w['votes'] / e['valid'] * 100, e['valid']))
            m = re.search(r'total:\s*\d+', ly)
            put((lk[y][0] + m.start(), lk[y][0] + m.end()), 'total: %d' % e['valid'])
            mayor_cc.setdefault(cc, {})[y] = [party[w['name']], round(margin([c['votes'] for c in cs], e['valid']), 6)]

    # ================= 鄉鎮市長 (TOWNSHIP_LOCAL_GOV) =================
    lgs, lge = var_span(s, 'TOWNSHIP_LOCAL_GOV'); lg = depth1_keys(s, lgs, lge)
    tm = {y: geo(Election(d, '', set(SEEDS))) for y, d in TMAYOR.items()}
    tmE = {y: Election(d, '', set(SEEDS)) for y, d in TMAYOR.items()}
    for tc in lg:
        mk = depth1_keys(s, *depth1_keys(s, *lg[tc])['mayorByYear'])
        for y in mk:
            (_, k, e), = tm[y][('tcareas', tc)]; cs = cands(tmE[y], k, e); w = cs[0]
            old = s[mk[y][0]:mk[y][1]]; party = re.search(r"party:\s*'(\w+)'", old).group(1)
            assert re.search(r"name:\s*'([^']+)'", old).group(1) == w['name'], (tc, y)
            put(mk[y], "{ name: '%s', party: '%s', electedYear: '%s', votes: %d, pct: %.2f, totalVotes: %d }" % (w['name'], party, y, w['votes'], w['votes'] / e['valid'] * 100, e['valid']))

    # ================= 縣市議員 =================
    c_dist, c_ind, c_tc, c_vc = {}, {}, {}, {}
    # 平地 ('p') / 山地 ('m') 原住民 ballots per village (原住民議員 map mode, 2026-10-18): CEC reports them per 村里 like the
    # general race; a joint polling station (跨村里, letter / 9999 li) with votes colours all its villages as one unit
    ivr, itr = {}, {}   # village / township rows of the 原住民 ballots
    tcdist = collections.defaultdict(dict)   # tc -> {year: general council district}
    cvn = collections.defaultdict(dict); cvr = {}
    for y, (dg, dp, dm) in COUNCIL.items():
        Es = [Election(d, '', set(SEEDS)) for d in (dg, dp, dm)]
        seats = {cc: collections.Counter() for cc in SEEDS}

        def bypty(E, k, e, extra=()):   # extras (district, joint flag) go before the tie list, which is always last
            out = collections.Counter()
            for no, v in e['votes'].items(): out[code_of(E.cand(k, no)['party_name'])] += v
            r = sorted(out.items(), key=lambda kv: (-kv[1], kv[0]))
            return [r[0][0], round(margin([v for _, v in r], e['valid']), 6)] + list(extra) + tie_tail(r)
        for i, E in enumerate(Es):
            if i:
                kind = 'pm'[i - 1]
                vnm = {}   # (tc, village name) -> vc, for resolving joint-station member names
                for k, e in E.rows.items():
                    if k[0] in SEEDS and E.level(k) == 'vc': vnm[(k[0] + k[2], E.vname(k))] = k[0] + k[2] + k[3][-3:]
                for k, e in E.rows.items():
                    if k[0] in SEEDS and e['valid'] and E.level(k) == 'tc':
                        assert (k[0] + k[2], y, kind) not in itr, ('township in two 原住民 districts', k, y, kind)
                        itr[(k[0] + k[2], y, kind)] = bypty(E, k, e, [k[1]])
                    if k[0] not in SEEDS or not e['valid'] or E.level(k) not in ('vc', 'joint'): continue
                    tc = k[0] + k[2]
                    if E.level(k) == 'vc': members = [tc + k[3][-3:]]
                    else:
                        members = [vnm.get((tc, n)) for n in E.vname(k).split('、')]
                        assert all(members), ('joint station village not found', y, kind, k, E.vname(k))
                        # a member with a row of its own keeps it (臺東 長濱 2014 「三間村、樟原村」 9999 + both villages' rows)
                        own = set(vnm.values()); members = [vc for vc in members if vc not in own]
                    r = bypty(E, k, e, [k[1]] + ([1] if E.level(k) == 'joint' else []))
                    for vc in members:
                        assert (vc, y, kind) not in ivr, ('village counted twice', vc, y, kind)
                        ivr[(vc, y, kind)] = r
            G = geo(E)
            for key, ke in G.items():
                k, e = ke if key[0] != 'tcareas' else (None, None)
                if key[0] == 'area':
                    cc, ar = key[1], key[2]
                    for no in e['elected']: seats[cc][code_of(E.cand(k, no)['party_name'])] += 1
                    (c_dist if i == 0 else c_ind).setdefault(cc + '_' + ar, {})[y] = bypty(E, k, e)
                elif key[0] == 'tcareas' and i == 0:
                    assert len(G[key]) == 1, key
                    ar, k2, e2 = G[key][0]; tc = key[1]
                    tcdist[tc][y] = ar
                    c_tc.setdefault(tc, {})[y] = bypty(E, k2, e2)
                elif key[0] == 'vc' and i == 0 and e['valid']:
                    vc = key[1]; cvn[vc][y] = E.vname(k); cvr[(vc, y)] = bypty(E, k, e)
        for cc in SEEDS:
            by = dict(sorted(seats[cc].items(), key=lambda kv: (-kv[1], kv[0])))
            put(seed_keys[cc]['council' + y], '{ total: %d, byParty: { %s } }' % (sum(by.values()), ', '.join('%s: %d' % kv for kv in by.items())))
    # a township's council district can change between elections (新北 2022: 新莊 02 → 03, 三重/蘆洲 03 → 04 …):
    # 'dist' = the latest one; 'distByYear' only when it changed (every other county's table stays byte-identical)
    for tc, d in tcdist.items():
        rec = {'dist': d[max(d)]}
        if len(set(d.values())) > 1: rec['distByYear'] = dict(sorted(d.items()))
        c_tc[tc] = dict(rec, **c_tc[tc])
    for vc in sorted(cvn):
        for y in COUNCIL:
            if y in cvn[vc] and keep_village(cvn[vc], y): c_vc.setdefault(vc, {})[y] = cvr[(vc, y)]
            elif y in cvn[vc]: skipped.append(('council', vc, y, cvn[vc][y]))
    # {vc: {year: {p|m: [party, margin, district(, 1 = joint station)]}}} — same "keep only while the code is still the
    # same village" rule as COUNCIL_VC_DATA (names from the general race, which covers every village)
    c_ind_vc, c_ind_tc = {}, {}
    for (tc, y, kind), r in sorted(itr.items()): c_ind_tc.setdefault(tc, {}).setdefault(y, {})[kind] = r
    for (vc, y, kind), r in sorted(ivr.items()):
        names = cvn.get(vc, {})
        assert y in names, ('原住民 ballot village without a general-race row', vc, y)
        if keep_village(names, y): c_ind_vc.setdefault(vc, {}).setdefault(y, {})[kind] = r

    for x in skipped: print('INFO re-issued village code, village-year not keyed:', x)

    # ================= whole-variable rewrites =================
    def body(obj): return '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in obj.items()) + '\n}'

    def keep_other(name, new):
        """Rows of the old table outside the three counties (none expected) are carried over."""
        sp = var_span(s, name)
        assert sp, name
        return sp
    for name, obj in [('LEGIS_TC_DATA', legis_tc), ('LEGIS_TC_SPLIT_DATA', legis_split), ('LEGIS_VC_DATA', legis_vc),
                      ('LEGIS_VC_LINEAGE', legis_lin), ('PL_TC_DATA', pl_tc), ('PL_VC_DATA', pl_vc), ('PL_VC_LINEAGE', pl_lin),
                      ('MAYOR_COUNTY_DATA', mayor_cc), ('COUNCIL_DIST_DATA', c_dist), ('COUNCIL_IND_DATA', c_ind),
                      ('COUNCIL_TC_DATA', c_tc), ('COUNCIL_VC_DATA', c_vc), ('COUNCIL_IND_TC_DATA', c_ind_tc), ('COUNCIL_IND_VC_DATA', c_ind_vc)]:
        put(keep_other(name, obj), body(dict(sorted(obj.items()))))

    edits.sort()
    for (s1, e1, _), (s2, e2, _) in zip(edits, edits[1:]):
        assert e1 <= s2, ('overlapping edits', s1, e1, s2, e2)
    for st, en, txt in reversed(edits): s = s[:st] + txt + s[en:]
    print({n: len(o) for n, o in [('legis_vc', legis_lin), ('pl_vc', pl_lin), ('council_vc', c_vc), ('legis_tc', legis_tc), ('pl_tc', pl_tc)]})
    print('villages per county legis:', collections.Counter(v[:5] for v in legis_lin), 'pl:', collections.Counter(v[:5] for v in pl_lin),
          'council:', collections.Counter(v[:5] for v in c_vc))
    if a.dry_run: print('dry run'); return
    open(PROFILE, 'w', encoding='utf-8').write(s); print('wrote', PROFILE)


if __name__ == '__main__':
    main()
