"""2026開票夜自動輪詢腳本——定期抓開票網站、驗證資料「正確」之後才覆寫data_live2026.js的
LIVE_TRACK_CC(縣市長層)跟LIVE_TRACK_TC(鄉鎮市區層)，不合格的一輪直接跳過、維持上一次成功
寫入的資料，不讓live2026.html的畫面被壞資料污染。

架構刻意分兩層：
  1. FETCHERS：抓資料+解析成統一格式，網站相關、開票夜當天確定實際網址後才會改/補寫。
     目前只有election.ltn.com.tw這個真的驗證過可行的來源(見CHANGELOG 2026-08-31)——它的
     縣市頁面本身就同時包含縣市層總表(候選人 中選會開票結果)跟逐鄉鎮市區的table.cecArea_*，
     一次fetch兩層資料都拿得到，不用打兩次。
  2. validate()/merge_and_write()：跟來源網站無關，同一套規則同時套用在CC層跟TC層，不用
     因為換了新聞來源就重寫這一層。

「正確」的定義（見validate()）：
  - 候選人清單非空，且每個候選人的票數都是非負整數
  - 跟上一輪已成功寫入的資料比較：同一位候選人的票數只能持平或增加，不能減少
    （減少通常代表抓到壞資料，或來源網站版本/年份跳掉）
  - 不是「全部候選人都是0票」（0票通常代表來源網站的即時票數欄位已經停更失效，
    而不是真的還沒開始開票——唯一的例外是投票剛截止的極早期，那個情境下用
    --allow-all-zero-first-run旗標明確放行，不要讓程式自己用猜的）
  - 候選人姓名清單要跟上一輪一致（人數對得起來）——名單忽然整批變了，很可能是
    抓到別的頁面/别的年份

用法：
  python3 poll_live2026.py --source ltn --once          # 手動測試單次執行
  python3 poll_live2026.py --source ltn --interval 60   # 每60~90秒輪詢一次(含隨機抖動)，持續執行到手動中斷

免責聲明／合規說明：本專案僅作為個人技術作品集與學習性質開發，不進行任何商業營利，也不會
持續對外提供服務。抓取方式是對公開網頁發出一般HTTP GET請求並解析回傳的HTML（跟一般瀏覽器
造訪同一頁面的方式相同），不繞過登入/驗證、不破解任何保護機制、不使用任何弱點——不構成
「入侵」。頻率上刻意壓低（輪詢間隔60秒起跳，含隨機抖動，不做高頻率請求），且不使用中選會
官方API（見上方架構說明）。**作品集展示時不應該持續對目標網站發送即時請求**——2026開票夜
當天實際執行完之後，畫面呈現（live2026.html）應該改讀當晚留下來的靜態歷史紀錄
（data_live2026.js當時的快照，或另存一份唯讀副本），不要在作品集上線後還無限期輪詢真實網站；
2022年彩排測試資料的備份檔`data_live2026_2022rehearsal.js.bak`就是同樣的用法示範。
"""
import argparse
import json
import random
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

PROJ = Path(__file__).parent
DATA_FILE = PROJ / 'data_live2026.js'
MARGIN_LOG_FILE = PROJ / 'data_live2026_margin_log.js'

sys.path.insert(0, str(PROJ))
from loadjs import load as load_json_style  # noqa: E402  只用在NM(已是雙引號JSON格式)上


def _extract_object_literal(src, varname):
    """從src(可能是純JS檔，也可能是像live2026.html那種夾在大量HTML/其他程式碼裡的檔案)裡，
    找到`varname`後面第一個平衡的{...}區塊，原樣切出來(不動引號/key格式)——跟loadjs.py的
    strip_comments_and_extract()同一個技巧(逐字元掃描、追蹤字串邊界跟大括號深度)，但故意
    不做loadjs.py那個「單引號轉雙引號」的正規化，因為這裡是要餵給真正的JS引擎eval，不是
    json.loads()，保留原始語法反而比較安全。"""
    idx = src.find(f'{varname} =')
    if idx == -1:
        idx = src.find(f'{varname}=')
    if idx == -1:
        raise RuntimeError(f'找不到 {varname} 的宣告')
    idx = src.find('{', idx)
    depth, i, in_str, esc, strch = 0, idx, False, False, ''
    out = []
    while i < len(src):
        c = src[i]
        if in_str:
            out.append(c)
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == strch:
                in_str = False
            i += 1
            continue
        if c in ('"', "'"):
            in_str, strch = True, c
            out.append(c)
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        out.append(c)
        i += 1
        if depth == 0 and c == '}':
            break
    return ''.join(out)


