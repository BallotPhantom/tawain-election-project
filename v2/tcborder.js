/* Shared look for every map page. (1) One township-border style for every map (user 2026-10-28: 「不分區的鄉鎮市區層必須要跟山地原住民一樣邊線的黑色粗細一直的
 * 邊線」「分區也跟原住民一樣」「請共用一個函式」「讓所有的版面跟這些設計都一致」 — every page, every mode).
 * The 原住民 design: blocks stroked in their own fill (no seams), 1 px township lines rgba(0,0,0,.28), a 2.5 px white
 * outline around the area shown, all non-scaling (same width at every zoom).
 *
 *  V2TcBorder.lines(parent, pathFn, cls, data, kind)
 *      draws one set of lines into a d3 selection: kind 'tc' = township lines, 'outline' = the white outline.
 *      Used by V2's own township views (history-legind / -townhead / -townrep).
 *  V2TcBorder.attach(win)
 *      for the V1 engines (test.html / council.html, untouched): watches gBase; whenever the engine draws a township
 *      layer (.ft-tc, or .ft-pltc for 不分區) it restyles those blocks the same way (inline style — outranks the engine's
 *      attributes and style.css; the hover rule in v2-shell.js / history.html is !important and still wins) and puts
 *      an overlay group last in gBase: township lines, the outline (from the engine's own .bg-fill shape, when the view
 *      has one), the 不分區 layer's orange dashed 舊縣市界 (kept, user's choice), and the hovered township's yellow
 *      outline on top. Blocks are never moved (moving the node under the pointer cancels its click).
 *      V2's own blocks (.v2-own) are left to their module, but get the same hover-on-top outline.
 */
