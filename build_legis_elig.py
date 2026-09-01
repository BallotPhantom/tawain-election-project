#!/usr/bin/env python3
"""Parse the 不分區政黨 (party-list) elprof.csv for 2008/2012/2016/2020/2024 legislative elections
into raw county/township/village-level eligible-voter counts, matching the exact same
tc_code/vc_code convention as build_mayor_tc.py/build_mayor_turnout.py (tc_code =
county+city+town, vc_code = tc_code + village[1:]).

This gives REAL eligible-voter counts for the same years/geography as BASE5_YEARS's party-list
vote data (PL08_VC/PL12_VC/PL16_VC/PL_VC_2020/PL_VC_2024 in council.html/test.html) -- no need
to estimate turnout or back-derive population; the elig count is a raw field (選舉人數, per
選舉資料庫格式.odt) in the same source file the vote counts themselves come from, right next to
a 人口數(population) field that's only populated at township level and above (village-level is
always 0 in CEC's own file -- confirmed against the format doc's own worked example, not a
parsing gap on our end).

2026-08-30: township/village-level 2008/2012 crosswalk solved (previously a documented gap --
LEGIS_TC_ELIG/LEGIS_VC_ELIG for those two years were keyed by CEC's old pre-2016 numbering scheme
and matched nothing at modern tc/vc lookups, which silently broke any floor/ceiling calculation
whose true extreme fell in 2008 or 2012 below the county level -- see project memory 2026-08-29
"real (nationwide) data-gap bug ... in 政黨基本盤 選舉人數校正" for how this was found). The county
crosswalk (CROSSWALK_2008/CROSSWALK_2012 below) only ever solved the COUNTY level, by matching
elig totals against PRES_TURNOUT_COUNTY -- that approach doesn't extend cleanly to town/village
level (tried a magnitude/nearest-value matching approach first; it got ~98% of towns right but
silently mismatched the rest, which is exactly the kind of quiet wrongness this project tries to
avoid). The actual fix: `elbase.csv` sits in the same `不分區政黨` folder as `elprof.csv` for every
year and gives the REAL Chinese name for every code (not just numbers) -- build the crosswalk by
exact name match against modern town/village names (`NM.t`/`NM.v`, extracted from test.html),
falling back to a suffix-stripped ("北投區"->"北投") stem match only when unambiguous (handles
routine 鄉/鎮/市/區 administrative-status upgrades, e.g. 頭份鎮->頭份市, 楊梅鎮->楊梅市). This reached
368/368 towns for both years with zero ambiguous matches. One case needed a manual override
despite passing the stem-match check: 高雄縣三民鄉(old code 03012002) was renamed to 那瑪夏區 in the
2010 merger specifically to avoid colliding with the pre-existing, unrelated 高雄市三民區 -- the stem
match saw one "三民"-stem candidate (三民區) and accepted it as unambiguous, when it was actually
the wrong one (a different real place). Caught via a straightforward sanity check (each crosswalked
old-code elig value should be roughly the same order of magnitude as the same modern town's 2016
value) that flagged exactly this one anomaly out of 736 total mappings -- see `TC_NAME_OVERRIDES`.
Village level: exact-name match only (no stem fallback -- village boundaries have had real
historical splits/merges/renames since 2008/2012, unlike towns, so an ambiguous village match is
likely a genuine different place, not just a suffix change); this covers 94.6% of 2012 villages
and 82.0% of 2008 villages, leaving the rest as an honest gap (same "don't fake data" precedent as
this project's existing `VC_MERGED_2022` handling) rather than guessing.

Known gaps, not bugs:
- Villages that no longer exist under that name by the modern boundary (real historical merges/
  splits/renames) have no 2008 and/or 2012 entry in LEGIS_VC_ELIG -- by design, not an oversight.
- 2016 lives under a differently-suffixed filename (elprof_T4.csv, not elprof.csv -- T4 is
  CEC's internal code for the 不分區政黨 ballot within that combined presidential+legislative
  election day) -- easy to miss with a plain "elprof.csv" filename search, which is exactly
  what happened on the first pass building this script.

Re-run: python3 build_legis_elig.py > data_legis_elig.js
"""

