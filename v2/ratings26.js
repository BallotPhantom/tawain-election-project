/* 2026 縣市長預測: US-style ratings on the 全台 panel (user 2026-10-29, after the 2028 總覽 got them: 「加入2026的預測裡」).
 *
 * Audit (2026-10-29): the 全台 panel had no seat count at all — setMayor2026PredictMode() writes a research note
 * (「2026 縣市長預測 — 研究性質推估」) and the 「全台」 crumb (goED) writes 「全台總覽 2022 / 點擊地圖上的選區查看詳細資料」
 * (the engine's legislative text, wrong year here). Both national states now show the same panel: the engine's note,
 * then the 22 seats by the likeliest winner, then the ratings.
 *
 * Win chances = the engine's own Monte Carlo (_getMC2026(cc): MC_N runs, national + regional + county swing), the same
 * numbers each county panel shows as 當選率. A county is rated by its likeliest winner's chance, with the 2028 page's
 * cut-offs (v2/predict2028.js RATE): Solid ≥ 95 %, Likely 80–95, Lean 65–80, Tilt 55–65, Toss-up below 55. Side = that
 * winner's party: 綠 (dpp), 藍 (kmt), else 其他 (民眾黨 / 無黨籍 …, its own party colour). Counties marked
 * no_prediction (no 2026 poll: estimate from the 2014–2022 record) are rated too and flagged 「無民調」.
 * Map (user 2026-10-29: 「2026預測應該要按照分級給地圖上色」): the county blocks (.ft-mayor-fill, national view) take
 * their rating colour through noglow.js's win.__v2FillOverride hook; the township views keep the margin shading. The
 * map legend's margin ramp (.ml-grad + its 五五波 / 鐵票區 row) gives way to a rating key while the county map is up.
 * Research note (user: 「…南投縣查無民調…不只南投縣」): the engine's text (V1, untouched) names 南投 only; five counties
 * have no usable 2026 poll (MAYOR_2026_PREDICT no_prediction) — the note is rewritten from the data: poll and pollster
 * counts from POLLS_2026, the no-poll counties by name.
 * V2Rate26.attach(win).
 */
