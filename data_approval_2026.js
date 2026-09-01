// 總統（賴清德）／行政院院長（卓榮泰）施政滿意度追蹤（2024-05-20就職起）— sourced 2026-08-15，
// 2026-08-31追加更新至2026-08-19（見PRESIDENT_APPROVAL_2025/PREMIER_APPROVAL_2025陣列尾端
// 「2026-08-31新增」註解區塊：新增震傳媒8/15-17、台灣民心調查8/19-21兩筆總統資料，及台灣民心調查
// 8/19-21一筆行政院長資料——原本委託美麗島電子報的戴立安2026年7月脫離該報自推「台灣民心調查」，
// 詳見陣列內註解）
// （2025年起部分於2026-08-15首次蒐集；2024-05-20至2024-12月的延伸區段於同日稍後追加，
// 詳見下方「2024年延伸區段」說明）。
//
// ============================================================================
// 用途說明
// ============================================================================
// 本檔案供 council.html 的 2026 縣市長選舉預測功能新增的「民調追蹤」面板使用，
// 目的是呈現總統與行政院長「即時、持續」的施政滿意度走勢（自賴清德總統2024-05-20
// 就職起算，理想上涵蓋到查詢當下 2026-08-15），作為研判 2026 大選「全國政治氣候」對選情影響的輔助
// 指標。這與同目錄下的 data_approval_context.js 用途完全不同：後者是為了backtest
// 2018/2022 模型而蒐集的「歷史」民調資料，僅到 2022-09 為止，且聚焦於「滿意度淨值
// vs. 選舉表現」的事後檢定；本檔案是「當下」的持續追蹤資料，時間範圍新、用途不同，
// 兩者刻意分開存放，互不覆蓋。
//
// ============================================================================
// 現任行政院院長說明（任務要求：查核「現任」是誰，因為台灣閣揆更換比總統頻繁）
// ============================================================================
// 卓榮泰（DPP）自 2024-05-20 就任行政院院長，經查核維基百科「中華民國行政院院長」
// 及「卓榮泰」條目、以及本檔案下方蒐集的 TPOF／美麗島電子報逐月報告（最新至
// 2026-07），卓榮泰截至研究日 2026-08-15 仍是現任院長，追蹤期間內「未發生」院長
// 更替（2025-09-01 有一次「內閣改組」，即部分部會首長異動，但卓榮泰本人職位未變，
// 與「換院長」是兩回事）。因此本檔案追蹤期間僅有一位院長，PREMIER_APPROVAL_2025
// 陣列中每筆資料的 premier_name 欄位皆固定為「卓榮泰」，不需要像任務說明所預想的
// 「多位院長分段標註」。若之後卓榮泰卸任，應在本檔案新增後續院長的資料並在此處
// 補記交接日期。
//
// ============================================================================
// 資料來源與蒐集方法（誠實揭露）
// ============================================================================
// 【台灣民意基金會 (TPOF, tpof.org)】
// TPOF 自 2024 年起將每月例行「記者會書面資料」新聞稿改為在網站文章內嵌「掃描/
// 排版好的 JPG 或 PNG 圖片頁面」（而非純文字 HTML），本檔案的做法是：先用
// curl 抓取每月新聞稿文章頁的 HTML，解析出該月「新聞稿正文」對應的圖片檔名規律
// （通常是 YYYYMMDDnp01.jpg / np02.jpg，1月例外為 cp01/cp02），下載該圖片後以
// 視覺方式讀取文字內容，逐月核對「賴清德總統聲望」與「卓內閣施政表現」兩題的
// 滿意/不滿意/沒意見比例、調查期間、有效樣本數，確保是第一手數字而非轉述。
// 已取得 2025 年 1、3、4、5、6、7、8、9、10、11、12 月，共 11 個月（10個完整
// 月份 + 缺 2 月）。
//   - 2025年2月：多次嘗試不同慣用網址格式（含常見的
//     「2025年2月「新聞稿」」與「新聞稿（2025年2月X日）」兩種命名慣例）均回傳
//     404，且該月的 WordPress 日期歸檔頁（/2025/02/）存在但內容是空的（只有側欄
//     小工具、無文章本體），研判 TPOF 該月確實未發布例行全國性重大議題民調（不同
//     於單純網頁抓取失敗）。誠實留空，未以鄰近月份估算填補。
//   - 2025年10月的文章網址與標題有明顯的 TPOF 自身打字錯誤：網址與頁面標題都寫成
//     「2020年10月「新聞稿」」（應為「2025年10月」），但文章內文的發布日期
//     （2025/10/21）、訪問期間（2025年10月13-15日）、主題（「以哈停火、川普變數
//     與兩岸關係」提及以哈停火等 2025年時事）皆確認內容確實是 2025年10月的報告，
//     只是標題/網址誤植了年份，不影響資料本身正確性，僅在此註記以免使用者誤會。
//   - 2025年11月、12月兩個月的原始新聞稿正文段落，只給出「滿意X%、不滿意Y%，
//     不滿意比滿意多Z個百分點」的敘述句，並未像其他月份一樣直接列出第三個
//     「沒意見/不知道」百分比。這4筆資料（11月賴清德、11月卓內閣、12月賴清德、
//     12月卓內閣）的 undecided_pct 是用 100 - approve_pct - disapprove_pct
//     （皆取自報告採用的整數/一位小數概數）反推得出，並非原文直接寫出的數字，
//     已在對應項目加註 note 說明，供使用時留意其精確度略低於其他月份。
//   - TPOF 截至研究日（2026-08-15）尚未查得任何 2026 年的月報（嘗試多種網址猜測、
//     WordPress 日期歸檔頁 /2026/01/、/2026/07/ 等均回傳 404，網站分類頁列表最新
//     一篇仍是 2025年12月23日），研判 TPOF 網站在可查得的範圍內最新資料僅到
//     2025-12。2026年的資料改用美麗島電子報補上（見下）。若之後 TPOF 有補發或
//     本檔案維護者能取得 2026 年報告，應補充進來。
//
// 【美麗島電子報 (my-formosa.com.tw)】
// my-formosa.com.tw 對本工具的 WebFetch 直接回傳 403（與 data_approval_context.js
// 記載的舊有問題一致），改用帶瀏覽器 User-Agent 的 curl 搭配 Big5→UTF-8 轉碼取得
// 原始 HTML 全文（非二手轉述），從「美麗島民調」專區頁面找到該報每月固定發布的
// 「國政民調」文章，逐篇讀取文末問卷附錄（逐題列出的原始百分比，例如「3、請問，
// 您對賴清德總統執政以來的整體表現是滿意、或不滿意？(1)很滿意X% (2)還算滿意Y%
// (3)有點不滿意Z% (4)很不滿意W% (5)未明確回答U%」）取得最精確的第一手數字，
// approve_pct = 很滿意+還算滿意，disapprove_pct = 有點不滿意+很不滿意，
// undecided_pct = 未明確回答。已取得 2025年11、12月與 2026年1、3、4、5、6、7月，
// 共8個月（2026年2月同樣查無該月的「國政民調」文章，推測是美麗島當月未發布或
// 未被本次搜尋方法找到，留空未捏造）。委託單位（sponsor）欄位依報告內「調查說明」
// 逐篇載明的「委託單位：美麗島電子報」直接填入，執行單位固定為「畢肯市場研究
// 公司」（問卷設計者為戴立安），未另立公司名稱作為pollster。
//   - 2026年7月報告已於 2026-08-04 發布（調查期間 2026/7/28-30），是本次蒐集範圍
//     內最新的一筆資料，代表美麗島電子報的月度「國政民調」系列截至研究日
//     （2026-08-15）尚未發布8月份報告屬正常（該報告通常在當月月底或次月初發布）。
//
// 【交叉驗證】2025年11月與12月是兩家機構唯一重疊的月份，可互相對照：
//   - 11月賴清德：TPOF 38% vs 美麗島 40.9%（approve）— 差距約3個百分點，屬合理
//     機構間差異(house effect)範圍。
//   - 11月卓榮泰：TPOF 40% vs 美麗島 39.5%（approve）— 非常接近。
//   - 12月賴清德：TPOF 43% vs 美麗島 40.6%（approve）— 差距約2個百分點。
//   - 12月卓榮泰：TPOF 44% vs 美麗島 38.1%（approve）— 差距約6個百分點，是兩家
//     機構在本檔案資料範圍內差異最大的一筆，暫無法判斷是抽樣時間點差異
//     （TPOF訪問12/15-17，美麗島訪問12/22-24，相隔約一週，其間有立法院表決卓榮泰
//     拒絕副署財劃法修正案等新聞）還是機構house effect所致，使用時請留意。
//
// 【其他機構（TVBS、聯合報、中華民國民意研究協會、山水民調、匯流民調、遠見雜誌）】
// 本次任務要求至少查核3-4家機構以確保廣度。實際嘗試結果：
//   - TVBS：cc.tvbs.com.tw 的民調中心頁面與 news.tvbs.com.tw 皆對直接抓取回傳
//     403或未能定位到具體滿意度文章連結（新聞列表頁為JS動態載入，靜態HTML抓取
//     抓不到文章標題），且本次任務執行期間 WebSearch 額度已用盡（該額度由本次
//     session其他並行工作提前耗用，非本檔案蒐集過程主動大量搜尋所致），無法用
//     搜尋引擎輔助定位TVBS個別報告網址，故未納入。
//   - 聯合報、中華民國民意研究協會、山水民調、匯流民調、遠見雜誌：受同一WebSearch
//     額度限制影響，未能有效搜尋到這些機構2025-2026年關於總統/閣揆滿意度的
//     獨立公開報告連結；亦查詢維基百科「賴清德」條目是否有彙整多家民調的表格，
//     結果未找到。誠實回報：非資料不存在，而是本次可用的搜尋工具額度耗盡，
//     未能覆蓋到。若未來有WebSearch額度，可優先嘗試「TVBS民調中心」
//     （cc.tvbs.com.tw 有公開PDF庫但需要能繞過403或改用有權限的瀏覽工具）與遠見
//     雜誌官網（gvsrc.cwgv.com.tw，data_approval_context.js記載對本工具曾回傳403，
//     但該次是抓天下雜誌非遠見雜誌本身，可再試）。
//
// ============================================================================
// 2024年延伸區段（PRESIDENT_APPROVAL_2024 / PREMIER_APPROVAL_2024）說明
// ============================================================================
// 任務要求將追蹤起點從「2025年起」往前延伸到賴清德總統實際就職日 2024-05-20，
// 因此本節新增 2024-05-20 至 2024-12-31 這段「缺口」期間的資料，方法與上述2025年
// 區段的 TPOF 蒐集方式完全相同（抓取每月新聞稿文章頁 HTML → 解析內嵌圖片檔名 →
// 下載圖片後以視覺方式逐字讀取正文）。
//
// 【台灣民意基金會 (TPOF)】2024年5-12月，共8個月，覆蓋率100%（無缺月）：
//   - 2024-05-20（就職後首份月報，訪問期間2024/5/20-22，即就職演說隔天起）：本月
//     報告主題是「賴清德時代的兩岸關係與統獨傾向」，並未列出標準的總統聲望「贊同/
//     不贊同/沒意見」三段式數字，而是先問「就職演說整體表現滿不滿意」（51%滿意，
//     19%不滿意，非本檔案採用之數字），另外在報告後段（page ii 第五點）才有「賴清德
//     總統聲望」標準題（58%贊同、25%不贊同），本檔案採用後者以維持與其他月份題型
//     一致；undecided_pct（17%）為反推值（100-58-25），原文未直接列出。
//   - 2024-05-20 卓榮泰部分：本月題目與其他月份不同，問的是「對卓榮泰做好行政院長
//     工作的信心」（有信心/沒信心/沒意見不知道），而非後續月份慣用的「滿意/不滿意」
//     施政表現題，approve_pct/disapprove_pct分別對應「有信心」「沒信心」；已於該筆
//     資料note中註明，使用時請留意此題與後續「施政滿意度」題並非完全同一問法，
//     6月之後才開始有標準化的「卓內閣施政表現滿不滿意」題。
//   - 2024年6、7、8月：部分月份的「沒意見」與「不知道/拒答」是報告原文分開列出的
//     兩個數字（例如6月賴清德「一成八沒意見，8.3%不知道」），undecided_pct採用兩者
//     加總，並在note中列出拆解，讓使用者可自行還原原始分項。
//   - 2024年8月：報告內嵌圖片檔名為「20200820np00/01/02」（應為2024年8月），與本檔案
//     2025年10月報告的「2020年10月」網址誤植是同一類型的TPOF自身年份打字錯誤；已
//     核對內文發布日期（2024/8/20）、訪問期間（2024/8/12-14）、主題（巴黎奧運等
//     2024年時事）確認內容確實是2024年8月報告，不影響數字正確性。
//   - 2024年9月：本月文章內嵌的是手機拍攝的紙本講義照片（IMG_2747.jpeg／
//     IMG_2748.jpeg／IMG_2816.jpeg），而非其他月份慣用的排版輸出圖片（YYYYMMDDnp
//     系列），格式不同但仍是TPOF自行發布的第一手報告全文照片，內容判讀方式相同。
//   - 2024年5-12月報告的抽樣方法、加權方式、經費來源（TPOF自籌）與2025年區段完全
//     相同，故sponsor欄位同樣填null。
//
// 【美麗島電子報】本次延伸區段「未能」取得2024年資料。原因：
//   - my-formosa.com.tw官網用來收錄近期「國政民調」系列文章的主題頁
//     （/Topical/formosapollster）經查詢只回溯到2025年11月（DOC_221882），推測是
//     該主題標籤本身在2025年11月才建立/啟用，更早的2024年報告即使存在，也未被
//     歸入此主題頁，難以用此路徑找到。
//   - 該站另有一個POST方式的內建搜尋（/Design/Search_Transfer.asp），本次可用的
//     curl工具在缺乏已知表單參數名稱、且WebSearch額度已於本次任務執行期間耗盡
//     （與2025年區段header記載的額度限制是同一種資源，屬本次session共用額度，
//     非本節蒐集過程獨立耗用）的情況下，無法可靠地用參數猜測方式核實文章網址，
//     為避免用臆測的doc編號拼湊出可能錯誤或根本不存在的網址（等同捏造資料），
//     選擇誠實留空，而非用不確定的連結硬湊出2024年美麗島數字。
//   - 因此2024年延伸區段目前僅有TPOF單一來源，缺少如2025年11-12月那樣的「兩家
//     機構交叉驗證」佐證；若之後能取得美麗島電子報2024年「國政民調」的可靠網址，
//     應優先補上以強化本區段的資料品質。
//
// 【現任行政院院長查核】任務要求特別查核2024年5-12月期間的閣揆人選，避免預設
// 卓榮泰從一開始就是院長。經WebFetch查核中文維基百科「卓榮泰」條目infobox，明確
// 記載其「行政院院長（第32任）2024年5月20日－」，即與賴清德同日就職、任期起點
// 就是本延伸區段的第一天，故2024-05-20至2024-12-31期間僅有卓榮泰一人擔任行政院
// 院長，無需分段標註不同院長姓名，與上方「現任行政院院長說明」一節的結論一致。
//
// ============================================================================
// 欄位說明
// ============================================================================
// pollster: 機構名稱，與 data_polls_2026.js / data_polls_2022_backtest.js 用字一致
//           （"台灣民意基金會"、"美麗島電子報"）。
// sponsor: TPOF 部分填 null——TPOF自身報告明確揭露經費來源是「財團法人台灣民意
//          教育基金會」（即TPOF自己），屬自籌經費、非受第三方委託，依本專案慣例
//          （見 data_polls_2026.js header）null 代表「揭露為獨立/自行負擔經費」。
//          美麗島電子報部分填 "美麗島電子報"——其報告「調查說明」明確寫「委託
//          單位：美麗島電子報」，形式上仍是（該報自己）委託畢肯市場研究公司執行，
//          故視為有揭露的委託方名稱而非null。
// date: 該次調查訪問期間的起始日（YYYY-MM-DD）。
// period: 完整訪問期間文字（例如 "2025/1/12-14"），供需要精確日期範圍時參照。
// approve_pct / disapprove_pct / undecided_pct: 百分比數字（0-100），undecided_pct
//          若為反推值會有 note 註記；原始報告用「X成Y」中文概數表示者，已換算為
//          阿拉伯數字（如「四成八」→48、「45.9%」維持原始一位小數）。
// sample_size: 有效樣本數（人）。
// source_url: 原始報告網址。
// note: 資料品質相關註記（若有）。
// premier_name: 僅 PREMIER_APPROVAL_2024 / PREMIER_APPROVAL_2025 使用，本檔案
//          追蹤期間固定為「卓榮泰」。
// ============================================================================