def load_js(path, varname):
    """讀取真正的JS物件常值(單引號字串、沒加引號的key，例如data_live2026.js手寫的格式，或
    live2026.html裡COUNCIL_SEATS這種夾在整個HTML檔案裡的const)——loadjs.py的load()內部靠
    json.loads()，只吃得下雙引號包住key的JSON格式，這種手寫格式的檔案會直接丟例外(第一次跑
    poll_live2026.py時就是這樣，try/except把例外吞掉、current變成空dict，結果把手動維護的
    ltn_cec/tvbs/setn來源全部覆寫消失——這裡改用真正的JS引擎(跟專案既有CLAUDE.md記載的
    osascript -l JavaScript語法檢查同一招)去eval，不會受限於字串是單引號還雙引號、key有沒有
    加引號。先用_extract_object_literal()只切出目標變數的物件常值本身(不管檔案其他部分是不是
    合法JS，例如live2026.html是整個HTML檔)，只eval這一小段，不用把整個大檔案(live2026.html
    ~90MB)整份丟進JS引擎。"""
    src = Path(path).read_text(encoding='utf-8')
    obj_literal = _extract_object_literal(src, varname)
    tmp = Path('/tmp') / f'_load_js_{varname}_{id(obj_literal)}.js'
    tmp.write_text(obj_literal, encoding='utf-8')
    try:
        script = (
            f"var s = $.NSString.stringWithContentsOfFileEncodingError('{tmp}', $.NSUTF8StringEncoding, null).js;"
            f"var f = new Function('return JSON.stringify(' + s + ');');"
            f"f();"
        )
        result = subprocess.run(
            ['osascript', '-l', 'JavaScript', '-e', script],
            capture_output=True, text=True, timeout=30,
        )
    finally:
        tmp.unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f'load_js({varname}) 失敗: {result.stderr.strip()}')
    return json.loads(result.stdout.strip())

CC_MAP = {
    '台北市': '63', '新北市': '65', '桃園市': '68', '台中市': '66', '台南市': '67', '高雄市': '64',
    '基隆市': '10017', '新竹市': '10018', '新竹縣': '10004', '苗栗縣': '10005', '花蓮縣': '10015',
    '宜蘭縣': '10002', '金門縣': '09020', '連江縣': '09007', '彰化縣': '10007', '南投縣': '10008',
    '雲林縣': '10009', '嘉義縣': '10010', '屏東縣': '10013', '台東縣': '10014', '澎湖縣': '10016',
}
LTN_SLUGS = {
    '台北市': 'Taipei', '新北市': 'NewTaipei', '桃園市': 'Taoyuan', '台中市': 'Taichung',
    '台南市': 'Tainan', '高雄市': 'Kaohsiung', '基隆市': 'Keelung', '新竹市': 'HsinchuCity',
    '新竹縣': 'HsinchuCounty', '苗栗縣': 'Miaoli', '花蓮縣': 'Hualien', '宜蘭縣': 'Yilan',
    '金門縣': 'Jinmen', '連江縣': 'LianJiang', '彰化縣': 'Changhua', '南投縣': 'Nantou',
    '雲林縣': 'Yunlin', '嘉義縣': 'ChiayiCounty', '屏東縣': 'Pingtung', '台東縣': 'Taitung',
    '澎湖縣': 'Penghu',
}


def _norm(s):
    return s.replace('臺', '台')  # NM.t用正體「臺」，新聞網站常用通用的「台」，同一個字的異體


