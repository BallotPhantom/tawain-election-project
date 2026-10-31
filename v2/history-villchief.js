/* History → 地方 → 村里長 (village chiefs), 2014/2018/2022 (user, 2026-10-27: 「村里長「要做」！」).
 *
 * Same rules as history-townhead.js (user: 「必須要跟其他的縣市長跟市議員是一模一樣的設計」, no population glow,
 * top level = the race's own unit as blocks) — inside History's own iframe copy of council.html (V1 untouched):
 *  - after setMayorMode(year) sets the mode up (legend, chips, panel frame), the map is cleared and redrawn as
 *    the engine's 全台村里 view (_mayorGoVillAllNational's layers): every village filled by its leading
 *    candidate's party via the engine's winMarginFill / COUNCIL_CLR (deeper = bigger margin), county borders and
 *    the yellow county hover outline as the engine draws them; villages without data are black (「沒資料就反黑吧」);
 *  - the village is the lowest level: no drill-down (user: 「因為是底層所以不用下鑽」); click = hover panel;
 *  - a first-place tie (同票, decided by lot) between different parties is a left→right gradient of their
 *    margin-0 shades, as profile.html's _winFill (user 2026-10-19: 同票 → 藍綠漸層); CEC files of 2018/2022 mark
 *    no winner for those villages, and none is invented here;
 *  - panel from the engine's own pieces (t1, sub-label, _glassBadge, _turnoutTrafficLights, 候選人得票 +
 *    renderCouncilCandRow), in _mayorTcPanelHtml's order;
 *  - data: VILLAGE_CHIEF (v2/data_village_chief.js, build_v2_village_chief.py, tests/reconcile_village_chief.py).
 * V2VillageChief.draw(win, year) / V2VillageChief.clear(win).
 */
