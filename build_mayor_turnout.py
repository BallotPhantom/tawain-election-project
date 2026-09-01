#!/usr/bin/env python3
"""Parse C1 (縣市長) elprof.csv to build TC-level and village-level turnout%/valid-vote-rate%
lookup tables for 2022 mayor mode. Companion to build_mayor_tc.py -- reuses the exact same
tc_code/vc_code construction (tc_code = county+city+town, vc_code = tc_code + village[1:])
so the keys line up 1:1 with MAYOR_2022_TC / MAYOR_2022_VILL already baked into council.html.
"""

import os
import json

BASE = "votedata/votedata/voteData/2022-111年地方公職人員選舉/C1"


def read_elprof_turnout(path):
    """Returns (tc_turnout, vc_turnout, tc_elig, vc_elig).
    tc_turnout/vc_turnout: code -> [turnout%, validRate%] (rounded, display-only).
    tc_elig/vc_elig: code -> [elig, validVotes] raw integers straight from the CSV --
    use these for any back-calculation (e.g. 模型盲區's 推算選舉人數) instead of dividing
    through the rounded percentages above, which compounds rounding error (你的要求)."""
    tc_turnout = {}
    vc_turnout = {}
    tc_elig = {}
    vc_elig = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.strip().rstrip(',').split(',')
            if len(parts) < 10:
                continue
            county, city, district, town, village, polling = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if polling != '0000':
                continue
            valid = int(parts[6]) if parts[6].isdigit() else 0
            invalid = int(parts[7]) if parts[7].isdigit() else 0
            total_cast = int(parts[8]) if parts[8].isdigit() else 0
            elig = int(parts[9]) if parts[9].isdigit() else 0
            if elig <= 0 or total_cast <= 0:
                continue
            turnout = round(total_cast / elig * 100, 2)
            valid_rate = round(valid / total_cast * 100, 2)

            if village == '0000':
                if town == '000':
                    continue  # county-level aggregate row, not a township -- skip
                tc_code = county + city + town
                tc_turnout[tc_code] = [turnout, valid_rate]
                tc_elig[tc_code] = [elig, valid]
            else:
                if town == '000':
                    continue
                tc_code = county + city + town
                vc_suffix = village[1:]
                vc_code = tc_code + vc_suffix
                vc_turnout[vc_code] = [turnout, valid_rate]
                vc_elig[vc_code] = [elig, valid]
    return tc_turnout, vc_turnout, tc_elig, vc_elig


if __name__ == '__main__':
    all_tc = {}
    all_vc = {}
    all_tc_elig = {}
    all_vc_elig = {}
    for subdir in ['city', 'prv']:
        prof_path = os.path.join(BASE, subdir, 'elprof.csv')
        if not os.path.exists(prof_path):
            continue
        tc_t, vc_t, tc_e, vc_e = read_elprof_turnout(prof_path)
        all_tc.update(tc_t)
        all_vc.update(vc_t)
        all_tc_elig.update(tc_e)
        all_vc_elig.update(vc_e)

    print(f'// TC-level 2022 mayor turnout%/valid-vote-rate% ({len(all_tc)} townships), from C1 elprof.csv')
    print('// [投票率%, 有效票比率%] -- rounded, display-only. For back-calculation use MAYOR_TC_ELIG_2022 instead.')
    print('const MAYOR_TC_TURNOUT_2022 = {')
    for tc in sorted(all_tc.keys()):
        v = all_tc[tc]
        print(f"  '{tc}':[{v[0]},{v[1]}],")
    print('};')

    print(f'\n// Village-level 2022 mayor turnout%/valid-vote-rate% ({len(all_vc)} villages), from C1 elprof.csv')
    print('const MAYOR_VC_TURNOUT_2022 = {')
    for vc in sorted(all_vc.keys()):
        v = all_vc[vc]
        print(f"  '{vc}':[{v[0]},{v[1]}],")
    print('};')

    print(f'\n// TC-level 2022 mayor raw eligible-voter/valid-vote counts ({len(all_tc_elig)} townships), from C1')
    print('// elprof.csv -- unrounded integers straight from the source, [elig, validVotes]. Use this')
    print('// for 模型盲區/推算選舉人數 instead of reverse-dividing through the rounded % tables above,')
    print('// which compounds rounding error (你的要求).')
    print('const MAYOR_TC_ELIG_2022 = {')
    for tc in sorted(all_tc_elig.keys()):
        v = all_tc_elig[tc]
        print(f"  '{tc}':[{v[0]},{v[1]}],")
    print('};')

    print(f'\n// Village-level 2022 mayor raw eligible-voter/valid-vote counts ({len(all_vc_elig)} villages), from C1 elprof.csv')
    print('const MAYOR_VC_ELIG_2022 = {')
    for vc in sorted(all_vc_elig.keys()):
        v = all_vc_elig[vc]
        print(f"  '{vc}':[{v[0]},{v[1]}],")
    print('};')

    # County-level raw totals, summed straight from the TC-level raw integers above (elig/validVotes
    # are additive across townships within a county) -- no separate raw parse needed. City code =
    # first 2 digits for the 6 special municipalities, first 5 for every other county (matches the
    # tc_code = county+city+town convention used throughout council.html).
    MUNICIPALITIES = {'63', '64', '65', '66', '67', '68'}
    all_cc_elig = {}
    for tc, v in all_tc_elig.items():
        cc2, cc5 = tc[:2], tc[:5]
        cc = cc2 if cc2 in MUNICIPALITIES else cc5
        if cc not in all_cc_elig:
            all_cc_elig[cc] = [0, 0]
        all_cc_elig[cc][0] += v[0]
        all_cc_elig[cc][1] += v[1]

    print(f'\n// County-level 2022 mayor raw eligible-voter/valid-vote counts ({len(all_cc_elig)} counties),')
    print('// summed from MAYOR_TC_ELIG_2022 above (additive across townships within a county).')
    print('const MAYOR_CC_ELIG_2022 = {')
    for cc in sorted(all_cc_elig.keys()):
        v = all_cc_elig[cc]
        print(f"  '{cc}':[{v[0]},{v[1]}],")
    print('};')
