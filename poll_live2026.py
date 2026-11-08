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
    '嘉義市': '10020',
}
# 來源類型標記——2026-09-11使用者提供的背景資料：台灣開票報導有兩種本質不同的來源，文字/網路
# 媒體(自由時報、聯合報、中央社、關鍵評論網等)幾乎全部只轉載中選會官方系統的數字，慢但準；電視台
# (TVBS、三立、東森、民視、台視等)開票前段主要靠自己派工讀生「報票」，快但可能被等比例灌票/事後
# 校正回歸。這個欄位純粹是說明來源類型，寫進data_live2026.js給前端顯示用，不影響任何抓取/驗證/
# 計算邏輯。自由時報屬於前者('net')；FETCHERS之後如果真的加了電視台來源，記得標'tv'。
ONLY_COUNTIES = None   # --county：只抓指定縣市（測試用）
LTN_SOURCE_LABEL = '自由時報(即時)'
LTN_SOURCE_TYPE = 'net'
# 黨籍：LTN 每位候選人後面有政黨圖示 assets/images/politicalParty/t{N}_m.png（2026-11-05 加，使用者：「政黨還是要
# 自動分類啦」）。對照表是拿 2022 年 21 縣市議員頁（1,638 位候選人）逐一對中選會黨籍（council_2022.js＋原住民選區）
# 得出來的：對得上名冊的 1,597 位裡 1,592 位一致（99.7%），5 位不一致（t99 標無黨但中選會是國民黨 2、時代力量 1；
# t2 標國民黨但中選會是無黨 1；t5 對無黨 1）。這是 LTN 自己的編號，2026 開票網站上線後要再對一次。
# 沒有圖示或代碼不在表裡的候選人 → 'other'（不猜）。
LTN_PARTY = {'t1': 'dpp', 't2': 'kmt', 't99': 'ind', 't11': 'tpp', 't7': 'npp', 't8': 'tsr', 't13': 'spgp', 't6': 'np',
             't5': 'npa', 't16': 'gp', 't4': 'pfp', 't3': 'tsu', 't10': 'lp', 't17': 'sdp', 't12': 'szmd'}
LTN_SLUGS = {
    '台北市': 'Taipei', '新北市': 'NewTaipei', '桃園市': 'Taoyuan', '台中市': 'Taichung',
    '台南市': 'Tainan', '高雄市': 'Kaohsiung', '基隆市': 'Keelung', '新竹市': 'HsinchuCity',
    '新竹縣': 'HsinchuCounty', '苗栗縣': 'Miaoli', '花蓮縣': 'Hualien', '宜蘭縣': 'Yilan',
    '金門縣': 'Jinmen', '連江縣': 'LianJiang', '彰化縣': 'Changhua', '南投縣': 'Nantou',
    '雲林縣': 'Yunlin', '嘉義縣': 'ChiayiCounty', '屏東縣': 'Pingtung', '台東縣': 'Taitung',
    '澎湖縣': 'Penghu',
    # 嘉義市 2026-11-05 補上（原本漏掉：2022 嘉義市長延期改選，當初建清單時沒放，連帶 2022 嘉義市議員 23 席也沒抓）。
    # 網址 election.ltn.com.tw/2022/realtime/ChiayiCity/parliamentary 實測可用（第1、2選舉區、40 位候選人）
    '嘉義市': 'ChiayiCity',
}


def _clean_name(n):
    """候選人姓名正規化（2026-11-07）：中央社有些姓名用 CJK 相容字（葉、劉、林、李、阮… 長得一樣、編碼不同，例如
    U+F96E），頁面用姓名查黨籍會查不到——NFKC 轉回一般字；中文字之間的空白（「李　問」）拿掉，拼音前的空白保留。"""
    import unicodedata
    # only the compatibility-ideograph blocks (NFKC on the whole string would also turn 「．」 into 「.」 and break
    # indigenous names against the roster)
    n = ''.join(unicodedata.normalize('NFKC', ch) if (0xF900 <= ord(ch) <= 0xFAFF or 0x2F800 <= ord(ch) <= 0x2FA1F) else ch
                for ch in (n or '')).replace('\u3000', ' ').strip()
    return re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', n)


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
        # 黨籍圖示與當選標記（見 LTN_PARTY 的註解）；沒有就是 None / False，不影響原本的姓名與票數
        img = tds[1].find('img', class_='pp')
        pm = re.search(r'politicalParty/([^/_.]+)', img.get('src', '')) if img else None
        party = LTN_PARTY.get(pm.group(1), 'other') if pm else None
        elected = bool(tds[0].find('span', class_='elected'))
        cands.append({'name': _clean_name(name), 'votes': int(m.group(1).replace(',', '')), 'party': party, 'elected': elected})
    return cands


