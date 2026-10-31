#!/usr/bin/env python3
"""Reconcile v2/profile.html LEGIND_* (山地 / 平地原住民立委 2016-2024) against the raw CEC files.

    python3 tests/reconcile_legind.py

Independent re-read of elcand / elprof / elctks (cec_lib.read only):
  L1 every county / township subtotal row of the profile counties has a ball-chart record (LEGIND_BALL_CC / _TC) whose
     elig / cast / invalid equal elprof and whose candidate votes equal elctks (name + votes)
  L2 LEGIND_TC_DATA leading party = the party with the most votes (party votes summed; ties tolerated) and margin =
     (top1 − top2) / candidate-vote sum, for every township with votes
  L3 every village with its own vote row and a code still naming the same village has LEGIND_VC_DATA, same check
"""
import collections, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.join(ROOT, 'tests'))
from cec_lib import read, VD  # noqa: E402
from build_profile_presidential import var_span, PROFILE  # noqa: E402
from build_profile_cec_tables import SEEDS, ALIAS, load_label  # noqa: E402
from build_profile_mayor_vc import same_village  # noqa: E402
from build_profile_legind import RACES  # noqa: E402

fails = 0
def report(ok, what, detail=''):
    global fails
    print('PASS' if ok else 'FAIL', what, '' if ok else detail)
    fails += 0 if ok else 1


def main():
    s = open(PROFILE, encoding='utf-8').read()
    P = {v: json.loads(s[slice(*var_span(s, v))]) for v in ('LEGIND_BALL_CC', 'LEGIND_BALL_TC', 'LEGIND_TC_DATA', 'LEGIND_VC_DATA')}
    LABEL = load_label(s)
    code = lambda n: ALIAS.get(n) or next((k for k, l in LABEL.items() if l == n), 'other')
    t = open(os.path.join(ROOT, 'data_map_v64_profile_core.js'), encoding='utf-8').read()
    i = t.index('const NM = ') + len('const NM = '); j = t.index('\n', i)
    nm = {vc: v.split(' ')[-1] for vc, v in json.loads(t[i:j].rstrip().rstrip(';'))['v'].items()}
    for y, kinds in RACES.items():
        for kind, (d, suf) in kinds.items():
            f = lambda x: os.path.join(VD, d, x + suf + '.csv') if os.path.exists(os.path.join(VD, d, x + suf + '.csv')) else os.path.join(VD, d, x + '.csv')
            paty = {r[0]: r[1] for r in read(f('elpaty'))}
            cand = {r[5]: (r[6], code(paty.get(r[7], ''))) for r in read(f('elcand')) if len(r) >= 8}
            base = {(r[0] + r[1], r[3], r[4]): r[5] for r in read(f('elbase'))}
            prof = {(r[0] + r[1], r[3], r[4]): r for r in read(f('elprof')) if r[5] in ('0', '0000') and r[0] + r[1] in SEEDS}
            votes = collections.defaultdict(collections.Counter)
            for r in read(f('elctks')):
                if r[5] in ('0', '0000') and r[0] + r[1] in SEEDS and (r[0] + r[1], r[3], r[4]) in prof: votes[(r[0] + r[1], r[3], r[4])][r[6]] += int(r[7])
            b1, b2, b3, n3 = [], [], [], 0
            for k, r in prof.items():
                cc, dept, li = k
                if li != '0000' and dept != '000' and not li.isdigit(): continue
                v = votes[k]; tot = sum(v.values())
                if li == '0000':
                    rec = (P['LEGIND_BALL_CC'].get(cc) if dept == '000' else P['LEGIND_BALL_TC'].get(cc + dept) or {}).get(y, {}).get(kind)
                    want = sorted((cand[no][0], n) for no, n in v.items())
                    if not rec or (rec['elig'], rec['cast'], rec['invalid']) != (int(r[9]), int(r[8]), int(r[7])) or sorted((c['name'], c['votes']) for c in rec['cands']) != want:
                        b1.append((y, kind, k))
                if dept == '000' or not tot: continue
                pv = collections.Counter()
                for no, n in v.items(): pv[cand[no][1]] += n
                top = sorted(pv.values(), reverse=True) + [0]
                tie = top[0] == top[1]
                lead = max(pv, key=pv.get)
                mg = (top[0] - top[1]) / tot
                if li == '0000':
                    got = ((P['LEGIND_TC_DATA'].get(cc + dept) or {}).get(y) or {}).get(kind)
                    if not got or (got[0] != lead and not tie) or abs(got[1] - mg) > 5.1e-6: b2.append((y, kind, cc + dept, got, lead, round(mg, 6)))
                else:
                    vc = cc + dept + li[-3:]
                    if vc not in nm or not same_village(base.get(k, ''), nm[vc]): continue
                    n3 += 1
                    got = ((P['LEGIND_VC_DATA'].get(vc) or {}).get(y) or {}).get(kind)
                    if not got or (got[0] != lead and not tie) or abs(got[1] - mg) > 5.1e-6: b3.append((y, kind, vc, got, lead, round(mg, 6)))
            report(not b1, f'L1 {y} {kind} county / township ball charts', b1[:3])
            report(not b2, f'L2 {y} {kind} township colour', b2[:3])
            report(not b3, f'L3 {y} {kind} village colour ({n3} villages)', b3[:3])
    print(f'\n{fails} FAIL(s)'); sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
