/* History → 地方 → 鄉鎮市區長 (township heads), 2014/2018/2022 (user, 2026-10-26; village layer 2026-10-27).
 *
 * Same design as the engine's 縣市長 mode, nothing of V2's own (user: 「必須要跟其他的縣市長跟市議員
 * 是一模一樣的設計」「不可以自己一個設計」) — inside History's own iframe copy of council.html
 * (V1 file untouched):
 *  - no population glow (user 2026-10-27: 「把人口渲染關掉」); like 縣市長, the top level is the race's own unit
 *    and you drill down from it (user: 「最上層永遠是該一層的大塊地圖往下鑽」): after the engine's 縣市長 national
 *    view is set up (setMayorMode(year): legend, chips, panel frame), the map is cleared and redrawn as the
 *    engine's 全台鄉鎮市區 view (_mayorGoTCAllNational): township blocks filled by the elected head's party via
 *    winMarginFill / COUNCIL_CLR (deeper = bigger margin), county borders as the engine draws them. Townships
 *    with no race (直轄市 / 省轄市 區: appointed 區長) take the map's black background;
 *  - click a township → its village layer (user: 「分別點進去才可以顯示村里層」), drawn like the engine's
 *    _mayorGoVill (bg fill, village strokes, township border, fitFeats), each village by its own leader;
 *    the crumb 全台 › 鄉鎮 leads back (no 縣市 level; 全台 = this township view, not the engine's goED);
 *  - panels assembled from the engine's own pieces in its own order (t1, sub-label, _glassBadge,
 *    _turnoutTrafficLights, 候選人得票 + renderCouncilCandRow). _mayorTcPanelHtml / _mayorVillPanelHtml are NOT
 *    called: their turnout lights, 政黨基本盤 bars and drill-down buttons are county-mayor data;
 *  - data: TOWNSHIP_HEAD + TOWNSHIP_HEAD_VILL (v2/data_township_head*.js, build_v2_township_head.py,
 *    tests/reconcile_township_head.py): 198 鄉鎮市長 + the 6 直轄市山地原住民區長, and their villages.
 * V2TownshipHead.draw(win, year) / V2TownshipHead.clear(win).
 */
