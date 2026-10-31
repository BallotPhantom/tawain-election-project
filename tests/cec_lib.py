#!/usr/bin/env python3
"""Minimal, generic reader for CEC 選舉資料庫 csv files (elbase/elcand/elctks/elprof/elpaty).

Every election uses the same 6-column geography key: prv, city, area (選區), dept (鄉鎮), li (村里),
tbox (投開票所). Subtotal rows have tbox '0'/'0000'; county row dept '000' li '0000'; township row
li '0000'; village row li = 4 digits; joint polling stations (跨村里) carry a letter li (e.g. 0A01).

    E = Election('2024總統立委/區域立委')
    E.rows   {(cc, area, dept, li): {'valid','invalid','cast','elig','votes': {candNo: n}}}   subtotal rows only
    E.cand(row_key, no) -> {'name','party_name','elected'}                                   scope-aware lookup
    E.name   {(cc, area, dept, li): elbase name}

Old (pre-2014) county codes are passed through unchanged; callers map them (see OLD_CC).
Integrity checks run on load: every subtotal row's candidate votes sum to valid, valid+invalid == cast
(rows above the contest level, e.g. a districted race's county row, carry no candidate votes).
"""
import csv, os, re

VD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'votedata/votedata/voteData')
# pre-2014 臺灣省 county codes for the profile counties (verified by elbase names in 2008/2012)
OLD_CC = {'06003': '10004', '06006': '10008', '06009': '10013', '06005': '10007', '06007': '10009', '01000': '63000', '06013': '10017', '06002': '68000', '05000': '64000', '03000': '66000', '02000': '65000', '04000': '67000', '06011': '10015', '06010': '10014'}

# 直轄市: its 區 have appointed heads (no 鄉鎮市長 / 代表會 race, except 山地原住民區), and its 市長 / 議員
# races sit in separate CEC folders (直轄市市長 …, 2022 */prv) — callers pass both folders, see Election
MUNICIPALITIES = {'63000', '64000', '65000', '66000', '67000', '68000'}
# 省轄市 (基隆 / 新竹市 / 嘉義市): their 區 also have appointed heads (no 區長 / 區民代表 race), but their races sit
# in the ordinary 縣市 folders. DISTRICT_CITIES = every county whose townships are all 區 without a 鄉鎮市長 race.
PROVINCIAL_CITIES = {'10017', '10018', '10020'}
DISTRICT_CITIES = MUNICIPALITIES | PROVINCIAL_CITIES
# 直轄市山地原住民區 (地方制度法 §83-2): the exception inside DISTRICT_CITIES — an elected 區長 (CEC 直轄市區長, 2022 D2) and
# 區民代表 (直轄市區民代表, 2022 R3), i.e. the same races as a 鄉鎮 (from the 2022 D2 township rows)
INDIGENOUS_DISTRICTS = {'64000360': '茂林區', '64000370': '桃源區', '64000380': '那瑪夏區', '65000290': '烏來區', '66000290': '和平區', '68000130': '復興區'}
# 2008: today's 直轄市 that were then TWO counties (合併升格 2010-12-25). Its county-grain 2008 row is the sum of both old
# county subtotal rows (user decision 2026-10-17, 高雄) — exact, since the two old areas tile today's city. Townships map
# one-to-one by name (FORMER_TC_NAMES), so only the county row is summed.
# numeric 跨村里 code — CEC's joint polling stations are normally letter codes (0A01), this one is digits
JOINT_LI = '9999'


def tie_tail(pairs):
    """Winner tables are [party, margin(, extras…)]; when the first place is a tie between DIFFERENT parties (votes > 0)
    the tied parties (in the given order, winner first) are appended as a final list — [party, 0, …, ['kmt', 'dpp']] —
    so the map can draw both colours (user 2026-10-19: 同票 → 藍綠漸層). Same-party ties need no marker."""
    pairs = list(pairs); top = max((v for _, v in pairs), default=0)
    if top <= 0: return []
    ps = []
    for p, v in pairs:
        if v == top and p not in ps: ps.append(p)
    return [ps] if len(ps) > 1 else []