def _parse_prog(text):
    """「98 / 98 （已開 / 應開）投開票所」→ [98, 98]；找不到就 None"""
    m = re.search(r'(\d+)\s*/\s*(\d+)\s*（已開\s*/\s*應開）', text or '')
    return [int(m.group(1)), int(m.group(2))] if m else None


def _build_council_seats_2026():
    """2026（115年）的應選席次表（一般＋原住民，{dk: 應選席次}）——v2/data_council_seats_2026.js，由
    build_v2_council_seats_2026.py 從中選會 115/8/20 中選務字第1153150253號公告產生（使用者 2026-11-07 要求核對
    2026 席次）。2026 跟 2022 不同：新北 66→68、桃園 63→65、彰化 54→55、雲林 43→45、基隆 31→32、新竹市 34→35，
    新竹縣竹北市拆成兩區、之後的選區全部重編號，多個縣市選區間席次移動，新增彰化山地、雲林平地／山地、基隆山地、
    新竹市山地原住民選區。拿 2022 的表比對 2026 頁面會把這些選區當成「應選席次對不起來」整區跳過。"""
    s = (PROJ / 'v2' / 'data_council_seats_2026.js').read_text(encoding='utf-8')
    i = s.index('const COUNCIL_SEATS_2026 = ') + len('const COUNCIL_SEATS_2026 = ')
    table = json.loads(s[i:s.index(';\n', i)])
    return {dk: v[1] for dk, v in table.items()}


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
            out[dk] = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                       'prog': _parse_prog(box.get_text(' ', strip=True))}
    return out


# ── FETCHER: 自由時報 election.ltn.com.tw（2026-08-31驗證可行，見CHANGELOG）──
# 回傳 (cc_data, tc_data, ed_data)：
#   cc_data = { cc: {'cands':[...], 'source_label', 'ts'} }          縣市長
#   tc_data = { tc: {'cands':[...], 'source_label', 'ts'} }          鄉鎮市長(從縣市長頁面附帶抓到)
#   ed_data = { dk: {'cands':[...], 'source_label', 'ts'} }          縣市議員(SNTV選區，另一個頁面)
# 2026-11-07 改版（使用者 2026-11-07 要求拿 2022 開票數字測整條 pipeline 時發現）：自由時報開票頁改成「網頁只是空殼，
# 票數由頁面自己的 JS 去讀 /{year}/ajax_vote/outer/cecVote_{1 縣市長|2 縣市議員}_{縣市編號}.txt」（頁面 assets/js/
# realtime_open_index.js 的 getCectimeHtml）；11/05 還在 HTML 表格裡的 2022 數字，11/07 已經從 HTML 跟這些檔案都拿掉
# （回 {"code":200,"data":null}）。格式用 web.archive.org 存的 2022 年 12 月檔案確認：
#   縣市長 data.cec.mayor = {over_all:[候選人], other:{NowPoNumber, AllPoNumber}, area:{R_No:{des 鄉鎮名, other, data:[候選人]}}}
#   縣市議員 data.cec = {R_No:{data:[候選人 (RName「第N選舉區」)], other:{NowPoNumber, AllPoNumber, range_detail「應選出名額：N席…」}}}
#   候選人 = {Name, V_Num, PNo（政黨圖示編號，同 LTN_PARTY 的 t{N}）, Elected (1 當選), …}
# 讀的是頁面本身公開讀取的同一批檔案，沒有繞過任何防護；縣市編號（pageRno）從縣市頁面讀一次後記住，之後每輪每縣市
# 只抓兩個小檔。檔案讀不到（data null／404）時退回原本解析 HTML 表格的做法。
LTN_RNO = {}   # 縣市 -> 自由時報的縣市編號（頁面 let pageRno = 'N'）


def _ltn_rno(html):
    m = re.search(r"pageRno\s*=\s*'(\d+)'", html or '')
    return m.group(1) if m else None


def _ltn_feed(year, kind, rno):
    """kind 1 縣市長／2 縣市議員；有資料回傳 data.cec，沒有（data null、非 JSON、404）回傳 None"""
    try:
        txt = http_get(f'https://election.ltn.com.tw/{year}/ajax_vote/outer/cecVote_{kind}_{rno}.txt')
        d = json.loads(txt)
    except Exception:
        return None
    return (d.get('data') or {}).get('cec') or None


