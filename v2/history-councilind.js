/* History → 地方 → 縣市議員 → 平地／山地原住民: click a district → its townships (user 2026-10-31: 「V2 加一層『點原住民選區
 * → 看該選區的鄉鎮得票』」).
 *
 * The engine's indigenous council layer (council.html _addCouncilIndLayer) is hover-only — its district shapes have a
 * mouseover (panel + hemicycle) and no click, and its data (COUNCIL_IND_P/M_DISTS) holds district totals only. Inside
 * History's own iframe copy of council.html (V1 untouched):
 *  - _addCouncilIndLayer is wrapped: after it draws, every district shape also gets a click;
 *  - the click opens the district's townships, drawn like the engine's district views (township blocks by their own
 *    leader via winMarginFill / COUNCIL_CLR, the shared township lines, fitFeats); the panel starts with the engine's
 *    own district panel (_indDistPanelHtml) and hovering a township shows that township's votes for the district's
 *    candidates (renderCouncilCandRow, turnoutBadgeHtml); the crumb 全台 › 縣市 平地原住民第N選舉區 leads back to the
 *    engine's national view with the indigenous layer on;
 *  - an engine redraw (resize, its own deferred calls to goED) puts the district view back; a click in the bar
 *    (navbar.js __v2NavClick), the indigenous toggles or a year / type change (V2CouncilInd.clear) end it.
 * Data: COUNCIL_IND (v2/data_council_ind.js, build_v2_council_ind.py, tests/reconcile_v2_council_ind.py).
 * V2CouncilInd.attach(win) once per engine; V2CouncilInd.clear(win) on every apply.
 */