(function () {
  var NO_DATA = '#aaa';     // fallback party colour only
  var BLACK = '#0a0d16';    // a village without data takes the map's black background (user 2026-10-27: 「沒資料就反黑吧」;
                            // mapBgColor()'s base colour — mapBgColor itself returns a CSS gradient, not an SVG fill)

  // the engine's top-level const / let bindings are not window properties: read them in its scope
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }

  function dataFor(year) {
    return (typeof VILLAGE_CHIEF !== 'undefined' ? VILLAGE_CHIEF : {})[year] || null;   // top-level const in data_village_chief.js
  }
  // [valid, elig, cast, [[n, p, v, e], ...]] → {valid, elig, cast, cands: [{n, p, v, e}]} (sorted by votes)
  function rec(row) {
    if (!row) return null;
    return { valid: row[0], elig: row[1], cast: row[2], cands: row[3].map(function (c) { return { n: c[0], p: c[1], v: c[2], e: c[3] }; }) };
  }
  // tied first-place parties (distinct, in vote order) when more than one party shares the top vote, else null
  function tieParties(r) {
    var c = r.cands;
    if (c.length < 2 || c[0].v !== c[1].v || !c[0].v) return null;
    var ps = [];
    c.forEach(function (x) { if (x.v === c[0].v && ps.indexOf(x.p) === -1) ps.push(x.p); });
    return ps.length > 1 ? ps : null;
  }
  function fill(c, r) {
    var win = c.win, CLR = G(win, 'COUNCIL_CLR');
    if (!r || !r.valid) return BLACK;
    var tie = tieParties(r);
    if (tie) {
      var id = 'v2vc-tie-' + tie.join('-');
      if (c.defs.select('#' + id).empty()) {
        var g = c.defs.append('linearGradient').attr('id', id).attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 0);
        tie.forEach(function (p, i) {
          g.append('stop').attr('offset', i / (tie.length - 1)).attr('stop-color', win.winMarginFill(p, 0, CLR[p] || NO_DATA));
        });
      }
      return 'url(#' + id + ')';
    }
    var s = r.cands, margin = s.length > 1 ? (s[0].v - s[1].v) / r.valid : 1;
    return win.winMarginFill(s[0].p, margin, CLR[s[0].p] || NO_DATA);
  }
  // 2022 villages merged since (the map's code ≠ the 2022 code) read their VC_MERGED_2022 target, as the engine does
  function rowFor(c, vc) {
    if (c.data[vc]) return c.data[vc];
    var to = c.year === '2022' && c.merged22 && c.merged22[vc];
    return (to && c.data[to]) || null;
  }
  // {vc: [turnout %, valid-vote %]} — the shape _turnoutTrafficLights ranks (all villages of the year)
  function turnoutTable(data) {
    var o = {};
    Object.keys(data).forEach(function (vc) {
      var r = data[vc];
      if (r[1] && r[2]) o[vc] = [+(r[2] / r[1] * 100).toFixed(2), +(r[0] / r[2] * 100).toFixed(2)];
    });
    return o;
  }

  function panelHtml(c, vc) {
    var win = c.win, T = win.T, CLR = G(win, 'COUNCIL_CLR'), LBL = G(win, 'COUNCIL_LBL'), NM = G(win, 'NM');
    var tc = vc.slice(0, 8), cc = win._tcCityKey(tc);
    var cn = (G(win, '_CC_NAME') || {})[cc] || cc;
    var tRaw = (NM && NM.t && NM.t[tc]) || tc;
    var tn = typeof win.translateTownship === 'function' ? win.translateTownship(tRaw) : tRaw;
    var vRaw = (NM && NM.v && NM.v[vc]) || vc;
    var vnRaw = vRaw.indexOf(' ') !== -1 ? vRaw.split(' ').slice(1).join(' ') : vRaw;
    var vn = typeof win.translateVillage === 'function' ? win.translateVillage(vc, vnRaw) : vnRaw;
    var key = c.data[vc] ? vc : (c.year === '2022' && c.merged22 && c.merged22[vc]);
    var r = rec(rowFor(c, vc));
    if (!r || !r.valid) return '<div class="t1">' + vn + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>';
    // the engine's banner for a village merged since 2022 (_mayorVillPanelHtml's 2022 wrapper)
    var banner = '';
    if (key !== vc) {
      var toRaw = (NM && NM.v && NM.v[key]) || key;
      var toName = toRaw.indexOf(' ') !== -1 ? toRaw.split(' ').slice(1).join(' ') : toRaw;
      banner = '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
        T('此村里已併入「' + toName + '」，2022年地圖染色／候選人資料沿用「' + toName + '」', 'This village has been merged into "' + toName + '" — the 2022 map color and candidate data shown here belong to "' + toName + '"') + '</div>';
    }
    var tie = r.cands.length > 1 && r.cands[0].v === r.cands[1].v;
    var w = null;
    r.cands.forEach(function (x) { if (x.e) w = x; });
    var head = w || r.cands[0], wclr = CLR[head.p] || '#888';
    var badge = w
      ? (LBL[w.p] || w.p) + T(' 當選', ' elected') + (r.cands.length === 1 ? T('（同額競選）', ' (uncontested)') : tie ? T('（同票抽籤）', ' (tie, drawn by lot)') : '')
      : T('同票，抽籤決定（中選會檔案未標當選人）', 'Tie, decided by lot (no winner marked in the CEC files)');
    // every candidate on its own row, as the engine's village panels
    var maxV = (r.cands[0] || {}).v || 1;
    var rows = r.cands.map(function (x) { return win.renderCouncilCandRow(x, r.valid, maxV); }).join('');
    return banner + '<div class="t1" style="color:' + wclr + '">' + vn + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + cn + ' ' + tn + ' · ' + c.year + T(' 村里長選舉', ' Village Chief Election') + '</div>' +
      win._glassBadge(w ? wclr : '#f59e0b', badge) + win._turnoutTrafficLights(c.tl, key, 'v2vc' + c.year) +
      '<div class="sec-title" style="margin-bottom:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rows + '</div>';
  }

  // re-read the engine's projection and layer handles: it rebuilds them on resize (e.g. when the page's control
  // rows wrap), and drawing with a stale pathFn puts the map off-screen while fitFeats uses the new one
  function fresh(c) {
    c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg');
  }
  function ic(win, html) { var el = win.document.getElementById('ic'); if (el) el.innerHTML = html; }

  // the national village map (_mayorGoVillAllNational's layers) — the only level of this mode
  function national(c) {
    fresh(c);   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    var win = c.win, d3 = win.d3, T = win.T;
    // the engine's own 全台村里 state (level 'vill', no county): its legend and toolbar gating follow it
    win.eval("level = 'vill'; villAllMode = true; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var CD = G(win, 'CD'), VD = G(win, 'VD');
    var feats = win.topojson.feature(VD, VD.objects.villages).features.filter(function (f) { return f.properties.vc; });
    var cos = win.topojson.feature(CD, CD.objects.counties);
    var countyMesh = win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; });
    c.gBase.selectAll('.ft-vill').data(feats).join('path').attr('class', 'ft ft-vill v2-own').attr('d', c.pathFn)
      .attr('fill', function (d) { return fill(c, rec(rowFor(c, d.properties.vc))); })
      .attr('stroke', 'rgba(0,0,0,0.08)').attr('stroke-width', 0.3).attr('vector-effect', 'non-scaling-stroke')
      .on('mouseover', function (e, d) {
        ic(win, panelHtml(c, d.properties.vc));
        var cc = win._tcCityKey(d.properties.vc.slice(0, 8));
        var ef = cos.features.find(function (f) { return win._normCCKey(f.properties.cc) === cc; });
        if (ef) hov.attr('d', c.pathFn(ef)).attr('display', null); else hov.attr('display', 'none');
      })
      .on('click', function (e, d) { ic(win, panelHtml(c, d.properties.vc)); });
    c.gBase.selectAll('.ft-tc-border').data(cos.features).join('path')
      .attr('class', 'ft-tc-border').attr('d', c.pathFn)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.45)').attr('stroke-width', 1.8)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
    c.gBase.selectAll('.ft-ed-border').data([countyMesh]).join('path')
      .attr('class', 'ft-ed-border').attr('d', c.pathFn)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.9)').attr('stroke-width', 2.5)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
    var hov = c.gBase.append('path')
      .attr('class', 'nat-vill-hover-ed').attr('fill', 'none')
      .attr('stroke', '#ffd900').attr('stroke-width', 3.0)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none')
      .attr('display', 'none');
    if (c.svg) c.svg.on('mouseleave.v2vc', function () { hov.attr('display', 'none'); });
    ic(win, '<div class="t1">' + T(c.year + ' 村里長選舉', c.year + ' Village Chief Election') + '</div>' +
      '<div style="color:#bbb;font-size:11px;margin-top:4px">' + T('移到各村里查看資料', 'Hover over a village to view data') + '</div>');
    var crumb = win.document.getElementById('crumb');
    if (crumb) {
      crumb.innerHTML = '<span class="cl">' + T('全台', 'All') + '</span> › ' + T(c.year + ' 村里長選舉', c.year + ' Village Chief Election');
      crumb.querySelector('.cl').onclick = function () {
        if (c.svg) c.svg.transition().duration(380).call(G(win, 'zm').transform, d3.zoomIdentity);
        try { win.eval('curK = 1'); } catch (e) {}
      };
    }
    setTimeout(function () { if (typeof win.renderLegend === 'function') win.renderLegend(); }, 50);
  }

  function chrome(c) {
    var win = c.win, T = win.T, vcs = Object.keys(c.data);
    var mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = T(c.year + ' 村里長地圖', c.year + ' Village Chief Map');
    // top-right summary chips: the same three slots 縣市長 mode fills with 直轄市長 / 縣市長 / 縣市首長
    var set = function (id, zh, en, val) {
      var l = win.document.getElementById(id + '-lbl'), v = win.document.getElementById(id);
      if (l) { l.dataset.zh = zh; l.dataset.en = en; l.textContent = G(win, 'currentLang') === 'en' ? en : zh; }
      if (v) { v.textContent = val; v.style.color = ''; }
    };
    var single = vcs.filter(function (vc) { return c.data[vc][3].length === 1; }).length;
    set('ss-region', '多人競選', 'Contested', String(vcs.length - single));
    set('ss-pl', '同額競選', 'Uncontested', String(single));
    set('ss-total', '村里長', 'Village chiefs', String(vcs.length));
    return vcs.length;
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
    if (win.__v2VillChiefYear !== year) return;
    chrome(c);
    var glow = G(win, 'gGlow'), glowBack = glow && !glow.selectAll('.glow-core').empty();
    var moved = G(win, 'curED') != null, gB = G(win, 'gBase');
    if (moved || glowBack || gB.select('.ft-vill.v2-own').empty()) { if (moved) reset(win, year); national(c); }
  }
  function schedule(c, year) {
    (c.win.__v2VillChiefTimers || []).forEach(clearTimeout);
    c.win.__v2VillChiefTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c, year); }, ms); });
  }

  // setMayorMode(year) has just drawn the engine's glow national view; replace it with the village map, then keep it
  // there (ensure() on a schedule and after every resize).
  function draw(win, year) {
    clear(win);
    var data = dataFor(year), gBase = G(win, 'gBase'), pathFn = G(win, 'pathFn'), svg = G(win, 'svg');
    if (!data || !gBase || !pathFn || !svg) return 0;
    var defs = svg.select('defs');
    if (defs.empty()) defs = svg.insert('defs', ':first-child');
    var c = { win: win, year: year, data: data, tl: turnoutTable(data), gBase: gBase, pathFn: pathFn, svg: svg, defs: defs,
              merged22: G(win, "typeof VC_MERGED_2022 !== 'undefined' ? VC_MERGED_2022 : null") };
    win.__v2VillChiefYear = year;
    national(c);
    var n = chrome(c);
    schedule(c, year);
    win.__v2VcResize = function () { schedule(c, year); };
    win.addEventListener('resize', win.__v2VcResize);
    win.document.addEventListener('fullscreenchange', win.__v2VcResize);
    return n;
  }
  function clear(win) {
    if (win.__v2VcResize) {
      win.removeEventListener('resize', win.__v2VcResize);
      win.document.removeEventListener('fullscreenchange', win.__v2VcResize);
      win.__v2VcResize = null;
    }
    (win.__v2VillChiefTimers || []).forEach(clearTimeout);
    win.__v2VillChiefTimers = [];
    win.__v2VillChiefYear = null;
    var svg = G(win, 'svg');
    if (svg) svg.on('mouseleave.v2vc', null);
  }
  window.V2VillageChief = { draw: draw, clear: clear };
})();
