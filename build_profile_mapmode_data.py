#!/usr/bin/env python3
"""Map-mode-only data for v2/profile.html: 縣市議員 ball charts + 鄉鎮市長 village colouring, from CEC raw files.

    python3 build_profile_mapmode_data.py [--dry-run]

Writes (adds when missing, otherwise replaces) FIVE tables and touches nothing else:
  COUNCIL_BALL_CC  {cc: {year: R}}  whole county, BY PARTY (無黨籍 = one ball), all council ballots
                   (區域 + 平地原住民 + 山地原住民 — every voter is on exactly one of the three rolls)
  COUNCIL_BALL_DIST {'cc_NN': {year: R}}  one council district (區域 and 原住民 districts alike), by candidate
  COUNCIL_BALL_TC  {tc: {year: R}}  the township's 區域議員 district race, by candidate, this township's votes
  COUNCIL_BALL_VC  {vc: {year: R}}  the same race, this village's votes
  TMAYOR_VC_DATA   {vc: {year: [winnerParty, (top1-top2)/valid]}}  鄉鎮市長, by candidate
R = {elig, cast, invalid, cands: [{name, party, votes[, elected: true]}]} — the ball-chart record shape (BALL_CHART_CEC);
  council candidate records mark the race's winners (CEC '*' / '!' 婦女保障) with elected: true.
Every number is a CEC subtotal row of that grain; the county council record's party votes are the sum of
the district rows, checked against the county row's valid count. Villages keyed by CEC code; a code
whose name changes between years is a re-issued code and that village-year is left out (same rule as
build_profile_cec_tables.py). Party codes: CEC party name → partyLabel() code / ALIAS, else 'other'.
"""
import argparse, collections, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from cec_lib import Election, tie_tail  # noqa: E402
from build_profile_presidential import var_span, js, PROFILE  # noqa: E402
from build_profile_mayor_vc import same_village  # noqa: E402
from build_profile_cec_tables import SEEDS, TMAYOR, COUNCIL, ALIAS, load_label, margin  # noqa: E402

