#!/usr/bin/env python3
"""Rebuild v2/profile.html's presidential tables straight from CEC raw files.

    python3 build_profile_presidential.py [--dry-run]

Implements fixes 1-5 of AUDIT_PRESIDENTIAL_DATA_LINEAGE.md §7 (profile side only, V1 untouched):
  * county / township totals come from CEC's own county / township subtotal rows (never summed
    up from a village table), for all three years alike;
  * villages are keyed by CEC CODE (fixes the 竹山/草屯 中正里 name collision, adds 卡里布安村 and
    every Pingtung village);
  * joint polling stations (letter codes, e.g. 魚池 0A01「新城村、共和村」) are stored once per
    township in PRES_JOINT_STATIONS — never split or copied into member villages;
  * every contest carries valid/invalid/cast/elig, so turnout can be official cast/elig.

Rewritten in place (each literal located by bracket matching, everything else byte-identical):
  <SEED>.presidentialByYear (3 seeds), TOWNSHIP_CENTRAL_GOV[tc].presidentialByYear,
  PRES_CC_DATA, PRES_TC_DATA, PRES_VC_DATA, PRES_VC_LINEAGE, PRES_TURNOUT_CEC, PRES_JOINT_STATIONS.
Verify afterwards with tests/reconcile_presidential.py (must be 0 FAIL).
"""
import argparse, collections, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from reconcile_presidential import VD, FILES, PARTY, SEEDS, _rows  # noqa: E402
from cec_lib import tie_tail  # noqa: E402

PROFILE = os.path.join(ROOT, 'v2/profile.html')
COUNTIES = list(SEEDS)
YEARS = ['2016', '2020', '2024']


def load_year(year):
    """{('county'|'tc'|'vc'|'joint', code): {...}} for the three counties, from CEC subtotal rows."""
    d, suf = FILES[year]
    pname = {r[0].strip(): r[1].strip() for r in _rows(f'{VD}/{d}elpaty.csv')}
    pres, vice, cparty = {}, {}, {}
    for r in _rows(f'{VD}/{d}elcand{suf}.csv'):
        if r[0] != '00': continue
        no = r[5].strip()
        cparty[no] = PARTY.get(pname.get(r[7].strip(), ''), r[7].strip())
        (vice if r[15].strip() == 'Y' else pres)[no] = r[6].strip()
    ticket = {no: pres[no] + '／' + vice[no] for no in pres}
    names = {}
    for r in _rows(f'{VD}/{d}elbase{suf}.csv'):
        if r[0] + r[1] in COUNTIES and r[4] not in ('0000',) and r[3] != '000':
            names[r[0] + r[1] + r[3] + r[4]] = r[5].strip()

    def key(r):
        cc = r[0] + r[1]
        if cc not in COUNTIES or r[5].strip() not in ('0', '0000'): return None
        if r[3] == '000' and r[4] == '0000': return ('county', cc)
        if r[4] == '0000': return ('tc', cc + r[3])
        if r[4].isdigit() and r[4] != '9999': return ('vc', cc + r[3] + r[4][-3:])   # 9999 = numeric joint station
        return ('joint', cc + r[3] + '|' + r[4])
    out = {}
    for r in _rows(f'{VD}/{d}elprof{suf}.csv'):
        k = key(r)
        if k:
            e = out.setdefault(k, {'cands': {}})
            e.update(valid=int(r[6]), invalid=int(r[7]), cast=int(r[8]), elig=int(r[9]))
            if k[0] in ('vc', 'joint'): e['name'] = names.get(r[0] + r[1] + r[3] + r[4], '')
    for r in _rows(f'{VD}/{d}elctks{suf}.csv'):
        k = key(r)
        if k: out[k]['cands'][r[6].strip()] = int(r[7])
    for k, e in out.items():
        assert sum(e['cands'].values()) == e['valid'], (year, k)
        assert e['valid'] + e['invalid'] == e['cast'], (year, k)
        e['cands'] = sorted(({'name': ticket[no], 'party': cparty[no], 'votes': v} for no, v in e['cands'].items()),
                            key=lambda c: -c['votes'])
    return out


def same_village(a, b):   # = build_profile_mayor_vc.same_village (not imported: that module imports this one's SEEDS chain)
    return len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1


