#!/usr/bin/env python3
"""Village-grain county-mayor (縣市長) lineage for v2/profile.html, straight from CEC raw files.

    python3 build_profile_mayor_vc.py [--dry-run]

Writes MAYOR_VC_LINEAGE (full candidate votes + valid/invalid/cast/elig per village, keyed by CEC
code) and regenerates MAYOR_VC_DATA ([winnerParty, (top1-top2)/valid]) for 南投/新竹/屏東 ×
2014/2018/2022. Replaces the village panel's synthetic one-candidate contest. Candidate → party
codes come from each seed's own mayorLineageByYear (same people county-wide). Checks: candidate
votes sum to valid; valid+invalid == cast; villages close to the county subtotal row.
"""
import argparse, collections, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from reconcile_presidential import _rows, SEEDS  # noqa: E402
from cec_lib import VILLAGES_REDRAWN  # noqa: E402
REDRAWN_TC = {pr + ci + d: cut for keys, cut in VILLAGES_REDRAWN for (pr, ci, d) in keys if pr == '10'}   # modern codes only
from build_profile_presidential import var_span, depth1_keys, js, margin, PROFILE  # noqa: E402

VD = os.path.join(ROOT, 'votedata/votedata/voteData')
# 縣市 + 直轄市 folders; rows are keyed by county code, so the two files never overlap
DIRS = {'2014': ('2014-103年地方公職人員選舉/縣市市長', '2014-103年地方公職人員選舉/直轄市市長'),
        '2018': ('2018-107年地方公職人員選舉/縣市市長', '2018-107年地方公職人員選舉/直轄市市長'),
        '2022': ('2022-111年地方公職人員選舉/C1/city', '2022-111年地方公職人員選舉/C1/prv')}
YEARS = list(DIRS)


def rows(y, f): return [[x.strip().lstrip("'") for x in r] for d in DIRS[y] for r in _rows(f'{VD}/{d}/{f}.csv')]


def load_year(y, party_of):
    cand = {}
    for r in rows(y, 'elcand'):
        if r[0] + r[1] in SEEDS: cand[(r[0] + r[1], r[5])] = r[6]
    names = {r[0] + r[1] + r[3] + r[4][-3:]: r[5] for r in rows(y, 'elbase')
             if r[0] + r[1] in SEEDS and r[3] != '000' and r[4] != '0000'}
    out = {}
    def key(r):
        cc = r[0] + r[1]
        if cc not in SEEDS or r[5] not in ('0', '0000'): return None
        if r[3] == '000': return ('county', cc)
        if r[4] == '0000': return ('tc', cc + r[3])
        assert r[4].isdigit(), r
        if r[4] == '9999': return ('joint', cc + r[3] + r[4])   # numeric joint station (2014 臺中 福恩里、協和里), not a village
        return ('vc', cc + r[3] + r[4][-3:])
    for r in rows(y, 'elprof'):
        k = key(r)
        if k: out[k] = {'valid': int(r[6]), 'invalid': int(r[7]), 'cast': int(r[8]), 'elig': int(r[9]), 'cands': {}}
    for r in rows(y, 'elctks'):
        k = key(r)
        if k: out[k]['cands'][r[6]] = int(r[7])
    for (lvl, code), e in out.items():
        cc = code[:5]
        assert sum(e['cands'].values()) == e['valid'] and e['valid'] + e['invalid'] == e['cast'], (y, code)
        cs = []
        for no, v in e['cands'].items():
            nm = cand[(cc, no)]
            cs.append({'name': nm, 'party': party_of[cc][y][nm], 'votes': v})
        e['cands'] = sorted(cs, key=lambda c: -c['votes'])
        if lvl == 'vc': e['name'] = names.get(code, '')
    for cc in SEEDS:   # closure: villages -> county
        tot = collections.Counter()
        for (lvl, code), e in out.items():
            if lvl in ('vc', 'joint') and code[:5] == cc: tot.update({c['name']: c['votes'] for c in e['cands']})
            # a township whose village rows were dropped (cec_lib.VILLAGES_REDRAWN, 臺東市 before 2022) closes on its own row
            if lvl == 'tc' and code[:5] == cc and code in REDRAWN_TC and int(y) < REDRAWN_TC[code]: tot.update({c['name']: c['votes'] for c in e['cands']})
        assert dict(tot) == {c['name']: c['votes'] for c in out[('county', cc)]['cands']}, (y, cc)
    return out