def _build_tc_pool():
    """依cc代碼字首把NM.t(鄉鎮代碼->名稱)分組，逐縣市比對用——縣市內部才需要唯一，
    不同縣市可能同名(例如「東區」)"""
    # NM在2026-08-31的瘦身工程中被搬進共用的data_map_v64.js(不再是live2026.html自己內嵌的
    # 一段)，這裡跟著改路徑——2026-09-02發現這支腳本從瘦身當天起就一直讀不到NM，是這次要
    # 加領先幅度紀錄功能、實際跑一次--once測試才發現的既有壞掉，不是新功能造成的
    NM = load_json_style(str(PROJ / 'data_map_v64.js'), 'const NM')
    pool = {}
    for tc, name in NM['t'].items():
        cc = tc[:2] if tc[:2] in ('63', '64', '65', '66', '67', '68') else tc[:5]
        pool.setdefault(cc, {})[_norm(name)] = tc
    return pool


def _build_council_seats():
    """COUNCIL_SEATS是council.html/live2026.html既有的{dk: 應選席次}對照表——縣市議員選區
    比對時拿來當ground truth，見fetch_ltn()裡的用法。COUNCIL_SEATS本身是手寫const(不保證雙引號
    JSON相容)，用load_js()而不是load_json_style()讀。這張表只收錄一般(非原住民)選區——原住民
    選區的應選席次要另外從COUNCIL_IND_P_DISTS/COUNCIL_IND_M_DISTS查，見_build_ind_council_seats()。"""
    return load_js(str(PROJ / 'live2026.html'), 'COUNCIL_SEATS')


def _build_ind_council_seats():
    """平地/山地原住民選區的應選席次表——COUNCIL_IND_P_DISTS/COUNCIL_IND_M_DISTS本身是
    {cc: [{dist, seats, title, ...}, ...]}的陣列結構(不是COUNCIL_SEATS那種扁平{dk: seats})，
    這裡壓平成同一種{dk: seats}格式回傳，好跟COUNCIL_SEATS合併成一張含原住民選區的完整表，
    直接餵給_parse_council_page()當ground truth，不用另外寫一套比對邏輯。
    dk沿用LTN自己的選區編號——一般選區排完接著繼續編原住民選區，兩者數字不重疊(見live2026.html
    live-track council工作記錄)，所以可以跟一般選區共用同一個{cc}_{dist}格式的key，不會互相
    覆蓋。"""
    out = {}
    for varname in ('COUNCIL_IND_P_DISTS', 'COUNCIL_IND_M_DISTS'):
        table = load_js(str(PROJ / 'live2026.html'), varname)
        for cc, dists in table.items():
            for d in dists:
                out[f"{cc}_{d['dist']}"] = d['seats']
    return out


def http_get(url, max_retries=3):
    # Accept-Language：讓請求看起來像一般台灣瀏覽器的完整標頭之一，跟User-Agent同一個理由
    # （很多伺服器單純擋掉「明顯不是瀏覽器」的請求，不是針對本站）。
    # 刻意不加假的Referer（例如偽裝成從Google搜尋點進來）——那已經不是「看起來正常」，而是
    # 主動偽造來源去騙過對方在開票夜特別開啟的防禦機制(Cloudflare等)，性質不一樣，不做。
    #
    # 429/503單獨處理、指數backoff重試：開票夜對方伺服器負載最重的時候，剛好也是我們最需要
    # 資料的時候，這兩件事同時發生不是意外，是選舉夜這種場景本來就會撞在一起。純網路逾時等
    # 其他錯誤不在這裡重試——那類錯誤留給run_once()外層的輪詢interval自然重試，這裡只處理
    # 「伺服器明確說『你太快了』」的情況，因為這種情況值得馬上、在同一輪內就退讓後再試，而不是
    # 死等一整個interval（可能60~90秒）才有機會拿到這次原本就快到手的資料。
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    })
    for attempt in range(max_retries + 1):
        try:
            return urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='ignore')
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt >= max_retries:
                raise
            retry_after = e.headers.get('Retry-After') if e.headers else None
            if retry_after:
                try:
                    wait = float(retry_after)
                except ValueError:
                    wait = 5 * (2 ** attempt)
            else:
                wait = 5 * (2 ** attempt)  # 5, 10, 20秒
            wait += random.uniform(0, wait * 0.3)  # 加抖動，避免固定節奏被當成機器人訊號
            print(f'  [http_get] {url} 收到HTTP {e.code}(限流/伺服器忙碌)，'
                  f'{wait:.0f}秒後重試(第{attempt+1}/{max_retries}次)', file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f'http_get({url}) 重試{max_retries}次後仍然失敗')  # 理論上不會走到這裡


