#!/usr/bin/env python3
"""Reconcile v2/data_career.js (build_v2_career.py) — History's 跳槽 tags.

    python3 tests/reconcile_v2_career.py

  K1 fixtures, checked by hand against public records (each a known career move):
     2008 立委 林淑芬 前議員 (臺北縣議員) · 2016 立委 吳思瑤 前議員 · 2020 立委 馬文君 前鎮長 (埔里) ·
     2018 臺中市長 盧秀燕 前立委 · 2022 臺北市長 蔣萬安 前立委 / 黃珊珊 前議員 · 2022 新北市長 林佳龍 前市長 (臺中) ·
     2022 臺北市長 蘇煥智 前縣長 (臺南縣) · 2022 宜蘭縣長 林姿妙 前鎮長 (羅東) · 2024 立委 傅崐萁 前縣長 (花蓮) ·
     2018 高雄市長 韓國瑜 前立委 (臺北縣, 1995 / 1998) · 2022 高雄市長 柯志恩 前不分區 (2016);
     no tag: 2014 臺北市長 柯文哲, 2022 新北市長 侯友宜 (never elected to another office)
  K2 every tooltip lists earlier years only (before the race), newest first, and its first office is the tag's
  K3 tags are one of the allowed words; every race / year the History modes show is present
Prints one line per failure and a final "N FAIL(s)".
"""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS = {'前不分區', '前立委', '前議員', '前市長', '前縣長', '前鄉長', '前鎮長', '前區長', '前鄉鎮長'}
FIX = [('L', '2008', '林淑芬', '前議員', '臺北縣議員'), ('L', '2016', '吳思瑤', '前議員', '臺北市議員'), ('L', '2020', '馬文君', '前鎮長', '埔里鎮長'),
       ('M', '2018', '盧秀燕', '前立委', '立委'), ('M', '2022', '蔣萬安', '前立委', '立委'), ('M', '2022', '黃珊珊', '前議員', '臺北市議員'),
       ('M', '2022', '林佳龍', '前市長', '臺中市長'), ('M', '2022', '蘇煥智', '前縣長', '臺南縣長'), ('M', '2022', '林姿妙', '前鎮長', '羅東鎮長'),
       ('L', '2024', '傅崐萁', '前縣長', '花蓮縣長'), ('M', '2018', '韓國瑜', '前立委', '立委'), ('M', '2022', '柯志恩', '前不分區', '不分區立委')]
NONE = [('M', '2014', '柯文哲'), ('M', '2022', '侯友宜')]


def main():
    d = json.loads(re.search(r'const CAREER = (\{.*\});', open(os.path.join(ROOT, 'v2', 'data_career.js'), encoding='utf-8').read(), re.S).group(1))
    fails = []
    for o, y, n, tag, first in FIX:
        e = d.get(o, {}).get(y, {}).get(n)
        if not e or e[0][1] != tag or first not in e[0][2].split('、')[0]: fails.append(('K1', o, y, n, e))
    for o, y, n in NONE:
        if d.get(o, {}).get(y, {}).get(n): fails.append(('K1 no tag', o, y, n, d[o][y][n]))
    total = 0
    for o, years in d.items():
        for y, names in years.items():
            for n, lst in names.items():
                for county, tag, tip in lst:
                    total += 1
                    if tag not in WORDS: fails.append(('K3 word', o, y, n, tag))
                    ys = [int(x.split(' ')[0]) for x in tip.split('、')]
                    if any(v >= int(y) + (1 if o in ('M', 'C', 'T', 'R', 'V') else 0) for v in ys) or ys != sorted(ys, reverse=True):
                        fails.append(('K2 years', o, y, n, tip))
    for o, ys in {'L': ('2008', '2012', '2016', '2020', '2024'), 'M': ('2014', '2018', '2022'), 'C': ('2014', '2018', '2022'),
                  'T': ('2014', '2018', '2022'), 'R': ('2014', '2018', '2022'), 'V': ('2014', '2018', '2022')}.items():
        for y in ys:
            if not d.get(o, {}).get(y): fails.append(('K3 race missing', o, y))
    print('tags', total)
    for f in fails: print('FAIL', *f)
    print('%d FAIL(s)' % len(fails))


if __name__ == '__main__':
    main()