import json
import sys

PATHS = {
    2008: "votedata/votedata/voteData/2008立委/不分區政黨/elprof.csv",
    2012: "votedata/votedata/voteData/20120114-總統及立委/不分區政黨/elprof.csv",
    2016: "votedata/votedata/voteData/2016總統立委/不分區政黨/elprof_T4.csv",
    2020: "votedata/votedata/voteData/2020總統立委/不分區政黨/elprof.csv",
    2024: "votedata/votedata/voteData/2024總統立委/不分區政黨/elprof.csv",
}


def clean(field):
    # 2012's CSV nests quotes as "'0000" (literal outer " wrapping a leading ') -- stripping
    # "'" then '"' in that order leaves a residual leading ' behind (found by inspecting the
    # actual field values: they came out as "'0000" instead of "0000", which silently failed
    # every village-code comparison). strip() with a char *set* peels both chars in either
    # nesting order, unlike two sequential single-char strips.
    return field.strip().strip("'\"")


def parse_year(path):
    tc_elig = {}
    vc_elig = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = [clean(p) for p in line.strip().rstrip(",").split(",")]
            if len(parts) < 10:
                continue
            county, city, district, town, village, polling = parts[0:6]
            if polling != "0000" and polling != "0":
                # per-polling-station rows use a real station code; 0000 is the town/village
                # aggregate row (same convention as build_mayor_turnout.py's C1 parser) --
                # but 2008/2012's polling field isn't zero-padded the same way 2020/2024 is,
                # so normalize by int value instead of exact string match.
                try:
                    if int(polling) != 0:
                        continue
                except ValueError:
                    continue
            valid = int(parts[6]) if parts[6].isdigit() else 0
            invalid = int(parts[7]) if parts[7].isdigit() else 0
            total_cast = int(parts[8]) if parts[8].isdigit() else 0
            elig = int(parts[9]) if parts[9].isdigit() else 0
            # 人口數(population), field 11 per 選舉資料庫格式.odt -- lives right next to 選舉人數
            # in the same row, so where it's populated this is a same-election-day population
            # figure, no need for a separate 戶政 lookup. Doc notes by-elections only fill this
            # on the first row of the whole file; regular elections (all 4 years here) fill it
            # throughout, but guard with isdigit() same as the other numeric fields regardless.
            population = int(parts[10]) if len(parts) > 10 and parts[10].isdigit() else None
            if elig <= 0 or total_cast <= 0:
                continue
            if village == "0000" or village == "0":
                if town in ("000", "0"):
                    continue  # county-level aggregate row
                tc_code = county + city + town
                tc_elig[tc_code] = [elig, valid, population]
            else:
                if town in ("000", "0"):
                    continue
                tc_code = county + city + town
                vc_suffix = village[1:]
                vc_code = tc_code + vc_suffix
                vc_elig[vc_code] = [elig, valid, population]
    return tc_elig, vc_elig


# Same municipality set used by build_mayor_turnout.py's MAYOR_CC_ELIG_2022 rollup -- the 6
# directly-administered municipalities use a 2-digit county-code prefix, every other county
# uses the full 5-digit compound code. Copied from that existing, already-verified logic
# rather than re-deriving it.
MUNICIPALITIES = {'63', '64', '65', '66', '67', '68'}