MERGED_2008 = {'64000': ('02000', '03012'), '66000': ('03006', '03019'), '67000': ('03011', '03021')}


def merge_rows(e0, e):
    """Sum two subtotal rows of the same race (votes by candidate number — national lists only, e.g. 2008 不分區)."""
    return {'valid': e0['valid'] + e['valid'], 'invalid': e0['invalid'] + e['invalid'], 'cast': e0['cast'] + e['cast'], 'elig': e0['elig'] + e['elig'],
            'votes': {n: e0['votes'].get(n, 0) + e['votes'].get(n, 0) for n in set(e0['votes']) | set(e['votes'])},
            'elected': set(e0.get('elected', ())) | set(e.get('elected', ()))}


HAS_TOWNSHIP_HEAD = lambda tc: tc[:5] not in DISTRICT_CITIES or tc in INDIGENOUS_DISTRICTS

# townships renamed since 2008/2012 (pre-2014 files are matched to today's codes by township name)
FORMER_TC_NAMES = {'10007100': ['員林鎮'],   # 員林鎮 → 員林市 (2015)
                   # 桃園縣 → 桃園市 (直轄市, 2014-12-25): every 鄉鎮市 became a 區 (楊梅 was 鎮 in 2008, 市 in 2012)
                   '68000010': ['桃園市'], '68000020': ['中壢市'], '68000030': ['大溪鎮'], '68000040': ['楊梅鎮', '楊梅市'],
                   '68000050': ['蘆竹鄉'], '68000060': ['大園鄉'], '68000070': ['龜山鄉'], '68000080': ['八德市'],
                   '68000090': ['龍潭鄉'], '68000100': ['平鎮市'], '68000110': ['新屋鄉'], '68000120': ['觀音鄉'], '68000130': ['復興鄉'],
                   # 高雄縣 (2008 code 03012) → 高雄市 (2010-12-25): every 鄉鎮市 became a 區; 三民鄉 → 那瑪夏區 (2008)
                   **{'64000' + d: [n] for d, n in [('120', '鳳山市'), ('130', '林園鄉'), ('140', '大寮鄉'), ('150', '大樹鄉'), ('160', '大社鄉'),
                       ('170', '仁武鄉'), ('180', '鳥松鄉'), ('190', '岡山鎮'), ('200', '橋頭鄉'), ('210', '燕巢鄉'), ('220', '田寮鄉'),
                       ('230', '阿蓮鄉'), ('240', '路竹鄉'), ('250', '湖內鄉'), ('260', '茄萣鄉'), ('270', '永安鄉'), ('280', '彌陀鄉'),
                       ('290', '梓官鄉'), ('300', '旗山鎮'), ('310', '美濃鎮'), ('320', '六龜鄉'), ('330', '甲仙鄉'), ('340', '杉林鄉'),
                       ('350', '內門鄉'), ('360', '茂林鄉'), ('370', '桃源鄉'), ('380', '三民鄉')]},
                   # 臺中縣 (2008 code 03006) → 臺中市 (2010-12-25): every 鄉鎮市 became a 區 (臺中市 03019's 8 區 kept their names)
                   **{'66000' + d: [n] for d, n in [
                       ('090', '豐原市'),
                       ('100', '東勢鎮'),
                       ('110', '大甲鎮'),
                       ('120', '清水鎮'),
                       ('130', '沙鹿鎮'),
                       ('140', '梧棲鎮'),
                       ('150', '后里鄉'),
                       ('160', '神岡鄉'),
                       ('170', '潭子鄉'),
                       ('180', '大雅鄉'),
                       ('190', '新社鄉'),
                       ('200', '石岡鄉'),
                       ('210', '外埔鄉'),
                       ('220', '大安鄉'),
                       ('230', '烏日鄉'),
                       ('240', '大肚鄉'),
                       ('250', '龍井鄉'),
                       ('260', '霧峰鄉'),
                       ('270', '太平市'),
                       ('280', '大里市'),
                       ('290', '和平鄉')]},
                   # 臺北縣 (2008 code 03001) → 新北市 (2010-12-25): every 鄉鎮市 became a 區 (2012 code 02000 — 2008's 02000 was 高雄市)
                   **{'65000' + d: [n] for d, n in [
                       ('010', '板橋市'),
                       ('020', '三重市'),
                       ('030', '中和市'),
                       ('040', '永和市'),
                       ('050', '新莊市'),
                       ('060', '新店市'),
                       ('070', '樹林市'),
                       ('080', '鶯歌鎮'),
                       ('090', '三峽鎮'),
                       ('100', '淡水鎮'),
                       ('110', '汐止市'),
                       ('120', '瑞芳鎮'),
                       ('130', '土城市'),
                       ('140', '蘆洲市'),
                       ('150', '五股鄉'),
                       ('160', '泰山鄉'),
                       ('170', '林口鄉'),
                       ('180', '深坑鄉'),
                       ('190', '石碇鄉'),
                       ('200', '坪林鄉'),
                       ('210', '三芝鄉'),
                       ('220', '石門鄉'),
                       ('230', '八里鄉'),
                       ('240', '平溪鄉'),
                       ('250', '雙溪鄉'),
                       ('260', '貢寮鄉'),
                       ('270', '金山鄉'),
                       ('280', '萬里鄉'),
                       ('290', '烏來鄉')]},
                   # 臺南縣 (2008 code 03011) → 臺南市 (2010-12-25): every 鄉鎮市 became a 區 (臺南市 03021's 6 區 kept their names;
                   # 2012 code 04000)
                   **{'67000' + d: [n] for d, n in [
                       ('010', '新營市'),
                       ('020', '鹽水鎮'),
                       ('030', '白河鎮'),
                       ('040', '柳營鄉'),
                       ('050', '後壁鄉'),
                       ('060', '東山鄉'),
                       ('070', '麻豆鎮'),
                       ('080', '下營鄉'),
                       ('090', '六甲鄉'),
                       ('100', '官田鄉'),
                       ('110', '大內鄉'),
                       ('120', '佳里鎮'),
                       ('130', '學甲鎮'),
                       ('140', '西港鄉'),
                       ('150', '七股鄉'),
                       ('160', '將軍鄉'),
                       ('170', '北門鄉'),
                       ('180', '新化鎮'),
                       ('190', '善化鎮'),
                       ('200', '新市鄉'),
                       ('210', '安定鄉'),
                       ('220', '山上鄉'),
                       ('230', '玉井鄉'),
                       ('240', '楠西鄉'),
                       ('250', '南化鄉'),
                       ('260', '左鎮鄉'),
                       ('270', '仁德鄉'),
                       ('280', '歸仁鄉'),
                       ('290', '關廟鄉'),
                       ('300', '龍崎鄉'),
                       ('310', '永康市')]}}