(function () {
  var BLACK = '#0a0d16';

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function clr(win, p) { var CLR = G(win, 'COUNCIL_CLR') || {}, PM = G(win, 'PARTY_COLOR_MAP') || {}; return CLR[p] || PM[p] || '#aaa'; }
  function ranked(rec, vec) {
    return rec.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], v: vec[3 + i] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function fill(win, rec, vec) {
    if (!rec || !vec || !vec[2]) return BLACK;
    var s = ranked(rec, vec);
    if (!s[0].v) return BLACK;
    return win.winMarginFill(s[0].p, s.length > 1 ? (s[0].v - s[1].v) / vec[2] : 1, clr(win, s[0].p));
  }
  function tcName(win, tc) {
    var NM = G(win, 'NM'), raw = (NM && NM.t && NM.t[tc]) || tc;
    return typeof win.translateTownship === 'function' ? win.translateTownship(raw) : raw;
  }

  // ── the district a clicked shape stands for ──
  function keyOf(win, d) {
    if (d.properties && d.properties.ed) return d.properties.ed;   // multi-district counties (COUNCIL_IND_*_GJ)
    var cc = win._normCCKey(d.properties.cc), de = (distMap(win)[cc] || [])[0];
    return de ? cc + '_' + de.dist : null;
  }
  function plains(win) { return G(win, 'councilIndMode') === 'plains'; }
  function distMap(win) { return (plains(win) ? G(win, 'COUNCIL_IND_P_DISTS') : G(win, 'COUNCIL_IND_M_DISTS')) || {}; }
  function modeLabel(win) { return plains(win) ? win.T('平地原住民', 'Plains Indigenous') : win.T('山地原住民', 'Mountain Indigenous'); }
  function distEntry(win, key) { var p = key.split('_'); return (distMap(win)[p[0]] || []).filter(function (e) { return e.dist === p[1]; })[0]; }

  // ── panels ──
  function townPanel(c, tc) {
    var win = c.win, T = win.T, vec = c.rec.tc[tc], de = c.de;
    var title = tcName(win, tc), sub = win._indDistCountyName(c.cc) + (de ? (win.currentLang === 'en' ? ' ' : '') + win.T(de.title, 'District ' + (+de.dist)) : '') + ' · ' + c.year + ' ' + modeLabel(win);
    if (!vec || !vec[2]) return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>';
    var s = ranked(c.rec, vec), maxV = s[0].v || 1, cm = {};
    s.forEach(function (x) { cm[x.n] = clr(win, x.p); });
    return '<div class="t1" style="color:' + clr(win, s[0].p) + '">' + title + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + sub + '</div>' +
      (vec[0] && vec[1] ? win.turnoutBadgeHtml(vec[1] / vec[0] * 100, (vec[1] - vec[2]) / vec[1] * 100) : '') +
      '<div class="sec-title" style="margin-bottom:5px;margin-top:6px">' + T('候選人得票（本鄉鎮）', 'Candidate Votes (this township)') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + s.map(function (x) { return win.renderCouncilCandRow(x, vec[2], maxV, cm); }).join('') + '</div>' +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('只計本選區（原住民選舉人）的票', 'Votes of this indigenous district only') + '</div>';
  }
  function distPanel(c) {
    var win = c.win, T = win.T;
    return win._indDistPanelHtml(c.cc, c.de, modeLabel(win)) +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('移到各鄉鎮看該鄉鎮的得票', 'Hover a township for its votes') + '</div>';
  }

  // ── the district view ──
  function tcFeature(c, tc) {
    if (c.geom[tc]) return c.geom[tc];
    var VD = c.VD, vg = VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && vc.indexOf(tc) === 0; });
    if (!vg.length) return null;
    var m = c.win._cleanMergedGeom(c.win.topojson.merge(VD, vg)), g = m.type === 'Feature' ? m.geometry : m;
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, g);
    return (c.geom[tc] = { type: 'Feature', properties: { tc: tc }, geometry: g });
  }
  function ic(win, html) { var el = win.document.getElementById('ic'); if (el) el.innerHTML = html; }
  function draw(c) {
    var win = c.win, T = win.T;
    var pathFn = G(win, 'pathFn'), gBase = G(win, 'gBase'), gBg = G(win, 'gBg'), gInd = G(win, 'gInd');
    win.eval("level = 'tc'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    if (gInd) gInd.selectAll('*').remove();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var feats = Object.keys(c.rec.tc).sort().map(function (tc) { return tcFeature(c, tc); }).filter(Boolean);
    var f = function (d) { return fill(win, c.rec, c.rec.tc[d.properties.tc]); };
    var hov = window.V2TcBorder.hover(win, gBase.node(), 'v2-blk-hov');
    gBase.selectAll('.v2-ci-blk').data(feats).join('path')
      .attr('class', 'ft v2-ci-blk v2-own').attr('d', pathFn).style('animation', 'none')
      .attr('fill', f).attr('stroke', f).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .on('mouseover', function (e, d) { hov.show(this.getAttribute('d')); ic(win, townPanel(c, d.properties.tc)); })
      .on('mouseleave', function () { hov.hide(); })
      .on('click', function (e, d) { ic(win, townPanel(c, d.properties.tc)); });
    window.V2TcBorder.lines(gBase, pathFn, 'v2-ci-tcb', feats, 'tc');
    ic(win, distPanel(c));
    try { var bp = ((G(win, 'COUNCIL_IND_SEATS') || {})[c.cc] || {})[plains(win) ? 'p' : 'm'] || {}; win.drawCountyHemiForED(c.key, bp, plains(win) ? 'plains' : 'mountain'); } catch (e) {}
    var cr = win.document.getElementById('crumb');
    if (cr) {
      var nm = win._indDistCountyName(c.cc) + (win.currentLang === 'en' ? ' ' : '') + (c.de ? win.T(c.de.title, 'District ' + (+c.de.dist)) : '') + win.T('（' + modeLabel(win) + '）', ' (' + modeLabel(win) + ')');
      cr.innerHTML = '<span class="cl">' + T('全台', 'All') + '</span> › ' + nm;
      cr.querySelector('.cl').onclick = function () { back(win); };
    }
    if (feats.length) G(win, 'fitFeats')(feats);
  }
  function back(win) {
    win.__v2CiCtx = null;
    win.goED();
    if (typeof win._addCouncilIndLayer === 'function') win._addCouncilIndLayer();
  }
  function open(win, key) {
    var year = G(win, 'councilDisplayYear') || '2022', kind = plains(win) ? 'p' : 'm';
    var rec = ((typeof COUNCIL_IND !== 'undefined' ? COUNCIL_IND : {})[year] || {})[kind];
    rec = rec && rec[key];
    if (!rec) return;
    var c = { win: win, key: key, cc: key.split('_')[0], de: distEntry(win, key), rec: rec, year: year, VD: G(win, 'VD'), geom: {} };
    win.__v2CiCtx = c;
    draw(c);
  }

  // 全台 with 平地／山地原住民 on: drawn as its own map, not a pale layer over the council map (user 2026-10-31: 「平地山地原住民
  // 按鈕…ED層按鈕開的時候直接重畫，不要像現在一樣疊一層淺的上去了」「沒有的就地圖是黑的（跟鄉鎮市長一樣）」) — the council
  // blocks underneath go black (and stop taking the mouse), the district shapes solid in their own margin colour, the
  // county lines in the shared white outline
  function national(win) { return G(win, 'level') === 'ed' && G(win, 'curED') == null && !win.__v2CiCtx; }
  function solidify(win) {
    var gBase = G(win, 'gBase'), gInd = G(win, 'gInd'), pathFn = G(win, 'pathFn');
    if (!gBase || !gInd || !G(win, 'councilIndMode') || !national(win)) return;
    gBase.selectAll('.ft-ed').attr('fill', BLACK).attr('stroke', BLACK).style('pointer-events', 'none');
    gBase.selectAll('.ft-council-border').style('display', 'none');
    var hov = window.V2TcBorder.hover(win, gInd.node(), 'v2-blk-hov');
    gInd.selectAll('.ft-ind-active').attr('fill-opacity', 1).attr('stroke', function () { return this.getAttribute('fill'); }).attr('stroke-width', 0.6)
      .on('mouseover.v2ci', function () { d3sel(win, this).attr('fill-opacity', 1); hov.show(this.getAttribute('d')); })
      .on('mouseleave.v2ci', function () { d3sel(win, this).attr('fill-opacity', 1); hov.hide(); });
    var CD = G(win, 'CD');
    // the engine's own county lines (.co-b: rgba(255,255,255,.12), 0.9) — no white outline on the national map (user 2026-11-01)
    gInd.selectAll('.ft-ind-active').attr('stroke', 'rgba(255,255,255,.06)').attr('stroke-width', 0.6);
    if (CD) gInd.selectAll('.v2-ci-ccb').data([win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; })]).join('path')
      .attr('class', 'v2-ci-ccb').attr('d', pathFn).attr('fill', 'none').attr('stroke', 'rgba(255,255,255,.12)').attr('stroke-width', 0.9)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none').raise();
    if (hov.raise) hov.raise();
  }
  function d3sel(win, el) { return win.d3.select(el); }

  function attach(win) {
    if (win.__v2CiAttached) return;
    win.__v2CiAttached = true;
    var add = win._addCouncilIndLayer;
    if (typeof add === 'function') {
      win._addCouncilIndLayer = function () {
        var r = add.apply(this, arguments);
        var gInd = G(win, 'gInd');
        if (gInd) gInd.selectAll('.ft-ind-active').attr('cursor', 'pointer').on('click.v2ci', function (e, d) { var k = keyOf(win, d); if (k) open(win, k); });
        if (G(win, 'councilIndMode')) solidify(win);
        return r;
      };
    }
    // the indigenous toggles end the district view
    var sim = win.setCouncilIndMode;
    if (typeof sim === 'function') win.setCouncilIndMode = function () {
      win.__v2CiCtx = null;
      var r = sim.apply(this, arguments);
      // off again: the council map back in its own colours (solidify blacked it)
      if (!G(win, 'councilIndMode') && G(win, 'level') === 'ed' && G(win, 'curED') == null) win.goED();
      return r;
    };
    // engine redraws keep the district view; a click in the bar leaves it
    ['goED', 'goTCAllNational', 'goVillAllNational'].forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function') return;
      win[n] = function () {
        var c = win.__v2CiCtx;
        if (c && win.__v2NavClick) win.__v2CiCtx = c = null;
        var r = o.apply(this, arguments);
        if (c && win.__v2CiCtx === c) setTimeout(function () { if (win.__v2CiCtx === c) draw(c); }, 0);
        else if (n === 'goED' && G(win, 'councilIndMode')) setTimeout(function () { solidify(win); }, 0);
        return r;
      };
    });
  }
  function clear(win) { win.__v2CiCtx = null; }
  window.V2CouncilInd = { attach: attach, clear: clear };
})();