# Modern county code for each name (same table as test.html's _LEG_CC_TABLE, copied so this
# script has no runtime dependency on the HTML files).
MODERN_CC = {
    '臺北市': '63', '新北市': '65', '桃園市': '68', '臺中市': '66', '臺南市': '67', '高雄市': '64',
    '宜蘭縣': '10002', '新竹縣': '10004', '苗栗縣': '10005', '彰化縣': '10007', '南投縣': '10008',
    '雲林縣': '10009', '嘉義縣': '10010', '屏東縣': '10013', '臺東縣': '10014', '花蓮縣': '10015',
    '澎湖縣': '10016', '基隆市': '10017', '新竹市': '10018', '嘉義市': '10020', '金門縣': '09020',
    '連江縣': '09007',
}
# 2008/2012 county-level crosswalk, old CEC-internal code -> modern county name(s). Derived
# empirically, not from documentation: matched each year's old-code county elig totals against
# PRES_TURNOUT_COUNTY's same-year totals (already keyed by modern name in test.html) by nearest
# value -- the two elections are only ~2 months apart in both years, so totals should be within
# a fraction of a percent of each other, and every match here landed within 0.3%. 2008 needed
# 3 real many-to-one merges (2010's five-municipality mergers hadn't happened yet); every other
# county is a clean 1:1 renumbering. 2012 is entirely 1:1 -- the geography was already merged
# by then, only CEC's internal numbering differs from the modern scheme.
CROSSWALK_2008 = {
    '03001': '新北市', '01000': '臺北市', '03003': '桃園市', '03007': '彰化縣', '03013': '屏東縣',
    '03009': '雲林縣', '03010': '嘉義縣', '03005': '苗栗縣', '03008': '南投縣', '03004': '新竹縣',
    '03002': '宜蘭縣', '03017': '基隆市', '03018': '新竹市', '03015': '花蓮縣', '03020': '嘉義市',
    '03014': '臺東縣', '03016': '澎湖縣', '04001': '金門縣', '04002': '連江縣',
    '02000': '高雄市', '03012': '高雄市',  # merge: old 高雄市 + 高雄縣
    '03006': '臺中市', '03019': '臺中市',  # merge: old 臺中市 + 臺中縣
    '03011': '臺南市', '03021': '臺南市',  # merge: old 臺南市 + 臺南縣
}
CROSSWALK_2012 = {
    '01000': '臺北市', '02000': '新北市', '03000': '臺中市', '04000': '臺南市', '05000': '高雄市',
    '06001': '宜蘭縣', '06002': '桃園市', '06003': '新竹縣', '06004': '苗栗縣', '06005': '彰化縣',
    '06006': '南投縣', '06007': '雲林縣', '06008': '嘉義縣', '06009': '屏東縣', '06010': '臺東縣',
    '06011': '花蓮縣', '06012': '澎湖縣', '06013': '基隆市', '06014': '新竹市', '06015': '嘉義市',
    '07001': '金門縣', '07002': '連江縣',
}
# elbase.csv lives in the same folder as elprof.csv for every year and carries the real Chinese
# name for every county/town/village code -- gives an exact, ground-truth town/village crosswalk
# instead of guessing from code arithmetic or elig-magnitude nearest-matching (both tried first;
# magnitude-matching got ~98% right but silently wrong on the rest, see module docstring).
ELBASE_PATHS = {
    2008: "votedata/votedata/voteData/2008立委/不分區政黨/elbase.csv",
    2012: "votedata/votedata/voteData/20120114-總統及立委/不分區政黨/elbase.csv",
}
ADMIN_SUFFIXES = ('鄉', '鎮', '市', '區')

# One known case where exact-name AND suffix-stem matching both land on the wrong place: 高雄縣
# 三民鄉 (old code 03012002) was renamed to 那瑪夏區 in the 2010 merger specifically to avoid
# colliding with the pre-existing, unrelated 高雄市三民區 -- stem('三民鄉')==stem('三民區')=='三民',
# so the stem-fallback sees exactly one candidate and (wrongly) accepts it as unambiguous. Caught
# by the elig-magnitude sanity check in this module's dev notes (ratio=0.01 against 2016, the one
# anomaly out of 736 total town mappings). Keyed by old_tc (5-digit old county code + 3-digit old
# town index), same as the crosswalk dict this overrides into.
TC_NAME_OVERRIDES = {
    '03012002': '64000380',  # 高雄縣三民鄉 -> 那瑪夏區 (NOT 高雄市三民區/64000050)
}


def parse_elbase_names(path):
    """elbase.csv: county,city,district,town,village,name (village='0000' rows give the town's
    own name; county-level town='000' rows are skipped). Returns ({old_tc: town_name},
    {old_vc: village_name})."""
    tc_names = {}
    vc_names = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = [clean(p) for p in line.strip().split(",")]
            if len(parts) < 6:
                continue
            county, city, district, town, village, name = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if town in ("000", "0"):
                continue
            old_tc = county + city + town
            if village in ("0000", "0"):
                tc_names[old_tc] = name
            else:
                vc_names[old_tc + village[1:]] = name
    return tc_names, vc_names


