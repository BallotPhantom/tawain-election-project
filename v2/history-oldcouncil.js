/* History → 地方 → 縣市議員, 1998, 2002, 2005／06, 2009／10 (user 2026-10-31: 「縣市議員 1998–2009／10」).
 *
 * Drawn on today's map like history-oldmayor.js (user: 「地圖就不用找了，沒資料對不上就算了」), inside History's own iframe
 * copy of council.html (V1 untouched): the engine is put in its 2014 縣市議員 mode (legend, toolbars, panel frame,
 * county-council box), then the map is replaced —
 *  - 全台: one block per 區域 district (its townships merged; a township split between districts by its villages),
 *    filled by councilDistColor's rule (政黨比例: first party's votes minus the second's; 最高候選人: the top candidate's
 *    lead) via _councilPartyColor; hovering a district darkens every other council (the engine's 縣市暗色遮罩,
 *    _councilSetCountyDim — user: 「2014的黑色遮罩（跟滑鼠互動的）09跟以前也要用」) and draws that council's seats in the
 *    county-council box (drawCountyHemiForED's geometry, the district's seats lit);
 *  - click a district → its townships (each by its own votes), click a township → its villages; 「⊞ 全選區村里」 opens
 *    every village of the district; 全台鄉鎮市區 / 全台村里 in the bar likewise;
 *  - 平地／山地原住民 (the engine's toggles): the indigenous districts of that cycle as their own solid map, the rest
 *    black (as history-councilind.js); 臺北 / 高雄 before 2010 elected one combined 原住民 seat set, shown with 平地;
 *  - districts whose CEC township rows are incomplete say so (pt), 2005 新竹市 has district totals only (pt 2).
 * Data: OLD_COUNCIL (v2/data_oldcouncil.js, build_v2_oldcouncil.py, tests/reconcile_v2_oldcouncil.py).
 * V2OldCouncil.draw(win, cycle) after setCouncilElectionMode(V2OldCouncil.ENGINE_YEAR); V2OldCouncil.clear(win).
 */
