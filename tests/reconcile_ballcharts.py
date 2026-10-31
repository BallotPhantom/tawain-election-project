#!/usr/bin/env python3
"""Reconciliation test: v2/profile.html BALL_CHART_CEC + PRES_TURNOUT_CEC vs CEC raw files (read-only).

    python3 tests/reconcile_ballcharts.py

Re-reads the CEC subtotal rows with its own minimal parser (does not import the builders) and checks:
  B1  every record: elig/cast/invalid and each candidate's votes == the CEC row (county row for
      president / mayor / party list, district row for legislative), by candidate NAME
  B2  invariants: sum(votes) + invalid == cast <= elig; party-list: no duplicate party code (except other/ind);
      candidate races: no duplicate candidate name (two nominees of one party do happen — 臺北市 2024 第1選舉區 人民最大黨)
  B3  legislative district set per county/year == the CEC districts; names match the profile's
      TOWNSHIP_CENTRAL_GOV legislativeByYear ed names
  B4  mayor == <SEED>.mayorLineageByYear (names, parties, votes)
  B6  party-list codes: each code's CEC votes / the profile's own <SEED>.partyListRawByYear votes stays
      within ±5pp of that county-year's overall ratio (a wrong code mapping would break this; the
      profile table itself is a village sum, so the overall ratio may be < 1)
  T1  township grain (BALL_CHART_TC_CEC): every race/year/township record == the CEC township row
      (legislative: one per (district, township), so 竹北市 has two); 2012 townships mapped by name
  T2  closure: townships sum to the county record (per district for legislative)
  T3  coverage: every profile township has every race/year; TOWNSHIP_MAYOR_LINEAGE == townshipMayor
  B5  every party code that can be a top-4 ball has a colour in LEGIS_PARTY_COLOR or COUNCIL_PARTY_COLOR
      (the ball chart's lookup order; else it draws grey)
"""
import csv, json, os, re, subprocess, sys, tempfile, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cec_lib import FORMER_TC_NAMES, HAS_TOWNSHIP_HEAD  # noqa: E402
FORMER_CC_NAMES = {'68000': '桃園縣'}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VD = os.path.join(ROOT, 'votedata/votedata/voteData')
CC = {'10008': ('NANTOU_SEED', '南投縣'), '10004': ('HSINCHU_SEED', '新竹縣'), '10013': ('PINGTUNG_SEED', '屏東縣'), '10007': ('CHANGHUA_SEED', '彰化縣'), '10009': ('YUNLIN_SEED', '雲林縣'), '63000': ('TAIPEI_SEED', '臺北市'), '10017': ('KEELUNG_SEED', '基隆市'), '68000': ('TAOYUAN_SEED', '桃園市'), '64000': ('KAOHSIUNG_SEED', '高雄市'), '66000': ('TAICHUNG_SEED', '臺中市'), '65000': ('NEWTAIPEI_SEED', '新北市'), '67000': ('TAINAN_SEED', '臺南市'), '10015': ('HUALIEN_SEED', '花蓮縣'), '10014': ('TAITUNG_SEED', '臺東縣')}
SRC = {
    'presidential': {'2016': '2016總統立委/總統/*_P1', '2020': '2020總統立委/總統/*', '2024': '2024總統立委/總統/*'},
    'legislative': {'2016': '2016總統立委/區域立委/*_T1', '2020': '2020總統立委/區域立委/*', '2024': '2024總統立委/區域立委/*'},
    'partylist': {'2012': '20120114-總統及立委/不分區政黨/*', '2016': '2016總統立委/不分區政黨/*_T4', '2020': '2020總統立委/不分區政黨/*', '2024': '2024總統立委/不分區政黨/*'},
    # a list = 縣市 + 直轄市 folders of the same race, read one by one and merged (county codes never overlap)
    'mayor': {'2014': ['2014-103年地方公職人員選舉/縣市市長/*', '2014-103年地方公職人員選舉/直轄市市長/*'],
              '2018': ['2018-107年地方公職人員選舉/縣市市長/*', '2018-107年地方公職人員選舉/直轄市市長/*'],
              '2022': ['2022-111年地方公職人員選舉/C1/city/*', '2022-111年地方公職人員選舉/C1/prv/*']},
    # + 直轄市山地原住民區長 (直轄市區長 / 2022 D2) — an elected head like a 鄉鎮市長 (桃園 復興區)
    'townshipMayor': {'2014': ['2014-103年地方公職人員選舉/縣市鄉鎮市長/*', '2014-103年地方公職人員選舉/直轄市區長/*'],
                      '2018': ['2018-107年地方公職人員選舉/縣市鄉鎮市長/*', '2018-107年地方公職人員選舉/直轄市區長/*'],
                      '2022': ['2022-111年地方公職人員選舉/D1/*', '2022-111年地方公職人員選舉/D2/*']},
}