const PRESIDENT_APPROVAL_2024 = [
  // ---- 台灣民意基金會 (TPOF) 2024年5-12月（賴清德總統就職起，完整覆蓋無缺月）----
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-05-20", period: "2024/5/20-22", approve_pct: 58, disapprove_pct: 25, undecided_pct: 17, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b45%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "賴清德總統就職後首份TPOF月報（訪問期間即就職演說隔天起），主題聚焦就職演說評價與統獨傾向，undecided_pct為反推值（100-58-25），原文僅列出贊同58%與不贊同25%兩數字，未直接列出沒意見/不知道比例" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-06-11", period: "2024/6/11-13", approve_pct: 48, disapprove_pct: 26, undecided_pct: 26.3, sample_size: 1070, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b46%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為「一成八沒意見」+「8.3%不知道」加總（18+8.3）；報告原文特別指出「賴總統上任第一個月，只獲不到半數人民的支持」" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-07-08", period: "2024/7/8-10", approve_pct: 50, disapprove_pct: 31, undecided_pct: 19, sample_size: 1073, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b47%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-08-12", period: "2024/8/12-14", approve_pct: 47, disapprove_pct: 32, undecided_pct: 22, sample_size: 1075, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b48%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "報告內嵌圖片檔名誤植為「20200820」（應為2024年8月），經內文發布日期2024/8/20、訪問期間2024/8/12-14、主題（巴黎奧運等2024年時事）核實內容確為2024年8月報告，與本檔案2025年10月報告的類似情形（詳見header）屬同一種TPOF自身年份誤植現象，不影響數字正確性" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-09-09", period: "2024/9/9-11", approve_pct: 47, disapprove_pct: 39, undecided_pct: 15, sample_size: 1016, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b49%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "本月報告內嵌的是手機拍攝紙本講義照片（IMG_2747/2748/2816.jpeg），非其他月份慣用的排版圖片，格式不同但仍為第一手報告全文" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-10-13", period: "2024/10/13-15", approve_pct: 49, disapprove_pct: 38, undecided_pct: 14, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b410%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-11-11", period: "2024/11/11-13", approve_pct: 42.8, disapprove_pct: 43, undecided_pct: 14, sample_size: 1017, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b411%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2024-12-09", period: "2024/12/9-11", approve_pct: 51, disapprove_pct: 35, undecided_pct: 13, sample_size: 1083, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b412%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "TPOF報告原文指出「賴清德總統的執政表現獲得過半數國人的肯定和支持」" }
];

