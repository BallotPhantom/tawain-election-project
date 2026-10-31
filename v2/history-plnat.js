/* History → 全國 → 立委 → 不分區: a 全台 level first (user 2026-10-28: 「不分區立委也要改成跟山地原住民一樣，一開始是台灣一大塊
 * 然後立委的34半圓形，點開才是22縣市」). Inside History's own iframe copy of test.html (V1 untouched):
 *  - level 0 (V2): all of Taiwan as one block, filled by the party with the most party-list votes (winMarginFill,
 *    deeper = bigger lead over the runner-up); its panel has the 34-seat hemicycle (the engine's own PL_SEATS
 *    positions, seats in camp order left → right), turnout, and every party's national vote with its seats;
 *    the yellow hover outline is the block's own stroke;
 *  - click → the engine's own 22-county layer (_addPLCountyLayer), unchanged from there down; the crumb's 「全台」 —
 *    which the engine points at goED(), i.e. back to the county layer — is pointed at the V2 block instead;
 *  - data: PL_NATIONAL_V2 (v2/data_pl_national.js, build_v2_pl_national.py, CEC 不分區政黨 files).
 *  - county / township / village panels below (user 2026-10-28: 「22縣市層開始應該要跟全台地圖的設計一樣…有席次的政黨打勾」):
 *    the engine builds their 開票結果 rows with _buildPLRows (.cand-row, no seat marks). While this module is active,
 *    this iframe's global _buildPLRows is swapped for the same row markup as the national panel (✔ + bold for parties
 *    that won seats that year, others dimmed, short names, 萬); clear() puts the engine's own function back.
 *  - and their three folds go (user 2026-10-28: 「要把三個折疊都刪掉改回跟全台一塊時的設計一樣」): while the engine
 *    builds a county / township / village panel, its boxedCollapseSection drops 不分區得票演變 and 兩黨vs第三勢力 and
 *    turns 開票結果 into the national panel's 「政黨得票」 heading + rows; turnout pills and the drill row stay the
 *    engine's. The national panel uses the same turnoutBadgeHtml pills, so every level reads alike.
 * V2PLNat.draw(win, year) / V2PLNat.clear(win).
 */