def _parse_cec_table(table):
    cands = []
    for tr in table.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) != 3:
            continue
        spans = [s.get_text(strip=True) for s in tds[1].find_all('span') if s.get_text(strip=True)]
        if not spans:
            continue
        name = spans[-1] if len(spans) >= 2 else spans[0]
        m = re.match(r'^([\d,]+)', tds[2].get_text(strip=True))
        if not m:
            continue
        cands.append({'name': name, 'votes': int(m.group(1).replace(',', ''))})
    return cands


def _parse_council_page(html, cc, council_seats, now_label):
    """縣市議員頁面(election.ltn.com.tw/{year}/realtime/{slug}/parliamentary)——一次fetch整個
    縣市所有選區(含原住民選區)的完整候選人得票表，用div[class*="table_"]分區塊，跟縣市長的
    table.cecArea_*是不同的HTML結構。LTN自己的選區編號從1開始，一般選區排完接著繼續編原住民
    選區——用council_seats的應選席次數當ground truth比對，數字對得起來才收，見專案memory
    2026-08-31的詳細說明(160個一般選區全部驗證吻合、0筆衝突)。council_seats參數現在是
    COUNCIL_SEATS(一般選區)跟COUNCIL_IND_P_DISTS/COUNCIL_IND_M_DISTS(原住民選區)合併後的
    完整表(見main裡_build_ind_council_seats()的合併)，這個函式本身不用因為原住民選區改寫，
    council_seats.get(dk)對兩種選區都查得到。"""
    soup = BeautifulSoup(html, 'html.parser')
    out = {}
    for box in soup.select('div[class*="table_"]'):
        header_text = box.get_text(' ', strip=True)[:60]
        m = re.match(r'第(\d+)選舉區', header_text)
        if not m:
            continue
        dist_no = int(m.group(1))
        dk = f'{cc}_{dist_no:02d}'
        expected_seats = council_seats.get(dk)
        if expected_seats is None:
            continue  # 合併後的council_seats(一般+原住民)都查無這個key，理論上不該發生，跳過保守處理
        seats_m = re.search(r'應選出名額[：:]\s*(\d+)\s*席', header_text)
        scraped_seats = int(seats_m.group(1)) if seats_m else None
        if scraped_seats is not None and scraped_seats != expected_seats:
            print(f'  [ltn] {dk} 應選席次對不起來(抓到{scraped_seats}，app預期{expected_seats})，跳過', file=sys.stderr)
            continue
        table = box.find('table', class_='CEC')
        if not table:
            continue
        cands = _parse_cec_table(table)
        if cands:
            out[dk] = {'cands': cands, 'source_label': '自由時報(即時)', 'ts': now_label}
    return out