# A joint polling station that covers one of today's villages plus a village that no longer exists (merged into it):
# read as that village, so every builder / test sees it as the village's own row. 花蓮市 民治里 (59 voters) was merged
# into 民主里 before 2018; in 2016 both voted at one station A011 「民治里、民主里」 = today's 民主里 (user 2026-10-20;
# the 2016 平地/山地立委 files already key its votes as 0027 民主里 and only elprof says A011).
JOINT_AS_VILLAGE = {('2016總統立委', '10', '015', '010', 'A011'): ('0027', '民主里')}


# A township whose villages were redrawn wholesale (臺東市 2022: 46 → 38 里, most surviving 里 re-bounded): its village rows
# of earlier elections cannot be put on today's map, so they are dropped (township / county rows stay) — user 2026-10-20.
# Keys: every code the township had (2008 03014 / 2012 06010 use dept 001).
VILLAGES_REDRAWN = [({('10', '014', '010'), ('06', '010', '001'), ('03', '014', '001')}, 2022)]
# private-use characters CEC files carry for rare 字 (2016 關山 「里\uf073里」 = 里壠里)
PUA_FIX = {('10', '014'): {'\uf073': '壠'}}


def fix_rows(path, rows):
    """Apply JOINT_AS_VILLAGE, VILLAGES_REDRAWN and PUA_FIX to raw CEC rows (stripped or not) of the file at `path`."""
    st = lambda c: c.strip().lstrip("'")
    m = re.search(r'voteData/(\d{4})', path); yr = int(m.group(1)) if m else 9999
    for keys, cut in VILLAGES_REDRAWN:
        if yr < cut:
            rows[:] = [r for r in rows if not (len(r) > 4 and (st(r[0]), st(r[1]), st(r[3])) in keys and st(r[4]) not in ('0000', '0') and st(r[4]).isdigit())]
    if os.path.basename(path).startswith('elbase'):
        for r in rows:
            fx = PUA_FIX.get((st(r[0]), st(r[1]))) if len(r) > 5 else None
            if fx:
                for k, v in fx.items(): r[5] = r[5].replace(k, v)
    for (d, pr, ci, dept, li), (nli, nname) in JOINT_AS_VILLAGE.items():
        if d not in path: continue
        st = lambda c: c.strip().lstrip("'")
        for r in rows:
            if len(r) > 4 and st(r[0]) == pr and st(r[1]) == ci and st(r[3]) == dept and st(r[4]) == li:
                r[4] = nli
                if os.path.basename(path).startswith('elbase') and len(r) > 5: r[5] = nname
    return rows


