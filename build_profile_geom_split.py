"""Build v2/profile.html's slimmed geometry bundle from data_map_v64.js.

data_map_v64.js itself is NOT modified — test.html / council.html / live2026.html /
party_list.html still load it whole. Outputs are byte-identical line slices of it:

  data_map_v64_profile_core.js   CD, NM, TC_GJ — loaded up front by profile
  data_ed_gj.js                  the original `const ED_GJ = ...;` line   (Phase 2, lazy)
  data_ed_gj_2016.js             the original `const ED_GJ_2016 = ...;` line (Phase 2, lazy)

Not in profile's bundle at all:
  VD          served per county from data_vd/<cc>.js (build_profile_vd_split.py, Phase 3)
  TC_GJ_2016  never read by profile (runtime-verified 2026-10-08, AUDIT_WEBSITE_PERFORMANCE.md)

Re-run whenever data_map_v64.js changes (and re-run build_profile_vd_split.py too). Nothing
is written unless every output line matches its source line exactly, in source order.
"""
import os, sys

SRC = 'data_map_v64.js'
CORE = 'data_map_v64_profile_core.js'
SPLIT = {'ED_GJ': 'data_ed_gj.js', 'ED_GJ_2016': 'data_ed_gj_2016.js'}
EXCLUDE = {'VD', 'TC_GJ_2016'}


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    raw = open(SRC, 'rb').read()
    lines = raw.split(b'\n')
    if lines[-1] != b'':
        sys.exit('expected trailing newline')
    entries = []
    for ln in lines[:-1]:
        head = ln[:64].split(b' ')
        if head[0] != b'const' or head[2] != b'=':
            sys.exit('unexpected line shape: %r' % ln[:64])
        entries.append((head[1].decode(), ln + b'\n'))
    names = [n for n, _ in entries]
    for n in list(SPLIT) + sorted(EXCLUDE):
        if names.count(n) != 1:
            sys.exit('%s must appear exactly once, found %d' % (n, names.count(n)))

    out = {CORE: b''.join(ln for n, ln in entries if n not in SPLIT and n not in EXCLUDE)}
    for n, f in SPLIT.items():
        out[f] = dict(entries)[n]

    # integrity: every output is exactly the concatenation of its source lines, in order
    by_name = dict(entries)
    core_names = [n for n in names if n not in SPLIT and n not in EXCLUDE]
    if out[CORE] != b''.join(by_name[n] for n in core_names) or any(out[f] != by_name[n] for n, f in SPLIT.items()):
        sys.exit('integrity check failed — nothing written')

    for f, data in out.items():
        with open(f, 'wb') as fh:
            fh.write(data)
    print('%-30s %10d bytes  (%s)' % (CORE, len(out[CORE]), ', '.join(core_names)))
    for n, f in SPLIT.items():
        print('%-30s %10d bytes  (%s)' % (f, len(out[f]), n))
    print('excluded from profile bundle: %s' % ', '.join('%s %d bytes' % (n, len(by_name[n])) for n in sorted(EXCLUDE)))


if __name__ == '__main__':
    main()
