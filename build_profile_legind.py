#!/usr/bin/env python3
"""山地 / 平地原住民立委 (2016 / 2020 / 2024) → v2/profile.html tables for the 原住民立委 map mode.

    python3 build_profile_legind.py [--dry-run]

Sources: CEC 選舉資料庫 {2016,2020,2024}總統立委/{平地立委,山地立委} (2016 files carry suffix _T2 平地 / _T3 山地).
One nationwide district per ballot (3 seats each), so per county / township / village we keep that place's own rows:
  LEGIND_BALL_CC  {cc: {year: {p|m: {elig, cast, invalid, cands: [{name, party, votes, elected}]}}}}   county rows
  LEGIND_BALL_TC  {tc: {year: {p|m: record}}}                                                          township rows
  LEGIND_TC_DATA  {tc: {year: {p|m: [party, margin]}}}       leading party (votes summed per party, 無黨籍 = one) and
                                                              (top1 − top2) / valid — the same rule as COUNCIL_VC_DATA
  LEGIND_VC_DATA  {vc: {year: {p|m: [party, margin(, 1 = joint station)]}}}  villages with votes; a 跨村里 joint
                                                              station whose elbase name lists its villages colours them
                                                              as one unit; a village code kept only while it is still
                                                              the same village (elbase name ≈ the 2024 boundary name)
Not cec_lib.Election: its integrity asserts stop on two CEC inconsistencies in these files — the 2016 files list some joint stations (letter li, e.g. A001) in elctks with NO elprof row at
all (counted and reported — they cannot be attributed to any village), and a few rows' candidate votes ≠ elprof valid
(the candidate votes are used, every such row reported). Nothing is dropped silently.
"""
import collections, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.join(ROOT, 'tests'))
from cec_lib import read, VD, tie_tail  # noqa: E402
from build_profile_presidential import var_span, js, PROFILE  # noqa: E402
from build_profile_cec_tables import SEEDS, ALIAS, load_label, margin  # noqa: E402
from build_profile_mayor_vc import same_village  # noqa: E402

RACES = {'2016': {'p': ('2016總統立委/平地立委', '_T2'), 'm': ('2016總統立委/山地立委', '_T3')},
         '2020': {'p': ('2020總統立委/平地立委', ''), 'm': ('2020總統立委/山地立委', '')},
         '2024': {'p': ('2024總統立委/平地立委', ''), 'm': ('2024總統立委/山地立委', '')}}


def load(d, suf):
    p = lambda f: os.path.join(VD, d, f + suf + '.csv') if os.path.exists(os.path.join(VD, d, f + suf + '.csv')) else os.path.join(VD, d, f + '.csv')
    paty = {r[0]: r[1] for r in read(p('elpaty'))}
    cand = {}
    for r in read(p('elcand')):
        if len(r) < 8: continue
        c = {'name': r[6], 'party_name': paty.get(r[7], ''), 'elected': len(r) > 14 and r[14] in ('*', '!')}
        assert cand.get(r[5], c)['name'] == c['name'], ('candidate number reused', d, r[5])   # one nationwide list
        cand[r[5]] = c
    name = {(r[0] + r[1], r[3], r[4]): r[5] for r in read(p('elbase'))}
    rows = {}
    for r in read(p('elprof')):
        if r[5] not in ('0', '0000') or r[0] + r[1] not in SEEDS: continue
        rows[(r[0] + r[1], r[2], r[3], r[4])] = {'valid': int(r[6]), 'invalid': int(r[7]), 'cast': int(r[8]), 'elig': int(r[9]), 'votes': collections.Counter()}
    orphan = collections.Counter()
    for r in read(p('elctks')):
        if r[5] not in ('0', '0000') or r[0] + r[1] not in SEEDS: continue
        k = (r[0] + r[1], r[2], r[3], r[4])
        if k not in rows: k = (r[0] + r[1], '00', r[3], r[4])
        if k not in rows: orphan[k] += int(r[7]); continue
        rows[k]['votes'][r[6]] += int(r[7])
    # CEC's own files disagree in a few places (2016 平地 新竹縣關西 0008: candidate votes sum 18 — elctks percentages are
    # computed on 18 — while elprof says valid 16): the candidate votes are used (margin over their sum), and every such
    # row is reported
    bad = []
    for k, e in rows.items():
        vs = sum(e['votes'].values())
        if vs != e['valid']: bad.append((k, e['valid'], vs)); e['valid'] = vs
    return cand, name, rows, orphan, bad