def _feed_cands(rows):
    out = []
    for x in rows or []:
        try:
            v = int(str(x.get('V_Num', '')).replace(',', ''))
        except ValueError:
            continue
        pno = str(x.get('PNo') or '').strip()
        out.append({'name': _clean_name(x.get('Name')), 'votes': v,
                    'party': LTN_PARTY.get('t' + pno, 'other') if pno else None, 'elected': str(x.get('Elected')) == '1'})
    return [c for c in out if c['name']]


def _feed_prog(other):
    try:
        return [int(other['NowPoNumber']), int(other['AllPoNumber'])]
    except (KeyError, TypeError, ValueError):
        return None


def _parse_feed_mayor(cec, cc, pool, now_label):
    m = cec.get('mayor') or {}
    cc_entry, tcs = None, {}
    cands = _feed_cands(m.get('over_all'))
    if cands:
        cc_entry = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                    'prog': _feed_prog(m.get('other'))}
    for area in (m.get('area') or {}).values():
        tc = pool.get(_norm((area.get('des') or '').strip()))
        if not tc:
            continue
        cands = _feed_cands(area.get('data'))
        if cands:
            tcs[tc] = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                       'prog': _feed_prog(area.get('other'))}
    return cc_entry, tcs


def _parse_feed_council(cec, cc, council_seats, now_label):
    out = {}
    for d in cec.values():
        rows = d.get('data') or []
        if not rows:
            continue
        m = re.match(r'第(\d+)選舉區', rows[0].get('RName') or '')
        if not m:
            continue
        dk = f'{cc}_{int(m.group(1)):02d}'
        expected = council_seats.get(dk)
        if expected is None:
            print(f'  [ltn] {dk} 不在席次表裡，跳過', file=sys.stderr)
            continue
        sm = re.search(r'應選出名額[：:]\s*(\d+)\s*席', (d.get('other') or {}).get('range_detail') or '')
        if sm and int(sm.group(1)) != expected:
            print(f'  [ltn] {dk} 應選席次對不起來(抓到{sm.group(1)}，app預期{expected})，跳過', file=sys.stderr)
            continue
        cands = _feed_cands(rows)
        if cands:
            out[dk] = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                       'prog': _feed_prog(d.get('other'))}
    return out


def _parse_mayor_page(html, county, cc, pool, now_label):
    """舊版做法：縣市頁面 HTML 裡的中選會表格（2022 年 11/05 以前的頁面）"""
    cc_entry, tcs = None, {}
    soup = BeautifulSoup(html, 'html.parser')
    h5s = soup.find_all('h5', class_='TIT')
    target = next((h for h in h5s if '中選會' in h.get_text()), None)
    if target:
        container = target.find_parent(['div', 'section'])
        county_table = container.find('table') if container else None
        if county_table:
            cands = _parse_cec_table(county_table)
            if cands:
                cc_entry = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                            'prog': _parse_prog(container.get_text(' ', strip=True))}
    else:
        print(f'  [ltn] {county} 找不到中選會開票結果區塊——網站結構可能變了，需要重新檢查', file=sys.stderr)
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
            tcs[tc] = {'cands': cands, 'source_label': LTN_SOURCE_LABEL, 'source_type': LTN_SOURCE_TYPE, 'ts': now_label,
                       'prog': _parse_prog(dtable.get_text(' ', strip=True))}
    return cc_entry, tcs