(function () {
  var RATE = [['s', 'Solid', 0.95, 1], ['y', 'Likely', 0.80, 0.68], ['n', 'Lean', 0.65, 0.42], ['t', 'Tilt', 0.55, 0.2]];
  var TOSS = '#cbbf9f';
  var SIDE = { G: ['綠', 'Green'], B: ['藍', 'Blue'] };
  var PNAME = { tpp: ['民眾黨', 'TPP'], ind: ['無黨', 'Ind.'], other: ['其他', 'Other'] };

  function G(win, n) { try { return win.eval(n); } catch (e) { return undefined; } }
  function partyClr(win, p) { var C = G(win, 'COUNCIL_CLR'); return (C && C[p]) || '#888'; }
  function mix(hex, k) {
    var h = (hex || '#888888').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var m = function (i) { var c = parseInt(h.substring(i, i + 2), 16) || 0; return ~~(255 - (255 - c) * k); };
    return 'rgb(' + m(0) + ',' + m(2) + ',' + m(4) + ')';
  }
  function band(p) { for (var i = 0; i < RATE.length; i++) if (p >= RATE[i][2]) return RATE[i]; return null; }
  function range(r) { var i = RATE.indexOf(r); return i === 0 ? '≥95' : (r[2] * 100).toFixed(0) + '–' + (RATE[i - 1][2] * 100).toFixed(0); }

  // every county: its likeliest winner, the chance, the rating
  function rows(win) {
    var P = G(win, 'MAYOR_2026_PREDICT'), NM = G(win, '_CC_NAME') || {};
    if (!P || typeof win._getMC2026 !== 'function') return [];
    var disp = typeof win._dispCandName === 'function' ? win._dispCandName : function (n) { return String(n).split('（')[0]; };
    return Object.keys(P).map(function (cc) {
      var mc = win._getMC2026(cc); if (!mc || !mc.length) return null;
      var top = mc.slice().sort(function (a, b) { return b.winProb - a.winProb; })[0];
      var side = top.p === 'dpp' ? 'G' : top.p === 'kmt' ? 'B' : 'O';
      return { cc: cc, cn: NM[cc] || P[cc].county_zh || cc, who: String(disp(top.n)).split(/[（(]/)[0].trim(),   // the data's names carry poll notes in （…）
               p: top.p, side: side, pw: top.winProb,
               r: band(top.winProb), nopoll: !!P[cc].no_prediction };
    }).filter(Boolean);
  }
  function label(win, x) {
    var T = win.T;
    if (!x.r) return 'Toss-up';
    var s = x.side === 'O' ? (PNAME[x.p] || PNAME.other) : SIDE[x.side];
    return x.r[1] + ' ' + T(s[0], s[1]);
  }
  function fill(win, x) { return x.r ? mix(partyClr(win, x.p), x.r[3]) : TOSS; }
  function chip(win, x) {
    var dark = !x.r || x.r[3] < 0.5;
    return '<span style="display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;font-weight:700;line-height:15px;white-space:nowrap;background:' + fill(win, x) + ';color:' + (dark ? '#15171f' : '#fff') + '">' + label(win, x) + '</span>';
  }
  function sec(t) { return '<div class="sec-title" style="margin:10px 0 4px">' + t + '</div>'; }

  function html(win) {
    var T = win.T, R = rows(win); if (!R.length) return '';
    var n = { G: 0, B: 0, O: 0 }, exp = { G: 0, B: 0, O: 0 };
    var P = G(win, 'MAYOR_2026_PREDICT');
    R.forEach(function (x) { n[x.side]++; });
    // expected seats = the sum of each side's win chances
    Object.keys(P).forEach(function (cc) {
      (win._getMC2026(cc) || []).forEach(function (c) { exp[c.p === 'dpp' ? 'G' : c.p === 'kmt' ? 'B' : 'O'] += c.winProb; });
    });
    var cG = partyClr(win, 'dpp'), cB = partyClr(win, 'kmt');
    var big = function (v, l, c, sub) {
      return '<div style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">' +
        '<div style="font-size:18px;font-weight:700;color:' + c + ';font-variant-numeric:tabular-nums">' + v + '</div><div style="font-size:10px;color:#999">' + l + '</div>' +
        '<div style="font-size:9px;color:#777;font-variant-numeric:tabular-nums">' + sub + '</div></div>';
    };
    // footnotes as hover titles (user 2026-10-31: 左邊總覽「跟profile一樣盡量把資訊面板刪掉就只留圖表」)
    var seats = '<div style="display:flex;gap:6px;margin:6px 0" title="' + T('領先＝模擬中勝率最高的候選人；預期＝各縣市勝率加總', 'ahead = the likeliest winner; exp. = sum of win chances') + '">' +
      big(n.G, T('綠營領先', 'Green ahead'), cG, T('預期 ', 'exp. ') + exp.G.toFixed(1)) +
      big(n.B, T('藍營領先', 'Blue ahead'), cB, T('預期 ', 'exp. ') + exp.B.toFixed(1)) +
      big(n.O, T('其他領先', 'Others ahead'), '#bbb', T('預期 ', 'exp. ') + exp.O.toFixed(1)) + '</div>';

    // the 22-seat bar: 綠 Solid … Tilt, Toss-up, 其他, 藍 Tilt … Solid
    var order = function (x) { var i = x.r ? RATE.indexOf(x.r) : 4; return x.side === 'G' ? i : x.side === 'B' ? 10 - i : x.r ? 5 : 4.5; };
    var groups = {};
    R.forEach(function (x) { var k = label(win, x); (groups[k] = groups[k] || { x: x, list: [] }).list.push(x); });
    var keys = Object.keys(groups).sort(function (a, b) { return order(groups[a].x) - order(groups[b].x); });
    var bar = keys.map(function (k) {
      var g = groups[k], dark = !g.x.r || g.x.r[3] < 0.5;
      return '<div title="' + k + '：' + g.list.length + '" style="flex:' + g.list.length + ';background:' + fill(win, g.x) + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:' + (dark ? '#15171f' : '#fff') + ';min-width:0;overflow:hidden">' + g.list.length + '</div>';
    }).join('');
    var nT = R.filter(function (x) { return !x.r; }).length;
    var head = '<div style="display:flex;justify-content:space-between;font-size:11px;margin:4px 0 3px;font-variant-numeric:tabular-nums">' +
      '<span style="color:' + cG + ';font-weight:700">' + T('綠 ', 'Green ') + R.filter(function (x) { return x.side === 'G' && x.r; }).length + '</span>' +
      '<span style="color:' + TOSS + ';font-weight:700">Toss-up ' + nT + '</span>' +
      '<span style="color:' + cB + ';font-weight:700">' + T('藍 ', 'Blue ') + R.filter(function (x) { return x.side === 'B' && x.r; }).length + '</span></div>' +
      '<div style="position:relative" title="' + T('虛線＝22 席的一半', 'dashed line = half of 22') + '"><div style="display:flex;height:20px;border-radius:4px;overflow:hidden;gap:1px;background:#15171f">' + bar + '</div>' +
      '<div style="position:absolute;left:50%;top:-3px;bottom:-3px;border-left:1px dashed rgba(255,255,255,0.7)"></div></div>';

    // the eight 綠 / 藍 ratings with counts (綠 left, 藍 right), Toss-up and 其他 below
    // a county row (hover = outline + its panel on the right, click = open it; wired in attach)
    var itemsOf = function (g, pad) {
      return g.list.slice().sort(function (a, b) { return a.pw - b.pw; }).map(function (x) {
        return '<div class="v2-r26-row" data-cc="' + x.cc + '" style="display:flex;align-items:center;gap:6px;padding:2px 4px 2px ' + pad + 'px;border-radius:4px;font-size:11px;cursor:default">' +
          '<span style="flex:1;min-width:0;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + x.cn + ' <span style="color:' + partyClr(win, x.p) + '">' + x.who + '</span>' +
          (x.nopoll ? ' <span style="font-size:8.5px;color:#d8b26a">' + T('無民調', 'no poll') + '</span>' : '') + '</span>' +
          '<span style="flex-shrink:0;text-align:right;font-weight:700;color:#e8eaed;font-variant-numeric:tabular-nums">' + (x.pw * 100).toFixed(0) + '%</span></div>';
      }).join('');
    };
    // a rating: chip, range, count — a rating with counties opens its list (user 2026-10-31: the 各級縣市 lists 「應該要跟上一層
    // 的…這些合併，只留下toss up」); Toss-up keeps its own open list below. The table goes row by row (綠 | 藍) and an opened
    // list spans both columns under its row (user: names were cut off in one column — 「可以試試」)
    var cell = function (x, k, cnt) {
      var can = cnt && x.r && groups[k];
      return '<div class="v2-r26-cell"' + (can ? ' data-k="' + k + '"' : '') + ' style="flex:1;min-width:0;display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 3px;border-radius:4px' + (can ? ';cursor:pointer' : '') + '">' + chip(win, x) +
        '<span style="flex:1;min-width:0;color:#777;font-size:8.5px;white-space:nowrap;overflow:hidden">' + (x.r ? range(x.r) : '<55') + '</span>' +
        '<b style="flex-shrink:0;min-width:16px;text-align:right;color:' + (cnt ? '#e8eaed' : '#555') + ';font-variant-numeric:tabular-nums">' + cnt + '</b></div>';
    };
    var cnt = function (k) { return groups[k] ? groups[k].list.length : 0; };
    var line = function (pair) {   // pair: [[x, k], [x, k] or null]
      var cells = pair.map(function (c) { return c ? cell(c[0], c[1], cnt(c[1])) : '<div style="flex:1;min-width:0"></div>'; }).join('');
      var lists = pair.map(function (c) {
        return c && c[0].r && groups[c[1]] ? '<div class="v2-r26-list" data-k="' + c[1] + '" style="display:none;margin:2px 0 4px;padding:2px 0;border-left:2px solid ' + fill(win, c[0]) + '">' + itemsOf(groups[c[1]], 8) + '</div>' : '';
      }).join('');
      return '<div style="display:flex;gap:12px">' + cells + '</div>' + lists;
    };
    var pairs = RATE.map(function (r) {
      var g = { side: 'G', p: 'dpp', r: r }, b = { side: 'B', p: 'kmt', r: r };
      return [[g, label(win, g)], [b, label(win, b)]];
    });
    var tossX = { r: null, side: '', p: '' };
    var others = keys.filter(function (k) { return groups[k].x.side === 'O' && groups[k].x.r; });
    pairs.push([[tossX, 'Toss-up'], others[0] ? [groups[others[0]].x, others[0]] : null]);
    others.slice(1).forEach(function (k) { pairs.push([null, [groups[k].x, k]]); });
    var counts = '<div style="margin-top:8px" title="' + T('灰色數字＝領先者在模擬中的勝率（%）', 'grey figures = the leader’s chance of winning (%)') + '">' + pairs.map(line).join('') + '</div>';

    // Toss-up: its counties listed, always open
    var toss = groups['Toss-up'] ? sec(T('Toss-up 縣市（% 為領先者勝率）', 'Toss-up counties (% = leader’s chance)')) + itemsOf(groups['Toss-up'], 0) : '';

    return '<div id="v2-r26">' + '<div style="font-size:17px;font-weight:700;color:rgba(255,255,255,.95);margin-bottom:4px">' + T('縣市長預測', 'Mayoral forecast') + '</div>' + seats +
      '<div style="margin-top:10px"></div>' + head + counts +   // no heading (user 2026-10-29: 「美式評級 的字刪掉」)
 toss + '</div>';
  }

  // The research note above the panel, written here in both languages (the engine's own text names only 南投 as poll-less
  // and was captured once, so after a language switch it stayed Chinese — i18n audit 2026-10-29). Counts and the
  // no-poll counties come from the data; the engine's box style is kept.
  // the note's text alone — also shown in the bar's ⚠ (disclaimer.js; user 2026-10-31: 「這個警告文字改成複製貼上到上方警告三角形的
  // 文字裡」, 2026 預測 only)
  function noteText(win) {
    var T = win.T, P = G(win, 'MAYOR_2026_PREDICT') || {}, PL = G(win, "typeof POLLS_2026 !== 'undefined' ? POLLS_2026 : null"), NM = G(win, '_CC_NAME') || {};
    var no = Object.keys(P).filter(function (cc) { return P[cc].no_prediction; }).map(function (cc) { return NM[cc] || P[cc].county_zh; });
    var n = 0, orgs = {};
    if (PL) Object.keys(PL).forEach(function (k) { (Array.isArray(PL[k]) ? PL[k] : []).forEach(function (q) { n++; if (q.pollster) orgs[q.pollster] = 1; }); });
    var m = Object.keys(orgs).length;
    return T('⚠ 已依' + n + '筆民調（' + m + '家民調機構，house-effect降權+時間衰減加權）換算各縣市得票率，<b>' + no.join('、') + ' 共 ' + no.length +
          ' 縣市沒有可用的 2026 民調（查無民調，或只有非正式訪問、未測到正式對決），暫以 2014–2022 縣市長選舉實績推估</b>。移到地圖查看各縣市推估結果與民調明細。',
        '⚠ Estimated vote shares from ' + n + ' polls (' + m + ' pollsters, house-effect discount + recency weighting); <b>' + no.length + ' counties (' + no.join(', ') +
          ') have no usable 2026 poll (none found, or only informal / not the actual matchup): estimated from the 2014–2022 mayoral results instead</b>. Hover the map for per-county estimates and poll details.');
  }
  // The engine's Monte Carlo (_runMC2026, MC_N runs) draws from Math.random on every load, so a county near a cut-off
  // changed rating between reloads (user 2026-10-29: 「為啥toss up 一下一個一下三個？」 — 台北 / 新北 sit at ~55 %, and
  // 20 000 runs carry ±0.35 pt of sampling noise). Here the run uses a fixed-seed generator (mulberry32): the same
  // 20 000 simulations on every load, so ratings, the panels' 當選率 and the map agree and stay put. Math.random is
  // swapped only for the duration of the run.
  function seedMC(win) {
    var run = win._runMC2026;
    if (typeof run !== 'function' || run.v2Seeded) return;
    var seeded = function () {
      var a = 20261128 >>> 0, orig = win.Math.random;   // seed: 2026 election day
      win.Math.random = function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try { return run.apply(this, arguments); } finally { win.Math.random = orig; }
    };
    seeded.v2Seeded = true;
    win._runMC2026 = seeded;
    try { win.eval('_mc2026Cache = null'); } catch (e) {}   // anything drawn before this re-runs with the seed
  }
  // map legend while the rated county map is up: the margin ramp (.ml-grad + its 五五波 / 鐵票區 row) is hidden, and no rating
  // key replaces it — the left overview's table already names every rating (user 2026-10-31: 「圖例的solid綠solid藍跟solid
  // 無黨依勝率分類這些刪掉」)
  function legend(win) {
    var doc = win.document, ml = doc.getElementById('map-legend'); if (!ml) return;
    var on = G(win, "typeof is2026Predict !== 'undefined' && is2026Predict") && G(win, 'curED') == null;
    var mine = doc.getElementById('v2-r26-leg');
    [].forEach.call(ml.querySelectorAll(':scope > .ml-grad, :scope > .ml-row'), function (el) { el.style.display = on ? 'none' : ''; });
    if (mine) mine.remove();
  }

  // The 全台 overview (22 seats, ratings, counties by rating) on the map's left, stays up at every level; the right info
  // panel keeps the research note at 全台 and the hovered / opened county elsewhere (user 2026-10-31: option 1
  // 「全台總覽搬到左邊」). Bare like the Profile page — no panel box, no header, footnotes as hover titles, only the charts
  // (user: 「跟profile一樣盡量把資訊面板刪掉就只留圖表」). A county row: hover = its outline on the map + its panel on the
  // right; click = open it (the engine's goTC(cc), as a map click does).
  var LEFT_CSS = '#v2-r26-left{position:absolute;top:64px;left:16px;bottom:16px;width:264px;overflow-y:auto;z-index:10;font-size:12px;' +
    'scrollbar-width:none;word-break:break-word}#v2-r26-left::-webkit-scrollbar{display:none}' +
    '#v2-r26-left .sec-title{border-top:0;padding-top:0;margin-top:14px}#v2-r26-left .sec-title:first-child{margin-top:0}' +
    '#v2-r26-left .v2-r26-row{cursor:pointer!important}';
  // the right panel at 全台: how to use the map (the research note is in the bar's ⚠)
  function hintHtml(win) {
    var T = win.T;
    return '<div id="v2-r26"><div class="t1">' + T('2026 縣市長預測 — 研究性質推估', '2026 Mayor Prediction — Research Estimate') + '</div>' +
      '<div style="color:#999;font-size:11px;line-height:1.7;margin-top:6px">' +
      T('滑到地圖上的縣市（或左邊名單），這裡會顯示候選人、預測得票率、當選率與民調明細；點一下進入該縣市的鄉鎮市區。',
        'Hover a county on the map (or in the list on the left) for its candidates, predicted shares, win chances and polls; click to open its townships.') +
      '</div></div>';
  }
  var HOME = /^(2026 縣市長預測|2026 Mayor Prediction|全台總覽|National Overview)/;
  function attach(win) {
    var doc = win.document, ic = doc.getElementById('ic');
    if (!ic || win.__v2Rate26) return;
    seedMC(win);
    var busy = false;
    var gb = doc.getElementById('g-base');
    var hov = gb && window.V2TcBorder ? window.V2TcBorder.hover(win, gb, 'v2-mayor-hov') : null;
    var openK = {};
    var left = function () {
      var main = doc.getElementById('main'); if (!main) return;
      if (!doc.getElementById('v2-r26-left-css')) { var st = doc.createElement('style'); st.id = 'v2-r26-left-css'; st.textContent = LEFT_CSS; doc.head.appendChild(st); }
      var box = doc.getElementById('v2-r26-left');
      if (!G(win, "typeof is2026Predict !== 'undefined' && is2026Predict")) { if (box) box.style.display = 'none'; return; }
      var h = html(win); if (!h) return;
      if (!box) { box = doc.createElement('div'); box.id = 'v2-r26-left'; main.appendChild(box); }
      box.style.display = '';
      var top = box.scrollTop;
      box.innerHTML = h;
      box.scrollTop = top;
      box.querySelectorAll('.v2-r26-row').forEach(function (row) {
        var cc = row.dataset.cc;
        row.onmouseenter = function () {
          row.style.background = 'rgba(255,255,255,0.06)';
          if (G(win, 'curED') == null && typeof win._mayorPanelHtml === 'function') ic.innerHTML = win._mayorPanelHtml(cc);
          if (!hov) return;
          var norm = typeof win._normCCKey === 'function' ? win._normCCKey : function (c) { return c; }, d = null;
          [].some.call(gb.querySelectorAll(':scope > .ft-mayor-fill'), function (p) { if (p.__data__ && norm(p.__data__.properties.cc) === cc) { d = p.getAttribute('d'); return true; } return false; });
          if (d) hov.show(d);
        };
        row.onmouseleave = function () { row.style.background = ''; if (hov) hov.hide(); };
        row.onclick = function () { if (hov) hov.hide(); if (typeof win.goTC === 'function') win.goTC(cc); };
      });
      // a rating opens / closes its county list (kept across redraws, e.g. a language switch)
      var sync = function () {
        box.querySelectorAll('.v2-r26-list').forEach(function (l) { l.style.display = openK[l.dataset.k] ? '' : 'none'; });
        box.querySelectorAll('.v2-r26-cell[data-k]').forEach(function (c) { c.style.background = openK[c.dataset.k] ? 'rgba(255,255,255,.07)' : ''; });
      };
      box.querySelectorAll('.v2-r26-cell[data-k]').forEach(function (c) {
        c.onclick = function () { openK[c.dataset.k] = !openK[c.dataset.k]; sync(); };
      });
      sync();
    };
    // the right panel at 全台: a short pointer (the overview is on the left). force: the pointer left the page — back to
    // it whatever county was last hovered
    var run = function (force) {
      if (busy || doc.getElementById('v2-r26')) return;
      if (!G(win, "typeof is2026Predict !== 'undefined' && is2026Predict") || G(win, 'curED') != null) return;
      var t1 = ic.querySelector('.t1'); if (!force && (!t1 || !HOME.test(t1.textContent.trim()))) return;
      busy = true;
      try { ic.innerHTML = hintHtml(win); } finally { busy = false; }
    };
    win.__v2Rate26 = new win.MutationObserver(function () { run(false); });
    win.__v2Rate26.observe(ic, { childList: true });
    // the engine leaves the last hovered county's panel up; leaving the page (to the browser's tab bar, another window…)
    // brings back the 全台 overview (user 2026-10-29: 「總覽應該在滑鼠移出網站比如google上方欄位時就應該要出現」).
    // The engine is in an iframe, so its document's mouseleave also fires on the V2 bar above — also outside the map.
    doc.documentElement.addEventListener('mouseleave', function () { run(true); });
    // a language switch: redraw the 全台 panel in the new language (the engine does not rewrite it)
    var setLang = win.setLang;
    if (typeof setLang === 'function' && !setLang.v2Rate26) {
      win.setLang = function () {
        var r = setLang.apply(this, arguments), mine = doc.getElementById('v2-r26');
        // the engine may already have emptied the panel (seen 2026-10-31 once the note moved to the bar): redraw then too
        if (mine || !ic.textContent.trim()) { if (mine) mine.remove(); run(true); }
        left();
        legend(win); var lg = doc.getElementById('v2-r26-leg'); if (lg) { lg.remove(); legend(win); }
        return r;
      };
      win.setLang.v2Rate26 = true;
    }
    run(false);
    left();
    // county blocks by rating (noglow.js paints them; this hook picks the colour)
    var by = null;
    win.__v2FillOverride = function (sel, d) {
      if (sel !== '.ft-mayor-fill' || !G(win, "typeof is2026Predict !== 'undefined' && is2026Predict")) return null;
      if (!by) { by = {}; rows(win).forEach(function (x) { by[x.cc] = x; }); }
      var norm = typeof win._normCCKey === 'function' ? win._normCCKey : function (c) { return c; };
      var x = by[norm(d.properties.cc)];
      return x ? fill(win, x) : null;
    };
    if (window.V2NoGlow) window.V2NoGlow.paint(win);
    var ml = doc.getElementById('map-legend');
    if (ml) new win.MutationObserver(function () { legend(win); }).observe(ml, { childList: true });
    // the legend is only rebuilt on some navigations: also follow level changes through the crumb / map clicks
    doc.addEventListener('click', function () { setTimeout(function () { legend(win); }, 300); }, true);
    legend(win);
  }
  window.V2Rate26 = { attach: attach, noteText: noteText };
})();