# ── FETCHER: 自由時報 election.ltn.com.tw（2026-08-31驗證可行，見CHANGELOG）──
# 回傳 (cc_data, tc_data, ed_data)：
#   cc_data = { cc: {'cands':[...], 'source_label', 'ts'} }          縣市長
#   tc_data = { tc: {'cands':[...], 'source_label', 'ts'} }          鄉鎮市長(從縣市長頁面附帶抓到)
#   ed_data = { dk: {'cands':[...], 'source_label', 'ts'} }          縣市議員(SNTV選區，另一個頁面)
def fetch_ltn(tc_pool, council_seats, year=2026):
    now_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    cc_out, tc_out, ed_out = {}, {}, {}
    for county, slug in LTN_SLUGS.items():
        cc = CC_MAP[county]
        # --year 2022可以拿已經驗證過的2022真實資料測試整條fetch/驗證/寫入流程，不用等到
        # 2026年10/11月網站真的上線才能測——縣市頁面本身同時含縣市層總表跟逐鄉鎮市區
        # table.cecArea_*，一次fetch兩層資料都拿得到
        url = f'https://election.ltn.com.tw/{year}/realtime/{slug}'
        try:
            html = http_get(url)
        except Exception as e:
            print(f'  [ltn] {county} fetch失敗: {e}', file=sys.stderr)
            continue

        # 解析邏輯本身原本沒有try/except——只有上面的http_get()有包。網路請求失敗是意料中的事
        # （逐一guard），但「網站改版/CSS class名稱換了」這種解析階段的意外例外(AttributeError/
        # IndexError等)完全沒被擋，一旦某個縣市的頁面結構跟預期不同就會直接往上炸穿整個for迴圈，
        # 連還沒抓到的其他二十幾個縣市都會被拖累——這才是真正該擋的「單一媒體改版不能拖垮其他
        # 縣市」情境，不是網路逾時那種已經處理過的情況。這裡不用continue：即使縣市長/鄉鎮層解析
        # 失敗，下面縣市議員頁面是完全獨立的另一個fetch，還是要繼續嘗試，不要整個縣市都放棄。
        try:
            soup = BeautifulSoup(html, 'html.parser')

            h5s = soup.find_all('h5', class_='TIT')
            target = next((h for h in h5s if '中選會' in h.get_text()), None)
            if target:
                container = target.find_parent(['div', 'section'])
                county_table = container.find('table') if container else None
                if county_table:
                    cands = _parse_cec_table(county_table)
                    if cands:
                        cc_out[cc] = {'cands': cands, 'source_label': '自由時報(即時)', 'ts': now_label}
            else:
                print(f'  [ltn] {county} 找不到中選會開票結果區塊——網站結構可能變了，需要重新檢查', file=sys.stderr)

            pool = tc_pool.get(cc, {})
            for dtable in soup.select('table[class*="cecArea"]'):
                caption = dtable.find('caption')
                b = caption.find('b') if caption else None
                if not b:
                    continue
                tc = pool.get(_norm(b.get_text(strip=True)))
                if not tc:
                    continue  # 名稱對不到，跳過這個鄉鎮，不影響其他鄉鎮/縣市層資料
                cands = _parse_cec_table(dtable)
                if cands:
                    tc_out[tc] = {'cands': cands, 'source_label': '自由時報(即時)', 'ts': now_label}
        except Exception as e:
            print(f'  [ltn] {county} 縣市長/鄉鎮層解析失敗(網站結構可能變了): {e}', file=sys.stderr)

        # 縣市議員是完全不同的頁面(不是縣市長頁面的分頁/AJAX局部更新，是獨立URL)，另外抓一次
        council_url = f'https://election.ltn.com.tw/{year}/realtime/{slug}/parliamentary'
        try:
            council_html = http_get(council_url)
            ed_out.update(_parse_council_page(council_html, cc, council_seats, now_label))
        except Exception as e:
            print(f'  [ltn] {county} 縣市議員頁面fetch/解析失敗: {e}', file=sys.stderr)
    return cc_out, tc_out, ed_out


FETCHERS = {'ltn': fetch_ltn}


# ── 驗證層：跟來源網站無關，CC層/TC層共用同一套規則 ──
def _load_previous(varname, source_key='auto_poll'):
    """讀目前data_live2026.js裡這個腳本自己寫入過的來源(sourceKey預設'auto_poll')，當作
    「上一輪」的比較基準——不影響其他手動維護的來源(ltn_cec/tvbs/setn等)。這裡的try/except
    是安全的：只影響「上一輪拿來比對的基準」，讀失敗時退回「視為沒有上一輪資料」，不會導致
    資料被覆寫消失(真正會寫檔的_merge_layer故意不做同樣的except吞掉，見下方註解)。"""
    try:
        data = load_js(str(DATA_FILE), varname)
    except Exception:
        return {}
    prev = {}
    for key, entry in data.items():
        src = entry.get('sources', {}).get(source_key)
        if src:
            prev[key] = {c['n']: c['v'] for c in src['cands']}
    return prev


