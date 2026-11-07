/* Election night (v2/live.html) → 縣市議員 → 平地／山地原住民: drawn solid, as History's (history-councilind.js solidify)
 * (user 2026-11-07: 「歷史模式市議員是實心的，山地平地原住民也是實心的，請改成都一樣（改原住民的）」).
 *
 * The engine's live branch paints every indigenous district the same pale white (_indDistColor → _LIVE26_NO_DATA_COLOR
 * at 0.33) over the council map. Inside the election-night iframe (V1 untouched), with an indigenous toggle on at 全台:
 *  - the council blocks underneath go black and stop taking the mouse, the council lines hidden (History's solidify);
 *  - each district shape solid (fill-opacity 1) in the colour History's engine gives it — the leading party by summed
 *    votes, its margin over the next party (_councilPartyColor, margin clamped 0.05–0.5, as _indDistColor) — from the
 *    live votes (the source with the most votes counted; party from the source's own field, else the 2022 roster);
 *    a shape standing for a whole county with several districts sums them (as _indCountyColor); no numbers yet: white;
 *  - the county lines as History's (rgba(255,255,255,.12), 0.9), the shared hover outline (V2TcBorder.hover);
 *  - repainted after every live poll (_applyLiveTrack26CouncilColors) and engine redraw; toggled off → the council map back.
 * V2LiveCouncilInd.attach(win) once per engine.
 */
(function () {
  var BLACK = '#0a0d16';
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function live(win) { return !!G(win, "typeof isLiveTrack26 !== 'undefined' && isLiveTrack26"); }
  function national(win) { return G(win, 'level') === 'ed' && G(win, 'curED') == null; }
  function distMap(win) { return (G(win, 'councilIndMode') === 'plains' ? G(win, 'COUNCIL_IND_P_DISTS') : G(win, 'COUNCIL_IND_M_DISTS')) || {}; }

  function entriesOf(win, d) {   // the district entries a shape stands for
    var map = distMap(win);
    if (d.properties && d.properties.ed) {
      var p = d.properties.ed.split('_');
      return (map[p[0]] || []).filter(function (e) { return e.dist === p[1]; }).map(function (e) { return [p[0], e]; });
    }
    var cc = win._normCCKey ? win._normCCKey(d.properties.cc) : d.properties.cc;
    return (map[cc] || []).map(function (e) { return [cc, e]; });
  }
  function colourOf(win, list) {
    var LED = G(win, 'LIVE_TRACK_ED') || {}, pv = {}, tot = 0, any = false;
    list.forEach(function (x) {
      var cc = x[0], de = x[1], e = LED[cc + '_' + de.dist], best = null, bv = 0, ros = {};
      (de.cands || []).forEach(function (y) { ros[y.n] = y.p; });
      Object.keys((e && e.sources) || {}).forEach(function (k) {
        var s = e.sources[k], v = (s.cands || []).reduce(function (a, c) { return a + (c.v || 0); }, 0);
        if (v > bv) { bv = v; best = s; }
      });
      if (!best) return;
      any = true;
      best.cands.forEach(function (c) { var p = c.p || ros[c.n] || 'other'; pv[p] = (pv[p] || 0) + (c.v || 0); tot += c.v || 0; });
    });
    if (!any || !tot) return null;
    var pairs = Object.keys(pv).map(function (p) { return [p, pv[p]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var margin = (pairs[0][1] - (pairs[1] ? pairs[1][1] : 0)) / tot;
    return win._councilPartyColor(pairs[0][0], Math.max(0.05, Math.min(0.5, margin)));
  }

  function solidify(win) {
    if (!live(win) || win._live2026CurrentSub !== 'council' || !G(win, 'councilIndMode') || !national(win)) return;
    var gBase = G(win, 'gBase'), gInd = G(win, 'gInd'), pathFn = G(win, 'pathFn'), NODATA = G(win, '_LIVE26_NO_DATA_COLOR') || '#f5f5f5';
    if (!gBase || !gInd) return;
    gBase.selectAll('.ft-ed').attr('fill', BLACK).attr('stroke', BLACK).style('pointer-events', 'none');
    gBase.selectAll('.ft-council-border').style('display', 'none');
    var hov = window.V2TcBorder ? window.V2TcBorder.hover(win, gInd.node(), 'v2-blk-hov') : { show: function () {}, hide: function () {} };
    gInd.selectAll('.ft-ind-active').each(function (d) {
      var col = colourOf(win, entriesOf(win, d)) || NODATA, el = win.d3.select(this);
      // stroke in its own fill colour: the district shapes do not quite meet (thin black slivers along 臺中／花蓮, 高雄／屏東 …,
      // user 2026-11-07: 「原住民地圖有大空隙」) — a 1.4 px edge of the same colour closes them
      el.attr('fill', col).attr('fill-opacity', 1).attr('stroke', col).attr('stroke-width', 1.4).attr('vector-effect', 'non-scaling-stroke')
        // after the engine's own hover handlers (they put its pale fill back)
        .on('mouseover.v2lci', function () { el.attr('fill', col).attr('fill-opacity', 1); hov.show(this.getAttribute('d')); })
        .on('mouseleave.v2lci', function () { el.attr('fill', col).attr('fill-opacity', 1); hov.hide(); });
    });
    var CD = G(win, 'CD');
    if (CD) gInd.selectAll('.v2-lci-ccb').data([win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; })]).join('path')
      .attr('class', 'v2-lci-ccb').attr('d', pathFn).attr('fill', 'none').attr('stroke', 'rgba(255,255,255,.12)').attr('stroke-width', 0.9)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none').raise();
    if (hov.raise) hov.raise();
  }

  function attach(win) {
    if (!win || win.__v2LiveCi) return;
    win.__v2LiveCi = true;
    function wrap(name, after) {
      var o = win[name]; if (typeof o !== 'function') return;
      win[name] = function () { var r = o.apply(this, arguments); after.apply(this, arguments); return r; };
    }
    wrap('_addCouncilIndLayer', function () { solidify(win); });
    wrap('_applyLiveTrack26CouncilColors', function () { solidify(win); });   // every live poll
    wrap('goED', function () { setTimeout(function () { solidify(win); }, 0); });
    wrap('setCouncilIndMode', function () {
      // off again: the council map back in its own colours (solidify blacked it)
      if (live(win) && !G(win, 'councilIndMode') && national(win)) win.goED();
    });
  }
  window.V2LiveCouncilInd = { attach: attach };
})();
