#!/usr/bin/env python3
"""Reconciliation tests: v2/profile.html presidential data vs CEC raw files (read-only).

    python3 tests/reconcile_presidential.py [--counties 10008,10004,10013,10007,10009,63000,10017,68000,64000,66000,65000,67000] [--years 2016,2020,2024]

Checks, per county / year (exit code 1 if any FAIL):
  C1  county tickets (profile <COUNTY>_SEED.presidentialByYear)  == CEC county subtotal row
  C2  township tickets (TOWNSHIP_CENTRAL_GOV[tc].presidentialByYear) == CEC township rows
  C3  village tickets (PRES_VC_LINEAGE[vc][year])                == CEC village rows (by CODE)
  C4  closure: sum(CEC villages incl. joint-station rows) == CEC township == CEC county
      (guards the source itself; joint-station rows have letter codes, e.g. 0A01)
  C5  coverage: every CEC village with a numeric code is present in PRES_VC_LINEAGE (except a code CEC
      later re-issued to a different village — reported as INFO);
      joint-station (letter-code) rows are listed separately — they cannot belong to one village
  C6  turnout basis: profile turnout = valid/LEGIS_CC_ELIG vs official cast/elig (reported, informational)

Profile tables are read by extracting their literals from v2/profile.html and evaluating them
with macOS JavaScriptCore (osascript), so the test sees exactly what the page ships.
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VD = os.path.join(ROOT, 'votedata/votedata/voteData')
FILES = {'2024': ('2024總統立委/總統/', ''), '2020': ('2020總統立委/總統/', ''), '2016': ('2016總統立委/總統/', '_P1')}
PARTY = {'中國國民黨': 'kmt', '民主進步黨': 'dpp', '親民黨': 'pfp', '台灣民眾黨': 'tpp'}
SEEDS = {'10008': 'NANTOU_SEED', '10004': 'HSINCHU_SEED', '10013': 'PINGTUNG_SEED', '10007': 'CHANGHUA_SEED', '10009': 'YUNLIN_SEED', '63000': 'TAIPEI_SEED', '10017': 'KEELUNG_SEED', '68000': 'TAOYUAN_SEED', '64000': 'KAOHSIUNG_SEED', '66000': 'TAICHUNG_SEED', '65000': 'NEWTAIPEI_SEED', '67000': 'TAINAN_SEED', '10015': 'HUALIEN_SEED', '10014': 'TAITUNG_SEED'}

def _rd(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    raise ValueError(path)
def _rows(path):
    from cec_lib import fix_rows   # JOINT_AS_VILLAGE (花蓮 民治里→民主里 2016)
    return fix_rows(path, list(csv.reader(_rd(path).splitlines())))

def load_cec(year, counties):
    d, suf = FILES[year]
    pname = {r[0].strip(): r[1].strip() for r in _rows(f'{VD}/{d}elpaty.csv')}
    cand = {}
    for r in _rows(f'{VD}/{d}elcand{suf}.csv'):
        cand.setdefault(r[5].strip(), PARTY.get(pname.get(r[7].strip(), ''), r[7].strip()))
    out = {}
    def key(r):
        cc = r[0] + r[1]
        if cc not in counties: return None
        sub = r[5].strip() in ('0', '0000')
        if not sub: return None
        if r[3] == '000' and r[4] == '0000': return ('county', cc)
        if r[4] == '0000': return ('tc', cc + r[3])
        li = r[4][-3:] if r[4][0] == '0' and r[4][1:].isdigit() else r[4]   # keep letter codes intact
        return ('vc', cc + r[3] + li)
    for r in _rows(f'{VD}/{d}elprof{suf}.csv'):
        k = key(r)
        if k: out.setdefault(k, {'t': {}})['prof'] = dict(valid=int(r[6]), invalid=int(r[7]), cast=int(r[8]), elig=int(r[9]))
    for r in _rows(f'{VD}/{d}elctks{suf}.csv'):
        k = key(r)
        if k: out.setdefault(k, {'t': {}})['t'][cand[r[6].strip()]] = int(r[7])
    return out

def load_profile():
    s = open(os.path.join(ROOT, 'v2/profile.html'), encoding='utf-8').read()
    def extract(t):
        m = re.search(r'^[ \t]*(?:var|const|let)\s+' + t + r'\s*=\s*', s, re.M); i = m.end(); dep = 0; ins = None; esc = False; j = i
        while j < len(s):
            c = s[j]
            if ins:
                if esc: esc = False
                elif c == '\\': esc = True
                elif c == ins: ins = None
                j += 1; continue
            if c == '/' and s[j + 1] == '/': j = s.index('\n', j); continue
            if c == '/' and s[j + 1] == '*': j = s.index('*/', j) + 2; continue
            if c in '"\'`': ins = c
            elif c in '{[': dep += 1
            elif c in '}]':
                dep -= 1
                if dep == 0: break
            j += 1
        return 'var %s = %s;' % (t, s[i:j + 1])
    names = list(SEEDS.values()) + ['TOWNSHIP_CENTRAL_GOV', 'PRES_VC_LINEAGE']
    js = '\n'.join(extract(t) for t in names) + "\nJSON.stringify({seed:{%s}, tcg:Object.fromEntries(Object.entries(TOWNSHIP_CENTRAL_GOV).map(([k,v])=>[k,v.presidentialByYear||null])), vcl:PRES_VC_LINEAGE});" % \
        ','.join("'%s':%s.presidentialByYear" % (cc, n) for cc, n in SEEDS.items())
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as fh: fh.write(js); p = fh.name
    try: return json.loads(subprocess.run(['osascript', '-l', 'JavaScript', p], capture_output=True, text=True, check=True).stdout)
    finally: os.unlink(p)

def load_legis_elig():
    for ln in open(os.path.join(ROOT, 'data_legis_elig.js'), encoding='utf-8'):
        m = re.match(r'const LEGIS_CC_ELIG = (.*);\s*$', ln)
        if m: return json.loads(m.group(1))

_NAMES = {}
def names_of(year):
    """CEC village names by 11-digit code for one year (elbase)."""
    if year not in _NAMES:
        d, suf = FILES[year]
        _NAMES[year] = {r[0] + r[1] + r[3] + r[4][-3:]: r[5].strip() for r in _rows(f'{VD}/{d}elbase{suf}.csv')
                        if r[3] != '000' and r[4] != '0000' and r[4].isdigit()}
    return _NAMES[year]

def tickets(entry, name_key):
    return {c['party']: c['votes'] for c in entry['candidates']} if entry else None
def diff(a, b): return {p: a.get(p, 0) - b.get(p, 0) for p in sorted(set(a) | set(b)) if a.get(p, 0) != b.get(p, 0)}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--counties', default='10008,10004,10013,10007,10009,63000,10017,68000,64000,66000,65000,67000'); ap.add_argument('--years', default='2016,2020,2024')
    a = ap.parse_args(); counties = a.counties.split(','); years = a.years.split(',')
    prof = load_profile(); elig = load_legis_elig(); fails = 0
    def report(ok, tag, msg):
        nonlocal fails
        fails += (not ok); print(('PASS ' if ok else 'FAIL ') + tag + ('' if ok else '  ' + msg))
    for y in years:
        cec = load_cec(y, set(counties))
        for cc in counties:
            tag = f'{cc} {y}'
            c = cec[('county', cc)]
            sd = prof['seed'][cc].get(y)
            report(sd is not None and tickets(sd, 'name') == c['t'], f'C1 {tag} county', f"profile-CEC {diff(tickets(sd, 'name') or {}, c['t'])} (profile valid {sd and sd['total']} vs CEC {c['prof']['valid']})")
            tcs = sorted(k[1] for k in cec if k[0] == 'tc' and k[1].startswith(cc))
            bad = [(tc, diff(tickets((prof['tcg'].get(tc) or {}).get(y), 'name') or {}, cec[('tc', tc)]['t'])) for tc in tcs]
            bad = [b for b in bad if b[1]]
            report(not bad, f'C2 {tag} townships ({len(tcs)})', f'{len(bad)} mismatched: {bad[:4]}')
            vcs = sorted(k[1] for k in cec if k[0] == 'vc' and k[1].startswith(cc))
            joint = [v for v in vcs if not v[8:].isdigit()]
            numeric = [v for v in vcs if v[8:].isdigit()]
            have = [v for v in numeric if (prof['vcl'].get(v) or {}).get(y)]
            badv = [(v, diff({x['party']: x['votes'] for x in prof['vcl'][v][y]['candidates']}, cec[('vc', v)]['t'])) for v in have]
            badv = [b for b in badv if b[1]]
            report(not badv, f'C3 {tag} village values ({len(have)} present)', f'{len(badv)} mismatched: {badv[:4]}')
            for tc in tcs:   # C4 closure in the CEC source itself
                vs = [v for v in vcs if v.startswith(tc)]
                s_ = collections.Counter(); [s_.update(cec[('vc', v)]['t']) for v in vs]
                if dict(s_) != cec[('tc', tc)]['t']: report(False, f'C4 {tag} closure {tc}', f'village sum {dict(s_)} != township {cec[("tc", tc)]["t"]}')
            st = collections.Counter(); [st.update(cec[('tc', t)]['t']) for t in tcs]
            report(dict(st) == c['t'], f'C4 {tag} closure townships→county', f'{dict(st)} vs {c["t"]}')
            missing = [v for v in numeric if v not in have]
            # A code CEC later re-issued to a different village (e.g. 東港 10013030023: 2016 大鵬里, 2024 福德里)
            # is deliberately not keyed by code for the older year — its votes stay in the township total only.
            reissued = [v for v in missing if names_of(y).get(v) and names_of('2024').get(v) and names_of(y)[v] != names_of('2024')[v]]
            for v in reissued: print(f'INFO C5 {tag} {v} code re-issued: {names_of(y)[v]} ({y}) vs {names_of("2024")[v]} (2024) — excluded by design')
            missing = [v for v in missing if v not in reissued]
            report(not missing, f'C5 {tag} village coverage ({len(numeric)} numeric-code villages)', f'{len(missing)} missing: {missing[:8]}')
            if joint: print(f'INFO C5 {tag} joint-station rows (letter codes, not attributable to one village): ' +
                            ', '.join(f"{v}={sum(cec[('vc', v)]['t'].values())}" for v in joint))
            if sd:
                p = c['prof']; le = (elig[y].get(cc) or elig[y][cc[:2]])[0]   # 直轄市 keyed '63' (legisKeyFromCD)
                print(f"INFO C6 {tag} turnout shown={sd['total'] / le * 100:.2f}% (valid/LEGIS_CC_ELIG) official={p['cast'] / p['elig'] * 100:.2f}% (cast/elig)")
    print(f'\n{fails} FAIL(s)'); sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