def fetch_ltn(tc_pool, council_seats, year=2026):
    now_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    cc_out, tc_out, ed_out = {}, {}, {}
    slugs = {k: v for k, v in LTN_SLUGS.items() if not ONLY_COUNTIES or k in ONLY_COUNTIES}
    for n_county, (county, slug) in enumerate(slugs.items()):
        if n_county:
            time.sleep(random.uniform(0.8, 1.6))   # 縣市之間稍停，不連續快速打同一個網站
        cc = CC_MAP[county]
        pool = tc_pool.get(cc, {})
        url = f'https://election.ltn.com.tw/{year}/realtime/{slug}'
        html = None
        rno = LTN_RNO.get(county)
        if not rno:   # 第一輪：縣市頁面讀一次縣市編號
            try:
                html = http_get(url)
            except Exception as e:
                print(f'  [ltn] {county} fetch失敗: {e}', file=sys.stderr)
                continue
            rno = _ltn_rno(html)
            if rno:
                LTN_RNO[county] = rno
            else:
                print(f'  [ltn] {county} 頁面找不到縣市編號(pageRno)——網站結構可能變了', file=sys.stderr)
        # 單一縣市的解析意外（網站改版）不能拖垮其他縣市：每一段各自 try
        got_mayor = False
        if rno:
            try:
                cec = _ltn_feed(year, 1, rno)
                if cec:
                    c1, t1 = _parse_feed_mayor(cec, cc, pool, now_label)
                    if c1:
                        cc_out[cc] = c1; got_mayor = True
                    tc_out.update(t1)
            except Exception as e:
                print(f'  [ltn] {county} 縣市長資料檔解析失敗: {e}', file=sys.stderr)
        if not got_mayor:   # 退回 HTML 表格
            try:
                if html is None:
                    html = http_get(url)
                c1, t1 = _parse_mayor_page(html, county, cc, pool, now_label)
                if c1:
                    cc_out[cc] = c1
                tc_out.update(t1)
            except Exception as e:
                print(f'  [ltn] {county} 縣市長/鄉鎮層解析失敗(網站結構可能變了): {e}', file=sys.stderr)
        got_council = False
        if rno:
            try:
                cec = _ltn_feed(year, 2, rno)
                if cec:
                    e1 = _parse_feed_council(cec, cc, council_seats, now_label)
                    ed_out.update(e1); got_council = bool(e1)
            except Exception as e:
                print(f'  [ltn] {county} 縣市議員資料檔解析失敗: {e}', file=sys.stderr)
        if not got_council:   # 退回縣市議員頁面 HTML
            council_url = f'https://election.ltn.com.tw/{year}/realtime/{slug}/parliamentary'
            try:
                council_html = http_get(council_url)
                ed_out.update(_parse_council_page(council_html, cc, council_seats, now_label))
            except Exception as e:
                print(f'  [ltn] {county} 縣市議員頁面fetch/解析失敗: {e}', file=sys.stderr)
    return cc_out, tc_out, ed_out


# ── 中央社、TVBS（2026-11-07 加，使用者：「找三個開票網站，一個主要兩個備案；電視台自己開的票都要有自己的分頁」）──
# 每個來源寫進 data_live2026.js 各自的 source key（SOURCE_KEY），數字不合併；robots.txt／服務條款的檢查見
# 專案記憶 reference_live_results_sources。
# 中央社：開票頁 /project/{CNA_PROJECT[year]}/ 讀同資料夾的 api/council.json（議員各選區）與 api/city.json（縣市長＋
#   各鄉鎮＋村里，2022 年 18.8 MB——所以縣市長層最快 CNA_CITY_EVERY 秒才抓一次）。中選會數字。2026 的資料夾名稱
#   是照 2022 的命名猜的，開票頁上線時要確認。
# TVBS：開票專區讀 /events/taiwan_election/json/{year}.json，voteCountingList[0]＝縣市長 22 縣市、[1]＝議員 215 區，
#   含黨籍名稱、當選。票數是「TVBS開票中心」自己的計票（電視台），不是中選會數字。沒有投開票所進度。
CNA_PROJECT = {2022: '20221126-election-live', 2026: '20261128-election-live'}
CNA_CITY_EVERY = 180
_CNA_LAST_CITY = [0.0]
PARTY_NAME = {   # 來源寫的政黨全名／簡稱 → 頁面用的代碼（其他 → 'other'）
    '中國國民黨': 'kmt', '國民黨': 'kmt', '民主進步黨': 'dpp', '民進黨': 'dpp', '台灣民眾黨': 'tpp', '民眾黨': 'tpp',
    '無黨籍': 'ind', '無黨籍及未經政黨推薦': 'ind', '無': 'ind', '時代力量': 'npp', '台灣基進': 'tsr', '親民黨': 'pfp',
    '台灣團結聯盟': 'tsu', '台聯': 'tsu', '綠黨': 'gp', '新黨': 'np', '無黨團結聯盟': 'npa', '小民參政歐巴桑聯盟': 'spgp',
    '勞動黨': 'lp', '社會民主黨': 'sdp',
}


def _party_code(name):
    if not name:
        return None
    return PARTY_NAME.get(_norm(name.strip()), 'other')


def _cc_of_code(code5):   # 中央社 '63000' / '10017' → '63' / '10017'
    return code5[:2] if code5[:2] in ('63', '64', '65', '66', '67', '68') else code5[:5]


