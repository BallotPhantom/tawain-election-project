#!/usr/bin/env python3
"""Parse CEC's public "年齡層選舉人人數統計" (age-bracket eligible-voter counts) for the
14th/15th/16th presidential elections (2016/2020/2024) into a clean data_age_bracket.js
table, keyed by county name (normalized 臺->台 to match this project's existing county-name
convention, e.g. PRES_COUNTY_2008 in test.html).

County-level only -- CEC does not publish this broken down by township/village, and only
these 3 elections have it (not 2008/2012), so AGE_BRACKET_COUNTY only has 3 year keys where
BASE5_YEARS has 5. Any code consuming this must handle missing years explicitly, not assume
every BASE5_YEARS entry has a match.

Re-run: python3 build_age_bracket.py > data_age_bracket.js
"""

import io
import json
import re
import subprocess
import sys
import urllib.parse
import zipfile

import pandas as pd

DIR_URL = "https://data.cec.gov.tw/?dir=%E5%B9%B4%E9%BD%A1%E5%B1%A4%E9%81%B8%E8%88%89%E4%BA%BA%E4%BA%BA%E6%95%B8%E7%B5%B1%E8%A8%88"
BASE = "https://data.cec.gov.tw/" + urllib.parse.quote("年齡層選舉人人數統計") + "/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

BRACKETS = ["20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90+"]

# CEC files/API sometimes use 臺, sometimes 台 -- normalize to 台 to match every other
# county-name table already in this project (PRES_COUNTY_2008 etc.).
def norm_county(name):
    return name.strip().replace("臺", "台")


def fetch(url):
    # CEC's CDN 308-redirect-loops without a same-site Referer, and its cert chain fails
    # python's strict ssl verification (curl tolerates it fine) -- shell out to curl rather
    # than relaxing python's SSL context.
    r = subprocess.run(
        ["curl", "-sL", "-A", UA, "-H", f"Referer: {DIR_URL}", "--max-time", "30", url],
        capture_output=True, check=True,
    )
    return r.stdout


def fetch_zip(election_no):
    url = BASE + urllib.parse.quote(f"第{election_no}任總統副總統年齡層選舉人人數.zip")
    return zipfile.ZipFile(io.BytesIO(fetch(url)))


def row_to_brackets(cells):
    """cells = [name, tot, m, f, b1tot, b1m, b1f, b2tot, b2m, b2f, ...] (28 cols total,
    8 brackets). Returns (name, total, {bracket: total_count})."""
    name = norm_county(str(cells[0]))
    total = int(cells[1])
    out = {}
    for i, b in enumerate(BRACKETS):
        col = 4 + i * 3  # skip name,tot,m,f; each bracket group is tot,m,f
        out[b] = int(cells[col])
    return name, total, out


def parse_14():
    """14th (2016): zip contains 欄位說明.odt + a CSV with no header row, 22 data rows.
    Numbers are quoted with thousands-comma separators (e.g. "2,175,986 "), so this needs
    real CSV parsing -- a naive line.split(',') would shred the quoted numbers themselves."""
    import csv as csv_mod

    z = fetch_zip(14)
    # 2nd entry is the CSV (1st is the field-description .odt)
    csv_bytes = z.read(z.infolist()[1])
    text = csv_bytes.decode("utf-8-sig")
    result = {}
    for row in csv_mod.reader(text.splitlines()):
        if not row or not row[0].strip():
            continue
        cells = [c.strip().replace(",", "") for c in row]
        name, total, brackets = row_to_brackets(cells)
        result[name] = {"total": total, "brackets": brackets}
    return result


def parse_ods_year(election_no):
    """15th (2020) and 16th (2024): zip contains a single .ods, data starts at the row
    right after the '總計' (national total) row -- found empirically at row index 5,
    with row 4 being the national total (used here only to cross-check, not stored)."""
    z = fetch_zip(election_no)
    info = z.infolist()[0]
    data = z.read(info)
    df = pd.read_excel(io.BytesIO(data), engine="odf", header=None)
    result = {}
    national_total = None
    for i in range(len(df)):
        row = df.iloc[i]
        name_cell = row[0]
        if not isinstance(name_cell, str):
            continue
        name_cell = name_cell.strip()
        if name_cell == "總計":
            national_total = int(row[1])
            continue
        if not name_cell or name_cell in ("年齡分層", "直轄市/縣(市)"):
            continue
        try:
            cells = [row[j] for j in range(28)]
            name, total, brackets = row_to_brackets(cells)
        except (ValueError, TypeError):
            continue
        result[name] = {"total": total, "brackets": brackets}
    check_sum = sum(v["total"] for v in result.values())
    if national_total is not None and check_sum != national_total:
        print(f"// WARNING: election {election_no} county sum {check_sum} != national total {national_total}", file=sys.stderr)
    return result


def main():
    data = {
        "2016": parse_14(),
        "2020": parse_ods_year(15),
        "2024": parse_ods_year(16),
    }
    for yr, counties in data.items():
        print(f"// {yr}: {len(counties)} counties, sum={sum(v['total'] for v in counties.values())}", file=sys.stderr)

    print("// CEC「年齡層選舉人人數統計」(age-bracket eligible-voter counts), county-level only,")
    print("// 14th/15th/16th presidential elections (2016/2020/2024) -- CEC does not publish")
    print("// this at township/village level, and only these 3 elections have it (not 2008/2012),")
    print("// so this only has 3 year keys where BASE5_YEARS has 5. Built by build_age_bracket.py.")
    print("const AGE_BRACKET_COUNTY = " + json.dumps(data, ensure_ascii=False, indent=2) + ";")


if __name__ == "__main__":
    main()