const PREMIER_APPROVAL_2024 = [
  // ---- 台灣民意基金會 (TPOF) 2024年5-12月（卓榮泰就任起，完整覆蓋無缺月）----
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-05-20", period: "2024/5/20-22", approve_pct: 44, disapprove_pct: 32, undecided_pct: 24, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b45%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "本月題目與其他月份不同：問的是「對卓榮泰做好行政院長工作的信心」（有信心/沒信心/沒意見不知道），而非後續月份慣用的「滿意/不滿意」施政表現題；approve_pct/disapprove_pct分別對應「有信心」「沒信心」，undecided_pct為原文直接列出的「沒意見、不知道」24%，非反推值。解讀時請留意此題與後續月份「施政滿意度」題並非完全同一問法，6月起才開始有標準化的滿意度題" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-06-11", period: "2024/6/11-13", approve_pct: 43, disapprove_pct: 25, undecided_pct: 31, sample_size: 1070, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b46%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為「一成九沒意見」+「一成二不知道/拒答」加總（19+12）" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-07-08", period: "2024/7/8-10", approve_pct: 46, disapprove_pct: 30, undecided_pct: 25, sample_size: 1073, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b47%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為「一成五沒意見」+「一成不知道/拒答」加總（15+10）" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-08-12", period: "2024/8/12-14", approve_pct: 43, disapprove_pct: 34, undecided_pct: 22.4, sample_size: 1075, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b48%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為「一成七沒意見」+「5.4%不知道/拒答」加總（17+5.4）；本月報告內嵌圖片檔名年份誤植，詳見PRESIDENT_APPROVAL_2024同日期項目note" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-09-09", period: "2024/9/9-11", approve_pct: 49, disapprove_pct: 32, undecided_pct: 19, sample_size: 1016, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b49%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-10-13", period: "2024/10/13-15", approve_pct: 45, disapprove_pct: 36, undecided_pct: 19, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b410%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-11-11", period: "2024/11/11-13", approve_pct: 40, disapprove_pct: 41, undecided_pct: 19, sample_size: 1017, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b411%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2024-12-09", period: "2024/12/9-11", approve_pct: 47, disapprove_pct: 35, undecided_pct: 18, sample_size: 1083, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2024%e5%b9%b412%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" }
];

