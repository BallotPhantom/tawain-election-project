#!/usr/bin/env python3
"""Parse T1 (縣市議員/直轄市議員，一般區域選區) elprof.csv to build TC-level and village-level
turnout%/valid-vote-rate% lookup tables for 2022 council mode. Same column layout and code
construction as build_mayor_turnout.py (tc_code = county+city+town, vc_code = tc_code+village[1:]).
Only covers the regular (區域) race -- indigenous (山原/平原) reserved seats are a separate voter
roll/race entirely and are NOT folded in here, same tolerant-gap approach as the 嘉義市 mayor case.
"""

import os

BASE = "votedata/votedata/voteData/2022-111年地方公職人員選舉/T1"


def read_elprof_turnout(path):
    tc_turnout = {}
    vc_turnout = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.strip().rstrip(',').split(',')
            if len(parts) < 10:
                continue
            county, city, district, town, village, polling = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if polling != '0000' or town == '000':
                continue
            valid = int(parts[6]) if parts[6].isdigit() else 0
            invalid = int(parts[7]) if parts[7].isdigit() else 0
            total_cast = int(parts[8]) if parts[8].isdigit() else 0
            elig = int(parts[9]) if parts[9].isdigit() else 0
            if elig <= 0 or total_cast <= 0:
                continue
            turnout = round(total_cast / elig * 100, 2)
            valid_rate = round(valid / total_cast * 100, 2)
            tc_code = county + city + town

            if village == '0000':
                tc_turnout[tc_code] = [turnout, valid_rate]
            else:
                vc_suffix = village[1:]
                vc_code = tc_code + vc_suffix
                vc_turnout[vc_code] = [turnout, valid_rate]
    return tc_turnout, vc_turnout


if __name__ == '__main__':
    all_tc = {}
    all_vc = {}
    for subdir in ['city', 'prv']:
        prof_path = os.path.join(BASE, subdir, 'elprof.csv')
        if not os.path.exists(prof_path):
            continue
        tc_t, vc_t = read_elprof_turnout(prof_path)
        all_tc.update(tc_t)
        all_vc.update(vc_t)

    print(f'// TC-level 2022 council (區域議員) turnout%/valid-vote-rate% ({len(all_tc)} townships), from T1 elprof.csv')
    print('// Regular district race only -- does not include 山原/平原 indigenous seats (separate voter roll)')
    print('// [投票率%, 有效票比率%]')
    print('const COUNCIL_TC_TURNOUT_2022 = {')
    for tc in sorted(all_tc.keys()):
        v = all_tc[tc]
        print(f"  '{tc}':[{v[0]},{v[1]}],")
    print('};')

    print(f'\n// Village-level 2022 council (區域議員) turnout%/valid-vote-rate% ({len(all_vc)} villages), from T1 elprof.csv')
    print('const COUNCIL_VC_TURNOUT_2022 = {')
    for vc in sorted(all_vc.keys()):
        v = all_vc[vc]
        print(f"  '{vc}':[{v[0]},{v[1]}],")
    print('};')