def margin(e):
    c = e['cands']
    return [c[0]['party'], round((c[0]['votes'] - c[1]['votes']) / e['valid'], 5)] + tie_tail((x['party'], x['votes']) for x in c) if e['valid'] else None


# ---- literal location (same string/comment-aware scan as reconcile_presidential.extract) ----
def match_close(s, i):
    """s[i] is '{' or '['; return index of its matching close bracket."""
    dep = 0; ins = None; esc = False; j = i
    while j < len(s):
        c = s[j]
        if ins:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == ins: ins = None
        elif c == '/' and s[j + 1] == '/': j = s.index('\n', j); continue
        elif c == '/' and s[j + 1] == '*': j = s.index('*/', j) + 2; continue
        elif c in '"\'`': ins = c
        elif c in '{[': dep += 1
        elif c in '}]':
            dep -= 1
            if dep == 0: return j
        j += 1
    raise ValueError('unbalanced at %d' % i)


def var_span(s, name):
    m = re.search(r'^[ \t]*var\s+' + name + r'\s*=\s*', s, re.M)
    if not m: return None
    return m.end(), match_close(s, m.end()) + 1


def depth1_keys(s, a, b):
    """Top-level keys of the object literal s[a:b] -> {key: (valueStart, valueEnd)}."""
    out = {}; j = a + 1
    key_re = re.compile(r'\s*(?://[^\n]*\n\s*|/\*.*?\*/\s*)*(?:"([^"]+)"|\'([^\']+)\'|([A-Za-z_$][\w$]*))\s*:\s*', re.S)
    while j < b - 1:
        m = key_re.match(s, j)
        if not m:
            j += 1; continue
        k = m.group(1) or m.group(2) or m.group(3); v = m.end()
        if s[v] in '{[': e = match_close(s, v) + 1
        else:
            e = v
            while s[e] not in ',}': e += 1
        out[k] = (v, e); j = e
        while j < b - 1 and s[j] in ' \t\r\n,': j += 1
        while s.startswith('//', j): j = s.index('\n', j) + 1;
        while j < b - 1 and s[j] in ' \t\r\n,': j += 1
    return out