def validate(key, new_cands, prev_cands, allow_all_zero):
    if not new_cands:
        return False, '候選人清單是空的'
    if any(c['votes'] < 0 for c in new_cands):
        return False, '出現負票數，資料有問題'
    if not allow_all_zero and all(c['votes'] == 0 for c in new_cands):
        return False, '全部候選人都是0票——通常代表來源網站的即時票數欄位已停更失效，不是真的還沒開票'
    if prev_cands:
        prev_names = set(prev_cands.keys())
        new_names = {c['name'] for c in new_cands}
        if prev_names != new_names:
            return False, f'候選人名單跟上一輪對不起來（上次: {sorted(prev_names)}，這次: {sorted(new_names)}）'
        for c in new_cands:
            if c['votes'] < prev_cands.get(c['name'], 0):
                return False, f"{c['name']}的票數比上一輪少({c['votes']} < {prev_cands[c['name']]})，通常代表抓到壞資料"
    return True, 'ok'


def _merge_layer(varname, fresh, allow_all_zero, source_key='auto_poll'):
    prev = _load_previous(varname, source_key)
    # 故意不catch例外——如果讀不到目前檔案內容，代表沒辦法安全地做「只更新auto_poll這個key、
    # 保留其他手動維護來源」的合併，寧可讓這一輪整個失敗、下一輪interval再試，也不要用空dict
    # 硬寫，把ltn_cec/tvbs/setn等既有資料覆寫消失(第一版腳本就是這樣壞掉的，見load_js()的註解)
    current = load_js(str(DATA_FILE), varname)

    accepted, rejected = [], []
    for key, info in fresh.items():
        ok, reason = validate(key, info['cands'], prev.get(key), allow_all_zero)
        if not ok:
            rejected.append((key, reason))
            continue
        accepted.append(key)
        entry = current.setdefault(key, {'sources': {}, 'final': False})
        entry['sources'][source_key] = {
            'label': info['source_label'], 'ts': info['ts'],
            'cands': [{'n': c['name'], 'v': c['votes']} for c in info['cands']],
            'elected': None,
        }
    if accepted:
        _write_block(varname, current)
    return accepted, rejected


def _write_block(varname, data):
    """只覆寫data_live2026.js裡指定的const區塊(LIVE_TRACK_CC或LIVE_TRACK_TC)，其他區塊維持
    原樣不動——用簡單的文字區塊置換，不引入額外的JS序列化套件依賴。"""
    def esc(s):
        return s.replace('\\', '\\\\').replace("'", "\\'")

    lines = [f'const {varname} = {{']
    for key, entry in data.items():
        src_strs = []
        for skey, s in entry['sources'].items():
            cand_str = ', '.join(f"{{ n: '{esc(c['n'])}', v: {c['v']} }}" for c in s['cands'])
            elected = f"'{esc(s['elected'])}'" if s.get('elected') else 'null'
            src_strs.append(f"{skey}: {{ label: '{esc(s['label'])}', ts: '{esc(s['ts'])}', cands: [{cand_str}], elected: {elected} }}")
        lines.append(f'  "{key}": {{ sources: {{ {", ".join(src_strs)} }}, final: {str(entry.get("final", False)).lower()} }},')
    lines[-1] = lines[-1].rstrip(',')
    lines.append('};')
    new_block = '\n'.join(lines) + '\n'

    content = DATA_FILE.read_text(encoding='utf-8')
    start = content.index(f'const {varname} = {{')
    end = content.index('\n};', start) + 3
    content = content[:start] + new_block.rstrip('\n') + content[end:]
    DATA_FILE.write_text(content, encoding='utf-8')