def main():
    s = open(PROFILE, encoding='utf-8').read()
    LABEL = load_label(s)
    def code_of(n):
        if n in ALIAS: return ALIAS[n]
        exact = [k for k, l in LABEL.items() if l == n]
        return exact[0] if exact else 'other'
    t = open(os.path.join(ROOT, 'data_map_v64_profile_core.js'), encoding='utf-8').read()
    i = t.index('const NM = ') + len('const NM = '); j = t.index('\n', i)
    nm24 = {vc: v.split(' ')[-1] for vc, v in json.loads(t[i:j].rstrip().rstrip(';'))['v'].items()}
    nmtc = {(vc[:8], n): vc for vc, n in nm24.items()}   # joint-station members are named, most without rows of their own

    ball_cc, ball_tc, tc_data, vc_data = {}, {}, {}, {}
    report = []
    for y, kinds in RACES.items():
        for kind, (d, suf) in kinds.items():
            cand, name, rows, orphan, bad = load(d, suf)
            if bad: report.append((y, kind, 'rows whose candidate votes ≠ elprof valid (candidate sum used)', len(bad), bad[:3]))
            if orphan: report.append((y, kind, 'vote rows without elprof (unattributable, left out)', len(orphan), sum(orphan.values())))

            def rec(e):
                cs = sorted(({'name': cand[no]['name'], 'party': code_of(cand[no]['party_name']), 'votes': v, 'elected': cand[no]['elected']}
                             for no, v in e['votes'].items()), key=lambda c: (-c['votes'], c['name']))
                return {'elig': e['elig'], 'cast': e['cast'], 'invalid': e['invalid'], 'cands': cs}

            def bypty(e, extra=()):   # the joint flag goes before the tie list, which is always last
                out = collections.Counter()
                for no, v in e['votes'].items(): out[code_of(cand[no]['party_name'])] += v
                r = sorted(out.items(), key=lambda kv: (-kv[1], kv[0]))
                return [r[0][0], round(margin([v for _, v in r], e['valid']), 6)] + list(extra) + tie_tail(r)

            vnames = {}   # (tc, village name) -> vc, for joint-station members
            for (cc, _a, dept, li), e in rows.items():
                if li.isdigit() and li != '0000': vnames[(cc + dept, name.get((cc, dept, li), ''))] = cc + dept + li[-3:]
            skipped = 0; joint = []
            areas = collections.Counter((cc, dept, li) for (cc, _a, dept, li) in rows)
            assert max(areas.values()) == 1, ('one place under two area codes', d, [k for k, v in areas.items() if v > 1][:3])
            for (cc, _a, dept, li), e in rows.items():
                if dept == '000':
                    if li == '0000': ball_cc.setdefault(cc, {}).setdefault(y, {})[kind] = rec(e)
                    continue
                tc = cc + dept
                if li == '0000':
                    ball_tc.setdefault(tc, {}).setdefault(y, {})[kind] = rec(e)
                    if e['valid']: tc_data.setdefault(tc, {}).setdefault(y, {})[kind] = bypty(e)
                    continue
                if not e['valid']: continue
                if li.isdigit():
                    vc = tc + li[-3:]
                    if vc in nm24 and same_village(name.get((cc, dept, li), ''), nm24[vc]): vc_data.setdefault(vc, {}).setdefault(y, {})[kind] = bypty(e)
                    else: skipped += 1
                else:   # joint station: its elbase name lists the villages it serves
                    members = [vnames.get((tc, x)) or nmtc.get((tc, x)) for x in name.get((cc, dept, li), '').split('、')]
                    if not all(members): report.append((y, kind, 'joint station without village list', tc, li, name.get((cc, dept, li)))); continue
                    joint.append((members, bypty(e, [1])))
            for members, r in joint:   # after every village's own row: a village that has one keeps it
                for vc in members:
                    vc_data.setdefault(vc, {}).setdefault(y, {}).setdefault(kind, r)
            if skipped: report.append((y, kind, 'village codes not matching the 2024 village (re-issued / renamed), left out', skipped))
    out = s
    for var, obj in [('LEGIND_BALL_CC', ball_cc), ('LEGIND_BALL_TC', ball_tc), ('LEGIND_TC_DATA', tc_data), ('LEGIND_VC_DATA', vc_data)]:
        a, b = var_span(out, var)
        out = out[:a] + js(dict(sorted(obj.items()))) + out[b:]
    for r in report: print('INFO', *r)
    print('counties', len(ball_cc), 'townships', len(ball_tc), 'tc colour', len(tc_data), 'villages', len(vc_data), 'changed', out != s)
    if '--dry-run' in sys.argv: return
    if out != s: open(PROFILE, 'w', encoding='utf-8').write(out)


if __name__ == '__main__':
    main()