def read(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: txt = raw.decode(enc); break
        except UnicodeDecodeError: pass
    from cec_lib import fix_rows   # JOINT_AS_VILLAGE (花蓮 民治里→民主里 2016)
    return fix_rows(path, [[c.strip().lstrip("'") for c in r] for r in csv.reader(txt.splitlines())])


def f(pattern, name):
    return os.path.join(VD, pattern.replace('*', name)) + '.csv'


def cec(kind, year, grain='county', tnames=None, pat=None):
    """Subtotal rows -> {key: {'prof': (valid, invalid, cast, elig), 'votes': {name: n}}}.
    grain 'county': key (cc, area) — area = district for legislative, '00' otherwise.
    grain 'tc':     key (tc, area) — one row per (district, township) for legislative.
    tnames: {(cc, township name): tc}, needed for 2012 (pre-2014 county AND township numbers)."""
    pat = pat or SRC[kind][year]
    if isinstance(pat, list):
        out = {}
        for one in pat:
            part = cec(kind, year, grain, tnames, one)
            assert not set(part) & set(out), (kind, year, one)
            out.update(part)
        return out
    # candidate number -> name. Legislative numbers restart per district (cc, area); mayor per county
    # (cc); township mayor per township; president / party list are nationwide (number only).
    scope = {'legislative': lambda r: (r[0] + r[1], r[2]), 'mayor': lambda r: r[0] + r[1],
             'townshipMayor': lambda r: r[0] + r[1] + r[3]}.get(kind, lambda r: '')
    if kind == 'partylist':
        paty = {r[0]: r[1] for r in read(os.path.join(VD, os.path.dirname(pat), 'elpaty.csv'))}
        name = {(scope(r), r[5]): paty[r[7]] for r in read(f(pat, 'elcand'))}
    else:
        name = {}
        for r in read(f(pat, 'elcand')):
            if kind == 'presidential' and r[15] == 'Y': continue          # vice-presidential row
            name[(scope(r), r[5])] = r[6]
    out = {}
    old = {'06003': '10004', '06006': '10008', '06009': '10013', '06005': '10007', '06007': '10009', '01000': '63000', '06013': '10017', '06002': '68000', '05000': '64000', '03000': '66000', '02000': '65000', '04000': '67000', '06011': '10015', '06010': '10014'} if year == '2012' else {}
    oldtc = {}
    if old:   # pre-2014 codes: confirm counties by elbase name, map townships by name
        base = read(f(pat, 'elbase'))
        nm = {r[0] + r[1]: r[5] for r in base if r[2] == '00' and r[3] == '000' and r[4] == '0000'}
        assert all(nm[o] in (CC[n][1], FORMER_CC_NAMES.get(n)) for o, n in old.items()), nm   # 桃園縣 → 桃園市 (2014)
        if grain == 'tc':
            oldtc = {(old[r[0] + r[1]], r[3]): tnames[(old[r[0] + r[1]], r[5])] for r in base
                     if r[0] + r[1] in old and r[3] != '000' and r[4] == '0000'}
    def key(r):
        cc = old.get(r[0] + r[1], r[0] + r[1])
        if cc not in CC or r[4] != '0000' or r[5] not in ('0', '0000'): return None
        if kind == 'legislative' and r[2] == '00': return None
        area = r[2] if kind == 'legislative' else '00'
        if grain == 'county': return (cc, area) if r[3] == '000' else None
        if r[3] == '000': return None
        return (oldtc[(cc, r[3])] if old else cc + r[3], area)
    for r in read(f(pat, 'elprof')):
        k = key(r)
        if k: out[k] = {'prof': tuple(int(x) for x in r[6:10]), 'votes': {}}
    for r in read(f(pat, 'elctks')):
        k = key(r)
        if not k: continue
        n = name[(scope(r), r[6])]
        out[k]['votes'][n] = out[k]['votes'].get(n, 0) + int(r[7])
    return out


def load_profile():
    sys.path.insert(0, ROOT)
    from build_profile_presidential import var_span
    s = open(os.path.join(ROOT, 'v2/profile.html'), encoding='utf-8').read()
    src = ''
    for n in ['BALL_CHART_CEC', 'BALL_CHART_TC_CEC', 'TOWNSHIP_MAYOR_LINEAGE', 'PRES_TURNOUT_CEC', 'TOWNSHIP_CENTRAL_GOV', 'LEGIS_PARTY_COLOR', 'COUNCIL_PARTY_COLOR'] + [v[0] for v in CC.values()]:
        a, b = var_span(s, n); src += 'var %s = %s;\n' % (n, s[a:b])
    src += ("JSON.stringify({bc:BALL_CHART_CEC, tc:BALL_CHART_TC_CEC, tml:TOWNSHIP_MAYOR_LINEAGE, towns:{%s}, pres:PRES_TURNOUT_CEC," % ",".join("'%s':%s.townships" % (cc, v[0]) for cc, v in CC.items()) + " color:Object.assign({}, COUNCIL_PARTY_COLOR, LEGIS_PARTY_COLOR),"
            "tcg:Object.fromEntries(Object.entries(TOWNSHIP_CENTRAL_GOV).map(([k,v])=>[k,v.legislativeByYear||null])),"
            "tcpl:Object.fromEntries(Object.entries(TOWNSHIP_CENTRAL_GOV).map(([k,v])=>[k,v.partyListRawByYear||null])),"
            "mayor:{%s}, pl:{%s}})" % (','.join("'%s':%s.mayorLineageByYear" % (cc, v[0]) for cc, v in CC.items()),
                                      ','.join("'%s':%s.partyListRawByYear" % (cc, v[0]) for cc, v in CC.items())))
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh: fh.write(src); p = fh.name
    try: return json.loads(subprocess.run(['osascript', '-l', 'JavaScript', p], capture_output=True, text=True, check=True).stdout)
    finally: os.unlink(p)


def main():
    P = load_profile(); fails = 0
    def report(ok, tag, msg=''):
        nonlocal fails
        fails += (not ok); print(('PASS ' if ok else 'FAIL ') + tag + ('' if ok else '  ' + msg))

    def check_rec(tag, rec, row):
        valid, invalid, cast, elig = row['prof']
        mine = {c['name'].split('／')[0]: c['votes'] for c in rec['cands']}   # president: ticket → president
        # party-list records use the short label; compare by vote multiset there, by name elsewhere
        if tag.startswith('partylist'):
            ok = sorted(mine.values()) == sorted(row['votes'].values())
        else:
            ok = mine == row['votes']
        report(ok and (rec['elig'], rec['cast'], rec['invalid']) == (elig, cast, invalid), 'B1 ' + tag,
               f"profile {(rec['elig'], rec['cast'], rec['invalid'])} vs CEC {(elig, cast, invalid)}; votes diff "
               f"{ {k: mine.get(k, 0) - row['votes'].get(k, 0) for k in set(mine) | set(row['votes']) if mine.get(k) != row['votes'].get(k)} }")
        s = sum(mine.values())
        key = (lambda c: c['party']) if tag.startswith('partylist') else (lambda c: c['name'])
        dup = [p for p, n in collections.Counter(key(c) for c in rec['cands']).items() if n > 1 and p not in ('other', 'ind')]
        report(s + rec['invalid'] == rec['cast'] <= rec['elig'] and not dup, 'B2 ' + tag, f'sum {s}+{rec["invalid"]} vs cast {rec["cast"]}, dup {dup}')

    for kind in SRC:
        if kind == 'townshipMayor': continue   # township-only race (no county record)
        for y in SRC[kind]:
            rows = cec(kind, y)
            for cc, (seed, cname) in CC.items():
                if kind == 'presidential':
                    check_rec(f'presidential {cc} {y}', P['pres'][cc][y], rows[(cc, '00')]); continue
                if kind != 'legislative':
                    check_rec(f'{kind} {cc} {y}', P['bc'][cc][kind][y], rows[(cc, '00')]); continue
                areas = sorted(a for (c, a) in rows if c == cc)
                mine = P['bc'][cc]['legislative'][y]
                names = [cname + ('選舉區' if len(areas) == 1 else '第%d選舉區' % int(a)) for a in areas]
                prof_eds = {ly[y]['ed'] for tc, ly in P['tcg'].items() if tc[:5] == cc and ly and y in ly}
                report(sorted(mine) == sorted(names) and set(names) >= prof_eds, f'B3 legislative {cc} {y} districts',
                       f'profile {sorted(mine)} vs CEC {names}; TCG eds {sorted(prof_eds)}')
                for a, n in zip(areas, names):
                    if n in mine: check_rec(f'legislative {cc} {y} {n}', mine[n], rows[(cc, a)])
    # ---------------- township grain ----------------
    tnames = {(cc, t[1]): t[0] for cc in CC for t in P['towns'][cc]}
    tnames.update({(tc[:5], o): tc for tc, olds in FORMER_TC_NAMES.items() for o in olds})   # 員林鎮 → 員林市, 桃園縣 鄉鎮市 → 區 …
    years = {'presidential': ['2016', '2020', '2024'], 'legislative': ['2016', '2020', '2024'], 'partylist': ['2012', '2016', '2020', '2024'],
             'mayor': ['2014', '2018', '2022'], 'townshipMayor': ['2014', '2018', '2022']}
    for kind, ys in years.items():
        for y in ys:
            rows = cec(kind, y, 'tc', tnames)
            bad, n = [], 0
            for (tc, area), row in rows.items():
                if tc[:5] not in CC: continue
                recs = P['tc'].get(tc, {}).get(kind, {}).get(y)
                if kind == 'legislative':
                    cname = CC[tc[:5]][1]; nA = len({a for (c, a) in rows if c[:5] == tc[:5]})
                    recs = (recs or {}).get(cname + ('選舉區' if nA == 1 else '第%d選舉區' % int(area)))
                n += 1
                if not recs: bad.append((tc, area, 'missing')); continue
                valid, invalid, cast, elig = row['prof']
                mine = {c['name'].split('／')[0]: c['votes'] for c in recs['cands']}
                same = sorted(mine.values()) == sorted(row['votes'].values()) if kind == 'partylist' else mine == row['votes']
                if not same or (recs['elig'], recs['cast'], recs['invalid']) != (elig, cast, invalid) or sum(mine.values()) + recs['invalid'] != recs['cast']:
                    bad.append((tc, area))
            report(not bad and n > 0, f'T1 {kind} {y} townships ({n} rows)', str(bad[:5]))
            # T2 closure against the county records
            for cc in CC:
                if kind == 'townshipMayor': continue
                tot = collections.defaultdict(collections.Counter)
                for tc, v in P['tc'].items():
                    if tc[:5] != cc: continue
                    r = v[kind].get(y)
                    if not r: continue
                    for ed, rr in (r.items() if kind == 'legislative' else [('', r)]):
                        tot[ed].update({c['name']: c['votes'] for c in rr['cands']}); tot[ed].update({'#elig': rr['elig'], '#cast': rr['cast'], '#inv': rr['invalid']})
                county = P['pres'][cc][y] if kind == 'presidential' else P['bc'][cc][kind][y]
                for ed, rr in (county.items() if kind == 'legislative' else [('', county)]):
                    want = collections.Counter({c['name']: c['votes'] for c in rr['cands']}); want.update({'#elig': rr['elig'], '#cast': rr['cast'], '#inv': rr['invalid']})
                    report(tot[ed] == want, f'T2 {kind} {cc} {y} {ed} townships sum to county', str({k: tot[ed][k] - want[k] for k in set(tot[ed]) | set(want) if tot[ed][k] != want[k]}))
    for cc in CC:
        for t in P['towns'][cc]:
            tc = t[0]; v = P['tc'].get(tc)
            muni = not HAS_TOWNSHIP_HEAD(tc)   # 直轄市 / 省轄市 區 (not 原住民區): no 鄉鎮市長 race — must have none
            miss = [(k, y) for k, ys in years.items() for y in ys if not (muni and k == 'townshipMayor') and (not v or y not in v[k])]
            tml = P['tml'].get(tc, {})
            same = (not tml and not (v or {}).get('townshipMayor')) if muni else v and all(tml.get(y) and tml[y]['elig'] == v['townshipMayor'][y]['elig'] and tml[y]['total'] == v['townshipMayor'][y]['cast'] - v['townshipMayor'][y]['invalid']
                             and sorted((c['name'], c['votes']) for c in tml[y]['candidates']) == sorted((c['name'], c['votes']) for c in v['townshipMayor'][y]['cands']) for y in years['townshipMayor'])
            report(not miss and same, f'T3 {tc} {t[1]} coverage + lineage', f'missing {miss}, lineage equal {same}')
    for cc in CC:
        for y, rec in P['bc'][cc]['mayor'].items():
            seed = P['mayor'][cc][y]
            ok = sorted((c['name'], c['party'], c['votes']) for c in rec['cands']) == sorted((c['name'], c['party'], c['votes']) for c in seed['candidates'])
            report(ok, f'B4 mayor {cc} {y} == seed mayorLineageByYear')
    for cc in CC:
        for y, rec in P['bc'][cc]['partylist'].items():
            raw = (P['pl'][cc] or {}).get(y)
            if not raw:   # no county table that year (2012): sum the profile's own township tables
                raw = collections.Counter()
                for tc, v in P['tcpl'].items():
                    if tc[:5] == cc and v and v.get(y): raw.update(v[y])
                raw = dict(raw)
            if not raw:
                print(f'INFO B6 partylist {cc} {y}: profile has no {y} party-list table to cross-check (codes mapped by CEC name only)'); continue
            mine = {c['party']: c['votes'] for c in rec['cands']}
            ratio = sum(mine.values()) / sum(raw.values())
            bad = {k: round(mine[k] / raw[k], 3) for k in raw if k in mine and raw[k] >= 200 and abs(mine[k] / raw[k] - ratio) > 0.05}
            only = sorted(set(mine) ^ set(raw) - {'o'})
            report(not bad, f'B6 partylist {cc} {y} codes (overall ratio {ratio:.3f})', str(bad))
            if only: print(f'INFO B6 partylist {cc} {y} code present on one side only: ' +
                           ', '.join(f"{k} CEC={mine.get(k)} profile={raw.get(k)}" for k in only))
    nocolor = set()
    for cc in CC:
        for kind in ('partylist', 'mayor', 'legislative'):
            for y, v in P['bc'][cc][kind].items():
                for rec in (v.values() if kind == 'legislative' else [v]):
                    for c in sorted(rec['cands'], key=lambda c: -c['votes'])[:4]:
                        if c['party'] not in P['color']: nocolor.add((kind, cc, y, c['party'], c['name']))
    report(not nocolor, 'B5 top-4 party codes all have a colour', str(sorted(nocolor)))
    print(f'\n{fails} FAIL(s)'); sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