(function () {
  var HOVER = '#f5c518';   // = the 2027 補選預測 page (user 2026-10-28)
  // seats in camp order, left → right (same order as history-legind.js / council.html's COUNCIL_CAMP_ORDER)
  var ORDER = { dpp: 1, tsr: 2, gp: 3, gsdp: 3, sdp: 4, npp: 5, tsu: 6, other: 8, tpp: 10, pfp: 11, np: 12, kmt: 13 };

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(year) { return (typeof PL_NATIONAL_V2 !== 'undefined' ? PL_NATIONAL_V2 : {})[year] || null; }
  function clr(win, k) { var M = G(win, 'PARTY_COLOR_MAP') || {}; return M[k] || '#8a8a8a'; }
  // the engine's short names (民進黨 / 國民黨 / 時代力量 …) for parties it knows; the full CEC name otherwise
  function partyName(win, p) {
    var M = G(win, win.T('PARTY_NAME_MAP', 'PARTY_NAME_MAP_EN')) || {};
    return (p[1] !== 'other' && M[p[1]]) || p[0];
  }
  function votesTxt(win, v) { return v >= 10000 ? (v / 10000).toFixed(1) + win.T('萬', 'w') : v.toLocaleString(); }

  function hemiHtml(c) {
    var seats = (G(c.win, 'PL_SEATS') || []).slice().sort(function (a, b) { return b.ang - a.ang; });
    var list = [];
    c.d.parties.filter(function (p) { return p[3] > 0; })
      .sort(function (a, b) { return (ORDER[a[1]] || 8) - (ORDER[b[1]] || 8); })
      .forEach(function (p) { for (var i = 0; i < p[3]; i++) list.push(p[1]); });
    var dots = seats.map(function (s, i) {
      return '<circle cx="' + s.cx.toFixed(2) + '" cy="' + s.cy.toFixed(2) + '" r="4.4" fill="' + clr(c.win, list[i]) + '" stroke="#fff" stroke-width="0.5"></circle>';
    }).join('');
    return '<div style="position:relative;height:95px;margin:6px 0 4px"><svg width="185" height="92" viewBox="0 0 160 80" style="display:block;margin:0 auto;overflow:visible">' + dots + '</svg>' +
      '<div style="position:absolute;left:50%;bottom:4px;transform:translateX(-50%);font-size:16px;color:rgba(255,255,255,0.85);font-weight:700">34</div></div>';
  }
  // test.html's legislative row markup (.bar-row / .blb / .bbg …), so legbars.js gives it the shared bar length
  // 全台 list: one red dashed line across it between the last party at or above 5% and the first below (2024: 台灣民眾黨
  // / 時代力量) — user 2026-10-28: 「按照過門檻的政黨來只畫一條…台灣民眾黨<虛線<時代力量」. Only here: the threshold is a
  // national rule — on a county or township list it would read as 「5% of this area」.
  var TH_COLOR = '#ef4444';
  function rowsHtml(c) { return partyRows(c.win, c.d.parties, c.d.valid, true); }
  function thresholdLine(win) {
    return '<div class="v2-pl5" style="position:relative;height:0;border-top:1.5px dashed ' + TH_COLOR + ';margin:13px 0 6px">' +
      '<span style="position:absolute;right:0;bottom:2px;font-size:9px;font-weight:700;line-height:1;color:' + TH_COLOR + '">' +
      win.T('5% 門檻', '5% threshold') + '</span></div>';
  }
  // parties: [[full name, key, votes, seats], …] in display order (most votes first); th = draw the 5% line
  function partyRows(win, parties, valid, th) {
    var logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    var above = false;
    return parties.map(function (p) {
      var pct = valid > 0 ? p[2] / valid * 100 : 0, won = p[3] > 0;
      var line = th && above && pct < 5 ? thresholdLine(win) : '';   // first party under 5% after one at or above it
      if (pct >= 5) above = true; else if (line) above = false;
      var ns = won ? 'font-weight:700;color:#e8eaed' : 'color:#777';
      // parties without a logo get an empty slot of the same width, so every bar starts at the same x
      var ico = '<span style="display:inline-block;width:12px;height:12px;flex-shrink:0;vertical-align:middle;">' + (logos[p[1]] && p[1] !== 'other' ? logos[p[1]] : '') + '</span>';
      var check = won ? '<span style="color:#2ebd59;font-weight:bold;margin-right:2px">&#10004;</span>' : '';
      return line + '<div class="bar-row"><div class="blb" style="border-right:none;' + ns + '" title="' + p[0] + '">' + check + partyName(win, p) + '</div>' + ico +
        '<div class="bbg"><div class="bfill" style="width:' + pct.toFixed(1) + '%;background:' + clr(win, p[1]) + ';opacity:' + (won ? '1' : '0.4') + '"></div></div>' +
        '<div class="bpct" style="white-space:nowrap;' + ns + '">' + pct.toFixed(2) + '%</div><div class="bvote" style="white-space:nowrap;' + ns + '" title="' + p[2].toLocaleString() + '">' + votesTxt(win, p[2]) + '</div></div>';
    }).join('');
  }
  function panel(c) {
    var T = c.win.T, d = c.d;
    return '<div class="t1">' + T('全台', 'All Taiwan') + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px">' + c.year + T(' 不分區政黨票・全國一個選區，應選 34 席（5% 門檻）', ' party list · one nationwide district, 34 seats (5% threshold)') + '</div>' +
      hemiHtml(c) + seatLine(c) +
      c.win.turnoutBadgeHtml(+(d.cast / d.elig * 100).toFixed(2), +((d.cast - d.valid) / d.cast * 100).toFixed(2)) +
      sectionHtml(c.win, T('政黨得票', 'Party Votes')) +
      '<div style="max-height:320px;overflow-y:auto">' + rowsHtml(c) + '</div>' +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('點擊地圖進入 22 縣市 ▶', 'Click the map to enter the 22 counties ▶') + '</div>';
  }
  // the engine's _buildPLRows(aggr, tot, order, foldKey, isSim), same rows as the national panel; seats = that year's
  // national result (the party list is one nationwide district, so a ✔ means the party won seats, not this area)
  function installRows(win) {
    if (!win.__v2OrigBuildPLRows) win.__v2OrigBuildPLRows = win._buildPLRows;
    win._buildPLRows = function (aggr, tot, order, foldKey, isSim) {
      var c = win.__v2PlNatCtx;
      if (!c || isSim || !aggr) return win.__v2OrigBuildPLRows.apply(this, arguments);
      var seats = {}, full = {};
      c.d.parties.forEach(function (p) { seats[p[1]] = (seats[p[1]] || 0) + p[3]; full[p[1]] = p[0]; });
      var rows = order.filter(function (k) { return aggr[k]; }).map(function (k) {
        return [k === 'o' ? win.T('其他', 'Other') : (full[k] || k), k === 'o' ? 'other' : k, aggr[k], seats[k] || 0];
      }).sort(function (a, b) { return b[2] - a[2]; });
      return partyRows(win, rows, tot);
    };
  }
  var PANELS = ['plCountyPanelHtml', 'plTownshipPanelHtml', 'plVillagePanelHtml'];
  function sectionHtml(win, title) { return '<div class="sec-title" style="margin:8px 0 5px">' + title + '</div>'; }
  function installPanels(win) {
    if (win.__v2OrigPLPanels) return;
    win.__v2OrigPLPanels = {};
    PANELS.forEach(function (n) {
      var orig = win[n]; if (typeof orig !== 'function') return;
      win.__v2OrigPLPanels[n] = orig;
      win[n] = function () {
        if (!win.__v2PlNatCtx) return orig.apply(this, arguments);
        var box = win.boxedCollapseSection;
        win.boxedCollapseSection = function (title, body, key) {
          if (key === 'pl-trend' || key === 'pl-thirdforce') return '';
          if (key === 'pl-votes') return sectionHtml(win, win.T('政黨得票', 'Party Votes')) + body;
          return box.apply(this, arguments);
        };
        try { return orig.apply(this, arguments); } finally { win.boxedCollapseSection = box; }
      };
    });
  }
  function restoreRows(win) {
    if (win.__v2OrigBuildPLRows) { win._buildPLRows = win.__v2OrigBuildPLRows; win.__v2OrigBuildPLRows = null; }
    if (win.__v2OrigPLPanels) {
      Object.keys(win.__v2OrigPLPanels).forEach(function (n) { win[n] = win.__v2OrigPLPanels[n]; });
      win.__v2OrigPLPanels = null;
    }
  }
  function seatLine(c) {
    var win = c.win;
    return '<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;font-size:11px;margin-bottom:4px">' +
      c.d.parties.filter(function (p) { return p[3] > 0; }).map(function (p) {
        return '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:' + clr(win, p[1]) + '"></span>' +
          '<span style="color:#ccc">' + partyName(win, p) + '</span><b style="color:#e8eaed">' + p[3] + '</b></span>';
      }).join('') + '</div>';
  }
  function fill(c) {
    var p = c.d.parties, M = G(c.win, 'PARTY_COLOR_MAP') || {};
    return c.win.winMarginFill(p[0][1], (p[0][2] - p[1][2]) / c.d.valid, M[p[0][1]]);
  }

  function national(c) {
    var win = c.win, T = win.T;
    c.view = 'nat';
    var pathFn = G(win, 'pathFn'), gBase = G(win, 'gBase'), svg = G(win, 'svg');
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var CD = G(win, 'CD');
    var all = win.topojson.merge(CD, CD.objects.counties.geometries);
    var feat = { type: 'Feature', properties: {}, geometry: all.type === 'Feature' ? all.geometry : all };
    var f = fill(c);
    gBase.selectAll('.v2-pn-blk').data([feat]).join('path')
      .attr('class', 'ft v2-pn-blk v2-own').attr('d', pathFn)
      .attr('fill', f).attr('stroke', 'rgba(255,255,255,0.9)').attr('stroke-width', 2.5).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', 'pointer')
      .on('mouseover', function () { win.d3.select(this).attr('stroke', HOVER).attr('stroke-width', 2.2); ic(c); })
      .on('mouseleave', function () { win.d3.select(this).attr('stroke', 'rgba(255,255,255,0.9)').attr('stroke-width', 2.5); })
      .on('click', function () { counties(c); });
    ic(c);
    setCrumb(c);
    var mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = c.year + T(' 不分區政黨票地圖', ' Party-list Vote Map');
    if (svg) { svg.transition().duration(380).call(G(win, 'zm').transform, win.d3.zoomIdentity); try { win.eval('curK = 1'); } catch (e) {} }
  }
  function counties(c) {
    c.view = 'cc';
    c.win.eval("_addPLCountyLayer('" + c.year + "')");
  }
  function ic(c) { var el = c.win.document.getElementById('ic'); if (el) el.innerHTML = panel(c); }
  function setCrumb(c) {
    var el = c.win.document.getElementById('crumb'); if (!el) return;
    el.innerHTML = c.win.T('全台', 'All') + ' › ' + c.win.T('不分區', 'Party list');
  }
  // the engine's crumbs below the block start with 「全台」 → goED() (= its county layer): send it to the block instead
  function rerouteCrumb(c) {
    if (c.view === 'nat') return;
    var first = c.win.document.querySelector('#crumb .cl');
    if (!first || first.v2PlNat) return;
    first.removeAttribute('onclick');
    first.v2PlNat = true;
    first.onclick = function () { national(c); };
  }

  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    if (c.win.__v2PlNatCtx !== c) return;
    if (c.view === 'nat' && G(c.win, 'gBase').select('.v2-pn-blk').empty()) national(c);
  }
  function schedule(c) {
    (c.win.__v2PlNatTimers || []).forEach(clearTimeout);
    c.win.__v2PlNatTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }
  function draw(win, year) {
    clear(win);
    var d = dataFor(year);
    if (!d || !G(win, 'CD')) return 0;
    var c = { win: win, year: String(year), d: d, view: 'nat' };   // 2008–2024
    win.__v2PlNatCtx = c;
    installRows(win);
    installPanels(win);
    national(c);
    schedule(c);
    var crumb = win.document.getElementById('crumb');
    if (crumb && typeof win.MutationObserver === 'function') {
      win.__v2PlNatObs = new win.MutationObserver(function () { if (win.__v2PlNatCtx === c) rerouteCrumb(c); });
      win.__v2PlNatObs.observe(crumb, { childList: true, subtree: true });
    }
    win.__v2PlNatResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2PlNatResize);
    win.document.addEventListener('fullscreenchange', win.__v2PlNatResize);
    return d.parties.length;
  }
  function clear(win) {
    if (win.__v2PlNatResize) {
      win.removeEventListener('resize', win.__v2PlNatResize);
      win.document.removeEventListener('fullscreenchange', win.__v2PlNatResize);
      win.__v2PlNatResize = null;
    }
    if (win.__v2PlNatObs) { win.__v2PlNatObs.disconnect(); win.__v2PlNatObs = null; }
    (win.__v2PlNatTimers || []).forEach(clearTimeout);
    win.__v2PlNatTimers = [];
    win.__v2PlNatCtx = null;
    restoreRows(win);
  }
  window.V2PLNat = { draw: draw, clear: clear };
})();