def _entry(cands, label, stype, ts, prog):
    return {'cands': cands, 'source_label': label, 'source_type': stype, 'ts': ts, 'prog': prog}


def fetch_cna(tc_pool, council_seats, year=2026):
    now_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    base = f'https://www.cna.com.tw/project/{CNA_PROJECT.get(year, CNA_PROJECT[2026])}/api/'
    label = '中央社(中選會數字)'
    cc_out, tc_out, ed_out = {}, {}, {}
    def cands_of(rows):
        out = []
        for x in rows or []:
            try:
                v = int(x.get('tickets') or 0)
            except (TypeError, ValueError):
                continue
            nm = _clean_name(x.get('name'))
            if nm:
                out.append({'name': nm, 'votes': v, 'party': _party_code(x.get('party')), 'elected': (x.get('isYou') or '').strip() == '*'})
        return out
    def prog_of(p):
        try:
            return [int(float(p)), 100]   # 中央社只給開票進度百分比
        except (TypeError, ValueError):
            return None
    try:
        council = json.loads(http_get(base + 'council.json?t=%d' % int(time.time())))
        for cc5, dists in (council or {}).items():
            cc = _cc_of_code(cc5)
            if ONLY_COUNTIES and cc not in {CC_MAP[c] for c in ONLY_COUNTIES}:
                continue
            for code, d in dists.items():
                dk = f'{cc}_{code[-2:]}'
                if dk not in council_seats:
                    print(f'  [cna] {dk} 不在席次表裡，跳過', file=sys.stderr); continue
                cs = cands_of(d.get('candidates'))
                if cs:
                    ed_out[dk] = _entry(cs, label, 'net', now_label, prog_of(d.get('process')))
    except Exception as e:
        print(f'  [cna] 縣市議員 council.json 讀取／解析失敗: {e}', file=sys.stderr)
    if time.time() - _CNA_LAST_CITY[0] >= CNA_CITY_EVERY:
        try:
            city = json.loads(http_get(base + 'city.json?t=%d' % int(time.time())))
            _CNA_LAST_CITY[0] = time.time()
            for cc5, c in (city or {}).items():
                cc = _cc_of_code(cc5)
                if ONLY_COUNTIES and cc not in {CC_MAP[x] for x in ONLY_COUNTIES}:
                    continue
                cs = cands_of(c.get('candidates'))
                if cs:
                    cc_out[cc] = _entry(cs, label, 'net', now_label, prog_of(c.get('process')))
                for tcode, t in (c.get('towns') or {}).items():
                    tc = tcode if tcode in tc_pool.get(cc, {}).values() else tc_pool.get(cc, {}).get(_norm((t.get('name') or '').strip()))
                    ts_ = cands_of(t.get('candidates'))
                    if tc and ts_:
                        tc_out[tc] = _entry(ts_, label, 'net', now_label, None)
        except Exception as e:
            print(f'  [cna] 縣市長 city.json 讀取／解析失敗: {e}', file=sys.stderr)
    return cc_out, tc_out, ed_out


def fetch_tvbs(tc_pool, council_seats, year=2026):
    now_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    label = 'TVBS(開票中心)'
    cc_out, tc_out, ed_out = {}, {}, {}
    try:
        d = json.loads(http_get(f'https://news.tvbs.com.tw/events/taiwan_election/json/{year}.json?timestamp=%d' % int(time.time() * 1000)))
    except Exception as e:
        print(f'  [tvbs] {year}.json 讀取失敗: {e}', file=sys.stderr)
        return cc_out, tc_out, ed_out
    def cands_of(rows):
        out = []
        for x in rows or []:
            nm = _clean_name(x.get('profileName'))
            try:
                v = int(x.get('votes') or 0)
            except (TypeError, ValueError):
                continue
            if nm:
                out.append({'name': nm, 'votes': v, 'party': _party_code(x.get('partyName')), 'elected': bool(x.get('elected'))})
        return out
    lists = (d or {}).get('voteCountingList') or []
    for blk in lists:
        data = blk.get('data') or {}
        for row in data.get('byDistrict') or []:
            county = _norm((row.get('districtName') or '').strip())
            cc = CC_MAP.get(county)
            if not cc or (ONLY_COUNTIES and county not in ONLY_COUNTIES):
                continue
            cs = cands_of(row.get('candidates'))
            if not cs:
                continue
            sub = row.get('subDistrictName')
            if sub:   # 議員
                m = re.search(r'第(\d+)選舉區', sub)
                if not m:
                    continue
                dk = f'{cc}_{int(m.group(1)):02d}'
                if dk not in council_seats:
                    print(f'  [tvbs] {dk} 不在席次表裡，跳過', file=sys.stderr); continue
                ed_out[dk] = _entry(cs, label, 'tv', now_label, None)
            else:
                cc_out[cc] = _entry(cs, label, 'tv', now_label, None)
    return cc_out, tc_out, ed_out