_MARGIN_LOG_HEADER = (
    "// 2026即時開票——縣市長層領先幅度隨時間變化紀錄，逐來源各自記錄(跟LIVE_TRACK_CC的\n"
    "// sources[sourceKey]同一個巢狀慣例)，不合併成單一數字/單一條線——不同來源開票速度本來就\n"
    "// 未必相同，有些直接沿用中選會官方進度、有些是自己統計，混在一起畫成一條線會製造「精確度」\n"
    "// 的假象，也跟_liveTrack26Html()「每個來源各自一條bar」同一個設計意圖。目前這支腳本只有\n"
    "// auto_poll一個真正會自動寫入的來源(見FETCHERS)，但結構先比照多來源設計，以後真的多了\n"
    "// 別的自動來源也能各自累積自己的時間序列，不用重寫資料結構。不記錄黨籍：LIVE_TRACK_CC/\n"
    "// _parse_cec_table()本身都只有候選人姓名+票數(來源網頁沒結構化黨籍欄位)，前端畫圖時用\n"
    "// 既有的_liveCandParty(cc, ldrName)即時查，不在Python這端塞一個永遠是null的欄位。\n"
    "// 結構：{ [ccCode]: { [sourceKey]: [ { ts, ldrName, marginPct }, ... ], ... }, ... }\n"
)


def _ensure_margin_log_file():
    """LIVE2026_MARGIN_LOG不存在時建立空骨架——跟data_live2026.js的602 key骨架同樣邏輯，
    只是這裡的骨架是空物件(還沒有任何時間點的快照)，不是602個key，因為只在真的抓到資料、
    有margin可以算的當下才會新增一個key。"""
    if MARGIN_LOG_FILE.exists():
        return
    MARGIN_LOG_FILE.write_text(_MARGIN_LOG_HEADER + "const LIVE2026_MARGIN_LOG = {};\n", encoding='utf-8')


def _append_margin_log(cc_fresh, accepted_keys, source_key='auto_poll'):
    """縣市長層(cc)專屬——縣市議員層(ed)是多席次SNTV，沒有單一「領先方」的概念(見
    live2026.html既有註解)，鄉鎮層(tc)資料量太大、逐鄉鎮記錄時間序列narrative價值低，
    這個MVP範圍先只做縣市長層(2026-09-02使用者要求)。"""
    _ensure_margin_log_file()
    try:
        log = load_js(str(MARGIN_LOG_FILE), 'LIVE2026_MARGIN_LOG')
    except Exception as e:
        print(f'  領先幅度紀錄：讀取失敗，這一輪跳過寫入（{e}）', file=sys.stderr)
        return

    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    changed = False
    for key in accepted_keys:
        info = cc_fresh.get(key)
        if not info or not info.get('cands'):
            continue
        cands_sorted = sorted(info['cands'], key=lambda c: c['votes'], reverse=True)
        total = sum(c['votes'] for c in cands_sorted)
        if total <= 0 or len(cands_sorted) < 1:
            continue
        top = cands_sorted[0]
        second_votes = cands_sorted[1]['votes'] if len(cands_sorted) > 1 else 0
        margin_pct = round((top['votes'] - second_votes) / total * 100, 2)
        entry = {'ts': ts, 'ldrName': top['name'], 'marginPct': margin_pct}
        log.setdefault(key, {}).setdefault(source_key, []).append(entry)
        changed = True

    if not changed:
        return

    def esc(s):
        return s.replace('\\', '\\\\').replace("'", "\\'")

    lines = ['const LIVE2026_MARGIN_LOG = {']
    for key, by_source in log.items():
        src_strs = []
        for skey, entries in by_source.items():
            entry_strs = [f"{{ ts: '{esc(e['ts'])}', ldrName: '{esc(e['ldrName'])}', marginPct: {e['marginPct']} }}" for e in entries]
            src_strs.append(f'{skey}: [{", ".join(entry_strs)}]')
        lines.append(f'  "{key}": {{ {", ".join(src_strs)} }},')
    lines[-1] = lines[-1].rstrip(',')
    lines.append('};')
    new_content = _MARGIN_LOG_HEADER + '\n'.join(lines) + '\n'
    MARGIN_LOG_FILE.write_text(new_content, encoding='utf-8')


