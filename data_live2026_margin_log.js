// 2026即時開票——縣市長層領先幅度隨時間變化紀錄，逐來源各自記錄(跟LIVE_TRACK_CC的
// sources[sourceKey]同一個巢狀慣例)，不合併成單一數字/單一條線——不同來源開票速度本來就
// 未必相同，有些直接沿用中選會官方進度、有些是自己統計，混在一起畫成一條線會製造「精確度」
// 的假象，也跟_liveTrack26Html()「每個來源各自一條bar」同一個設計意圖。目前這支腳本只有
// auto_poll一個真正會自動寫入的來源(見FETCHERS)，但結構先比照多來源設計，以後真的多了
// 別的自動來源也能各自累積自己的時間序列，不用重寫資料結構。不記錄黨籍：LIVE_TRACK_CC/
// _parse_cec_table()本身都只有候選人姓名+票數(來源網頁沒結構化黨籍欄位)，前端畫圖時用
// 既有的_liveCandParty(cc, ldrName)即時查，不在Python這端塞一個永遠是null的欄位。
// 結構：{ [ccCode]: { [sourceKey]: [ { ts, ldrName, marginPct }, ... ], ... }, ... }
const LIVE2026_MARGIN_LOG = {};