def _stem(name):
    return name[:-1] if name and name[-1] in ADMIN_SUFFIXES else name


def build_tc_crosswalk(tc_names, crosswalk, nm_t):
    """tc_names: {old_tc: town_name} from elbase.csv. crosswalk: CROSSWALK_2008/2012 (old_cc(5)
    -> modern county name). nm_t: modern tc_code -> town name (NM.t from test.html). Returns
    {old_tc: modern_tc}, matching every old_tc exactly once (or raising -- any leftover after
    exact+stem+override matching is a real problem worth seeing, not silently dropping)."""
    name_to_oldccs = {}
    for old_cc, name in crosswalk.items():
        name_to_oldccs.setdefault(name, []).append(old_cc)

    result = {}
    unmatched = []
    for name, old_ccs in name_to_oldccs.items():
        modern_cc = MODERN_CC[name]
        prefix = modern_cc + "000" if modern_cc in MUNICIPALITIES else modern_cc
        name_to_tc = {n: tc for tc, n in nm_t.items() if tc.startswith(prefix) and len(tc) == 8}
        stem_to_tcs = {}
        for n, tc in name_to_tc.items():
            stem_to_tcs.setdefault(_stem(n), []).append(tc)
        for old_cc in old_ccs:
            for old_tc, town_name in tc_names.items():
                if not old_tc.startswith(old_cc):
                    continue
                if old_tc in TC_NAME_OVERRIDES:
                    result[old_tc] = TC_NAME_OVERRIDES[old_tc]
                    continue
                modern_tc = name_to_tc.get(town_name)
                if not modern_tc:
                    cands = stem_to_tcs.get(_stem(town_name))
                    if cands and len(cands) == 1:
                        modern_tc = cands[0]
                if modern_tc:
                    result[old_tc] = modern_tc
                else:
                    unmatched.append((name, old_tc, town_name))
    if unmatched:
        print(f"// WARNING: {len(unmatched)} town(s) unmatched in TC crosswalk: {unmatched}",
              file=sys.stderr)
    return result


def build_vc_crosswalk(vc_names, tc_crosswalk, nm_v):
    """Exact village-name match only, scoped to the already-resolved modern town (no stem
    fallback -- unlike towns, an ambiguous village-name match is likely a genuinely different
    place given real historical village splits/merges/renames, not just a suffix change). Villages
    that don't resolve are left out entirely -- an honest gap, not a guess (same precedent as this
    project's existing VC_MERGED_2022 handling for a similar known-boundary-change situation)."""
    modern_villages_by_tc = {}
    for vc, full in nm_v.items():
        tc = vc[:8]
        vname = full.split(" ", 1)[1] if " " in full else full
        modern_villages_by_tc.setdefault(tc, {})[vname] = vc

    result = {}
    for old_vc, vname in vc_names.items():
        modern_tc = tc_crosswalk.get(old_vc[:8])
        if not modern_tc:
            continue
        modern_vc = modern_villages_by_tc.get(modern_tc, {}).get(vname)
        if modern_vc:
            result[old_vc] = modern_vc
    return result


def remap_tc_elig(tc_elig_old, tc_crosswalk):
    remapped = {}
    for old_tc, v in tc_elig_old.items():
        modern_tc = tc_crosswalk.get(old_tc)
        if modern_tc:
            remapped[modern_tc] = v
    return remapped


def remap_vc_elig(vc_elig_old, vc_crosswalk):
    remapped = {}
    for old_vc, v in vc_elig_old.items():
        modern_vc = vc_crosswalk.get(old_vc)
        if modern_vc:
            remapped[modern_vc] = v
    return remapped


def remap_county_crosswalk(cc_elig_old, crosswalk):
    remapped = {}
    for old_code, v in cc_elig_old.items():
        name = crosswalk.get(old_code)
        if not name:
            continue
        modern_cc = MODERN_CC[name]
        if modern_cc not in remapped:
            remapped[modern_cc] = [0, 0, 0]
        remapped[modern_cc][0] += v[0]
        remapped[modern_cc][1] += v[1]
        remapped[modern_cc][2] += v[2]
    return remapped