(function () {
  var BLACK = '#0a0d16';
  // no data ≠ no election (user 2026-11-01: 「沒有資料的村里應該…灰底…沒有選舉的黑底不必改」): a place without data takes the
  // engine's own no-data grey — '#e0e0e0' (councilVillColor / councilTCTcColor; test.html's vcColor)
  var NO_DATA_FILL = '#e0e0e0';
  var ENGINE_YEAR = '2014';
  var EN = { '臺北市': 'Taipei City', '高雄市': 'Kaohsiung City', '新北市': 'New Taipei City', '臺中市': 'Taichung City', '臺南市': 'Tainan City',
    '臺北縣': 'Taipei County', '臺中縣': 'Taichung County', '臺南縣': 'Tainan County', '高雄縣': 'Kaohsiung County', '桃園縣': 'Taoyuan County',
    '宜蘭縣': 'Yilan County', '新竹縣': 'Hsinchu County', '苗栗縣': 'Miaoli County', '彰化縣': 'Changhua County', '南投縣': 'Nantou County',
    '雲林縣': 'Yunlin County', '嘉義縣': 'Chiayi County', '屏東縣': 'Pingtung County', '臺東縣': 'Taitung County', '花蓮縣': 'Hualien County',
    '澎湖縣': 'Penghu County', '基隆市': 'Keelung City', '新竹市': 'Hsinchu City', '嘉義市': 'Chiayi City', '金門縣': 'Kinmen County', '連江縣': 'Lienchiang County' };

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(cyc) { return (typeof OLD_COUNCIL !== 'undefined' ? OLD_COUNCIL : {})[cyc] || null; }
  function T(c, zh, en) { return c.win.T(zh, en); }
  function cname(c, n) { return T(c, n, EN[n] || n); }

  // ── colours: councilDistColor's two rules on a [elig, cast, valid, v0…] vector ──
  function ranked(d, vec) { return d.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], v: vec[3 + i] }; }).sort(function (a, b) { return b.v - a.v; }); }
  function fill(c, d, vec) {
    if (!d || !vec || !vec[2]) return NO_DATA_FILL;
    var s = ranked(d, vec), tot = vec[2], win = c.win;
    if (!s[0].v) return NO_DATA_FILL;
    if (G(win, 'councilMode') === 'candidate') {
      return win._councilPartyColor(s[0].p, Math.max(0.05, Math.min(0.5, (s[0].v - (s[1] ? s[1].v : 0)) / tot)));
    }
    var pv = {}; s.forEach(function (x) { pv[x.p] = (pv[x.p] || 0) + x.v; });
    var pairs = Object.keys(pv).map(function (p) { return [p, pv[p]]; }).sort(function (a, b) { return b[1] - a[1]; });
    return win._councilPartyColor(pairs[0][0], Math.max(0.05, Math.min(0.5, (pairs[0][1] - (pairs[1] ? pairs[1][1] : 0)) / tot)));
  }
  function villVec(d, vc) {
    if (!d) return null;
    if (d.vc[vc]) return { vec: d.vc[vc] };
    var j = d.jv[vc];
    return j ? { vec: d.jr[j].slice(1), joint: d.jr[j][0] } : null;
  }
  function clr(c, p) { var CLR = G(c.win, 'COUNCIL_CLR') || {}, PM = G(c.win, 'PARTY_COLOR_MAP') || {}; return CLR[p] || PM[p] || '#aaa'; }

  // ── names ──
  function distName(c, x) {
    var d = x.d, no = +d.a;
    if (d.i) return cname(c, x.council.n) + T(c, '原住民選區（平地山地合併）', ' indigenous district (plains + mountain)');
    if (x.kind === 'p') return cname(c, x.council.n) + T(c, '平地原住民第' + no + '選區', ' Plains Indigenous District ' + no);
    if (x.kind === 'm') return cname(c, x.council.n) + T(c, '山地原住民第' + no + '選區', ' Mountain Indigenous District ' + no);
    return cname(c, x.council.n) + T(c, '第' + no + '選區', ' District ' + no);
  }
  function elecName(c, x) { return x.council.y + T(c, x.council.m ? ' 直轄市議員選舉' : ' 縣市議員選舉', x.council.m ? ' Municipal Council Election' : ' County / City Council Election'); }
  function tcName(c, tc) { var NM = G(c.win, 'NM'), raw = (NM && NM.t && NM.t[tc]) || tc; return typeof c.win.translateTownship === 'function' ? c.win.translateTownship(raw) : raw; }
  function vcName(c, vc) {
    var NM = G(c.win, 'NM'), raw = (NM && NM.v && NM.v[vc]) || vc, n = raw.indexOf(' ') !== -1 ? raw.split(' ').slice(1).join(' ') : raw;
    return typeof c.win.translateVillage === 'function' ? c.win.translateVillage(vc, n) : n;
  }

  // ── panels (the engine's pieces) ──
  function hint(c, zh, en) { return '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T(c, zh, en) + '</div>'; }
  function villAllButton(c, x, zh, en) {
    zh = zh || '逐鄉鎮進入 ▶'; en = en || 'Enter by township ▶';
    if (!Object.keys(x.d.vc).length && !Object.keys(x.d.jv).length) return hint(c, zh, en);
    return '<div style="display:flex;gap:6px;margin-top:10px"><div class="hint" style="flex:1;text-align:center;opacity:0.5">' + T(c, zh, en) + '</div>' +
      '<button class="btn v2-oc-villall" data-x="' + x.idx + '" style="flex:1;font-size:10px;padding:4px 6px;background:rgba(27,158,75,0.18);color:#4ade80;border:1px solid rgba(27,158,75,0.45);border-radius:4px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 0 6px rgba(74,222,128,0.4);cursor:pointer"><span>' + T(c, '⊞ 全選區村里', '⊞ All Villages') + '</span></button></div>';
  }
  function ptNote(c, x) {
    if (x.d.pt === 2) return '<div style="font-size:10px;color:#f59e0b;margin-top:6px">' + T(c, '中選會這一屆的鄉鎮、村里列把不同選區混在一起，只顯示選區合計', 'CEC\'s township / village rows of this council mix districts: district totals only') + '</div>';
    if (x.d.pt) return '<div style="font-size:10px;color:#f59e0b;margin-top:6px">' + T(c, '中選會這一屆的鄉鎮列不完整，地圖上部分鄉鎮沒有資料（黑色）', 'CEC\'s township rows of this district are incomplete: some townships show no data (black)') + '</div>';
    return '';
  }
  // ── the engine's 縣市議員 panels, piece for piece (audit 2026-11-01, user: 「增加年的時候完全遵守已經固定下來的設計」「tag
  // 位置也不對…應該在長條圖的上面」): district = _councilShowEDPanel, township = _councilTCPanelHtml, village =
  // _councilShowVCPanel — same order: title · 應選N席, lights, 「X 得票率最高」, seat chips, then the candidate bars ──
  function typeLbl(c, x) { return /市$/.test(x.council.n) ? T(c, '市議員', 'City Councilor') : T(c, '縣議員', 'County Councilor'); }
  function partyVotes(x, vec) { var pv = {}; x.d.cands.forEach(function (y, i) { pv[y[1]] = (pv[y[1]] || 0) + vec[3 + i]; }); return pv; }
  function topBadge(c, pv, zh, en) {
    var top = Object.keys(pv).sort(function (a, b) { return pv[b] - pv[a]; })[0], LBL = G(c.win, 'COUNCIL_LBL') || {};
    return top ? c.win._glassBadge(clr(c, top), (LBL[top] || top) + ' ' + T(c, zh, en)) : '';
  }
  function seatChips(c, x) {
    var sb = {}, LBL = G(c.win, 'COUNCIL_LBL') || {};
    x.d.cands.forEach(function (y) { if (y[2]) sb[y[1]] = (sb[y[1]] || 0) + 1; });
    return Object.keys(sb).sort(function (a, b) { return sb[b] - sb[a]; }).map(function (p) {
      var col = clr(c, p);
      return '<span style="display:inline-flex;align-items:center;gap:2px;margin-right:4px;margin-bottom:3px;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:' + col + '22;border:1px solid ' + col + '55;color:' + col + '">' + (LBL[p] || p) + '&nbsp;' + T(c, sb[p] + '席', String(sb[p])) + '</span>';
    }).join('');
  }
  // rows with the engine's term tags (×N / 新 / 回鍋 / 連任失敗) counted from 1998 (history-councilterms.js): today's county
  // key, the district, plains / mountain for the 原住民 rows, and this cycle as the year while they render
  function candList(c, x, vec, divider) {
    var s = ranked(x.d, vec), maxV = (s[0] || {}).v || 1, cm = {}, last = -1, win = c.win;
    s.forEach(function (y, i) { cm[y.n] = clr(c, y.p); if (y.e) last = i; });
    var ck = window.V2CouncilTerms ? window.V2CouncilTerms.key(x.council.cc) : undefined, ind = x.kind === 'r' ? undefined : x.kind === 'p';
    win.__v2TermYear = c.cyc;
    try { return s.map(function (y, i) { return win.renderCouncilCandRow(y, vec[2], maxV, cm, ck, divider && i === last, ind, x.d.a); }).join(''); }
    finally { win.__v2TermYear = null; }
  }
  // _councilTrafficLights: turnout / valid-vote pills ranked against every district of the cycle
  function distLights(c, x) {
    if (!c.tlD) { c.tlD = {}; c.list.forEach(function (y) { var v = y.d.v; if (v[0] && v[1]) c.tlD[y.idx] = [+(v[1] / v[0] * 100).toFixed(2), +(v[2] / v[1] * 100).toFixed(2)]; }); }
    return c.win._turnoutTrafficLights(c.tlD, x.idx, 'v2oc' + c.cyc);
  }
  function noData(c, title) { return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:8px">' + T(c, '無資料', 'No data') + '</div>'; }
  function careerCtx(c, x) { c.win.__v2CareerCtx = x ? { race: 'C', year: x.council.y } : null; }   // career.js: this council's year
  function distPanel(c, x, extra) {
    careerCtx(c, x);
    var seats = x.d.cands.filter(function (y) { return y[2]; }).length;
    var ind = x.kind !== 'r' ? '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + x.council.y + ' ' + (x.d.i ? T(c, '原住民', 'Indigenous') : x.kind === 'p' ? T(c, '平地原住民', 'Plains Indigenous') : T(c, '山地原住民', 'Mountain Indigenous')) + '</div>' : '';
    return '<div class="t1">' + distName(c, x) + ' <span style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.5)">· ' + T(c, '應選' + seats + '席', seats + ' seats') + '</span></div>' + ind +
      distLights(c, x) +
      '<div style="margin-bottom:4px;margin-top:4px">' + topBadge(c, partyVotes(x, x.d.v), '得票率最高', 'highest vote share') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:2px">' + seatChips(c, x) + '</div>' +
      '<div class="sec-title" style="margin-top:6px;margin-bottom:4px">' + T(c, '候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:260px;overflow-y:auto">' + candList(c, x, x.d.v, true) + '</div>' + ptNote(c, x) + (extra || '');
  }
  function tcPanel(c, x, tc, extra) {
    careerCtx(c, x);
    var vec = x.d.tc[tc], seats = x.d.cands.filter(function (y) { return y[2]; }).length;
    if (!vec || !vec[2]) return noData(c, tcName(c, tc)) + (extra || '');
    return '<div class="t1">' + tcName(c, tc) + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + distName(c, x) + ' · ' + T(c, '應選' + seats + '席', seats + ' seats') + '</div>' +
      '<div style="margin-bottom:5px">' + topBadge(c, partyVotes(x, vec), '得票率最高', 'highest vote share') + '</div>' +
      '<div style="margin-bottom:6px;display:flex;flex-wrap:wrap">' + seatChips(c, x) + '</div>' +
      '<div class="sec-title" style="margin-top:8px">' + x.council.y + ' ' + T(c, typeLbl(c, x) + '得票 (本鄉鎮)', typeLbl(c, x) + ' votes (this township)') + '</div>' +
      '<div style="max-height:220px;overflow-y:auto">' + candList(c, x, vec, false) + '</div>' + (extra || '');
  }
  function vcPanel(c, x, vc) {
    careerCtx(c, x);
    var r = villVec(x.d, vc), vn = vcName(c, vc);
    if (!r || !r.vec || !r.vec[2]) return '<div class="t1">' + vn + '</div><div style="color:#bbb;font-size:11px;margin-top:8px">' + T(c, '此村里無' + x.council.y + typeLbl(c, x) + '資料', 'No ' + x.council.y + ' ' + typeLbl(c, x) + ' data for this village') + '</div>';
    var banner = r.joint ? '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
      T(c, '與「' + r.joint + '」合併開票，以下為合併後的數字', 'Counted jointly with 「' + r.joint + '」 — the figures below are the joint station\'s') + '</div>' : '';
    var pv = partyVotes(x, r.vec), top = Object.keys(pv).sort(function (a, b) { return pv[b] - pv[a]; })[0];
    return banner + '<div class="t1" style="color:' + (top ? clr(c, top) : '#888') + '">' + vn + '</div>' +
      '<div class="t2">' + distName(c, x) + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + x.council.y + ' ' + typeLbl(c, x) + '</div>' +
      '<div style="margin-bottom:5px;margin-top:5px">' + topBadge(c, pv, '得票最多', 'most votes') + '</div>' +
      '<div class="sec-title" style="margin-top:8px">' + x.council.y + ' ' + T(c, typeLbl(c, x) + '得票 (本里)', typeLbl(c, x) + ' votes (this village)') + '</div>' +
      '<div style="max-height:220px;overflow-y:auto">' + candList(c, x, r.vec, false) + '</div>';
  }
  function nationalPanel(c) {
    return '<div class="t1">' + c.d.label + T(c, ' 縣市議員選舉', ' Council Elections') + '</div>' +
      '<div style="color:#bbb;font-size:11px;margin-top:4px;line-height:1.6">' + T(c, '以今日行政區畫出；每個選區就是它當年涵蓋的鄉鎮市區。移到各選區查看資料，點選進入鄉鎮市區',
        'Drawn on today\'s map: each district covers the townships it had then. Hover a district to view it; click to enter its townships') + '</div>';
  }

  // ── hemicycle: the council's seats in the engine's county-council box ──
  // drawCountyHemiForED's markup (audit 2026-11-01, user: 「縣市長的黨籍跟市議員黨籍席次沒有加顏色匡…audit 09即以前跟14及以後有什麼
  // 差距」): title 「1998縣議員／市議員」 (_councilTypeLbl), parties in its PORD order, the mayor's party (non-independent) boxed
  // in 縣市長 mode, ▲/▼ seat change vs the same council a cycle earlier (_countyPartySeatChangeArrow)
  var PORD = ['dpp', 'kmt', 'tpp', 'npp', 'tsr', 'npa', 'gp', 'pfp', 'tsu', 'lp', 'sdp', 'np', 'szmd', 'ind'];
  var PREV = { '2002': '1998', '2005': '2002', '2009': '2005' };
  function prevSeats(cyc, council) {
    var d = PREV[cyc] && dataFor(PREV[cyc]);
    var k = d && d.councils.filter(function (x) { return x.n === council.n; })[0];
    return k ? k.seats : null;
  }
  function hemi(c, council, hiIdx, mayorP) {
    var win = c.win, doc = win.document, CLR = G(win, 'COUNCIL_CLR') || {}, ORDER = G(win, 'COUNCIL_CAMP_ORDER') || {};
    var panel = doc.getElementById('county-council-panel'); if (panel) panel.style.display = '';
    var b5 = doc.getElementById('council-base5-toggle-row'); if (b5) b5.style.display = 'none';
    var b5c = doc.getElementById('ccp-base5-compare'); if (b5c) b5c.innerHTML = '';
    var titleEl = doc.getElementById('ccp-county-title'), srEl = doc.getElementById('ccp-seat-ratio'), centerEl = doc.getElementById('ccp-hemi-center');
    var svg = win.d3.select('#ccp-hemi-svg');
    if (!council) {
      if (titleEl) { titleEl.textContent = T(c, '移到地圖選區查看縣市議會席次', 'Hover a district to see its council seats'); titleEl.style.color = '#bbb'; }
      if (srEl) srEl.innerHTML = ''; if (centerEl) centerEl.textContent = ''; svg.selectAll('*').remove();
      return;
    }
    var isCity = /市$/.test(council.n);
    if (titleEl) { titleEl.textContent = council.y + (isCity ? T(c, '市議員', 'City Councilor') : T(c, '縣議員', 'County Councilor')); titleEl.title = cname(c, council.n); titleEl.style.color = ''; }
    var dots = [];
    c.list.forEach(function (x) { if (x.council === council) x.d.cands.forEach(function (y) { if (y[2]) dots.push({ p: y[1], idx: x.idx }); }); });
    var bp = {}; dots.forEach(function (s) { bp[s.p] = (bp[s.p] || 0) + 1; });
    var logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : null");
    var parties = PORD.filter(function (p) { return bp[p]; }).concat(Object.keys(bp).filter(function (p) { return PORD.indexOf(p) === -1 && p !== 'other'; }));
    var prev = c.cyc ? prevSeats(c.cyc, council) : null;
    var hA = function (hex, a) { var h = (hex || '').length === 7 ? hex : '#888888'; return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')'; };
    var arrow = function (p, n) {
      if (!prev) return '';
      var was = prev[p] || 0; if (was === n) return '';
      var diff = n - was;
      return '<span title="' + T(c, '上屆' + was + '席', 'Was ' + was + ' seats last cycle') + '" style="margin-left:2px;font-weight:700;font-size:11px;color:' + (diff > 0 ? '#22c55e' : '#ef4444') + '">' + (diff > 0 ? '▲+' : '▼') + diff + '</span>';
    };
    if (srEl) srEl.innerHTML = parties.map(function (p) {
      var col = CLR[p] || '#aaa', logo = logos && logos[p]
        ? '<span style="display:inline-block;width:12px;height:12px;transform:scale(0.8);transform-origin:center;vertical-align:middle;">' + logos[p] + '</span>'
        : '<span style="width:8px;height:8px;border-radius:50%;background:' + col + ';display:inline-block;vertical-align:middle;flex-shrink:0"></span>';
      var box = mayorP && mayorP !== 'ind' && p === mayorP ? 'background:' + hA(col, 0.13) + ';border:1px solid ' + hA(col, 0.5) + ';border-radius:5px;padding:1px 4px;' : 'margin:0 4px;';
      return '<div class="sr-badge" style="display:inline-flex;align-items:center;gap:3px;' + box + '">' + logo + '<span class="sr-num" style="font-weight:700;font-size:11px;vertical-align:middle;color:' + col + '">' + bp[p] + '</span>' + arrow(p, bp[p]) + '</div>';
    }).join('') + (bp.other ? '<div class="sr-badge" style="display:inline-flex;align-items:center;gap:3px;margin:0 4px;"><span style="width:8px;height:8px;border-radius:50%;background:#aaa;display:inline-block;vertical-align:middle;"></span><span class="sr-num" style="font-weight:700;font-size:11px;">' + bp.other + '</span>' + arrow('other', bp.other) + '</div>' : '');
    if (centerEl) centerEl.textContent = dots.length;
    dots.sort(function (a, b) { return ((ORDER[a.p] || 99) - (ORDER[b.p] || 99)) || (a.idx - b.idx); });
    var W = 185, H = 95, cx = 92, cy = 90, sR = 28, eR = 84, total = dots.length, R = total > 70 ? 3.6 : total > 50 ? 4.2 : 5.0;
    var rows = total <= 20 ? 3 : total <= 35 ? 4 : total <= 55 ? 5 : total <= 75 ? 6 : 7;
    svg.attr('width', W).attr('height', H).selectAll('*').remove();
    var dark = function (hex) { var h = (hex || '').length === 7 ? hex : '#888888'; return 'rgb(' + ((parseInt(h.slice(1, 3), 16) * 0.3) | 0) + ',' + ((parseInt(h.slice(3, 5), 16) * 0.3) | 0) + ',' + ((parseInt(h.slice(5, 7), 16) * 0.3) | 0) + ')'; };
    win.generateHemiPoints(total, cx, cy, sR, eR, rows, 0.38, 1.2).forEach(function (pt, i) {
      var d = dots[i] || { p: 'other', idx: -1 }, base = CLR[d.p] || '#aaa', on = hiIdx == null || (hiIdx.indexOf ? hiIdx.indexOf(d.idx) !== -1 : d.idx === hiIdx);
      svg.append('circle').attr('cx', pt.cx).attr('cy', pt.cy).attr('r', R).attr('fill', on ? base : dark(base))
        .attr('stroke', '#fff').attr('stroke-width', R * 0.12).attr('opacity', on ? 1 : 0.9);
    });
  }

  // ── geometry ──
  function fresh(c) { c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg'); }
  function merged(c, key, test) {
    if (key in c.geom) return c.geom[key];
    var vg = c.VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && test(vc); });
    if (!vg.length) return (c.geom[key] = null);
    var m = c.win._cleanMergedGeom(c.win.topojson.merge(c.VD, vg)), g = m.type === 'Feature' ? m.geometry : m;
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, g);
    return (c.geom[key] = { type: 'Feature', properties: {}, geometry: g });
  }
  // which district of a kind a village belongs to: its own row (split townships), else its township's single district
  function ownerOf(c, kind, vc) {
    var m = c.owner[kind];
    if (!m) {
      m = c.owner[kind] = { vc: {}, tc: {} };
      c.list.forEach(function (x) {
        if (x.kind !== kind) return;
        Object.keys(x.d.vc).concat(Object.keys(x.d.jv)).forEach(function (v) { m.vc[v] = x.idx; });
        Object.keys(x.d.tc).concat(x.d.tcs || []).forEach(function (t) { (m.tc[t] = m.tc[t] || []).push(x.idx); });   // tcs: totals-only districts
      });
    }
    if (vc in m.vc) return m.vc[vc];
    var t = m.tc[vc.slice(0, 8)];
    return t ? t[0] : null;
  }
  function distFeature(c, x) {
    var f = merged(c, 'd' + x.idx, function (vc) { return ownerOf(c, x.kind, vc) === x.idx; });
    if (f) f.properties = { x: x.idx };
    return f;
  }
  function councilFeature(c, council) {
    var ci = c.councils.indexOf(council);
    var f = merged(c, 'c' + ci, function (vc) { var i = ownerOf(c, 'r', vc); return i != null && c.list[i].council === council; });
    return f;
  }
  function tcFeature(c, tc) {
    var f = merged(c, 't' + tc, function (vc) { return vc.indexOf(tc) === 0; });
    if (f) f.properties = { tc: tc };
    return f;
  }

  // ── layers ──
  function ic(c, html) {
    var el = c.win.document.getElementById('ic'); if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.v2-oc-villall').forEach(function (b) { b.onclick = function () { distVillages(c, c.list[+b.dataset.x]); }; });
  }
  function begin(c, view, lvl) {
    fresh(c);
    c.view = view;
    ['btn-tc-nat', 'btn-vill-nat'].forEach(function (b) { var el = c.win.document.getElementById(b); if (el) el.classList.remove('active'); });
    c.win.eval("level = '" + lvl + "'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(c.win, 'clearAll')();
    var gInd = G(c.win, 'gInd'); if (gInd) gInd.selectAll('*').remove();
    undim(c);
    c.win.document.getElementById('mp').style.background = c.win.mapBgColor();
  }
  function hov(c) {
    var layer = c.gBase.node();
    if (!c.hov || c.hovLayer !== layer) { c.hov = window.V2TcBorder.hover(c.win, layer, 'v2-blk-hov'); c.hovLayer = layer; }
    return c.hov;
  }
  function blocks(c, feats, fillOf, onOver, onClick, villStroke) {
    var sel = c.gBase.selectAll('.v2-oc-blk').data(feats).join('path')
      .attr('class', 'ft v2-oc-blk v2-own').attr('d', c.pathFn).style('animation', 'none').attr('fill', fillOf)
      .attr('cursor', function (d) { return onClick && onClick.can(d) ? 'pointer' : 'default'; })
      .on('mouseover', function (e, d) { hov(c).show(this.getAttribute('d')); onOver(d); })
      .on('mouseleave', function () { hov(c).hide(); })
      .on('click', function (e, d) { if (onClick && onClick.can(d)) onClick.go(d); });
    if (villStroke) sel.attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke');
    else sel.attr('stroke', fillOf).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke');
  }
  function border(c, cls, data, kind) { window.V2TcBorder.lines(c.gBase, c.pathFn, cls, data, kind); }
  // the national views in the engine's own 2014+ 縣市議員 lines, nothing of V2's (user 2026-11-01: 「台灣ED層不應該有白色邊線」
  // 「增加年的時候完全遵守已經固定下來的設計」): district edges = .ft-ed's stroke (rgba(255,255,255,.06), 0.6), county lines =
  // .co-b / .ft-council-border (rgba(255,255,255,.12), 0.9)
  function engineLines(c) {
    c.gBase.selectAll('.v2-oc-blk').attr('stroke', 'rgba(255,255,255,.06)').attr('stroke-width', 0.6);
    var CD = G(c.win, 'CD'); if (!CD) return;
    c.gBase.selectAll('.v2-oc-cob').data([c.win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; })]).join('path')
      .attr('class', 'v2-oc-cob').attr('d', c.pathFn).attr('fill', 'none').attr('stroke', 'rgba(255,255,255,.12)').attr('stroke-width', 0.9)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
  }
  function crumb(c, parts) {
    var el = c.win.document.getElementById('crumb'); if (!el) return;
    el.innerHTML = parts.map(function (p, i) { return p[1] ? '<span class="cl" data-i="' + i + '">' + p[0] + '</span>' : p[0]; }).join(' › ');
    el.querySelectorAll('.cl').forEach(function (s) { s.onclick = parts[+s.dataset.i][1]; });
  }
  function zoomAll(c) { if (!c.svg) return; c.svg.transition().duration(380).call(G(c.win, 'zm').transform, c.win.d3.zoomIdentity); try { c.win.eval('curK = 1'); } catch (e) {} }
  function legend(c) { setTimeout(function () { if (typeof c.win.renderLegend === 'function') c.win.renderLegend(); }, 50); }
  // the engine's 縣市暗色遮罩 (_councilSetCountyDim): every other council darkened while a district is hovered
  function dim(c, council) {
    if (c.dimFor === council) { clearTimeout(c.dimT); return; }
    clearTimeout(c.dimT);
    c.dimT = setTimeout(function () {
      c.dimFor = council;
      var g = G(c.win, 'gCountyDim'); if (!g) return;
      g.selectAll('*').remove();
      var others = c.councils.filter(function (k) { return k !== council; }).map(function (k) { return councilFeature(c, k); }).filter(Boolean);
      g.selectAll('.ft-cdim').data(others).join('path').attr('class', 'ft-cdim').attr('d', c.pathFn).attr('fill', 'rgba(0,0,0,0.45)').attr('pointer-events', 'none');
    }, 80);
  }
  function undim(c) { clearTimeout(c.dimT); c.dimFor = null; var g = G(c.win, 'gCountyDim'); if (g) g.selectAll('*').remove(); }
  var ALL = function (c) { return [T(c, '全台', 'All'), function () { national(c); }]; };

  function indKind(c) { var m = G(c.win, 'councilIndMode'); return m === 'plains' ? 'p' : m === 'highland' ? 'm' : null; }
  // 1. 全台: 區域 districts (or, with an indigenous toggle on, that kind's districts as their own solid map)
  function national(c) {
    var kind = indKind(c) || 'r';
    begin(c, ['nat'], 'ed');
    var xs = c.list.filter(function (x) { return x.kind === kind; }), feats = [];
    xs.forEach(function (x) { var f = distFeature(c, x); if (f) { f.properties.also = []; feats.push(f); } });
    // districts sharing a township the file has no villages for (1998 / 2005 新竹市: 東區 in two districts) cannot be told
    // apart on the map: they ride on the block of the district that holds the township, and its panel lists them all
    xs.forEach(function (x) {
      if (feats.some(function (f) { return f.properties.x === x.idx; })) return;
      var t = Object.keys(x.d.tc).concat(x.d.tcs || [])[0], host = t != null ? ownerOf(c, kind, t + '000') : null;
      var hf = feats.filter(function (f) { return f.properties.x === host; })[0];
      if (hf) hf.properties.also.push(x.idx);
    });
    var group = function (f) { return [f.properties.x].concat(f.properties.also); };
    var groupFill = function (f) {
      var g = group(f);
      if (g.length === 1) { var x = c.list[g[0]]; return fill(c, x.d, x.d.v); }
      var pv = {}, tot = 0;   // 政黨比例 of the districts together
      g.forEach(function (i) { var d = c.list[i].d; tot += d.v[2]; d.cands.forEach(function (y, j) { pv[y[1]] = (pv[y[1]] || 0) + d.v[3 + j]; }); });
      var pairs = Object.keys(pv).map(function (p) { return [p, pv[p]]; }).sort(function (a, b) { return b[1] - a[1]; });
      return c.win._councilPartyColor(pairs[0][0], Math.max(0.05, Math.min(0.5, (pairs[0][1] - (pairs[1] ? pairs[1][1] : 0)) / tot)));
    };
    blocks(c, feats, groupFill,
      function (f) {
        var g = group(f), x = c.list[g[0]];
        ic(c, g.map(function (i) { return distPanel(c, c.list[i]); }).join('<div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a2a2a"></div>') +
          (g.length > 1 ? sharedNote(c, g) : villAllButton(c, x)));
        hemi(c, x.council, g); if (kind === 'r') dim(c, x.council);
      },
      { can: function () { return true; }, go: function (f) { district(c, c.list[f.properties.x]); } });
    // district lines: the engine's council border style; council lines white
    engineLines(c);
    c.svg && c.svg.on('mouseleave.v2oc', function () { undim(c); });
    ic(c, nationalPanel(c));
    hemi(c, null);
    crumb(c, [[T(c, '全台', 'All'), null]]);
    zoomAll(c); legend(c);
  }
  function sharedNote(c, g) {
    return '<div style="font-size:10px;color:#f59e0b;margin-top:8px">' + T(c, '這幾個選區共用同一個鄉鎮，當年沒有村里資料可以分開，地圖上畫成同一塊', 'These districts share a township the file has no villages for: one block on the map') + '</div>' +
      hint(c, '點選進入 ▶', 'Click to enter ▶');
  }
  // the other districts sharing this district's block (see national)
  function sharers(c, x) {
    var mine = Object.keys(x.d.tc).concat(x.d.tcs || []);
    return c.list.filter(function (y) { return y !== x && y.kind === x.kind && y.council === x.council && Object.keys(y.d.tc).concat(y.d.tcs || []).some(function (t) { return mine.indexOf(t) !== -1; }) &&
      !Object.keys(y.d.vc).length && !Object.keys(x.d.vc).length; });
  }
  // 2. one district's townships
  // 最高候選人 inside a district — the engine's own pieces (user 2026-11-01: 「最高候選人98年鄉鎮市區跟村里層你沒做到」):
  // each candidate in CAND_PALETTE by party and strength (_buildCandColorMap), the top candidate's name on his ground
  // (_drawCandCentroidLabels), his whole ground outlined on hover (_candHighlightSetup)
  function candMode(c) { return G(c.win, 'councilMode') === 'candidate'; }
  function candColors(c, x) {
    c.cmap = c.cmap || {};
    if (c.cmap[x.idx]) return c.cmap[x.idx];
    var PAL = G(c.win, 'CAND_PALETTE') || {}, by = {}, map = {};
    x.d.cands.forEach(function (y, i) { (by[y[1]] = by[y[1]] || []).push({ n: y[0], v: x.d.v[3 + i] }); });
    Object.keys(by).forEach(function (p) { var pal = PAL[p] || PAL.other || ['#aaa']; by[p].sort(function (a, b) { return b.v - a.v; }).forEach(function (y, i) { map[y.n] = pal[i % pal.length]; }); });
    return (c.cmap[x.idx] = map);
  }
  function topCand(x, vec) { if (!vec || !vec[2]) return null; var s = ranked(x.d, vec); return s[0] && s[0].v ? s[0] : null; }
  function innerFill(c, x, vec) {   // a township / village inside a district
    if (!candMode(c)) return fill(c, x.d, vec);
    var t = topCand(x, vec); return t ? (candColors(c, x)[t.n] || clr(c, t.p)) : NO_DATA_FILL;
  }
  function candLayer(c, x, feats, vecOf, keyOf) {
    if (!candMode(c)) return;
    var win = c.win, cm = candColors(c, x), won = {};
    feats.forEach(function (f) { var t = topCand(x, vecOf(f)); if (t) won[keyOf(f)] = t.n; });
    win._drawCandCentroidLabels(feats, function (f) { return topCand(x, vecOf(f)); }, cm, c.gBase);
    win._candHighlightSetup(c.gBase.selectAll('.v2-oc-blk'), won, keyOf, function (cand) {
      var set = new Set();
      c.VD.objects.villages.geometries.forEach(function (g) {
        var vc = g.properties && g.properties.vc; if (!vc || ownerOf(c, x.kind, vc) !== x.idx) return;
        if (won[vc] === cand || won[vc.slice(0, 8)] === cand) set.add(vc);
      });
      return set;
    });
  }
  function district(c, x) {
    begin(c, ['dist', x.idx], 'tc');
    var feats = Object.keys(x.d.tc).sort().map(function (tc) { return tcFeature(c, tc); }).filter(Boolean);
    var df = distFeature(c, x);
    if (df) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(df)).attr('pointer-events', 'none');
    var hasV = function (tc) { return Object.keys(x.d.vc).some(function (v) { return v.indexOf(tc) === 0; }) || Object.keys(x.d.jv).some(function (v) { return v.indexOf(tc) === 0; }); };
    if (!feats.length && df) feats = [df];   // district totals only (pt 2): the district itself
    if (!feats.length) feats = (x.d.tcs || []).map(function (tc) { return tcFeature(c, tc); }).filter(Boolean);   // …sharing its township
    blocks(c, feats, function (f) { var tc = f.properties.tc; return tc ? innerFill(c, x, x.d.tc[tc]) : innerFill(c, x, x.d.v); },
      function (f) { var tc = f.properties.tc; ic(c, tc ? tcPanel(c, x, tc, hasV(tc) ? villAllButton(c, x, '點擊進入村里層 ▶', 'Click to enter village level ▶') : hint(c, '此屆無村里層資料', 'No village-level data for this election')) : distPanel(c, x)); },
      { can: function (f) { return f.properties.tc && hasV(f.properties.tc); }, go: function (f) { township(c, x, f.properties.tc); } });
    border(c, 'v2-oc-tcb', feats, 'tc');
    if (df) border(c, 'v2-oc-db', [df], 'outline');
    candLayer(c, x, feats.filter(function (f) { return f.properties.tc; }), function (f) { return x.d.tc[f.properties.tc]; }, function (f) { return f.properties.tc; });
    var sh = sharers(c, x);
    ic(c, distPanel(c, x, villAllButton(c, x) + (sh.length ? '<div style="margin-top:8px;font-size:11px;color:#bbb">' + T(c, '同一鄉鎮的其他選區：', 'Other districts in the same township: ') +
      sh.map(function (y) { return '<span class="cl v2-oc-go" data-x="' + y.idx + '" style="color:#7dd3fc;cursor:pointer;margin-right:6px">' + distName(c, y) + '</span>'; }).join('') + '</div>' : '')));
    [].forEach.call(c.win.document.querySelectorAll('#ic .v2-oc-go'), function (el) { el.onclick = function () { district(c, c.list[+el.dataset.x]); }; });
    hemi(c, x.council, x.idx);
    crumb(c, [ALL(c), [distName(c, x), null]]);
    if (feats.length) G(c.win, 'fitFeats')(feats);
    legend(c);
  }
  function villageLayer(c, x, feats) {
    var vecOf = function (f) { var r = villVec(x.d, f.properties.vc); return r && r.vec; };
    blocks(c, feats, function (f) { return innerFill(c, x, vecOf(f)); },
      function (f) { ic(c, vcPanel(c, x, f.properties.vc)); }, null, true);
    c.pendingCand = function () { candLayer(c, x, feats, vecOf, function (f) { return f.properties.vc; }); };
  }
  // 3. one township's villages (of this district)
  function township(c, x, tc) {
    begin(c, ['tc', x.idx, tc], 'vill');
    var feats = c.win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && vc.indexOf(tc) === 0 && ownerOf(c, x.kind, vc) === x.idx; });
    if (!feats.length) return;
    var tf = tcFeature(c, tc);
    if (tf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(tf)).attr('pointer-events', 'none');
    villageLayer(c, x, feats);
    if (tf) border(c, 'v2-oc-tcb', [tf], 'tc');
    c.pendingCand();
    ic(c, tcPanel(c, x, tc, hint(c, '移到各村里查看得票', 'Hover a village for its votes')));
    hemi(c, x.council, x.idx);
    crumb(c, [ALL(c), [distName(c, x), function () { district(c, x); }], [tcName(c, tc), null]]);
    G(c.win, 'fitFeats')(feats); legend(c);
  }
  // 「⊞ 全選區村里」
  function distVillages(c, x) {
    begin(c, ['dvill', x.idx], 'vill');
    var feats = c.win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && ownerOf(c, x.kind, vc) === x.idx; });
    if (!feats.length) return;
    var df = distFeature(c, x);
    if (df) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(df)).attr('pointer-events', 'none');
    villageLayer(c, x, feats);
    border(c, 'v2-oc-tcb', Object.keys(x.d.tc).map(function (tc) { return tcFeature(c, tc); }).filter(Boolean), 'tc');
    if (df) border(c, 'v2-oc-db', [df], 'outline');
    c.pendingCand();
    ic(c, distPanel(c, x));
    hemi(c, x.council, x.idx);
    crumb(c, [ALL(c), [distName(c, x), function () { district(c, x); }], [T(c, '全選區村里', 'All villages'), null]]);
    G(c.win, 'fitFeats')(feats); legend(c);
  }
  // 全台鄉鎮市區 / 全台村里: every township / village by its 區域 district's votes there
  function allTowns(c) {
    begin(c, ['alltc'], 'tc');
    var seen = {}, feats = [];
    c.win.getTCGJ().features.forEach(function (f) { var tc = f.properties.tc; if (seen[tc]) return; seen[tc] = 1; feats.push(tcFeature(c, tc) || f); });
    var xOf = function (tc) { var m = ownerOf(c, 'r', tc + '000'); var t = c.owner.r.tc[tc]; return t ? c.list[t[0]] : null; };
    blocks(c, feats, function (f) { var x = xOf(f.properties.tc); return x ? fill(c, x.d, x.d.tc[f.properties.tc]) : NO_DATA_FILL; },   // councilTCTcColor: party colour in both modes
      function (f) { var x = xOf(f.properties.tc); ic(c, x ? tcPanel(c, x, f.properties.tc) : '<div class="t1">' + tcName(c, f.properties.tc) + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T(c, '無資料', 'No data') + '</div>'); if (x) hemi(c, x.council, x.idx); },
      { can: function (f) { return !!xOf(f.properties.tc); }, go: function (f) { district(c, xOf(f.properties.tc)); } });
    border(c, 'v2-oc-tcb', feats, 'tc');
    engineLines(c);
    ic(c, nationalPanel(c));
    crumb(c, [ALL(c), [T(c, '全台鄉鎮市區', 'All townships'), null]]);
    var b = c.win.document.getElementById('btn-tc-nat'); if (b) b.classList.add('active');
    zoomAll(c); legend(c);
  }
  function allVillages(c) {
    begin(c, ['allvill'], 'vill');
    var feats = c.win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { return f.properties.vc; });
    blocks(c, feats, function (f) { var i = ownerOf(c, 'r', f.properties.vc), x = i != null ? c.list[i] : null, r = x && villVec(x.d, f.properties.vc); return x ? fill(c, x.d, r && r.vec) : NO_DATA_FILL; },
      function (f) { var i = ownerOf(c, 'r', f.properties.vc); if (i != null) ic(c, vcPanel(c, c.list[i], f.properties.vc)); }, null, true);
    engineLines(c);
    ic(c, nationalPanel(c) + (c.cyc === '1998' ? '<div style="color:#bbb;font-size:11px;margin-top:6px">' + T(c, '1998 只有直轄市（臺北市、高雄市）有村里層資料，其餘為黑色', '1998 has village data for Taipei and Kaohsiung only; the rest are black') + '</div>' : ''));
    crumb(c, [ALL(c), [T(c, '全台村里', 'All villages'), null]]);
    var b = c.win.document.getElementById('btn-vill-nat'); if (b) b.classList.add('active');
    zoomAll(c); legend(c);
  }
  function redraw(c) {
    var v = c.view || ['nat'];
    if (v[0] === 'dist') district(c, c.list[v[1]]);
    else if (v[0] === 'tc') township(c, c.list[v[1]], v[2]);
    else if (v[0] === 'dvill') distVillages(c, c.list[v[1]]);
    else if (v[0] === 'alltc') allTowns(c);
    else if (v[0] === 'allvill') allVillages(c);
    else national(c);
  }

  // engine hooks (only while a context is drawn): bar clicks open V2's views, the engine's own redraws keep V2's view
  function hook(win) {
    if (win.__v2OcHooked) return;
    win.__v2OcHooked = true;
    var to = { goED: national, goTCAllNational: allTowns, goVillAllNational: allVillages };
    Object.keys(to).forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function') return;
      win[n] = function () {
        var c = win.__v2OcCtx;
        if (!c) return o.apply(this, arguments);
        if (win.__v2NavClick) to[n](c); else redraw(c);
      };
    });
    // the indigenous toggles: the engine flips councilIndMode and draws its 2014 layer — V2 draws this cycle's instead
    var sim = win.setCouncilIndMode;
    if (typeof sim === 'function') win.setCouncilIndMode = function () {
      var r = sim.apply(this, arguments), c = win.__v2OcCtx;
      if (c) national(c);
      return r;
    };
    var al = win._addCouncilIndLayer;
    if (typeof al === 'function') win._addCouncilIndLayer = function () {
      if (win.__v2OcCtx) { var g = G(win, 'gInd'); if (g) g.selectAll('*').remove(); return; }
      return al.apply(this, arguments);
    };
    var sl = win.setLang;
    if (typeof sl === 'function') win.setLang = function () { var r = sl.apply(this, arguments), c = win.__v2OcCtx; if (c) { chrome(c); redraw(c); } return r; };
    var cm = win.setCouncilMode;
    if (typeof cm === 'function') win.setCouncilMode = function () { var r = cm.apply(this, arguments), c = win.__v2OcCtx; if (c) redraw(c); return r; };
  }
  function chrome(c) {
    var win = c.win, mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = c.d.label + T(c, ' 縣市議員地圖', ' Council Map');
  }
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    var win = c.win;
    if (win.__v2OcCtx !== c) return;
    chrome(c);
    var gB = G(win, 'gBase');
    if (G(win, 'curED') != null || gB.select('.v2-oc-blk').empty()) {
      if (G(win, 'curED') != null) win.eval("level = 'ed'; curED = null; curTC = null; curVC = null; villAllMode = false;");
      redraw(c);
    }
  }
  function schedule(c) {
    (c.win.__v2OcTimers || []).forEach(clearTimeout);
    c.win.__v2OcTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }

  function draw(win, cyc) {
    clear(win);
    var d = dataFor(cyc), VD = G(win, 'VD');
    if (!d || !VD) return 0;
    var c = { win: win, cyc: cyc, d: d, VD: VD, councils: d.councils, list: [], geom: {}, owner: {}, view: ['nat'] };
    d.councils.forEach(function (council) {
      Object.keys(council.d).forEach(function (kind) {
        council.d[kind].forEach(function (dd) { c.list.push({ idx: c.list.length, council: council, kind: kind, d: dd }); });
      });
    });
    win.__v2OcCtx = c;
    hook(win);
    var gInd = G(win, 'gInd'); if (gInd) gInd.selectAll('*').remove();
    national(c);
    chrome(c);
    schedule(c);
    win.__v2OcResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2OcResize);
    return d.councils.reduce(function (s, k) { return s + Object.keys(k.seats).reduce(function (a, p) { return a + k.seats[p]; }, 0); }, 0);
  }
  function clear(win) {
    if (win.__v2OcResize) { win.removeEventListener('resize', win.__v2OcResize); win.__v2OcResize = null; }
    (win.__v2OcTimers || []).forEach(clearTimeout);
    win.__v2OcTimers = [];
    var c = win.__v2OcCtx;
    if (c) { undim(c); if (c.svg) c.svg.on('mouseleave.v2oc', null); }
    win.__v2OcCtx = null;
  }
  // the council of a county name in a cycle, drawn in the engine's county-council box — for the 縣市長 layer of the same
  // years (history-oldmayor.js; user 2026-11-01: 「09即以前的市議員半圓形圖」「在市長的」), as 2014+ 縣市長 shows that
  // county's council there. n = null clears the box.
  function hemiFor(win, cyc, n, mayorP) {
    var d = dataFor(cyc), council = d && n ? d.councils.filter(function (k) { return k.n === n; })[0] : null;
    var c = { win: win, list: [], cyc: cyc };
    if (council) Object.keys(council.d).forEach(function (kind) { council.d[kind].forEach(function (dd) { c.list.push({ idx: c.list.length, council: council, kind: kind, d: dd }); }); });
    hemi(c, council || null, null, mayorP);
    return !!council;
  }
  window.V2OldCouncil = { draw: draw, clear: clear, hemiFor: hemiFor, ENGINE_YEAR: ENGINE_YEAR, CYCLES: ['1998', '2002', '2005', '2009'] };
})();
