#!/usr/bin/env python3
"""Parse C1 (縣市長) election data to build TC-level and village-level mayor data for 2022."""

import csv
import os
import json

BASE = "votedata/votedata/voteData/2022-111年地方公職人員選舉/C1"

PARTY_MAP = {
    '1': 'kmt', '16': 'dpp', '350': 'tpp', '267': 'npp',
    '203': 'ind', '306': 'ind', '320': 'ind', '343': 'ind',
    '355': 'ind', '356': 'ind', '999': 'ind',
}

def read_elprof(path):
    """Read profile file. Returns dict: tc_code -> elig (eligible voters)."""
    elig = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.strip().rstrip(',').split(',')
            if len(parts) < 10:
                continue
            county, city, district, town, village, polling = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if village != '0000' or polling != '0000':
                continue
            tc_code = county + city + town
            elig[tc_code] = int(parts[9]) if parts[9].isdigit() else 0
    return elig

def read_elcand(path):
    """Read candidate file. Returns dict: (county_code, cand_no) -> {name, party}"""
    cands = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.strip().rstrip(',').split(',')
            if len(parts) < 7:
                continue
            county = parts[0]
            city = parts[1]
            cand_no = parts[5]
            name = parts[6]
            party_code = parts[7]
            party = PARTY_MAP.get(party_code, 'ind')
            key = (county, city, cand_no)
            cands[key] = {'name': name, 'party': party, 'party_code': party_code}
    return cands

def read_elctks(path):
    """Read vote counts. Returns:
      tc_results: tc_code -> {cands: {cand_no: votes}, tot: int}
      vill_results: vc_code -> {cands: {cand_no: votes}, tot: int}
    """
    tc_results = {}
    vill_results = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.strip().rstrip(',').split(',')
            if len(parts) < 9:
                continue
            county = parts[0]
            city = parts[1]
            district = parts[2]
            township = parts[3]
            village = parts[4]
            sub = parts[5]
            cand_no = parts[6]
            votes = int(parts[7]) if parts[7].isdigit() else 0

            tc_code = county + city + township

            # Township-level totals (village == '0000')
            if township != '000' and village == '0000':
                if tc_code not in tc_results:
                    tc_results[tc_code] = {'cands': {}, 'tot': 0}
                tc_results[tc_code]['cands'][cand_no] = votes
                tc_results[tc_code]['tot'] += votes

            # Village-level (village != '0000', sub == '0000')
            if village != '0000' and sub == '0000':
                # VC code: tc_code(8) + village[1:](3) = 11 chars
                # C1 village is 4 chars: '0001' -> suffix '001', '0A01' -> suffix 'A01'
                vc_suffix = village[1:]
                vc_code = tc_code + vc_suffix
                if vc_code not in vill_results:
                    vill_results[vc_code] = {'cands': {}, 'tot': 0}
                vill_results[vc_code]['cands'][cand_no] = votes
                vill_results[vc_code]['tot'] += votes

    return tc_results, vill_results

def build_results(tc_results, cands, elig_map, county_prefix_fn):
    """Build structured results from raw vote data."""
    results = {}
    for code, tdata in tc_results.items():
        county_cands = {k: v for k, v in cands.items()
                        if k[0] == code[:2] and k[1] == code[2:5]}

        cand_list = []
        for cand_no, votes in tdata['cands'].items():
            info = county_cands.get((code[:2], code[2:5], cand_no))
            if info:
                cand_list.append({
                    'n': info['name'],
                    'p': info['party'],
                    'v': votes,
                    'e': 0
                })

        cand_list.sort(key=lambda c: c['v'], reverse=True)
        if cand_list:
            cand_list[0]['e'] = 1

        tot = tdata['tot']
        winner = cand_list[0] if cand_list else None
        elig = elig_map.get(code, 0) if elig_map else 0

        results[code] = {
            'name': '',
            'p': winner['p'] if winner else 'ind',
            'wp': winner['p'] if winner else 'ind',
            'wn': winner['n'] if winner else '',
            'v': winner['v'] if winner else 0,
            'pct': round(winner['v'] / tot * 100, 2) if winner and tot else 0,
            'tot': tot,
            'elig': elig,
            'cands': cand_list,
        }
    return results

if __name__ == '__main__':
    all_tc = {}
    all_vill = {}

    for subdir in ['city', 'prv']:
        dirpath = os.path.join(BASE, subdir)
        if not os.path.isdir(dirpath):
            continue
        cand_path = os.path.join(dirpath, 'elcand.csv')
        tks_path = os.path.join(dirpath, 'elctks.csv')
        prof_path = os.path.join(dirpath, 'elprof.csv')
        if not os.path.exists(cand_path) or not os.path.exists(tks_path):
            continue

        cands = read_elcand(cand_path)
        tc_votes, vill_votes = read_elctks(tks_path)
        elig_map = read_elprof(prof_path) if os.path.exists(prof_path) else {}

        for tc_code, d in build_results(tc_votes, cands, elig_map, None).items():
            all_tc[tc_code] = d
        for vc_code, d in build_results(vill_votes, cands, None, None).items():
            all_vill[vc_code] = d

    # Output TC data
    print(f"// TC-level 2022 county mayor election data ({len(all_tc)} TCs)")
    print("const MAYOR_2022_TC = {")
    for tc in sorted(all_tc.keys()):
        d = all_tc[tc]
        cands_js = json.dumps(d['cands'], ensure_ascii=False)
        print(f"  '{tc}':{{name:'{d['name']}',p:'{d['p']}',wp:'{d['wp']}',wn:'{d['wn']}',v:{d['v']},pct:{d['pct']},tot:{d['tot']},elig:{d['elig']},cands:{cands_js}}},")
    print("};")

    # Output village data
    print(f"\n// Village-level 2022 county mayor election data ({len(all_vill)} villages)")
    print("const MAYOR_2022_VILL = {")
    for vc in sorted(all_vill.keys()):
        d = all_vill[vc]
        cands_js = json.dumps(d['cands'], ensure_ascii=False)
        print(f"  '{vc}':{{tot:{d['tot']},cands:{cands_js}}},")
    print("};")