# ETtoday（備案 2，2026-11-07）：media.ettoday.net/events/election{year}/data/html/ 的 HTML 片段（中選會數字）——
#   縣市長 ballotreport_html_3_cec.html（六都）、_4_（其他縣市），每縣市一張 table id="b{代碼}"；
#   議員 alderman_html_2_cec_{代碼}.html（各選區「第N選區（…）應選N人」＋候選人表），政黨圖示 p{pid} 的名稱從同縣市
#   alderman_html_1_cec_{代碼}.html 的席次 JSON（"pid":1,"name":"中國國民黨"）對出來。議員 22 個檔，最快 ETT_COUNCIL_EVERY
#   秒抓一次。縣市代碼 100–121（2022 年嘉義市 113 延期改選沒有）。無鄉鎮、無投開票所進度。
ETT_CODE = {'100': '63', '101': '65', '102': '68', '103': '66', '104': '67', '105': '64', '106': '10017', '107': '10004',
            '108': '10018', '109': '10005', '110': '10007', '111': '10008', '112': '10009', '113': '10020', '114': '10010',
            '115': '10013', '116': '10002', '117': '10015', '118': '10014', '119': '10016', '120': '09020', '121': '09007'}
ETT_COUNCIL_EVERY = 180
_ETT_LAST_COUNCIL = [0.0]
_ETT_PID = {'1': 'kmt', '16': 'dpp', '999': 'ind'}


def fetch_ettoday(tc_pool, council_seats, year=2026):
    now_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    base = f'https://media.ettoday.net/events/election{year}/data/html/'
    label = 'ETtoday(中選會數字)'
    cc_out, tc_out, ed_out = {}, {}, {}
    only = {CC_MAP[c] for c in ONLY_COUNTIES} if ONLY_COUNTIES else None
    def rows_of(table):
        out = []
        for tr in table.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) < 3:
                continue
            img = tds[0].find('img')
            pm = re.search(r'/p(\d+)\.png', img.get('src', '')) if img else None
            nm = re.sub(r'^\d+\.', '', tds[1].get_text(strip=True))
            vm = re.match(r'([\d,]+)', tds[2].get_text(strip=True))
            if not nm or not vm:
                continue
            party = _ETT_PID.get(str(int(pm.group(1))), 'other') if pm else None   # 圖示 p016.png ↔ pid 16
            out.append({'name': _clean_name(nm), 'votes': int(vm.group(1).replace(',', '')), 'party': party,
                        'elected': bool(tds[1].find('i', class_='icon_win'))})
        return out
    if time.time() - _ETT_LAST_COUNCIL[0] >= ETT_COUNCIL_EVERY:   # council first: it also fills the party-icon map
        _ETT_LAST_COUNCIL[0] = time.time()
        for code, cc in ETT_CODE.items():
            if only and cc not in only:
                continue
            time.sleep(random.uniform(0.3, 0.8))
            try:
                head = http_get(base + f'alderman_html_1_cec_{code}.html')
                for pid, pname in re.findall(r'"pid":(\d+),"name":"([^"]+)"', head):
                    _ETT_PID[pid] = _party_code(pname)
                body = http_get(base + f'alderman_html_2_cec_{code}.html')
            except Exception as e:
                if '404' not in str(e):
                    print(f'  [ettoday] {code} 議員片段讀取失敗: {e}', file=sys.stderr)
                continue
            # 每個選區的表格包在 <!--第N區 開始-->…<!--第N區 結束--> 裡；應選席次在頁尾「選擇選區」清單 <li data-no data-stotal>
            need = {int(n): int(t) for n, t in re.findall(r"data-no='(\d+)'[^>]*?data-stotal='(\d+)'", body)}
            for n, chunk in re.findall(r'<!--第(\d+)區 開始-->(.*?)<!--第\1區 結束-->', body, flags=re.S):
                n = int(n)
                dk = f'{cc}_{n:02d}'
                if council_seats.get(dk) is None:
                    print(f'  [ettoday] {dk} 不在席次表裡，跳過', file=sys.stderr); continue
                if need.get(n) != council_seats[dk]:
                    print(f'  [ettoday] {dk} 應選席次對不起來(抓到{need.get(n)}，app預期{council_seats[dk]})，跳過', file=sys.stderr); continue
                cs = [c for t in BeautifulSoup(chunk, 'html.parser').find_all('table') for c in rows_of(t)]
                if cs:
                    ed_out[dk] = _entry(cs, label, 'net', now_label, None)
    for frag in (3, 4):
        try:
            soup = BeautifulSoup(http_get(base + f'ballotreport_html_{frag}_cec.html'), 'html.parser')
        except Exception as e:
            print(f'  [ettoday] 縣市長片段 {frag} 讀取失敗: {e}', file=sys.stderr); continue
        for table in soup.find_all('table', id=re.compile(r'^b\d+$')):
            cc = ETT_CODE.get(table['id'][1:])
            if not cc or (only and cc not in only):
                continue
            cs = rows_of(table)
            if cs:
                cc_out[cc] = _entry(cs, label, 'net', now_label, None)
    return cc_out, tc_out, ed_out