IND_NAME = '無黨籍'
OTHER_NAME = '其他政黨'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    s = open(PROFILE, encoding='utf-8').read()
    LABEL = load_label(s)

    def code_of(name):
        if name in ALIAS: return ALIAS[name]
        exact = [k for k, l in LABEL.items() if l == name]
        return exact[0] if exact else 'other'

    def rec(e, cands):
        return {'elig': e['elig'], 'cast': e['cast'], 'invalid': e['invalid'], 'cands': sorted(cands, key=lambda c: (-c['votes'], c['name']))}

    def by_cand(E, k, e, mark=False):
        out = []
        for no, v in e['votes'].items():
            c = E.cand(k, no); r = {'name': c['name'], 'party': code_of(c['party_name']), 'votes': v}
            if mark and c['elected']: r['elected'] = True   # 縣市議員 charts: elected candidates get their own ball
            out.append(r)
        return out

    def keep(names, y): return same_village(names[y], names[max(names)])

    cc_out, dist_out, tc_out, vc_out, tm_out = {}, {}, {}, {}, {}
    skipped = []

    # ---- 縣市議員 ----
    vnames = collections.defaultdict(dict); vrecs = {}
    for y, dirs in COUNCIL.items():
        tot = {cc: {'elig': 0, 'cast': 0, 'invalid': 0, 'valid': 0} for cc in SEEDS}
        party = {cc: collections.Counter() for cc in SEEDS}
        for i, d in enumerate(dirs):
            E = Election(d, '', set(SEEDS))
            dist_valid = collections.Counter()
            for k, e in E.rows.items():
                cc, area, dept, li = k
                lvl = E.level(k)
                if lvl == 'county':
                    for f in ('elig', 'cast', 'invalid'): tot[cc][f] += e[f]
                    tot[cc]['valid'] += e['valid']
                elif lvl == 'area':
                    dist_valid[cc] += e['valid']
                    dk = cc + '_' + area
                    assert y not in dist_out.get(dk, {}), ('district code reused across ballots', dk, y)
                    dist_out.setdefault(dk, {})[y] = rec(e, by_cand(E, k, e, True))
                    for no, v in e['votes'].items(): party[cc][code_of(E.cand(k, no)['party_name'])] += v
                elif i == 0 and lvl == 'tc':
                    tc = cc + dept
                    assert tc not in tc_out or y not in tc_out[tc], ('township in two council districts', tc, y)
                    tc_out.setdefault(tc, {})[y] = rec(e, by_cand(E, k, e, True))
                elif i == 0 and lvl == 'vc' and e['valid']:
                    vc = cc + dept + li[-3:]
                    vnames[vc][y] = E.vname(k); vrecs[(vc, y)] = rec(e, by_cand(E, k, e, True))
            for cc in SEEDS:   # district rows add up to the county row
                county = [e for k, e in E.rows.items() if k[0] == cc and E.level(k) == 'county']
                if county: assert dist_valid[cc] == county[0]['valid'], (d, cc, dist_valid[cc], county[0]['valid'])
        for cc in SEEDS:
            assert sum(party[cc].values()) == tot[cc]['valid'], (y, cc)
            cands = [{'name': IND_NAME if p == 'ind' else OTHER_NAME if p == 'other' else LABEL.get(p, p), 'party': p, 'votes': v} for p, v in party[cc].items()]
            cc_out.setdefault(cc, {})[y] = rec(tot[cc], cands)
    for vc in sorted(vnames):
        for y in sorted(vnames[vc]):
            if keep(vnames[vc], y): vc_out.setdefault(vc, {})[y] = vrecs[(vc, y)]
            else: skipped.append(('council', vc, y, vnames[vc][y]))

    # ---- 鄉鎮市長, village rows ----
    tnames = collections.defaultdict(dict); trecs = {}
    for y, d in TMAYOR.items():
        E = Election(d, '', set(SEEDS))
        for k, e in E.rows.items():
            if E.level(k) != 'vc' or not e['valid']: continue
            vc = k[0] + k[2] + k[3][-3:]
            cs = sorted(by_cand(E, k, e), key=lambda c: (-c['votes'], c['name']))
            tnames[vc][y] = E.vname(k); trecs[(vc, y)] = [cs[0]['party'], round(margin([c['votes'] for c in cs], e['valid']), 6)] + tie_tail((c['party'], c['votes']) for c in cs)
    for vc in sorted(tnames):
        for y in sorted(tnames[vc]):
            if keep(tnames[vc], y): tm_out.setdefault(vc, {})[y] = trecs[(vc, y)]
            else: skipped.append(('township mayor', vc, y, tnames[vc][y]))

    for x in skipped: print('INFO re-issued village code, village-year not keyed:', x)
    print('council county', {cc: {y: len(r['cands']) for y, r in v.items()} for cc, v in cc_out.items()})
    print('council districts', collections.Counter(d[:5] for d in dist_out))
    print('council townships', collections.Counter(t[:5] for t in tc_out), 'villages', collections.Counter(v[:5] for v in vc_out))
    print('township-mayor villages', collections.Counter(v[:5] for v in tm_out))

    def body(obj): return '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in sorted(obj.items())) + '\n}'
    notes = {
        'COUNCIL_BALL_CC': '縣市議員 ball chart, whole county by party (區域+平原+山原 ballots)',
        'COUNCIL_BALL_DIST': '縣市議員 ball chart, one district (區域 or 原住民), by candidate',
        'COUNCIL_BALL_TC': '縣市議員 ball chart, the township\'s 區域 district race, this township\'s votes',
        'COUNCIL_BALL_VC': '縣市議員 ball chart, the village\'s 區域 district race, this village\'s votes',
        'TMAYOR_VC_DATA': '鄉鎮市長 village colouring [winnerParty, (top1-top2)/valid]',
    }
    for name, obj in [('COUNCIL_BALL_CC', cc_out), ('COUNCIL_BALL_DIST', dist_out), ('COUNCIL_BALL_TC', tc_out), ('COUNCIL_BALL_VC', vc_out), ('TMAYOR_VC_DATA', tm_out)]:
        sp = var_span(s, name)
        if sp: s = s[:sp[0]] + body(obj) + s[sp[1]:]
        else:
            a0, b0 = var_span(s, 'MAYOR_VC_LINEAGE'); end = s.index(';', b0) + 1
            s = s[:end] + ('\n      // %s. Map-mode only. Generated by build_profile_mapmode_data.py from CEC subtotal rows.\n'
                           '      var %s = %s;' % (notes[name], name, body(obj))) + s[end:]
    if a.dry_run: print('dry run'); return
    open(PROFILE, 'w', encoding='utf-8').write(s); print('wrote', PROFILE)


if __name__ == '__main__':
    main()