(function () {
  var TC = { stroke: 'rgba(0,0,0,0.28)', width: 1.0 };
  var TC_MESH = 'rgba(0,0,0,0.48)';   // = two TC strokes on one edge: 1 − 0.72²
  var OUTLINE = { stroke: 'rgba(255,255,255,0.9)', width: 2.5 };
  var HOVER = { stroke: '#f5c518', width: 2.2 };   // = the 2027 補選預測 page
  var OLD_CITY = '#f59e0b';                       // test.html's 不分區 township layer: 舊縣市界

  function lines(parent, pathFn, cls, data, kind) {
    var s = kind === 'outline' ? OUTLINE : TC;
    return parent.selectAll('.' + cls).data(data).join('path').attr('class', cls).attr('d', pathFn)
      .attr('fill', 'none').attr('stroke', s.stroke).attr('stroke-width', s.width)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  // ── the yellow hover outline for V2's own blocks (user 2026-10-28: 「2028預測跟08,12 滑鼠互動的黃匡在全台地圖會留在
  // 地圖上」). Audit: those modules raised / re-inserted the hovered block to put its outline on top; moving the node under
  // the pointer makes Chrome drop the pending mouseleave / mouseout, so the block's yellow stroke was never reset. Here the
  // blocks are never moved: one outline path (pointer-events none) sits last in the layer and takes the hovered shape's
  // d; it is hidden on leave, and whenever the pointer leaves the whole map (svg mouseleave), so it cannot stay behind.
  //   var h = V2TcBorder.hover(win, gBaseNode, 'v2-xx-hov'); h.show(dString); h.hide();
  // onLeave (optional): what leaving the map does instead of hiding — e.g. 2028's click-locked block keeps its outline
  function hover(win, layer, cls, onLeave) {
    var doc = win.document;
    var get = function () {
      var n = layer.querySelector(':scope > path.' + cls);
      if (!n) {
        n = mk(doc, '', HOVER.stroke, HOVER.width);
        n.setAttribute('class', cls); n.style.display = 'none';
        layer.appendChild(n);
      }
      return n;
    };
    var api = {
      show: function (d) { var n = get(); if (n.parentNode.lastChild !== n) n.parentNode.appendChild(n); n.setAttribute('d', d || ''); n.style.display = ''; },
      hide: function () { var n = layer.querySelector(':scope > path.' + cls); if (n) n.style.display = 'none'; }
    };
    var svg = layer.ownerSVGElement || (layer.tagName && layer.tagName.toLowerCase() === 'svg' ? layer : null), flag = '__v2Hov_' + cls;
    if (svg) svg[flag + 'Cb'] = onLeave || null;
    if (svg && !svg[flag]) {   // once per map: hides every outline of this class, whichever layer it is in now
      svg[flag] = true;
      svg.addEventListener('mouseleave', function () {
        [].forEach.call(svg.querySelectorAll('path.' + cls), function (n) { n.style.display = 'none'; });
        if (svg[flag + 'Cb']) svg[flag + 'Cb']();
      });
    }
    return api;
  }
  function mk(doc, d, stroke, width, dash) {
    var p = doc.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', width); p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('pointer-events', 'none');
    if (dash) p.setAttribute('stroke-dasharray', dash);
    return p;
  }
  function G(win, n) { try { return win.eval(n); } catch (e) { return undefined; } }

  function attach(win) {
    if (win.__v2TcBorder) return;
    var gSel = G(win, 'gBase'); if (!gSel || !gSel.node) return;
    var g = gSel.node(), doc = win.document, st = { group: null, hov: null, hovEl: null, raf: 0 };
    win.__v2TcBorder = st;
    // a language switch redraws the gap labels (「空軍基地」 / 「Air base」)
    var sl = win.setLang;
    if (typeof sl === 'function' && !sl.v2Tcb) {
      win.setLang = function () { var r = sl.apply(this, arguments); try { apply(); } catch (e) {} return r; };
      win.setLang.v2Tcb = true;
    }
    var isBlock = function (el) { return el && el.tagName === 'path' && el.classList && (el.classList.contains('ft-tc') || el.classList.contains('ft-pltc') || el.classList.contains('ft-ed')); };
    var isVill = function (el) { return el && el.tagName === 'path' && /(^|\s)(ft-vill\S*|v2-li-blk)(\s|$)/.test(el.getAttribute('class') || ''); };

    function apply() {
      st.raf = 0;
      fillGaps();
      var blocks = [].filter.call(g.querySelectorAll('path.ft-tc, path.ft-pltc'), function (el) { return !st.group || !st.group.contains(el); });
      var engine = blocks.filter(function (el) { return !el.classList.contains('v2-own'); });
      // the 全台 district layer (.ft-ed, no township blocks): the 2008 / 2012 design (user 2026-10-28: 「2012,2008的邊線
      // 設計跟2016,2020,2024不同讓2016,2020,2024改成2012 的設計」) — blocks stroked in their own fill, district lines =
      // the village arcs between districts (TC style), county lines white (OUTLINE style), the engine's faint .co-b hidden
      var eds = blocks.length ? [] : [].filter.call(g.querySelectorAll('path.ft-ed'), function (el) { return !el.classList.contains('v2-own') && (!st.group || !st.group.contains(el)); });
      if (eds.length) return edLayer(eds);
      if (!blocks.length) { if (st.group) { st.group.remove(); st.group = null; st.hov = null; } return; }
      var grp = doc.createElementNS(SVGNS, 'g');
      grp.setAttribute('class', 'v2-tcb-g');
      grp.setAttribute('pointer-events', 'none');
      var olds = [];
      engine.forEach(function (el) {
        var fill = el.style.fill || el.getAttribute('fill');   // the engine colours some layers by style (.ft-ed: attr #16161c, style = the colour)
        if (el.getAttribute('stroke') === OLD_CITY) olds.push(el);
        if (fill) { el.style.stroke = fill; el.style.strokeWidth = '0.6'; el.style.vectorEffect = 'non-scaling-stroke'; el.style.strokeDasharray = 'none'; }
      });
      // everything below comes from one set of villages — the view's — so lines, outline and blocks share their arcs
      // (2026-10-28 audit: the engine's own outline shapes and per-block outlines left visible gaps)
      if (engine.length && !viewLines(win, engine, grp)) {
        engine.forEach(function (el) { grp.appendChild(mk(doc, el.getAttribute('d'), TC.stroke, TC.width)); });
        var gBg = G(win, 'gBg'), bg = gBg && gBg.node && gBg.node().querySelector('.bg-fill');
        if (bg && bg.getAttribute('d')) grp.appendChild(mk(doc, bg.getAttribute('d'), OUTLINE.stroke, OUTLINE.width));
      }
      olds.forEach(function (el) { grp.appendChild(mk(doc, el.getAttribute('d'), OLD_CITY, 1.4, el.getAttribute('stroke-dasharray') || '4,3')); });
      st.hov = mk(doc, '', HOVER.stroke, HOVER.width);
      st.hov.style.display = 'none';
      grp.appendChild(st.hov);
      if (st.group) st.group.remove();
      st.group = grp;
      g.appendChild(grp);
      if (st.lbl) g.appendChild(st.lbl);
      if (st.hovEl && g.contains(st.hovEl)) show(st.hovEl);
    }
    // gaps in the village map (land no village covers: 新竹 / 清泉崗 / 岡山 air bases, …) under every township or village
    // layer — engine or V2 module — filled in the colour of the nearest village's block, in a group put first in gBase
    // so it sits under the blocks and their lines (user 2026-10-28 audit: they showed as black holes)
    function fillGaps() {
      if (st.gap) { st.gap.remove(); st.gap = null; }
      if (st.lbl) { st.lbl.remove(); st.lbl = null; }
      var m = vmap(win), pathFn = G(win, 'pathFn');
      if (!m || !pathFn) return;
      var els = [].filter.call(g.querySelectorAll('path'), function (el) { return isBlock(el) || isVill(el); });
      if (!els.length) return;
      var byTc = m.byTc(), byVc = m.byVc(), owner = new Map();
      els.forEach(function (el) {
        var f = el.__data__, p = f && f.properties; if (!p) return;
        var idx = isVill(el) ? (byVc[p.vc] !== undefined ? [byVc[p.vc]] : null) : (f.__v2Vill || byTc[p.tc]);
        if (idx) idx.forEach(function (i) { if (!owner.has(i) || isVill(el)) owner.set(i, el); });
      });
      if (!owner.size) return;
      var view = [].concat(Array.from(owner.keys())).sort(function (a, b) { return a - b; });
      var gaps = gapRings(m, view), cents = m.centroids();
      if (!gaps.length) return;
      var grp = doc.createElementNS(SVGNS, 'g');
      grp.setAttribute('class', 'v2-tcb-gap');
      grp.setAttribute('pointer-events', 'none');
      var labels = doc.createElementNS(SVGNS, 'g');   // on top of everything (the blocks' strokes would cover them)
      labels.setAttribute('class', 'v2-tcb-gap v2-tcb-lbl');
      labels.setAttribute('pointer-events', 'none');
      gaps.forEach(function (gp) {
        var base = airBase(m, gp);
        if (base) {   // user 2026-10-28: 「空軍基地的那幾塊在鄉鎮市區層可能直接填黑色直接標示用處」
          var bp = mk(doc, pathFn(gp.geom), 'rgba(255,255,255,0.35)', 0.8);
          bp.setAttribute('fill', '#000');
          grp.appendChild(bp);
          // English 「Air base」 (i18n audit 2026-10-29); sized for the text actually drawn
          var txt = win.T && win.T('z', 'e') === 'e' ? 'Air base' : base;
          var lb = labelSpot(pathFn, gp.geom, txt);
          if (!lb) return;
          var t = doc.createElementNS(SVGNS, 'text');
          t.textContent = txt;
          t.setAttribute('x', lb.x); t.setAttribute('y', lb.y);
          t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
          // map units sized to the block's own width: it grows with the zoom and always fits (user: 「字體要隨著大小修正」)
          t.setAttribute('font-size', lb.size);
          t.setAttribute('fill', 'rgba(255,255,255,0.85)');
          t.setAttribute('pointer-events', 'none');
          labels.appendChild(t);
          return;
        }
        var best = -1, bd = Infinity;
        view.forEach(function (i) { var c = cents[i], d = (c[0] - gp.mid[0]) * (c[0] - gp.mid[0]) + (c[1] - gp.mid[1]) * (c[1] - gp.mid[1]); if (d < bd) { bd = d; best = i; } });
        var el = owner.get(best), fill = el && (el.style.fill || el.getAttribute('fill'));
        if (!fill || fill === 'none') return;
        var pth = mk(doc, pathFn(gp.geom), fill, 0.6);
        pth.setAttribute('fill', fill);
        grp.appendChild(pth);
      });
      st.gap = grp;
      g.insertBefore(grp, g.firstChild);
      if (labels.firstChild) { st.lbl = labels; g.appendChild(labels); }
    }
    function edLayer(eds) {
      var pathFn = G(win, 'pathFn'), m = vmap(win), CD = G(win, 'CD');
      if (!pathFn || !m || !CD) return;
      // only 立委 districts: council.html's 縣市長 / 議員 maps draw their counties as .ft-ed too (user 2026-10-28: 「你把區域
      // 立委的邊線弄到2022的縣市長地圖上了」) — the blocks must be features of ED_GJ / ED_GJ_2016
      var gj16 = G(win, "typeof ED_GJ_2016 !== 'undefined' ? ED_GJ_2016 : null"), gj24 = G(win, "typeof ED_GJ !== 'undefined' ? ED_GJ : null");
      var f0 = eds[0].__data__;
      var is16 = !!(gj16 && f0 && gj16.features.indexOf(f0) >= 0), is24 = !!(gj24 && f0 && gj24.features.indexOf(f0) >= 0);
      if (!is16 && !is24) { if (st.group) { st.group.remove(); st.group = null; st.hov = null; } return; }
      var arr = is16 ? villageEd2016(win) : win.__v2VcEd2024;
      eds.forEach(function (el) {
        var fill = el.style.fill || el.getAttribute('fill');   // the engine colours some layers by style (.ft-ed: attr #16161c, style = the colour)
        if (fill) { el.style.stroke = fill; el.style.strokeWidth = '0.6'; el.style.vectorEffect = 'non-scaling-stroke'; }
      });
      [].forEach.call(g.querySelectorAll('path.co-b'), function (el) { el.style.display = 'none'; });
      var grp = doc.createElementNS(SVGNS, 'g');
      grp.setAttribute('class', 'v2-tcb-g');
      grp.setAttribute('pointer-events', 'none');
      // both meshes once per village map / projection (fill transitions re-run this every frame)
      var ck = st.edCache, pr = pathFn.projection && pathFn.projection();
      var pk = pr && pr.scale ? pr.scale() + ',' + pr.translate() : '';
      if (!ck || ck.arr !== arr || ck.pathFn !== pathFn || ck.pk !== pk) {
        ck = st.edCache = { arr: arr, pathFn: pathFn, pk: pk, ed: null,
          cd: pathFn(m.topo.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; })) };
        if (arr) ck.ed = pathFn(m.topo.mesh(m.VD, m.VD.objects.villages, function (a, b) {
          if (a === b) return false;
          var ea = arr[m.index.get(a)], eb = arr[m.index.get(b)];
          return ea && eb && ea !== eb;
        }));
      }
      if (ck.ed) grp.appendChild(mk(doc, ck.ed, TC.stroke, TC.width));
      grp.appendChild(mk(doc, ck.cd, OUTLINE.stroke, OUTLINE.width));
      st.hov = mk(doc, '', HOVER.stroke, HOVER.width);
      st.hov.style.display = 'none';
      grp.appendChild(st.hov);
      if (st.group) st.group.remove();
      st.group = grp;
      g.appendChild(grp);
      if (st.lbl) g.appendChild(st.lbl);
      if (st.hovEl && g.contains(st.hovEl)) show(st.hovEl);
    }
    function schedule() { if (!st.raf) st.raf = win.requestAnimationFrame(apply); }
    function show(el) { if (!st.hov) return; st.hov.setAttribute('d', el.getAttribute('d')); st.hov.style.display = ''; }

    st.obs = new win.MutationObserver(function (muts) {
      var ours = function (n) { return n === st.group || (st.group && st.group.contains(n)) || n === st.gap || (st.gap && st.gap.contains(n)) || n === st.lbl || (st.lbl && st.lbl.contains(n)) || (n.classList && (n.classList.contains('v2-tcb-g') || n.classList.contains('v2-tcb-gap') || n.classList.contains('v2-blk-hov') || n.classList.contains('v2-p28-hov'))); };
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') { if (!ours(m.target) && (isBlock(m.target) || isVill(m.target))) { schedule(); return; } continue; }
        var nodes = [].slice.call(m.addedNodes).concat([].slice.call(m.removedNodes));
        if (nodes.some(function (n) { return !ours(n); })) { schedule(); return; }
      }
    });
    st.obs.observe(g, { childList: true, subtree: true, attributes: true, attributeFilter: ['fill', 'd'] });
    g.addEventListener('mouseover', function (e) { if (isBlock(e.target)) { st.hovEl = e.target; show(e.target); } });
    g.addEventListener('mouseout', function (e) {
      if (isBlock(e.target) && st.hovEl === e.target) { st.hovEl = null; if (st.hov) st.hov.style.display = 'none'; }
    });
    schedule();
  }

  // the view's villages = the villages of its township blocks (each piece knows its own, see rebuildTownships).
  //  (gaps — holes of their merge that hold no village — are filled by attach's fillGaps)
  //  - township lines: topojson.mesh of the arcs between villages of different blocks — shared edges, drawn once;
  //  - white outline: the outer rings of the merge.
  function viewLines(win, blocks, grp) {
    var m = vmap(win), pathFn = G(win, 'pathFn'), doc = win.document;
    if (!m || !pathFn) return false;
    var owner = new Int32Array(m.geoms.length).fill(-1), byTc = m.byTc();
    blocks.forEach(function (el, b) {
      var f = el.__data__, idx = f && (f.__v2Vill || (f.properties && byTc[f.properties.tc]));
      if (idx) idx.forEach(function (i) { owner[i] = b; });
    });
    var view = [];
    owner.forEach(function (b, i) { if (b >= 0) view.push(i); });
    if (!view.length) return false;
    var merged = m.topo.merge(m.VD, view.map(function (i) { return m.geoms[i]; }));
    var polys = merged.type === 'Polygon' ? [merged.coordinates] : merged.coordinates;
    var mesh = m.topo.mesh(m.VD, m.VD.objects.villages, function (a, b) {
      if (a === b) return false;
      var oa = owner[m.index.get(a)], ob = owner[m.index.get(b)];
      return oa >= 0 && ob >= 0 && oa !== ob;
    });
    // TC_MESH: the 原住民 design draws each township's own outline (lines(…, 'tc')), so a shared edge carries two 0.28
    // strokes; a mesh draws it once, so it takes their combined darkness (user 2026-10-28: 「2016的鄉鎮市區層的黑色邊線要改
    // 成跟其他年一樣」 — 2016 / 2020 / 2024 came out lighter than 2008 / 2012 / 原住民)
    grp.appendChild(mk(doc, pathFn(mesh), TC_MESH, TC.width));
    grp.appendChild(mk(doc, pathFn({ type: 'MultiPolygon', coordinates: polys.map(function (p) { return [p[0]]; }) }), OUTLINE.stroke, OUTLINE.width));
    return true;
  }

  // ── result tags: the 區域立委 tag everywhere (user 2026-10-28: 「市議員的tag: 民進黨 得票率最高 跟區域立委的民進黨勝選的綠
  // 不一致，請遵守區域立委的tag」). council.html (V1, untouched) draws its mayor / council / township tags with
  // _glassBadge(colour, text) — inline glass styling in COUNCIL_CLR's colours. In this iframe it is replaced by the
  // legislative markup, <span class="win-badge bd-*">, with test.html's getWinnerBadgeClass party → class rule (dpp
  // bd-green, kmt bd-blue, tpp bd-white, tsr / npp / pfp / tsu / np their own, anything else bd-other), so the colours
  // come from style.css's .win-badge.bd-* exactly as the legislative tags. The party is read back from the colour
  // (COUNCIL_CLR's normal and colour-blind tables); the text is unchanged.
  // 無黨團結聯盟 bd-npu: style.css's #C20F51 tag (user 2026-10-28: 「無黨團結聯盟的顏色…用#C20F51…tag…要有顏色」)
  var BADGE_CLS = { dpp: 'bd-green', kmt: 'bd-blue', tpp: 'bd-white', tsr: 'bd-tsr', npp: 'bd-npp', pfp: 'bd-pfp', tsu: 'bd-tsu', np: 'bd-np', npsu: 'bd-npu' };
  function unifyBadges(win) {
    // one 無黨團結聯盟 colour: the engine's 原住民 map paints 高金素梅 #aa22aa (indCandColor), everything else #C20F51
    if (typeof win.indCandColor === 'function' && !win.indCandColor.v2) {
      var oi = win.indCandColor;
      var ni = function (name, party) { return (party === '無黨團結聯盟' || String(name).indexOf('高金素梅') >= 0) ? '#C20F51' : oi.apply(this, arguments); };
      ni.v2 = true; win.indCandColor = ni;
    }
    if (typeof win._glassBadge !== 'function' || win._glassBadge.v2) return;
    var inv = {};
    ['_COUNCIL_CLR_NORMAL', '_COUNCIL_CLR_CB'].forEach(function (n) {
      var m = G(win, n) || {};
      Object.keys(m).forEach(function (k) { var c = String(m[k] || '').toLowerCase(); if (!(c in inv)) inv[c] = k; });
    });
    var f = function (color, text) {
      var k = inv[String(color || '').toLowerCase()];
      return '<span class="win-badge ' + (BADGE_CLS[k] || 'bd-other') + '">' + text + '</span>';
    };
    f.v2 = true;
    win._glassBadge = f;
  }

  // ── 2016 立委 districts rebuilt from the village map (user 2026-10-28: 「2016區域立委的地圖跟灰色遮罩有不重合的地方」).
  // test.html's ED_GJ_2016 (rebuild_ed_gj_2016.py: a Shapely union saved as plain coordinates) has its own coastline
  // and outer edges, so the county mask (#g-county-dim, cut from CD) missed slivers of it: 36 of 3,070 sample points
  // vs 1 of 3,037 for 2024. Here each district is re-made with topojson.merge from the engine's own village topology
  // (VD), the same arcs the other layers use:
  //  - village → 2016 district from VC_2016's candidates (each district had its own; 7,593 villages, none ambiguous);
  //  - villages with no 2016 record (154: split or created later, or no voters) take the district most of their
  //    neighbouring villages have (topojson.neighbors), then — islands with no neighbour — their township's;
  //  - the merge leaves holes where VD has gaps (106, none containing a village); the 2024 districts have none, so a
  //    hole is dropped when it is one of VD's own gaps (isGap; a real enclave stays).
  // Done once, lazily, the first time the engine asks getEDGJ() for the 2016 set; features are rewritten in place.
  function fixEd2016(win) {
    try { fixCounties(win); } catch (e) { if (win.console) win.console.warn('[V2] county hole fix skipped:', e); }
    fixTownships(win);   // townships first: TC_GJ now; TC_GJ_2016 on first use
    if (typeof win.getEDGJ !== 'function' || win.getEDGJ.v2Ed2016) return;
    var orig = win.getEDGJ;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { var gj = G(win, "typeof ED_GJ_2016 !== 'undefined' ? ED_GJ_2016 : null"); if (r === gj && gj && !gj.v2Fixed) rebuild2016(win, gj); }
      catch (e) { if (win.console) win.console.warn('[V2] 2016 district rebuild skipped:', e); }
      return r;
    };
    wrapped.v2Ed2016 = true;
    win.getEDGJ = wrapped;
  }
  // ── shared village-map helpers (one cache per iframe) ──
  function vmap(win) {
    if (win.__v2VMap) return win.__v2VMap;
    var VD = G(win, 'VD'), topo = win.topojson, d3 = win.d3;
    if (!VD || !topo || !d3) return null;
    var geoms = VD.objects.villages.geometries;
    var m = { VD: VD, topo: topo, d3: d3, geoms: geoms, nb: null, cents: null };
    m.neighbors = function () { return m.nb || (m.nb = topo.neighbors(geoms)); };
    m.index = new Map(geoms.map(function (g, i) { return [g, i]; }));
    var tcIdx = null;
    m.byTc = function () {
      if (tcIdx) return tcIdx;
      tcIdx = {};
      geoms.forEach(function (g, i) { var tc = g.properties.vc.slice(0, 8); (tcIdx[tc] = tcIdx[tc] || []).push(i); });
      return tcIdx;
    };
    var vcIdx = null;
    m.byVc = function () { if (!vcIdx) { vcIdx = {}; geoms.forEach(function (g, i) { vcIdx[g.properties.vc] = i; }); } return vcIdx; };
    m.gapCache = {};
    // planar: the topology is already projected (x ≈ 350, y ≈ 52), so d3.geoCentroid (spherical) would be meaningless
    var planar = d3.geoPath(null);
    m.centroids = function () { return m.cents || (m.cents = geoms.map(function (g) { return planar.centroid(topo.feature(VD, g)); })); };
    win.__v2VMap = m;
    return m;
  }
  // fill the villages left null: the value most of their neighbours have, then their township's
  function fillByNeighbours(m, arr) {
    var nb = m.neighbors();
    for (var pass = 0; pass < 20; pass++) {
      var upd = [];
      arr.forEach(function (e, i) {
        if (e) return;
        var cnt = {}, best = null;
        nb[i].forEach(function (j) { var x = arr[j]; if (x) { cnt[x] = (cnt[x] || 0) + 1; if (!best || cnt[x] > cnt[best]) best = x; } });
        if (best) upd.push([i, best]);
      });
      if (!upd.length) break;
      upd.forEach(function (u) { arr[u[0]] = u[1]; });
    }
    var tcV = {};
    arr.forEach(function (e, i) { if (e) { var tc = m.geoms[i].properties.vc.slice(0, 8); (tcV[tc] = tcV[tc] || {})[e] = ((tcV[tc] || {})[e] || 0) + 1; } });
    arr.forEach(function (e, i) {
      if (e) return;
      var t = tcV[m.geoms[i].properties.vc.slice(0, 8)];
      if (t) arr[i] = Object.keys(t).sort(function (a, b) { return t[b] - t[a]; })[0];
    });
    return arr;
  }
  // topojson.merge of some villages, minus its holes that are gaps in VD (isGap)
  function mergeVillages(m, list) {
    var g = m.topo.merge(m.VD, list);
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (poly) {
      for (var k = poly.length - 1; k >= 1; k--) if (isGap(m, poly[k])) poly.splice(k, 1);
    });
    return g;
  }
  // VD's own gaps: the holes of the merge of every village (land no village covers). A hole of any other merge is a
  // gap only if it is one of these — a village centroid test is not enough (香山區虎山里 wraps around the 新竹 air
  // base, so its centroid lies inside that gap).
  function vdGaps(m) {
    if (m.gaps) return m.gaps;
    var all = m.topo.merge(m.VD, m.geoms), planar = m.d3.geoPath(null), out = [];
    (all.type === 'Polygon' ? [all.coordinates] : all.coordinates).forEach(function (poly) {
      poly.slice(1).forEach(function (ring) { out.push({ b: bbox(ring), a: Math.abs(planar.area({ type: 'Polygon', coordinates: [ring] })) }); });
    });
    return (m.gaps = out);
  }
  // where a label fits inside a polygon (screen units): the widest horizontal run in its middle band that is also
  // clear a little above and below (the text's own height)
  function labelSpot(pathFn, geom, text) {
    var pr = pathFn.projection && pathFn.projection(), ring = geom.coordinates[0].map(function (q) { return pr ? pr(q) : q; });
    var b = bbox(ring), h = b[3] - b[1], d = h * 0.09, best = null;
    var runs = function (y) {
      var xs = [];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[j], c = ring[i];
        if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      var out = []; for (var k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
      return out;
    };
    var at = function (rs, x) { for (var k = 0; k < rs.length; k++) if (rs[k][0] <= x && x <= rs[k][1]) return rs[k]; return null; };
    for (var f = 0.25; f <= 0.751; f += 0.025) {
      var y = b[1] + h * f, up = runs(y - d), dn = runs(y + d);
      runs(y).forEach(function (r) {
        var mid = (r[0] + r[1]) / 2, u = at(up, mid), w = at(dn, mid); if (!u || !w) return;
        var lo = Math.max(r[0], u[0], w[0]), hi = Math.min(r[1], u[1], w[1]), len = hi - lo;
        var score = len * (1 - 0.5 * Math.abs(f - 0.5));
        if (len > 0 && (!best || score > best.score)) best = { score: score, len: len, x: (lo + hi) / 2, y: y };
      });
    }
    if (!best) return null;
    return { x: best.x, y: best.y, size: Math.min(best.len * 0.85 / text.length, d * 2) };
  }
  // VD gaps that are air bases (no village, so no voters): told apart by the village nearest the gap's middle.
  // The other three large gaps (三重/蘆洲/大同, 中和/永和/文山, 淡水/八里/關渡) look like river channels and keep
  // the neighbours' colour.
  var AIR_BASES = { '66000120029': '空軍基地', '10018020038': '空軍基地', '64000190024': '空軍基地' };   // 清泉崗 / 新竹 / 岡山 (user: 「就直接寫空軍基地就好了」)
  function airBase(m, gp) {
    if (gp.base !== undefined) return gp.base;
    gp.base = null;
    var cents = m.centroids(), best = -1, bd = Infinity;
    cents.forEach(function (c, i) { var d = (c[0] - gp.mid[0]) * (c[0] - gp.mid[0]) + (c[1] - gp.mid[1]) * (c[1] - gp.mid[1]); if (d < bd) { bd = d; best = i; } });
    var name = best >= 0 && AIR_BASES[m.geoms[best].properties.vc];
    if (name && Math.abs(m.d3.geoPath(null).area(gp.geom)) > 1) gp.base = name;
    return gp.base;
  }
  // same area (1 %) and overlapping boxes (≥ 80 % of the smaller): CD's copy of a gap differs from VD's by a stray
  // vertex or two (臺中's 清泉崗 hole is 0.5 wider in CD), so exact boxes don't match
  function isGap(m, ring) {
    var b = bbox(ring), a = null;
    // slivers between counties (area ≈ 0, no village in them): the white outline drew them as white specks
    var tiny = Math.abs(m.d3.geoPath(null).area({ type: 'Polygon', coordinates: [ring] }));
    if (tiny < 0.01 && !m.centroids().some(function (c) { return c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && inRing(c, ring); })) return true;
    return vdGaps(m).some(function (gp) {
      var ix = Math.min(gp.b[2], b[2]) - Math.max(gp.b[0], b[0]), iy = Math.min(gp.b[3], b[3]) - Math.max(gp.b[1], b[1]);
      if (ix <= 0 || iy <= 0) return false;
      var sm = Math.min((gp.b[2] - gp.b[0]) * (gp.b[3] - gp.b[1]), (b[2] - b[0]) * (b[3] - b[1]));
      if (ix * iy < 0.8 * sm) return false;
      if (a === null) a = Math.abs(m.d3.geoPath(null).area({ type: 'Polygon', coordinates: [ring] }));
      return Math.abs(gp.a - a) <= 0.01 * Math.max(gp.a, 1e-9);
    });
  }
  // holes of the merge of some villages that are gaps in VD, not enclaves (cached per view)
  function gapRings(m, view) {
    var key = view.length + ':' + view[0] + ':' + view[view.length - 1] + ':' + view.reduce(function (a, i) { return (a * 31 + i) % 1000000007; }, 7);
    if (m.gapCache[key]) return m.gapCache[key];
    var merged = m.topo.merge(m.VD, view.map(function (i) { return m.geoms[i]; })), out = [];
    (merged.type === 'Polygon' ? [merged.coordinates] : merged.coordinates).forEach(function (poly) {
      poly.slice(1).forEach(function (ring) {
        if (!isGap(m, ring)) return;   // an enclave
        var b = bbox(ring);
        out.push({ geom: { type: 'Polygon', coordinates: [ring.slice().reverse()] }, mid: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] });
      });
    });
    var ks = Object.keys(m.gapCache); if (ks.length > 40) delete m.gapCache[ks[0]];
    return (m.gapCache[key] = out);
  }
  // county map (CD): drop its holes that hold no village — 新竹市 and 臺中市 each had one (the air bases, which no
  // village covers), so every county-level map showed a black hole there; 臺北市 / 嘉義市 (real enclaves) stay.
  // Done once on the topology itself, so every later topojson.feature / merge / mesh of CD gets the solid county.
  function fixCounties(win) {
    var CD = G(win, 'CD'), m = vmap(win);
    if (!CD || CD.v2Holes || !m) return;
    CD.v2Holes = true;
    CD.objects.counties.geometries.forEach(function (g) {
      var f = m.topo.feature(CD, g), geo = f.geometry; if (!geo) return;
      var polysA = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : null;
      var polysC = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
      if (!polysA || polysA.length !== polysC.length) return;
      polysC.forEach(function (poly, pi) {
        for (var k = poly.length - 1; k >= 1; k--) {
          if (isGap(m, poly[k])) polysA[pi].splice(k, 1);
        }
      });
    });
  }
  // a VD-merged geometry minus its holes that hold no village (for V2 modules' own township shapes)
  function solid(win, geom) {
    var m = vmap(win); if (!m || !geom) return geom;
    (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []).forEach(function (poly) {
      for (var k = poly.length - 1; k >= 1; k--) if (isGap(m, poly[k])) poly.splice(k, 1);
    });
    return geom;
  }
  function inRing(pt, ring) {
    var c = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function bbox(ring) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    ring.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; });
    return b;
  }
  // 2016 立委 district of every village (index-aligned with VD's villages), cached
  var SPLIT_2016 = { '63000010': 1, '63000050': 1, '63000110': 1, '64000050': 1, '64000090': 1, '65000010': 1, '65000020': 1,
                     '65000030': 1, '65000050': 1, '66000280': 1, '68000010': 1, '68000020': 1 };   // CEC 2016's 12 split townships
  function villageEd2016(win) {
    if (win.__v2VcEd2016) return win.__v2VcEd2016;
    var m = vmap(win), ED16 = G(win, 'ED_2016'), VC16 = G(win, 'VC_2016');
    if (!m || !ED16 || !VC16) return null;
    var byCand = {};
    Object.keys(ED16).forEach(function (ed) { (ED16[ed].cands || []).forEach(function (c) { (byCand[c.n] = byCand[c.n] || {})[ed] = 1; }); });
    var ed = m.geoms.map(function (g) {
      var r = VC16[g.properties.vc]; if (!r) return null;
      var cnt = {}, best = null;
      r.cands.forEach(function (c) { Object.keys(byCand[c.n] || {}).forEach(function (e) { cnt[e] = (cnt[e] || 0) + 1; if (!best || cnt[e] > cnt[best]) best = e; }); });
      return best;
    });
    // a township CEC did not split goes wholly to its majority district (VC_2016 has 3 stray villages: 善化, 仁德, 中西),
    var tcV = {};
    ed.forEach(function (e, i) { if (e) { var tc = m.geoms[i].properties.vc.slice(0, 8); (tcV[tc] = tcV[tc] || {})[e] = ((tcV[tc] || {})[e] || 0) + 1; } });
    // …including its villages with no 2016 record (官田 has 3): only the 12 split townships use the neighbour rule
    ed = ed.map(function (e, i) {
      var tc = m.geoms[i].properties.vc.slice(0, 8), t = tcV[tc];
      if (SPLIT_2016[tc] || !t) return e;
      return Object.keys(t).sort(function (a, b) { return t[b] - t[a]; })[0];
    });
    return (win.__v2VcEd2016 = fillByNeighbours(m, ed));
  }
  function rebuild2016(win, gj) {
    gj.v2Fixed = true;
    var m = vmap(win), ed = villageEd2016(win);
    if (!m || !ed) return;
    var groups = {};
    ed.forEach(function (e, i) { if (e) (groups[e] = groups[e] || []).push(m.geoms[i]); });
    gj.features.forEach(function (f) { var gs = groups[f.properties.ed]; if (gs) f.geometry = mergeVillages(m, gs); });
  }
  // ── township shapes rebuilt from the village map (user 2026-10-28: 「2016的鄉鎮市區層的白色匡線跟地圖都是有明顯空格」
  // 「村里層也有黑色邊界粗線跟地圖沒重合的問題（彰化第一區）」). Audit: the township layer TC_GJ (and TC_GJ_2016) has its
  // own, larger coastline — 臺南's townships sum to +0.4 % of the county, 北門區 +8.6 % of its villages — while the
  // village map VD matches the county map CD to 0.0001 %. So townships stuck out past the district / county outline and
  // past their own villages. Each township piece becomes the merge of its villages; a township split between districts
  // has one piece per district, built from that district's villages (2024: VC_ED's ed; 2016: villageEd2016).
  function inGeom(pt, geom) {
    return (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).some(function (poly) {
      return inRing(pt, poly[0]) && !poly.slice(1).some(function (h) { return inRing(pt, h); });
    });
  }
  // village → district from district shapes (planar centroid in shape; the rest by neighbours) — for 2024, whose
  // VC_ED district names disagree with the engine's own shapes in the areas redrawn in 2020 (屏東 / 臺南 / 高雄)
  function villageEdFromShapes(win, fc, tcPieces) {
    var m = vmap(win), cents = m.centroids();
    var shapes = fc.features.map(function (f) { return { ed: f.properties.ed, g: f.geometry, b: bboxGeom(f.geometry) }; });
    var ed = cents.map(function (c) {
      for (var k = 0; k < shapes.length; k++) {
        var s = shapes[k];
        if (c[0] >= s.b[0] && c[0] <= s.b[2] && c[1] >= s.b[1] && c[1] <= s.b[3] && inGeom(c, s.g)) return s.ed;
      }
      return null;
    });
    // a township the engine keeps in one piece stays whole (centroids near an imprecise edge must not split it)
    var tcV = {};
    ed.forEach(function (e, i) { if (e) { var tc = m.geoms[i].properties.vc.slice(0, 8); (tcV[tc] = tcV[tc] || {})[e] = ((tcV[tc] || {})[e] || 0) + 1; } });
    ed = ed.map(function (e, i) {
      var tc = m.geoms[i].properties.vc.slice(0, 8), t = tcV[tc];
      if (!t || (tcPieces[tc] || 0) > 1) return e;
      return Object.keys(t).sort(function (a, b) { return t[b] - t[a]; })[0];
    });
    return fillByNeighbours(m, ed);
  }
  function bboxGeom(g) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (p) {
      var r = bbox(p[0]); b = [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])];
    });
    return b;
  }
  // Township pieces from villages. Whole townships: all their villages. Townships split between districts: each piece
  // takes the villages the year's village → district map (edArr) gives its district; a district the map has but no
  // piece for is added (2016: CEC split 大里 but the engine has one piece, so 東湖里 / 西湖里 of 臺中2 had no block).
  function rebuildTownships(win, fc, edArr) {
    if (!fc || fc.v2Fixed) return;
    fc.v2Fixed = true;
    var m = vmap(win); if (!m) return;
    var byTc = m.byTc(), pieces = {};
    fc.features.forEach(function (f) { (pieces[f.properties.tc] = pieces[f.properties.tc] || []).push(f); });
    Object.keys(pieces).forEach(function (tc) {
      var ps = pieces[tc], idx = byTc[tc]; if (!idx) return;
      var eds = {};
      if (edArr) idx.forEach(function (i) { if (edArr[i]) eds[edArr[i]] = (eds[edArr[i]] || 0) + 1; });
      var split = Object.keys(eds).length > 1 && (ps.length > 1 || (SPLIT_2016[tc] && edArr === win.__v2VcEd2016));
      if (!split) { ps.forEach(function (f, k) { f.__v2Vill = k === 0 ? idx : []; }); if (ps.length > 1) ps.slice(1).forEach(function (f) { f.__v2Vill = []; }); return; }
      Object.keys(eds).forEach(function (e) {
        if (ps.some(function (f) { return f.properties.ed === e; })) return;
        var f0 = ps[0], nf = { type: 'Feature', properties: {}, geometry: null };
        Object.keys(f0.properties).forEach(function (k) { nf.properties[k] = f0.properties[k]; });
        nf.properties.ed = e;
        fc.features.push(nf); ps.push(nf);
      });
      ps.forEach(function (f) { f.__v2Vill = idx.filter(function (i) { return edArr[i] === f.properties.ed; }); });
    });
    fc.features.forEach(function (f) {
      if (f.__v2Vill && f.__v2Vill.length) f.geometry = mergeVillages(m, f.__v2Vill.map(function (i) { return m.geoms[i]; }));
    });
  }
  // 2024 districts from villages too (same reason as 2016), and their village map for the township pieces
  function rebuildEd2024(win) {
    var gj = G(win, "typeof ED_GJ !== 'undefined' ? ED_GJ : null"), m = vmap(win);
    if (!gj || gj.v2Fixed || !m) return null;
    gj.v2Fixed = true;
    var tcg = G(win, "typeof TC_GJ !== 'undefined' ? TC_GJ : null"), tcPieces = {};
    if (tcg) tcg.features.forEach(function (f) { tcPieces[f.properties.tc] = (tcPieces[f.properties.tc] || 0) + 1; });
    var ed = win.__v2VcEd2024 = villageEdFromShapes(win, gj, tcPieces), groups = {};
    ed.forEach(function (e, i) { if (e) (groups[e] = groups[e] || []).push(m.geoms[i]); });
    gj.features.forEach(function (f) { var gs = groups[f.properties.ed]; if (gs) f.geometry = mergeVillages(m, gs); });
    return ed;
  }
  function fixTownships(win) {
    if (typeof win.getTCGJ !== 'function' || win.getTCGJ.v2Tc) return;
    try { var ed24 = rebuildEd2024(win); rebuildTownships(win, G(win, "typeof TC_GJ !== 'undefined' ? TC_GJ : null"), ed24); }
    catch (e) { if (win.console) win.console.warn('[V2] township rebuild skipped:', e); }
    var orig = win.getTCGJ;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { var t16 = G(win, "typeof TC_GJ_2016 !== 'undefined' ? TC_GJ_2016 : null"); if (r === t16) rebuildTownships(win, t16, villageEd2016(win)); }
      catch (e) { if (win.console) win.console.warn('[V2] 2016 township rebuild skipped:', e); }
      return r;
    };
    wrapped.v2Tc = true;
    win.getTCGJ = wrapped;
  }
  window.V2TcBorder = { lines: lines, solid: solid, hover: hover, attach: attach, unifyBadges: unifyBadges, fixEd2016: fixEd2016, fixTownships: fixTownships, TC: TC, OUTLINE: OUTLINE };
})();