def read(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try: txt = raw.decode(enc); break
        except UnicodeDecodeError: pass
    return fix_rows(path, [[c.strip().lstrip("'") for c in r] for r in csv.reader(txt.splitlines()) if r])


class Election:
    def __init__(self, d, suf='', cc_filter=None):
        if isinstance(d, (list, tuple)):   # several folders of one race (縣市 + 直轄市): merged, keys never overlap
            self.paty, self._cand, self.name, self.rows = {}, {}, {}, {}   # paty: per-folder codes, already resolved into _cand
            for part in (Election(x, suf, cc_filter) for x in d):
                for attr in ('_cand', 'name', 'rows'):
                    mine, theirs = getattr(self, attr), getattr(part, attr)
                    clash = [k for k in theirs if k in mine and mine[k] != theirs[k]]
                    assert not clash, (d, attr, clash[:3])
                    mine.update(theirs)
            return
        p = lambda f: os.path.join(VD, d, f + suf + '.csv') if os.path.exists(os.path.join(VD, d, f + suf + '.csv')) else os.path.join(VD, d, f + '.csv')
        self.paty = {r[0]: r[1] for r in read(p('elpaty'))}
        self._cand = {}
        for r in read(p('elcand')):
            if len(r) < 8: continue
            if len(r) > 15 and r[15] == 'Y': continue          # vice-presidential row
            self._cand[(tuple(r[0:5]), r[5])] = {'name': r[6], 'party_name': self.paty.get(r[7], ''), 'party_no': r[7],
                                                 'elected': len(r) > 14 and r[14] in ('*', '!')}
        self.name = {}
        for r in read(p('elbase')):
            self.name[(r[0] + r[1], r[2], r[3], r[4])] = r[5]
        keep = (lambda cc: cc in cc_filter) if cc_filter else (lambda cc: True)
        self.rows = {}
        for r in read(p('elprof')):
            if r[5] not in ('0', '0000') or not keep(r[0] + r[1]): continue
            self.rows[(r[0] + r[1], r[2], r[3], r[4])] = {'valid': int(r[6]), 'invalid': int(r[7]), 'cast': int(r[8]), 'elig': int(r[9]), 'votes': {}, 'elected': set()}
        for r in read(p('elctks')):
            if r[5] not in ('0', '0000') or not keep(r[0] + r[1]): continue
            k = (r[0] + r[1], r[2], r[3], r[4])
            if k not in self.rows: k = (r[0] + r[1], '00', r[3], r[4])   # 2008 不分區: elctks area 01, elprof area 00
            self.rows[k]['votes'][r[6]] = self.rows[k]['votes'].get(r[6], 0) + int(r[7])
            if len(r) > 9 and r[9] in ('*', '!'): self.rows[k]['elected'].add(r[6])   # '!' = 婦女保障名額
        for k, e in self.rows.items():
            # rows above the contest level (e.g. the county row of a districted race) have no votes
            assert not e['votes'] and e['valid'] + e['invalid'] == e['cast'] or sum(e['votes'].values()) == e['valid'] and e['valid'] + e['invalid'] == e['cast'], (d, k, e)

    def cand(self, key, no):
        """Candidate `no` as numbered for the contest containing subtotal row `key`."""
        cc, area, dept, li = key
        pr, ci = cc[:2], cc[2:]
        for scope in ((pr, ci, area, dept, li), (pr, ci, area, dept, '0000'), (pr, ci, area, '000', '0000'),
                      (pr, ci, '00', dept, li), (pr, ci, '00', dept, '0000'), (pr, ci, '00', '000', '0000'),
                      ('00', '000', area, '000', '0000'), ('00', '000', '00', '000', '0000')):
            c = self._cand.get((scope, no))
            if c: return c
        # county-wide (2014 縣市長) or nationwide (2008 不分區) lists filed under area 01 while the
        # vote rows use area 00: accept only an unambiguous match
        hit = [c for (scope, n), c in self._cand.items() if n == no and scope[3:] == ('000', '0000') and
               (scope[:2] == (pr, ci) or scope[0] == '00') and area == '00']
        if len(hit) == 1: return hit[0]
        raise KeyError((key, no, len(hit)))

    def vname(self, key):
        """elbase name of a row; some files key elbase under area 00 while vote rows carry the area."""
        return self.name.get(key) or self.name.get((key[0], '00', key[2], key[3]), '')

    def level(self, key):
        cc, area, dept, li = key
        if dept == '000': return 'area' if area != '00' else 'county'
        if li == '0000': return 'tc'
        # li '9999': a numeric joint polling station (2014 臺中 西屯 「福恩里、協和里」), not a village
        return 'vc' if li.isdigit() and li != JOINT_LI else 'joint'


# ── 立委缺額補選 (2026-10-23) ──────────────────────────────────────────────
# The by-election folders under votedata/votedata/立委補選(2019年後) are not the
# elbase/elcand/elctks/elprof set: prof.csv = one row per polling station
# (行政區別, 村里別, 投開票所別, 號次1..N, 有效A, 無效B, 投票數C, 已領未投D,
# 發出E, 用餘F, 選舉人數G, 投票率H) and cand.csv = 號次, 名字, 政黨名稱.
# ByElection rebuilds the regular Election shape (rows keyed (cc, area, dept, li)
# at county / area / tc / vc level, cand(), vname(), level()) so the profile
# builders and tests treat a by-election year like any other year. Township and
# village codes, and which district (area) a village belongs to, come from the
# next general election's own elbase (2024 for the 2023 by-elections): names
# are matched within the township, so a village that only exists in one of the
# two files is an error, never a guess.
BYE_DIR = os.path.join(os.path.dirname(VD), '立委補選(2019年後)')
BYELECTIONS = {
    # year: [(folder, county code, district number)]
    '2023': [('2023第10屆立法委員臺北市第3選舉區缺額補選', '63000', '03'),
             ('2023第10屆立法委員南投縣第2選舉區缺額補選', '10008', '02')],
}


# Village names the CEC by-election files lost to their encoding ('??'),
# each confirmed by elimination against the reference election's villages in
# that township (exactly one name unmatched on each side).
BYE_NAME_FIX = {('2023第10屆立法委員南投縣第2選舉區缺額補選', '竹山鎮', '??里'): '硘磘里',
                ('2023第10屆立法委員南投縣第2選舉區缺額補選', '名間鄉', '?下村'): '廍下村'}


class ByElection:
    def __init__(self, year, reference=('2024總統立委/區域立委', ''), cc_filter=None):
        ref = Election(reference[0], reference[1])
        self._cand, self.name, self.rows = {}, {}, {}
        for folder, cc, area in BYELECTIONS[year]:
            if cc_filter and cc not in cc_filter:
                continue
            d = os.path.join(BYE_DIR, folder)
            # township / village codes of this district from the reference election
            depts, villages = {}, {}
            for (rcc, rar, dept, li), nm in ref.name.items():
                if rcc != cc or dept == '000':
                    continue
                if li == '0000':
                    depts[nm.replace('台', '臺')] = dept
                elif rar == area:
                    villages[(dept, nm)] = li
            for r in read(os.path.join(d, 'cand.csv'))[1:]:
                if len(r) >= 3 and r[0].isdigit():
                    self._cand[(cc, area, r[0])] = {'name': r[1].strip(), 'party_name': r[2].strip(), 'party_no': '', 'elected': False}
            nos = sorted({no for (c, a, no) in self._cand if (c, a) == (cc, area)}, key=int)
            prof = read(os.path.join(d, 'prof.csv'))
            head = prof[0]
            for r in prof[1:]:
                if not r or not r[0].strip():
                    continue                                   # trailing blank / total row
                tname, vname = r[0].strip().replace('台', '臺'), r[1].strip()
                vname = BYE_NAME_FIX.get((folder, tname, vname), vname)
                dept = depts[tname]                             # KeyError = township not in the reference: stop
                li = villages[(dept, vname)]                   # KeyError = village not in this district: stop
                votes = {no: int(r[3 + i]) for i, no in enumerate(nos)}
                valid, invalid, cast, elig = (int(r[3 + len(nos) + j]) for j in (0, 1, 2, 6))   # A, B, C, G
                assert sum(votes.values()) == valid and valid + invalid == cast, (folder, r[:3])
                for key in ((cc, '00', '000', '0000'), (cc, area, '000', '0000'), (cc, area, dept, '0000'), (cc, area, dept, li)):
                    e = self.rows.setdefault(key, {'valid': 0, 'invalid': 0, 'cast': 0, 'elig': 0, 'votes': {}, 'elected': set()})
                    e['valid'] += valid; e['invalid'] += invalid; e['cast'] += cast; e['elig'] += elig
                    if key[1] != '00':                         # like a districted general election: no votes on the county row
                        for no, v in votes.items():
                            e['votes'][no] = e['votes'].get(no, 0) + v
                self.name[(cc, area, dept, li)] = vname
                self.name.setdefault((cc, area, dept, '0000'), tname)
            assert head[3:3 + len(nos)] == ['號次%s' % no for no in nos], (folder, head[:8])
            top = max(self.rows[(cc, area, '000', '0000')]['votes'].items(), key=lambda kv: kv[1])[0]
            for key, e in self.rows.items():
                if key[0] == cc and key[1] == area and key[2] == '000':
                    e['elected'].add(top)

    def cand(self, key, no):
        return self._cand[(key[0], key[1], no)]

    def vname(self, key):
        return self.name.get(key, '')

    def level(self, key):
        return Election.level(self, key)


def election_for(year, d, suf='', cc_filter=None):
    """Election or ByElection — by-election years are listed in BYELECTIONS."""
    return ByElection(year, cc_filter=cc_filter) if year in BYELECTIONS else Election(d, suf, cc_filter)