def run_once(source, allow_all_zero, tc_pool, council_seats, year=2026):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] 抓取中（來源={source}, year={year}）...')
    cc_fresh, tc_fresh, ed_fresh = FETCHERS[source](tc_pool, council_seats, year)

    def _do_layer(varname, fresh, label, truncate=None):
        try:
            accepted, rejected = _merge_layer(varname, fresh, allow_all_zero)
            print(f'  {label}：接受 {len(accepted)} 個，拒絕 {len(rejected)} 個')
            shown = rejected[:truncate] if truncate else rejected
            for key, reason in shown:
                print(f'    拒絕 {key}: {reason}')
            if truncate and len(rejected) > truncate:
                print(f'    ...還有{len(rejected)-truncate}筆拒絕，省略')
            return accepted
        except Exception as e:
            # 讀不到目前檔案內容時寧可整層跳過、下一輪interval再試，也不要用空資料硬寫覆蓋掉
            # 手動維護的來源——見_merge_layer()裡故意不吞例外的說明
            print(f'  {label}：這一輪失敗，跳過不寫入（{e}）', file=sys.stderr)
            return []

    cc_accepted = _do_layer('LIVE_TRACK_CC', cc_fresh, '縣市長層')
    tc_accepted = _do_layer('LIVE_TRACK_TC', tc_fresh, '鄉鎮市區層', truncate=10)  # 鄉鎮層數量多，避免洗版
    ed_accepted = _do_layer('LIVE_TRACK_ED', ed_fresh, '縣市議員層', truncate=10)

    if cc_accepted:
        try:
            _append_margin_log(cc_fresh, cc_accepted)
        except Exception as e:
            # 領先幅度紀錄是錦上添花的附加功能，寫入失敗不該連帶讓這一輪的主要開票資料
            # (LIVE_TRACK_CC/TC/ED，已經在上面_do_layer()各自成功寫入了)也被當成失敗
            print(f'  領先幅度紀錄：這一輪寫入失敗，不影響主要開票資料（{e}）', file=sys.stderr)

    return cc_accepted, tc_accepted, ed_accepted


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', choices=list(FETCHERS), default='ltn')
    ap.add_argument('--once', action='store_true', help='只執行一次，不進入輪詢迴圈')
    ap.add_argument('--interval', type=int, default=60,
                     help='輪詢間隔秒數下限(預設60)——實際每輪會在[interval, interval*1.5]之間'
                          '隨機取一個值再sleep，不要每次都固定間隔對同一批網站發請求')
    ap.add_argument('--allow-all-zero-first-run', action='store_true',
                     help='投票剛截止、真的全部都還沒開票時用這個旗標明確放行全0資料，平常不要開')
    ap.add_argument('--year', type=int, default=2026,
                     help='election.ltn.com.tw的年份路徑，預設2026；用--year 2022可以拿已驗證的'
                          '2022真實資料測試整條流程，不用等網站真的上線')
    args = ap.parse_args()

    print('載入鄉鎮市區代碼對照表跟縣市議員選區席次表...')
    tc_pool = _build_tc_pool()
    # 合併一般選區(COUNCIL_SEATS)跟原住民選區(COUNCIL_IND_P_DISTS/COUNCIL_IND_M_DISTS)的應選
    # 席次表成同一張——兩者key(dk格式)不重疊(LTN選區編號一般選區排完接著繼續編原住民選區)，
    # 合併後_parse_council_page()不用改，兩種選區都能查得到ground truth，原住民選區不再被
    # 跳過(舊版本的council_seats.get(dk)對原住民選區永遠是None，全部continue掉)
    council_seats = {**_build_council_seats(), **_build_ind_council_seats()}
    print(f'  共{sum(len(v) for v in tc_pool.values())}個鄉鎮市區、{len(council_seats)}個縣市議員選區(含原住民選區)')

    if args.once:
        run_once(args.source, args.allow_all_zero_first_run, tc_pool, council_seats, args.year)
    else:
        first = True
        while True:
            run_once(args.source, args.allow_all_zero_first_run and first, tc_pool, council_seats, args.year)
            first = False
            # 加隨機抖動而不是固定間隔：開票夜對方伺服器負載本來就重，固定的機械式間隔本身也是
            # 「明顯是機器人」的訊號之一，抖動一下比較像人類偶爾重新整理的節奏
            wait = random.uniform(args.interval, args.interval * 1.5)
            print(f'  ...等待 {wait:.0f} 秒後下一輪')
            time.sleep(wait)