def js(o): return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def contest(e):
    return {'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig'],
            'candidates': [dict(c) for c in e['cands']]}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    cec = {y: load_year(y) for y in YEARS}

    # Village identity guard: a code whose CEC name differs between years is a renumbered village —
    # keep only the years whose name matches the 2024 name (never attribute another village's votes).
    vnames = collections.defaultdict(dict)
    for y in YEARS:
        for (lvl, code), e in cec[y].items():
            if lvl == 'vc': vnames[code][y] = e['name']
    renamed = {c: n for c, n in vnames.items() if len(set(n.values())) > 1}
    for c, n in sorted(renamed.items()): print('INFO village name differs across years:', c, n)

    s = open(PROFILE, encoding='utf-8').read()
    edits = []   # (start, end, text)

    # 1. seeds + townships
    for cc, seed in SEEDS.items():
        a0, b0 = var_span(s, seed); v = depth1_keys(s, a0, b0)['presidentialByYear']
        edits.append((v[0], v[1], js({y: contest(cec[y][('county', cc)]) for y in YEARS})))
    a0, b0 = var_span(s, 'TOWNSHIP_CENTRAL_GOV'); tcg = depth1_keys(s, a0, b0)
    tcs = sorted({code for y in YEARS for (lvl, code) in cec[y] if lvl == 'tc'})
    assert set(tcs) == {k for k in tcg if k[:5] in COUNTIES}, set(tcs) ^ set(tcg)
    for tc in tcs:
        inner = depth1_keys(s, *tcg[tc])['presidentialByYear']
        edits.append((inner[0], inner[1], js({y: contest(cec[y][('tc', tc)]) for y in YEARS if ('tc', tc) in cec[y]})))

    # 2. margin tables + village lineage (by code)
    cc_data = {cc: {y: margin(cec[y][('county', cc)]) for y in YEARS} for cc in COUNTIES}
    tc_data = {tc: {y: margin(cec[y][('tc', tc)]) for y in YEARS if ('tc', tc) in cec[y]} for tc in tcs}
    vcs = sorted(vnames)
    vc_lin, vc_data, skipped = {}, {}, []
    for vc in vcs:
        for y in YEARS:
            e = cec[y].get(('vc', vc))
            if not e: continue
            # same rule as the other builders (build_profile_mayor_vc.same_village): one differing character is a
            # CEC spelling variant (彰化 大城鄉 臺西村 2020「台西村」, 彰化市 南瑤里/南瑶里), more is a re-issued code
            if vc in renamed and not same_village(e['name'], vnames[vc].get('2024', e['name'])):
                skipped.append((vc, y, e['name'])); continue
            if not e['valid']: continue
            vc_lin.setdefault(vc, {})[y] = {'candidates': [{'candidate': c['name'], 'party': c['party'], 'votes': c['votes']} for c in e['cands']],
                                            'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig']}
            vc_data.setdefault(vc, {})[y] = margin(e)
    for x in skipped: print('INFO skipped renumbered village-year:', x)

    # 3. joint polling stations, once per township (never split into villages)
    joint = {}
    for y in YEARS:
        for (lvl, code), e in cec[y].items():
            if lvl != 'joint': continue
            tc, li = code.split('|')
            joint.setdefault(tc, {}).setdefault(y, []).append(
                {'code': li, 'name': e['name'], 'total': e['valid'], 'invalid': e['invalid'], 'cast': e['cast'], 'elig': e['elig'],
                 'candidates': e['cands']})
    for tc in joint:
        for y in joint[tc]: joint[tc][y].sort(key=lambda r: r['code'])

    turnout = {cc: {y: {'elig': cec[y][('county', cc)]['elig'], 'cast': cec[y][('county', cc)]['cast'],
                        'invalid': cec[y][('county', cc)]['invalid'], 'cands': cec[y][('county', cc)]['cands']} for y in YEARS}
               for cc in COUNTIES}

    def replace_var(name, obj, multiline=False):
        sp = var_span(s, name)
        if not sp: raise SystemExit('missing var ' + name)
        if multiline:
            body = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in obj.items()) + '\n}'
        else:
            body = js(obj)
        edits.append((sp[0], sp[1], body))
    replace_var('PRES_CC_DATA', cc_data)
    replace_var('PRES_TC_DATA', tc_data)
    replace_var('PRES_VC_DATA', vc_data)
    replace_var('PRES_VC_LINEAGE', vc_lin, multiline=True)
    replace_var('PRES_TURNOUT_CEC', turnout, multiline=True)
    if var_span(s, 'PRES_JOINT_STATIONS'):
        replace_var('PRES_JOINT_STATIONS', joint, multiline=True)
    else:
        sp = var_span(s, 'PRES_VC_LINEAGE'); end = s.index(';', sp[1]) + 1
        decl = ('\n  // Joint polling stations (CEC letter-code rows such as 魚池鄉 0A01「新城村、共和村」): votes\n'
                '  // that cannot be attributed to one village. Stored once per township and NEVER split or\n'
                '  // copied into member villages, so villages + these rows == township exactly (CEC closure).\n'
                '  // Generated by build_profile_presidential.py.\n'
                '  var PRES_JOINT_STATIONS = ' + '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), js(v)) for k, v in joint.items()) + '\n};')
        edits.append((end, end, decl))

    # Old-vs-new coverage report for the map tables (no key may disappear silently)
    old = {}
    for name in ('PRES_CC_DATA', 'PRES_TC_DATA', 'PRES_VC_DATA'):
        a0, b0 = var_span(s, name); old[name] = set(depth1_keys(s, a0, b0))
    for name, new in (('PRES_CC_DATA', cc_data), ('PRES_TC_DATA', tc_data), ('PRES_VC_DATA', vc_data)):
        lost = old[name] - set(new)
        print(f'{name}: {len(old[name])} -> {len(new)} keys; dropped {sorted(lost)}')
        assert not lost, name
    print('villages with lineage:', collections.Counter(v[:5] for v in vc_lin))
    print('joint-station townships:', {tc: {y: len(r) for y, r in v.items()} for tc, v in joint.items()})

    edits.sort(key=lambda e: e[0])
    for x, y in zip(edits, edits[1:]): assert x[1] <= y[0], 'overlapping edits'
    for st, en, txt in reversed(edits): s = s[:st] + txt + s[en:]
    if a.dry_run: print('dry run, not written'); return
    open(PROFILE, 'w', encoding='utf-8').write(s); print('wrote', PROFILE)


if __name__ == '__main__':
    main()
