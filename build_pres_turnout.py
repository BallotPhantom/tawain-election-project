#!/usr/bin/env python3
"""Parse presidential elprof.csv (all 5 cycles: 2008/2012/2016/2020/2024) into
county-level + national 選舉人數(elig)/投票數(turnout) totals, for the
政治冷感 (didn't show up to vote) figure in the party-base presidential
cross-reference Sankey.

Reuses parse_2008_2012.py's county-name-mapping approach (join by NAME via
each year's own elbase.csv, not by numeric code -- codes are inconsistent
pre/post the 2010 six-municipality merger, names are stable).

elprof.csv column layout (same across all 5 years, confirmed by inspection):
  [0]=county [1]=citysub [2]=f3(district, '00' for aggregate rows)
  [3]=town   [4]=village [5]=polling
  [6]=valid votes  [7]=invalid votes  [8]=total_cast(=valid+invalid)
  [9]=elig(選舉人數)  [10]=population
County/national aggregate rows: town='000', village='0000'.
National row additionally has county='00', citysub='000'.
"""
import os
import json

BASE = "."

NAME_TO_MODERN = {
    '臺北市': '台北市', '新北市': '新北市', '臺北縣': '新北市',
    '桃園市': '桃園市', '桃園縣': '桃園市',
    '臺中市': '台中市', '臺中縣': '台中市',
    '臺南市': '台南市', '臺南縣': '台南市',
    '高雄市': '高雄市', '高雄縣': '高雄市',
    '宜蘭縣': '宜蘭縣', '基隆市': '基隆市', '新竹市': '新竹市', '新竹縣': '新竹縣',
    '苗栗縣': '苗栗縣', '彰化縣': '彰化縣', '南投縣': '南投縣', '雲林縣': '雲林縣',
    '嘉義縣': '嘉義縣', '嘉義市': '嘉義市', '屏東縣': '屏東縣', '花蓮縣': '花蓮縣',
    '臺東縣': '台東縣', '澎湖縣': '澎湖縣', '金門縣': '金門縣', '連江縣': '連江縣',
}

YEARS = {
    2008: "votedata/votedata/voteData/20080322-總統",
    2012: "votedata/votedata/voteData/20120114-總統及立委/總統",
    2016: "votedata/votedata/voteData/2016總統立委/總統",
    2020: "votedata/votedata/voteData/2020總統立委/總統",
    2024: "votedata/votedata/voteData/2024總統立委/總統",
}
# 2016 files use a _P1 suffix (first/only round)
SUFFIX = {2016: '_P1'}


def clean(v):
    return v.strip().strip('"').lstrip("'")


def read_csv_rows(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n').rstrip('\r')
            if not line:
                continue
            yield [clean(x) for x in line.split(',')]


def build_county_name_map(elbase_path):
    m = {}
    for parts in read_csv_rows(elbase_path):
        if len(parts) < 6:
            continue
        county, citysub, f3, town, village, name = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        if town == '000' and village == '0000':
            m.setdefault((county, citysub), name)
    return m


def parse_year(year, folder):
    sfx = SUFFIX.get(year, '')
    elbase_path = os.path.join(BASE, folder, f'elbase{sfx}.csv')
    elprof_path = os.path.join(BASE, folder, f'elprof{sfx}.csv')

    cc_name_map = build_county_name_map(elbase_path)

    county_out = {}
    national = None
    for parts in read_csv_rows(elprof_path):
        if len(parts) < 10:
            continue
        county, citysub, f3, town, village = parts[0], parts[1], parts[2], parts[3], parts[4]
        if town != '000' or village != '0000':
            continue
        if not parts[6].isdigit() or not parts[9].isdigit():
            continue
        valid, invalid, total_cast, elig = int(parts[6]), int(parts[7]), int(parts[8]), int(parts[9])
        if county == '00' and citysub == '000':
            national = {'elig': elig, 'turnout': total_cast, 'valid': valid}
            continue
        name = cc_name_map.get((county, citysub))
        if not name:
            continue
        cc = NAME_TO_MODERN.get(name)
        if not cc:
            print(f"  [WARN] unmapped county name '{name}' ({county},{citysub}) in {year}")
            continue
        d = county_out.setdefault(cc, {'elig': 0, 'turnout': 0, 'valid': 0})
        d['elig'] += elig
        d['turnout'] += total_cast
        d['valid'] += valid

    if national is None:
        # some years might not have a pre-computed national row -- sum counties instead
        national = {'elig': 0, 'turnout': 0, 'valid': 0}
        for d in county_out.values():
            national['elig'] += d['elig']
            national['turnout'] += d['turnout']
            national['valid'] += d['valid']

    return county_out, national


def main():
    all_county = {}
    all_national = {}
    for year, folder in YEARS.items():
        county_out, national = parse_year(year, folder)
        all_county[year] = county_out
        all_national[year] = national
        print(f"=== {year}: {len(county_out)} counties, national elig={national['elig']:,} turnout={national['turnout']:,} apathy={national['elig']-national['turnout']:,} ({(national['elig']-national['turnout'])/national['elig']*100:.1f}%)")

    print("\nconst PRES_TURNOUT_COUNTY = " + json.dumps(all_county, ensure_ascii=False) + ";")
    print("const PRES_TURNOUT_NATIONAL = " + json.dumps(all_national, ensure_ascii=False) + ";")


if __name__ == '__main__':
    main()