(function () {
  var NO_RACE = '#aaa';       // fallback party colour / village without data (the engine's own '#aaa')
  var BLACK = '#0a0d16';      // mapBgColor()'s base colour (mapBgColor itself returns a CSS gradient, not an SVG fill)

  // the engine's top-level const / let bindings are not window properties: read them in its scope
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }

  function dataFor(year) {
    return (typeof TOWNSHIP_HEAD !== 'undefined' ? TOWNSHIP_HEAD : {})[year] || null;   // top-level const in data_township_head.js
  }
  function villFor(year) {
    return (typeof TOWNSHIP_HEAD_VILL !== 'undefined' ? TOWNSHIP_HEAD_VILL : {})[year] || {};
  }
  function winnerOf(t) {
    for (var i = 0; i < t.cands.length; i++) if (t.cands[i].e) return t.cands[i];
    return t.cands[0];
  }
  // a village's candidates in the township's order: [{n, p, v, e}], from [valid, elig, cast, v0, v1, ...]
  function villCands(t, row) {
    return t.cands.map(function (c, i) { return { n: c.n, p: c.p, v: row[3 + i], e: c.e }; });
  }
  function villFill(win, t, row) {
    if (!t) return BLACK;                  // no race (user: 「沒有選的一樣是黑色底圖」)
    if (!row || !row[0]) return BLACK;     // no village row (臺東市 before 2022): black too (user: 「沒資料就反黑吧」)
    var s = villCands(t, row).sort(function (a, b) { return b.v - a.v; });
    var margin = s.length > 1 ? (s[0].v - s[1].v) / row[0] : 1;
    var CLR = G(win, 'COUNCIL_CLR');
    return win.winMarginFill(s[0].p, margin, CLR[s[0].p] || NO_RACE);
  }
  function fillFor(win, t) {
    if (!t) return BLACK;                  // no race (user: 「沒有選的一樣是黑色底圖」)
    var w = winnerOf(t), CLR = G(win, 'COUNCIL_CLR');
    var margin = t.cands.length > 1 ? (t.cands[0].v - t.cands[1].v) / t.valid : 1;
    return win.winMarginFill(w.p, margin, CLR[w.p] || NO_RACE);
  }
  // a village's row; 2022 villages merged away or voting at a joint station (連江 「仁愛村、津沙村、…」) read
  // their VC_MERGED_2022 target's row, as the engine's own 2022 village data does
  function villRow(c, vc) {
    if (c.vill[vc]) return c.vill[vc];
    var to = c.year === '2022' && c.merged22 && c.merged22[vc];
    return (to && c.vill[to]) || null;
  }
  // {code: [turnout %, valid-vote %]} — the shape _turnoutTrafficLights ranks
  function turnoutTable(data) {
    var o = {};
    Object.keys(data).forEach(function (tc) {
      var t = data[tc];
      if (t.elig && t.cast) o[tc] = [+(t.cast / t.elig * 100).toFixed(2), +(t.valid / t.cast * 100).toFixed(2)];
    });
    return o;
  }
  function villTurnoutTable(vill) {
    var o = {};
    Object.keys(vill).forEach(function (vc) {
      var r = vill[vc];
      if (r[1] && r[2]) o[vc] = [+(r[2] / r[1] * 100).toFixed(2), +(r[0] / r[2] * 100).toFixed(2)];
    });
    return o;
  }

  function names(win, tc, data) {
    var NM = G(win, 'NM');
    var cc = win._tcCityKey(tc);
    var cn = (G(win, '_CC_NAME') || {})[cc] || cc;
    var raw = (NM && NM.t && NM.t[tc]) || (data[tc] && data[tc].name) || tc;
    return { cc: cc, cn: cn, tn: typeof win.translateTownship === 'function' ? win.translateTownship(raw) : raw };
  }
  function noRaceHtml(win, title) {
    var T = win.T;
    return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' +
      T('直轄市與省轄市的區長由市長派任，沒有選舉（直轄市山地原住民區除外）', 'Appointed district chief — no election (except the six indigenous districts)') + '</div>';
  }

  // township panel: the engine's township panel pieces (as before)
  function tcPanelHtml(win, year, tc, data, tlTable) {
    var T = win.T, CLR = G(win, 'COUNCIL_CLR'), LBL = G(win, 'COUNCIL_LBL');
    var nm = names(win, tc, data), t = data[tc];
    if (!t) return noRaceHtml(win, nm.cn + ' ' + nm.tn);
    var w = winnerOf(t), wclr = CLR[w.p] || '#888';
    var sorted = t.cands.slice().sort(function (a, b) { return b.v - a.v; });
    // same rule as _mayorTcPanelHtml: independents under 5% merge into 「其他無黨籍」
    var main = [], other = [];
    sorted.forEach(function (c) {
      var row = { n: c.n, p: c.p, v: c.v, e: c.e };
      (c.p === 'ind' && t.valid && c.v / t.valid < 0.05) ? other.push(row) : main.push(row);
    });
    if (other.length) main.push({ n: T('其他無黨籍', 'Other independents'), p: 'other', v: other.reduce(function (s, c) { return s + c.v; }, 0), e: 0 });
    var maxV = (main[0] || {}).v || 1;
    var rows = main.map(function (c) { return win.renderCouncilCandRow(c, t.valid, maxV); }).join('');
    var badge = (LBL[w.p] || w.p) + T(' 當選', ' elected') + (t.cands.length === 1 ? T('（同額競選）', ' (uncontested)') : '');
    return '<div class="t1" style="color:' + wclr + '">' + nm.cn + ' ' + nm.tn + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + year + T(' 鄉鎮市區長選舉', ' Township Head Election') + '</div>' +
      win._glassBadge(wclr, badge) + win._turnoutTrafficLights(tlTable, tc, 'v2th' + year) +
      '<div class="sec-title" style="margin-bottom:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rows + '</div>';
  }

  // village panel: _mayorVillPanelHtml's pieces and order (title in the village's own leader colour,
  // sub-label, traffic lights, every candidate on its own row — the engine's village panels do not merge)
  function vcPanelHtml(c, vc) {
    var win = c.win, year = c.year, data = c.data;
    var T = win.T, CLR = G(win, 'COUNCIL_CLR'), NM = G(win, 'NM');
    var tc = vc.slice(0, 8), t = data[tc], nm = names(win, tc, data);
    var raw = (NM && NM.v && NM.v[vc]) || vc;
    var vnRaw = raw.indexOf(' ') !== -1 ? raw.split(' ').slice(1).join(' ') : raw;
    var vn = typeof win.translateVillage === 'function' ? win.translateVillage(vc, vnRaw) : vnRaw;
    if (!t) return noRaceHtml(win, vn);
    var row = villRow(c, vc);
    if (!row || !row[0]) return '<div style="color:#bbb;font-size:11px">' + T('無資料', 'No data') + '</div>';
    // the engine's banner for a merged / joint-station village (_mayorVillPanelHtml's 2022 wrapper)
    var banner = '', to = !c.vill[vc] && c.merged22 && c.merged22[vc];
    if (to) {
      var tRaw = (NM && NM.v && NM.v[to]) || to;
      var tName = tRaw.indexOf(' ') !== -1 ? tRaw.split(' ').slice(1).join(' ') : tRaw;
      banner = '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
        T('此村里已併入「' + tName + '」，2022年地圖染色／候選人資料沿用「' + tName + '」', 'This village has been merged into "' + tName + '" — the 2022 map color and candidate data shown here belong to "' + tName + '"') + '</div>';
    }
    var s = villCands(t, row).sort(function (a, b) { return b.v - a.v; });
    var maxV = (s[0] || {}).v || 1;
    var wclr = (s[0] && CLR[s[0].p]) || '#888';
    var rows = s.map(function (c) { return win.renderCouncilCandRow(c, row[0], maxV); }).join('');
    return banner + '<div class="t1" style="color:' + wclr + '">' + vn + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + nm.cn + ' ' + nm.tn + ' · ' + year + T(' 鄉鎮市區長選舉', ' Township Head Election') + '</div>' +
      win._turnoutTrafficLights(c.vtl, c.vill[vc] ? vc : to, 'v2thv' + year) +
      '<div class="sec-title" style="margin-bottom:5px;margin-top:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rows + '</div>';
  }

  // per-draw context: data tables + merged township geometry cache
  function ctx(win, year) {
    var data = dataFor(year);
    if (!data) return null;
    var VD = G(win, 'VD'), gBase = G(win, 'gBase'), gBg = G(win, 'gBg'), pathFn = G(win, 'pathFn');
    if (!VD || !gBase || !gBg || !pathFn) return null;
    var vill = villFor(year);
    return { win: win, year: year, data: data, vill: vill, tl: turnoutTable(data), vtl: villTurnoutTable(vill),
             VD: VD, gBase: gBase, gBg: gBg, pathFn: pathFn, svg: G(win, 'svg'), merged: {},
             merged22: G(win, "typeof VC_MERGED_2022 !== 'undefined' ? VC_MERGED_2022 : null") };
  }
  function villGeoms(c, prefix) {
    return c.VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && vc.indexOf(prefix) === 0; });
  }
  // one polygon per township from its villages (the engine merges the same way: _mayorGoVill / _cleanMergedGeom)
  function tcFeature(c, tc) {
    if (c.merged[tc]) return c.merged[tc];
    var vg = villGeoms(c, tc);
    if (!vg.length) return null;
    var m = c.win._cleanMergedGeom(c.win.topojson.merge(c.VD, vg));
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, m.type === 'Feature' ? m.geometry : m);   // VD gaps aren't holes
    return (c.merged[tc] = { type: 'Feature', properties: { tc: tc }, geometry: m.type === 'Feature' ? m.geometry : m });
  }
  // re-read the engine's projection and layer handles: it rebuilds them on resize (e.g. when the page's control
  // rows wrap), and drawing with a stale pathFn puts the map off-screen while fitFeats uses the new one
  function fresh(c) {
    c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg');
  }
  function ic(win, html) { var el = win.document.getElementById('ic'); if (el) el.innerHTML = html; }

  // crumb: 全台 › 鄉鎮 — no 縣市 level in these modes, 全台 goes straight back to the national map
  // (user 2026-10-27: 「把縣市那層隱藏…點進去出來回全台地圖是直接回到全台的」)
  function setCrumb(c, tc) {
    var win = c.win, T = win.T, el = win.document.getElementById('crumb');
    if (!el) return;
    var allTxt = T('全台', 'All');
    if (!tc) { el.innerHTML = '<span class="cl">' + allTxt + '</span> › ' + T(c.year + ' 鄉鎮市區長選舉', c.year + ' Township Head Election'); }
    else {
      var nm = names(win, tc, c.data);
      el.innerHTML = '<span class="cl">' + allTxt + '</span> › ' + nm.tn;
    }
    var all = el.querySelector('.cl');
    if (all) all.onclick = function () { national(c); };
  }

  // top level = the race's own unit, like 縣市長 (user 2026-10-27: 「最上層永遠是該一層的大塊地圖往下鑽」):
  // national township blocks (_mayorGoTCAllNational's layers), flat fill = elected head's party by margin,
  // no population glow
  function national(c) {
    fresh(c);   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    var win = c.win, d3 = win.d3, T = win.T;
    win.__v2ThTC = null;
    // the engine's own 全台鄉鎮市區 state (level 'tc', no county): its legend and toolbar gating follow it
    win.eval("level = 'tc'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var CD = G(win, 'CD');
    // one polygon per township (TC_GJ repeats split townships; merged from villages as the engine does)
    var seen = {}, feats = [];
    win.getTCGJ().features.forEach(function (f) {
      var tc = f.properties.tc; if (seen[tc]) return; seen[tc] = 1;
      feats.push(tcFeature(c, tc) || f);
    });
    var countyMesh = win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; });
    var fill = function (d) { return fillFor(win, c.data[d.properties.tc]); };
    c.gBase.selectAll('.ft-tc').data(feats).join('path').attr('class', 'ft ft-tc v2-own').attr('d', c.pathFn)
      .attr('fill', fill)
      // same-colour stroke hides the hairline seams of village-merged townships (as _mayorGoTCAllNational)
      .attr('stroke', fill).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', function (d) { return c.data[d.properties.tc] ? 'pointer' : 'default'; })
      .on('mouseover', function (e, d) {
        var tc = d.properties.tc;
        ic(win, tcPanelHtml(win, c.year, tc, c.data, c.tl));
      })
      .on('click', function (e, d) {
        if (c.data[d.properties.tc]) township(c, d.properties.tc);   // no race → nothing below to show
      });
    // township lines + white county lines: the shared style (v2/tcborder.js, user 2026-10-28: 「所有的版面…一致」)
    window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-tc-natborder', feats, 'tc');
    window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-ed-border', [countyMesh], 'outline');
    // no yellow county frame on hover (user 2026-10-27: 「滑鼠移過去時的黃色縣框」 removed): the hovered township keeps
    // the engine's own .ft hover highlight
    ic(win, '<div class="t1">' + T(c.year + ' 鄉鎮市區長選舉', c.year + ' Township Head Election') + '</div>' +
      '<div style="color:#bbb;font-size:11px;margin-top:4px">' + T('移到各鄉鎮查看資料，點選進入村里層', 'Hover over a township to view data; click to enter its villages') + '</div>');
    setCrumb(c, null);
    if (c.svg) {
      c.svg.transition().duration(380).call(G(win, 'zm').transform, d3.zoomIdentity);
      try { win.eval('curK = 1'); } catch (e) {}
    }
    setTimeout(function () { if (typeof win.renderLegend === 'function') win.renderLegend(); }, 50);
  }

  // one township's village layer (_mayorGoVill's layers)
  function township(c, tc) {
    fresh(c);   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    var win = c.win;
    win.__v2ThTC = tc;
    // level 'vill' as _mayorGoVill sets it, but curED / curTC stay null: a year switch must not make the
    // engine redraw its own 縣市長 villages here (setMayorMode redraws curED's level when one is set)
    win.eval("level = 'vill'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var feats = win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && vc.indexOf(tc) === 0; });
    if (!feats.length) return;
    var tf = tcFeature(c, tc);
    if (tf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(tf)).attr('pointer-events', 'none');
    var show = function (e, d) { ic(win, vcPanelHtml(c, d.properties.vc)); };
    c.gBase.selectAll('.ft-vill').data(feats).join('path')
      .attr('class', 'ft ft-vill v2-own').attr('d', c.pathFn)
      .attr('fill', function (d) { return villFill(win, c.data[tc], villRow(c, d.properties.vc)); })
      .attr('fill-opacity', 1)
      .attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke')
      .on('mouseover', show).on('click', show);
    if (tf) window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-tc-border', [tf], 'tc');
    G(win, 'fitFeats')(feats);
    ic(win, tcPanelHtml(win, c.year, tc, c.data, c.tl));
    setCrumb(c, tc);
    setTimeout(function () { if (typeof win.renderLegend === 'function') win.renderLegend(); }, 420);
  }

  function chrome(c) {
    var win = c.win, T = win.T, n = Object.keys(c.data).length;
    var mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = T(c.year + ' 鄉鎮市區長地圖', c.year + ' Township Head Map');
    // top-right summary chips: the same three slots 縣市長 mode fills with 直轄市長 / 縣市長 / 縣市首長
    var set = function (id, zh, en, val) {
      var l = win.document.getElementById(id + '-lbl'), v = win.document.getElementById(id);
      if (l) { l.dataset.zh = zh; l.dataset.en = en; l.textContent = G(win, 'currentLang') === 'en' ? en : zh; }
      if (v) { v.textContent = val; v.style.color = ''; }
    };
    var ind = Object.keys(c.data).filter(function (tc) { return ['63', '64', '65', '66', '67', '68'].indexOf(tc.slice(0, 2)) !== -1; }).length;
    set('ss-region', '鄉鎮市長', 'Township mayors', String(n - ind));
    set('ss-pl', '原住民區長', 'Indigenous district chiefs', String(ind));
    set('ss-total', '鄉鎮市區長', 'Township heads', String(n));
    return n;
  }

  // the engine took over (a quick click reached its view first, or its own deferred redraw landed after ours):
  // put it back to its national state and let setMayorMode tidy its own toolbars before V2 redraws
  function reset(win, year) {
    win.eval("level = 'ed'; curED = null; curTC = null; curVC = null; villAllMode = false;");
    win.setMayorMode(year);
  }

  // V2's map must stay on top of the engine. The engine can take the map back three ways: its own deferred redraw
  // after setMayorMode landing after ours (slow first load), a quick click reaching its view before ours replaced
  // it (it then navigates into a county itself: curED set), and its resize handler (120 ms after any resize of the
  // frame — e.g. when the page's control rows wrap — it rebuilds its projection, runs goED and resets the zoom).
  // ensure() checks V2's own layers (.v2-own: the engine's views use the same .ft-tc / .ft-vill classes) and redraws
  // the current V2 view; it runs on a schedule after draw() and after every resize, since on a busy machine the
  // engine's own timers can run seconds late.
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c, year) {
    var win = c.win;
    if (win.__v2TownHeadYear !== year) return;
    chrome(c);
    var glow = G(win, 'gGlow'), glowBack = glow && !glow.selectAll('.glow-core').empty();
    var moved = G(win, 'curED') != null, gB = G(win, 'gBase');
    var t = win.__v2ThTC;
    if (t) {
      if (moved || glowBack || gB.select('.ft-vill.v2-own').empty()) { if (moved) reset(win, year); township(c, t); return; }
      // zoom pulled back to the whole island (the engine's goED resets it after a resize): fit the township again
      if (win.d3.zoomTransform(G(win, 'svg').node()).k < 1.5) {
        var fs = []; gB.selectAll('.ft-vill.v2-own').each(function (d) { fs.push(d); });
        G(win, 'fitFeats')(fs);
      }
      return;
    }
    if (moved || glowBack || gB.select('.ft-tc.v2-own').empty()) { if (moved) reset(win, year); national(c); }
  }
  function schedule(c, year) {
    (c.win.__v2TownHeadTimers || []).forEach(clearTimeout);
    c.win.__v2TownHeadTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c, year); }, ms); });
  }

  // setMayorMode(year) has just drawn the engine's glow national view; replace it with the township blocks,
  // then keep it there (ensure() on a schedule and after every resize).
  function draw(win, year) {
    clear(win);
    var c = ctx(win, year);
    if (!c) return 0;
    win.__v2TownHeadYear = year;
    national(c);
    var n = chrome(c);
    schedule(c, year);
    win.__v2ThResize = function () { schedule(c, year); };
    win.addEventListener('resize', win.__v2ThResize);
    win.document.addEventListener('fullscreenchange', win.__v2ThResize);
    return n;
  }
  function clear(win) {
    if (win.__v2ThResize) {
      win.removeEventListener('resize', win.__v2ThResize);
      win.document.removeEventListener('fullscreenchange', win.__v2ThResize);
      win.__v2ThResize = null;
    }
    (win.__v2TownHeadTimers || []).forEach(clearTimeout);
    win.__v2TownHeadTimers = [];
    win.__v2TownHeadYear = null;
    win.__v2ThTC = null;
    var svg = G(win, 'svg');
    if (svg) svg.on('mouseleave.v2th', null);
  }
  window.V2TownshipHead = { draw: draw, clear: clear };
})();