const PRESIDENT_APPROVAL_2025 = [
  // ---- 台灣民意基金會 (TPOF) 2025年1-12月（缺2月）----
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-01-12", period: "2025/1/12-14", approve_pct: 48, disapprove_pct: 40, undecided_pct: 11, sample_size: 1081, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b41%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-03-10", period: "2025/3/10-12", approve_pct: 49, disapprove_pct: 39, undecided_pct: 12, sample_size: 1079, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b43%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-04-07", period: "2025/4/7-9", approve_pct: 45.9, disapprove_pct: 45.7, undecided_pct: 8.5, sample_size: 1080, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b44%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-05-12", period: "2025/5/12-14", approve_pct: 46, disapprove_pct: 37, undecided_pct: 16.9, sample_size: 1080, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/%e6%96%b0%e8%81%9e%e7%a8%bf%ef%bc%882025%e5%b9%b45%e6%9c%8820%e6%97%a5%ef%bc%89/", note: "此為賴清德總統就職一週年專題民調" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-06-09", period: "2025/6/9-11", approve_pct: 49, disapprove_pct: 46, undecided_pct: 5.7, sample_size: 1085, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b46%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-07-07", period: "2025/7/7-9", approve_pct: 43, disapprove_pct: 45, undecided_pct: 12.5, sample_size: 1083, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/%e6%96%b0%e8%81%9e%e7%a8%bf%ef%bc%882025%e5%b9%b47%e6%9c%8815%e6%97%a5%ef%bc%89/" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-08-04", period: "2025/8/4-6", approve_pct: 33, disapprove_pct: 54, undecided_pct: 12.3, sample_size: 1079, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b48%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "726/823大罷免期間，聲望明顯下滑（前一個月為49%）" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-09-08", period: "2025/9/8-10", approve_pct: 33, disapprove_pct: 58, undecided_pct: 9.4, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b49%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "大罷免31:0結果揭曉後之首次調查，不滿意度創本系列新高" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-10-13", period: "2025/10/13-15", approve_pct: 35, disapprove_pct: 53, undecided_pct: 12.6, sample_size: 1070, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2020%e5%b9%b410%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "此報告網址與頁面標題TPOF自行誤植為「2020年10月」，經內文發布日期/訪問期間/時事主題核實實際內容確為2025年10月，詳見本檔案header說明" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-11-10", period: "2025/11/10-12", approve_pct: 38, disapprove_pct: 50, undecided_pct: 12, sample_size: 1085, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b411%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為反推值（100-38-50），原文僅提供「不贊同比贊同多12.3個百分點」之敘述，未直接列出沒意見比例" },
  { pollster: "台灣民意基金會", sponsor: null, date: "2025-12-15", period: "2025/12/15-17", approve_pct: 43, disapprove_pct: 49, undecided_pct: 8, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b412%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為反推值（100-43-49），原文僅提供「不贊同比贊同多5.2個百分點」之敘述，未直接列出沒意見比例" },

  // ---- 美麗島電子報「國政民調」2025年11-12月、2026年1-7月（缺2026年2月）----
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2025-11-24", period: "2025/11/24-26", approve_pct: 40.9, disapprove_pct: 53.3, undecided_pct: 5.8, sample_size: 1079, source_url: "https://www.my-formosa.com.tw/DOC_221882.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2025-12-22", period: "2025/12/22-24", approve_pct: 40.6, disapprove_pct: 52.2, undecided_pct: 7.3, sample_size: 1083, source_url: "https://www.my-formosa.com.tw/DOC_222574.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-01-26", period: "2026/1/26-28", approve_pct: 46.0, disapprove_pct: 48.0, undecided_pct: 6.0, sample_size: 1075, source_url: "https://www.my-formosa.com.tw/DOC_223441.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-03-26", period: "2026/3/26-28", approve_pct: 43.8, disapprove_pct: 47.4, undecided_pct: 8.9, sample_size: 1076, source_url: "https://www.my-formosa.com.tw/DOC_224706.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-04-22", period: "2026/4/22-24", approve_pct: 44.4, disapprove_pct: 47.4, undecided_pct: 8.0, sample_size: 1074, source_url: "https://www.my-formosa.com.tw/DOC_225352.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-05-20", period: "2026/5/20-22", approve_pct: 45.7, disapprove_pct: 44.9, undecided_pct: 9.4, sample_size: 1078, source_url: "https://www.my-formosa.com.tw/DOC_226123.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-06-22", period: "2026/6/22-24", approve_pct: 43.9, disapprove_pct: 47.5, undecided_pct: 8.4, sample_size: 1078, source_url: "https://www.my-formosa.com.tw/DOC_226926.htm" },
  { pollster: "美麗島電子報", sponsor: "美麗島電子報", date: "2026-07-28", period: "2026/7/28-30", approve_pct: 44.7, disapprove_pct: 47.4, undecided_pct: 7.9, sample_size: 1200, source_url: "https://www.my-formosa.com.tw/DOC_227893.htm", note: "2026-08-15/08-19新增兩筆前，本檔案蒐集範圍內最新一筆資料（報告發布於2026-08-04），樣本數1200為此系列中唯一擴大樣本的月份" },

  // ---- 2026-08-31新增：震傳媒(委託山水民意研究)、台灣民心調查（見下方説明）----
  { pollster: "震傳媒", sponsor: "震傳媒", date: "2026-08-15", period: "2026/8/15-17", approve_pct: 46.9, disapprove_pct: 42.3, undecided_pct: 10.8, sample_size: 1070, source_url: "https://www.zmedia.com.tw/Document/PoolDetail/43759", note: "震傳媒出資委託山水民意研究股份有限公司執行；同一天另有信任度調查(48.5%信任/39.0%不信任)，本檔案只收「施政滿意度」題與其他月份的問法一致" },
  // 民調專家戴立安2026年7月初結束與《美麗島電子報》的委託關係，自行推出《台灣民心調查》(TST)，
  // 固定題組延續其本人自2006年設計的「台灣民心指數」一脈(2012-2016台灣民心動態調查、2017-2026/6
  // 美麗島國政民調)，問卷設計/分析仍是戴立安本人、執行單位仍是畢肯市場研究公司，方法論跟先前
  // PREMIER/PRESIDENT_APPROVAL裡「美麗島電子報」那些筆數是同一套人馬的延續，只是委託方/品牌名稱
  // 換了，不是兩個不相干的新民調——分開的pollster名稱純粹反映實際掛名者變化，供之後查證脈絡用。
  { pollster: "台灣民心調查", sponsor: "台灣民心調查", date: "2026-08-19", period: "2026/8/19-21", approve_pct: 51.4, disapprove_pct: 42.3, undecided_pct: 6.3, sample_size: 1076, source_url: "https://www.businesstoday.com.tw/article/category/183027/post/202608250012/", note: "戴立安脫離美麗島電子報後首篇「台灣民心調查」，執行單位/問卷設計者不變（見上方說明）；同時段信任度49.9%/不信任39.5%，本檔案只收「施政滿意度」題" }
];

const PREMIER_APPROVAL_2025 = [
  // ---- 台灣民意基金會 (TPOF) 2025年1-12月（缺2月）----
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-01-12", period: "2025/1/12-14", approve_pct: 45, disapprove_pct: 39, undecided_pct: 16, sample_size: 1081, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b41%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-03-10", period: "2025/3/10-12", approve_pct: 45, disapprove_pct: 39, undecided_pct: 16, sample_size: 1079, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b43%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-04-07", period: "2025/4/7-9", approve_pct: 42, disapprove_pct: 46, undecided_pct: 12, sample_size: 1080, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b44%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-05-12", period: "2025/5/12-14", approve_pct: 43, disapprove_pct: 44, undecided_pct: 13, sample_size: 1080, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/%e6%96%b0%e8%81%9e%e7%a8%bf%ef%bc%882025%e5%b9%b45%e6%9c%8820%e6%97%a5%ef%bc%89/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-06-09", period: "2025/6/9-11", approve_pct: 44, disapprove_pct: 46, undecided_pct: 9.5, sample_size: 1085, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b46%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-07-07", period: "2025/7/7-9", approve_pct: 39, disapprove_pct: 44, undecided_pct: 16.6, sample_size: 1083, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/%e6%96%b0%e8%81%9e%e7%a8%bf%ef%bc%882025%e5%b9%b47%e6%9c%8815%e6%97%a5%ef%bc%89/" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-08-04", period: "2025/8/4-6", approve_pct: 32, disapprove_pct: 55, undecided_pct: 13, sample_size: 1079, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b48%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "726/823大罷免期間，滿意度明顯下滑（前一個月為39%）" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-09-08", period: "2025/9/8-10", approve_pct: 31, disapprove_pct: 58, undecided_pct: 11, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b49%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "大罷免31:0結果揭曉後之首次調查，不滿意度創本系列新高" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-10-13", period: "2025/10/13-15", approve_pct: 36, disapprove_pct: 49, undecided_pct: 15, sample_size: 1070, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2020%e5%b9%b410%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "此報告網址與頁面標題TPOF自行誤植為「2020年10月」，經內文核實實際內容確為2025年10月，詳見本檔案header說明" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-11-10", period: "2025/11/10-12", approve_pct: 40, disapprove_pct: 47, undecided_pct: 13, sample_size: 1085, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b411%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為反推值（100-40-47），原文僅提供「不滿意比滿意多6.9個百分點」之敘述，未直接列出沒意見比例" },
  { pollster: "台灣民意基金會", premier_name: "卓榮泰", sponsor: null, date: "2025-12-15", period: "2025/12/15-17", approve_pct: 44, disapprove_pct: 44, undecided_pct: 12, sample_size: 1077, source_url: "https://www.tpof.org/%e7%84%a6%e9%bb%9e%e6%96%87%e7%ab%a0/2025%e5%b9%b412%e6%9c%88%e3%80%8c%e6%96%b0%e8%81%9e%e7%a8%bf%e3%80%8d/", note: "undecided_pct為反推值（100-44-44）；原文提供非常滿意15.1%/非常不滿意23.3%等細項但未直接給出沒意見總比例" },

  // ---- 美麗島電子報「國政民調」2025年11-12月、2026年1-7月（缺2026年2月）----
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2025-11-24", period: "2025/11/24-26", approve_pct: 39.5, disapprove_pct: 43.8, undecided_pct: 16.7, sample_size: 1079, source_url: "https://www.my-formosa.com.tw/DOC_221882.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2025-12-22", period: "2025/12/22-24", approve_pct: 38.1, disapprove_pct: 44.3, undecided_pct: 17.6, sample_size: 1083, source_url: "https://www.my-formosa.com.tw/DOC_222574.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-01-26", period: "2026/1/26-28", approve_pct: 43.2, disapprove_pct: 42.3, undecided_pct: 14.6, sample_size: 1075, source_url: "https://www.my-formosa.com.tw/DOC_223441.htm", note: "報告指出這是卓榮泰滿意度「自去年5月以來首度高於不滿意」" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-03-26", period: "2026/3/26-28", approve_pct: 41.9, disapprove_pct: 42.1, undecided_pct: 15.9, sample_size: 1076, source_url: "https://www.my-formosa.com.tw/DOC_224706.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-04-22", period: "2026/4/22-24", approve_pct: 42.3, disapprove_pct: 41.8, undecided_pct: 15.9, sample_size: 1074, source_url: "https://www.my-formosa.com.tw/DOC_225352.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-05-20", period: "2026/5/20-22", approve_pct: 40.7, disapprove_pct: 39.7, undecided_pct: 19.6, sample_size: 1078, source_url: "https://www.my-formosa.com.tw/DOC_226123.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-06-22", period: "2026/6/22-24", approve_pct: 40.8, disapprove_pct: 40.0, undecided_pct: 19.3, sample_size: 1078, source_url: "https://www.my-formosa.com.tw/DOC_226926.htm" },
  { pollster: "美麗島電子報", premier_name: "卓榮泰", sponsor: "美麗島電子報", date: "2026-07-28", period: "2026/7/28-30", approve_pct: 40.2, disapprove_pct: 45.1, undecided_pct: 14.7, sample_size: 1200, source_url: "https://www.my-formosa.com.tw/DOC_227893.htm", note: "2026-08-19新增一筆前，本檔案蒐集範圍內最新一筆資料（報告發布於2026-08-04），樣本數1200為此系列中唯一擴大樣本的月份" },

  // ---- 2026-08-31新增：台灣民心調查（戴立安脫離美麗島電子報後的新品牌，見PRESIDENT_APPROVAL_2025同日期項目說明）----
  { pollster: "台灣民心調查", premier_name: "卓榮泰", sponsor: "台灣民心調查", date: "2026-08-19", period: "2026/8/19-21", approve_pct: 43.2, disapprove_pct: 40.6, undecided_pct: 16.2, sample_size: 1076, source_url: "https://www.businesstoday.com.tw/article/category/183027/post/202608250012/", note: "戴立安脫離美麗島電子報後首篇「台灣民心調查」；本檔案查找期間找不到2026-08卓榮泰個人施政滿意度的獨立TPOF報告，這筆是唯一同期可用的來源" }
];