def same_village(a, b):
    """Same name up to one differing character: CEC spells rare characters inconsistently across
    years (private-use code points, 徦/厦 variants), while a re-issued code (東港 大鵬里→福德里) differs more."""
    return len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    s = open(PROFILE, encoding='utf-8').read()
    party_of = {}
    for cc, seed in SEEDS.items():
        a0, b0 = var_span(s, seed); ml = depth1_keys(s, a0, b0)['mayorLineageByYear']
        block = s[ml[0]:ml[1]]; party_of[cc] = {}
        for y, (ya, yb) in depth1_keys(s, *ml).items():
            party_of[cc][y] = dict(re.findall(r"name:\s*'([^']+)',\s*party:\s*'(\w+)'", s[ya:yb]))
    cec = {y: load_year(y, party_of) for y in YEARS}

    vnames = collections.defaultdict(dict)
    for y in YEARS:
        for (lvl, code), e in cec[y].items():
            if lvl == 'vc': vnames[code][y] = e['name']
    lin, data, skipped = {}, {}, []
    for vc in sorted(vnames):
        latest = vnames[vc].get('2022')
        for y in YEARS:
            e = cec[y].get(('vc', vc))
            if not e or not e['valid']: continue
            if latest and not same_village(e['name'], latest): skipped.append((vc, y, e['name'], latest)); continue
            lin.setdefault(vc, {})[y] = {'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig'],
                                        'candidates': e['cands']}
            data.setdefault(vc, {})[y] = margin(e)
    for x in skipped: print('INFO code re-issued, village-year not keyed:', x)

    # Compare against the existing MAYOR_VC_DATA before replacing it
    a0, b0 = var_span(s, 'MAYOR_VC_DATA'); old = json.loads(s[a0:b0])
    diffs = collections.Counter(); lost = []
    for vc, ys in old.items():
        for y, r0 in ys.items():
            p, m = r0[0], r0[1]   # a record may carry a tie list after the margin (cec_lib.tie_tail)
            n = data.get(vc, {}).get(y)
            if not n: lost.append((vc, y)); continue
            if n[0] != p: diffs['winner differs'] += 1; print('WINNER DIFF', vc, y, (p, m), n)
            elif abs(n[1] - m) > 0.0005: diffs['margin differs'] += 1; print('MARGIN DIFF', vc, y, (p, m), n)
            else: diffs['same'] += 1
    print('vs old MAYOR_VC_DATA:', dict(diffs), 'old village-years without CEC row:', lost)
    print('villages:', collections.Counter(v[:5] for v in lin))

    edits = [(a0, b0, js(data))]
    body = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in lin.items()) + '\n}'
    sp = var_span(s, 'MAYOR_VC_LINEAGE')
    if sp: edits.append((sp[0], sp[1], body))
    else:
        end = s.index(';', b0) + 1
        edits.append((end, end, '\n  // Village-grain county-mayor lineage (full candidate votes, valid/invalid/\n'
                                '  // cast/elig), keyed by CEC code. Generated by build_profile_mayor_vc.py from\n'
                                '  // CEC 縣市長 village subtotal rows; MAYOR_VC_DATA above is derived from it.\n'
                                '  var MAYOR_VC_LINEAGE = ' + body + ';'))
    edits.sort()
    for st, en, txt in reversed(edits): s = s[:st] + txt + s[en:]
    if a.dry_run: print('dry run'); return
    open(PROFILE, 'w', encoding='utf-8').write(s); print('wrote', PROFILE)


if __name__ == '__main__':
    main()