FETCHERS = {'ltn': fetch_ltn, 'cna': fetch_cna, 'tvbs': fetch_tvbs, 'ettoday': fetch_ettoday}
# 每個來源在 data_live2026.js 的 source key（自由時報沿用原本的 auto_poll，頁面與紀錄檔已經用這個名字）
SOURCE_KEY = {'ltn': 'auto_poll', 'cna': 'cna', 'tvbs': 'tvbs', 'ettoday': 'ettoday'}


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
        # the same candidate twice from a source (2022 自由時報 屏東縣第1選區: 梁育慈 7,559 listed twice): drop the repeat
        seen, uniq = set(), []
        for c in info['cands']:
            k = (c['name'], c['votes'])
            if k not in seen:
                seen.add(k); uniq.append(c)
        info['cands'] = uniq
        ok, reason = validate(key, info['cands'], prev.get(key), allow_all_zero)
        if not ok:
            rejected.append((key, reason))
            continue
        accepted.append(key)
        entry = current.setdefault(key, {'sources': {}, 'final': False})
        won = [c['name'] for c in info['cands'] if c.get('elected')]
        entry['sources'][source_key] = {
            'label': info['source_label'], 'type': info.get('source_type'), 'ts': info['ts'],
            'cands': [{'n': c['name'], 'v': c['votes'], 'p': c.get('party'), 'e': 1 if c.get('elected') else 0} for c in info['cands']],
            # 單一席（縣市長、鄉鎮層的縣市長票）：來源標了當選才填姓名；多席（議員）看各候選人的 e
            'elected': won[0] if len(won) == 1 and varname != 'LIVE_TRACK_ED' else None,
            'prog': info.get('prog'),
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
            cand_str = ', '.join(
                f"{{ n: '{esc(c['n'])}', v: {c['v']}" + (f", p: '{esc(c['p'])}'" if c.get('p') else '') + (", e: 1" if c.get('e') else '') + " }"
                for c in s['cands'])
            prog = f", prog: [{s['prog'][0]}, {s['prog'][1]}]" if s.get('prog') else ''
            elected = f"'{esc(s['elected'])}'" if s.get('elected') else 'null'
            src_type = f"'{esc(s['type'])}'" if s.get('type') else 'null'
            src_strs.append(f"{skey}: {{ label: '{esc(s['label'])}', type: {src_type}, ts: '{esc(s['ts'])}', cands: [{cand_str}], elected: {elected}{prog} }}")
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
        # 2026-11-07：每位候選人當時的累計票數也記下（使用者：舊版的折線圖改成長條圖，按照進來的票數累積看 pattern）
        entry = {'ts': ts, 'ldrName': top['name'], 'marginPct': margin_pct,
                 'cands': [{'n': c['name'], 'v': c['votes'], 'p': c.get('party')} for c in cands_sorted]}
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
            def cands_js(e):
                cs = e.get('cands')
                if not cs:
                    return ''
                return ', cands: [' + ', '.join(
                    f"{{ n: '{esc(c['n'])}', v: {int(c['v'])}" + (f", p: '{esc(c['p'])}'" if c.get('p') else '') + ' }' for c in cs) + ']'
            entry_strs = [f"{{ ts: '{esc(e['ts'])}', ldrName: '{esc(e['ldrName'])}', marginPct: {e['marginPct']}{cands_js(e)} }}" for e in entries]
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
            accepted, rejected = _merge_layer(varname, fresh, allow_all_zero, SOURCE_KEY.get(source, 'auto_poll'))
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
            _append_margin_log(cc_fresh, cc_accepted, SOURCE_KEY.get(source, 'auto_poll'))
        except Exception as e:
            # 領先幅度紀錄是錦上添花的附加功能，寫入失敗不該連帶讓這一輪的主要開票資料
            # (LIVE_TRACK_CC/TC/ED，已經在上面_do_layer()各自成功寫入了)也被當成失敗
            print(f'  領先幅度紀錄：這一輪寫入失敗，不影響主要開票資料（{e}）', file=sys.stderr)

    return cc_accepted, tc_accepted, ed_accepted


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default='ltn',
                     help='來源，可用逗號列多個，每輪依序各抓一次、各寫各的 source key：' + ', '.join(FETCHERS) + '（例如 ltn,cna,tvbs）')
    ap.add_argument('--once', action='store_true', help='只執行一次，不進入輪詢迴圈')
    ap.add_argument('--interval', type=int, default=60,
                     help='輪詢間隔秒數下限(預設60)——實際每輪會在[interval, interval*1.5]之間'
                          '隨機取一個值再sleep，不要每次都固定間隔對同一批網站發請求')
    ap.add_argument('--allow-all-zero-first-run', action='store_true',
                     help='投票剛截止、真的全部都還沒開票時用這個旗標明確放行全0資料，平常不要開')
    ap.add_argument('--year', type=int, default=2026,
                     help='election.ltn.com.tw的年份路徑，預設2026；用--year 2022可以拿已驗證的'
                          '2022真實資料測試整條流程，不用等網站真的上線')
    ap.add_argument('--data-file', default=None,
                     help='寫入的資料檔（預設 data_live2026.js）；測試時指到暫存副本，正式檔不會被動到。'
                          '領先幅度紀錄跟著放在同一個資料夾（<檔名>_margin_log.js）')
    ap.add_argument('--county', action='append', default=None, help='只抓這個縣市（可重複），測試用，例如 --county 嘉義市')
    args = ap.parse_args()
    ONLY_COUNTIES = set(args.county) if args.county else None
    if args.data_file:
        DATA_FILE = Path(args.data_file).resolve()
        MARGIN_LOG_FILE = DATA_FILE.with_name(DATA_FILE.stem + '_margin_log.js')
        print(f'資料檔：{DATA_FILE}（領先幅度紀錄：{MARGIN_LOG_FILE.name}）')

    print('載入鄉鎮市區代碼對照表跟縣市議員選區席次表...')
    tc_pool = _build_tc_pool()
    # 合併一般選區(COUNCIL_SEATS)跟原住民選區(COUNCIL_IND_P_DISTS/COUNCIL_IND_M_DISTS)的應選
    # 席次表成同一張——兩者key(dk格式)不重疊(LTN選區編號一般選區排完接著繼續編原住民選區)，
    # 合併後_parse_council_page()不用改，兩種選區都能查得到ground truth，原住民選區不再被
    # 跳過(舊版本的council_seats.get(dk)對原住民選區永遠是None，全部continue掉)
    # 2026：中選會 2026 公告的席次表（_build_council_seats_2026）；--year 2022 排練：2022 的表
    council_seats = _build_council_seats_2026() if args.year >= 2026 else {**_build_council_seats(), **_build_ind_council_seats()}
    print(f'  共{sum(len(v) for v in tc_pool.values())}個鄉鎮市區、{len(council_seats)}個縣市議員選區(含原住民選區)')

    sources = [x.strip() for x in args.source.split(',') if x.strip()]
    bad = [x for x in sources if x not in FETCHERS]
    if bad:
        ap.error('不認得的來源：' + ', '.join(bad))
    def one_round(first):
        for src in sources:   # 一個來源出錯不影響其他來源
            try:
                run_once(src, args.allow_all_zero_first_run and first, tc_pool, council_seats, args.year)
            except Exception as e:
                print(f'  [{src}] 這一輪失敗：{e}', file=sys.stderr)
    if args.once:
        one_round(True)
    else:
        first = True
        while True:
            one_round(first)
            first = False
            # 加隨機抖動而不是固定間隔：開票夜對方伺服器負載本來就重，固定的機械式間隔本身也是
            # 「明顯是機器人」的訊號之一，抖動一下比較像人類偶爾重新整理的節奏
            wait = random.uniform(args.interval, args.interval * 1.5)
            print(f'  ...等待 {wait:.0f} 秒後下一輪')
            time.sleep(wait)