def rollup_county(tc_elig):
    cc_elig = {}
    for tc, v in tc_elig.items():
        cc2, cc5 = tc[:2], tc[:5]
        cc = cc2 if cc2 in MUNICIPALITIES else cc5
        if cc not in cc_elig:
            cc_elig[cc] = [0, 0, 0]
        cc_elig[cc][0] += v[0]
        cc_elig[cc][1] += v[1]
        if v[2] is not None:
            cc_elig[cc][2] += v[2]
    return cc_elig


def main():
    sys.path.insert(0, ".")
    from loadjs import load
    nm = load("test.html", "const NM")
    nm_t, nm_v = nm["t"], nm["v"]

    all_tc = {}
    all_vc = {}
    all_cc = {}
    for year, path in PATHS.items():
        try:
            tc, vc = parse_year(path)
        except FileNotFoundError:
            print(f"// WARNING: {path} not found, skipping {year}", file=sys.stderr)
            continue
        tc_old_scheme = tc  # county rollup below needs the OLD-scheme keys (CROSSWALK_2008/2012
                            # are old_cc -> name, not modern-keyed), so capture before remapping
        if year in ELBASE_PATHS:
            tc_names, vc_names = parse_elbase_names(ELBASE_PATHS[year])
            crosswalk = CROSSWALK_2008 if year == 2008 else CROSSWALK_2012
            tc_cw = build_tc_crosswalk(tc_names, crosswalk, nm_t)
            vc_cw = build_vc_crosswalk(vc_names, tc_cw, nm_v)
            tc = remap_tc_elig(tc, tc_cw)
            vc = remap_vc_elig(vc, vc_cw)
            print(f"// {year}: TC crosswalk {len(tc_cw)}/{len(tc_names)} towns, "
                  f"VC crosswalk {len(vc_cw)}/{len(vc_names)} villages "
                  f"({len(vc_cw)/len(vc_names)*100:.1f}%)", file=sys.stderr)
        all_tc[year] = tc
        all_vc[year] = vc
        if year == 2008:
            all_cc[year] = remap_county_crosswalk(rollup_county(tc_old_scheme), CROSSWALK_2008)
        elif year == 2012:
            all_cc[year] = remap_county_crosswalk(rollup_county(tc_old_scheme), CROSSWALK_2012)
        else:
            all_cc[year] = rollup_county(tc)
        print(f"// {year}: {len(tc)} townships, {len(vc)} villages, {len(all_cc[year])} counties, "
              f"tc sum elig={sum(v[0] for v in tc.values())}", file=sys.stderr)

    print("// 不分區政黨(party-list) raw eligible-voter counts by year, county(CC)/township(TC)/")
    print("// village(VC) level -- [elig, validVotes, population], straight from CEC's elprof.csv")
    print("// (2008/2012/2016/2020/2024), remapped to modern tc/vc/cc codes at every level -- see")
    print("// build_legis_elig.py header for the 2008/2012 town/village name-based crosswalk detail")
    print("// (368/368 towns both years; villages: 82.0%/94.6% matched, real historical")
    print("// merges/renames left as an honest gap rather than guessed). Village-level entries")
    print("// always have population=0 (CEC's own file only fills that field at TC level and above,")
    print("// confirmed against 選舉資料庫格式.odt's own worked example). Same tc/vc/cc key convention")
    print("// as every other table in this project (tc=county+city+town, vc=tc+village, cc=2-digit")
    print("// for the 6 municipalities else 5-digit).")
    print("const LEGIS_CC_ELIG = " + json.dumps({str(y): d for y, d in all_cc.items()}, ensure_ascii=False) + ";")
    print("const LEGIS_TC_ELIG = " + json.dumps({str(y): d for y, d in all_tc.items()}, ensure_ascii=False) + ";")
    print("const LEGIS_VC_ELIG = " + json.dumps({str(y): d for y, d in all_vc.items()}, ensure_ascii=False) + ";")


if __name__ == "__main__":
    main()
