/* V2 History: population glow hidden in every election (user 2026-10-27: 「把人口光暈層在所有選舉都關掉都隱藏（只隱藏先保留不刪）」,
 * scope 「歷屆頁（地方和全國）」). Hidden only — the engines' glow code is untouched and comes back by not attaching this.
 *
 * Audit (2026-10-27): on the national views the election colour lives on the glow layer (#g-glow: .glow-core per
 * township, blurred, opacity by voter count; .ft-popglow) while the interactive blocks underneath are a colourless
 * placeholder (#16161c) or unfilled (fill none) — 立委區域 .ft-ed (73 districts), 不分區 .ft-plcounty (22), 縣市長
 * .ft-mayor-fill (22), 縣市議員 .ft-ed (160 council districts). Each block holds exactly one glow colour. So the colour
 * moves onto the block itself and the glow layer is hidden: the yellow hover outline is the block's own stroke, on the
 * same layer as its colour (user: 「滑鼠黃色匡互動應該是跟整個區塊同一層的不是上面」). The first version made the glow
 * opaque and moved it under the base; that covered or misplaced the outline and blacked out 不分區 — replaced.
 *  - #g-glow and .ft-popglow are hidden (CSS);
 *  - a block whose own fill is the placeholder (#16161c) or none gets the colour as an inline style fill (the engine's
 *    attribute stays untouched); a block the engine colours itself (2016 districts, heat maps, swing masks) is left
 *    alone, and a block whose attribute stops being the placeholder drops the V2 style again;
 *  - colours come from the glow paths of the block's townships (same key the engine coloured them by); 縣市議員 blocks
 *    use the engine's own councilDistColor() — the function the glow is painted with — since 新竹市's 4 districts
 *    split townships by village; 立委 district blocks likewise use edColor() (2016 districts are named differently);
 *  - re-applied whenever the engine repaints (#g-glow / #g-base mutations: year switch, colour-blind mode, navigation);
 *  - the map legend's 「亮度 = 投票人數多寡」 title is hidden (its 五五波 → 鐵票區 bar is the margin shade, still true), and
 *    the left legend's 「，亮度=鄉鎮投票人數多寡」 clause is dropped.
 *  - 縣市長 only (its blocks are fill none in the engine, the others an opaque placeholder): with the colour on the
 *    blocks, the county white lines (.ft-mayor-border) and the 2026 trust dashes (.ft-mayor-trust-border), drawn
 *    before the blocks, went under them (user 2026-10-29: 「trust level 的線被蓋住了」「原本的縣市系的白線也沒了」, then
 *    「歷屆頁縣市長的縣市白線…要」) — both (pointer-events none) are moved after the last block; no block moves.
 *    The yellow hover outline there = one overlay path last in the layer (V2TcBorder.hover, as 2028 / 立委 08·12), so it
 *    is whole on every side and above the lines; the engine's own stroke on the block stays underneath.
 *  - 2026 即時開票 (v2/live.html, user 2026-10-29: 「把開票的系統把人口光暈隱藏」): same layer, live colours — mayor blocks take
 *    the glow's live colour (_liveTrack26Color), council blocks the glow's flat white, never councilDistColor's 2022 colours.
 * V2NoGlow.attach(win).
 */
(function () {
  var CSS = [
    '#g-glow { display: none !important; }',
    '.ft-popglow { display: none !important; }'
  ].join('\n');
  var PLACEHOLDER = { '#16161c': 1, 'none': 1 };
  var TITLE = /^(亮度 = 投票人數多寡|Brightness = voter density)$/;
  var CLAUSE = [/，亮度=鄉鎮投票人數多寡/g, /, brightness = township voter turnout/g];

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }

  // block selector → [key of a block datum, key of a glow datum (township)] — the engine's own keys
  function rules(win) {
    var cityKey = typeof win._tcCityKey === 'function' ? win._tcCityKey : function (tc) { return tc.slice(0, 5); };
    var normCC = typeof win._normCCKey === 'function' ? win._normCCKey : function (cc) { return cc; };
    return [
      ['.ft-mayor-fill', function (d) { return normCC(d.properties.cc); }, function (d) { return cityKey(d.properties.tc); }],
      ['.ft-plcounty', function (d) { return d.properties.cc; }, function (d) { return d.properties.tc.slice(0, 5); }],
      ['.ft-ed', function (d) { return d.properties.ed; }, function (d) { return d.properties.ed; }]
    ];
  }

  function hexRgb(h) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    return m ? 'rgb(' + parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16) + ')' : h;
  }
  function paint(win) {
    var d3 = win.d3, base = win.document.getElementById('g-base');
    if (!d3 || !base) return;
    var glowShown = win.document.querySelectorAll('#g-glow .glow-core').length > 0;
    // 即時開票 (live2026.html): councilDistColor() still answers 2022's party colours there — the engine paints its
    // council glow flat white (_LIVE26_NO_DATA_COLOR, no SNTV "leader"), so the blocks take the glow's colour instead
    var live = !!G(win, "typeof isLiveTrack26 !== 'undefined' && isLiveTrack26");
    var councilMode = G(win, "typeof isCouncilMode !== 'undefined' && isCouncilMode");
    var council = !live && councilMode && typeof win.councilDistColor === 'function';
    // (the glow is keyed by legislative district, the council blocks by council district — so the live white is asked of
    // the engine directly)
    var white = live ? G(win, "typeof _LIVE26_NO_DATA_COLOR !== 'undefined' && _LIVE26_NO_DATA_COLOR") : null;
    var liveWhite = councilMode ? white : null;
    var rgbWhite = white ? hexRgb(white) : null;
    // the legislative engine (test.html: no setMayorMode) paints its glow with edColor(district) — 2016 maps townships
    // to 2016 district names (TC_TO_ED_2016), so the district block asks edColor directly
    var legis = typeof win.setMayorMode !== 'function' && typeof win.edColor === 'function';
    rules(win).forEach(function (r) {
      var sel = d3.select(base).selectAll(r[0]);
      if (sel.empty()) return;
      var colour = {};
      if (glowShown) d3.select(win.document.getElementById('g-glow')).selectAll('.glow-core').each(function (gd) {
        if (!gd || !gd.properties) return;
        var k = r[2](gd);
        if (k != null && colour[k] == null) colour[k] = this.getAttribute('fill');
      });
      sel.each(function (bd) {
        var own = (this.getAttribute('fill') || '').toLowerCase();
        var c = null, op = '1';
        if (glowShown && PLACEHOLDER[own] && bd && bd.properties) {
          // a page may colour these blocks its own way (2026 縣市長預測: by rating, ratings26.js)
          if (typeof win.__v2FillOverride === 'function') { try { c = win.__v2FillOverride(r[0], bd); } catch (e) { c = null; } }
          if (c) { /* page override */ }
          else if (r[0] === '.ft-ed' && liveWhite) c = liveWhite;
          else if (r[0] === '.ft-ed' && council) { try { c = win.councilDistColor(bd.properties.ed); } catch (e) { c = null; } }
          else if (r[0] === '.ft-ed' && legis) { try { c = win.edColor(bd.properties.ed); } catch (e) { c = null; } }
          if (!c) c = colour[r[1](bd)] || null;
          // 「no live data yet」 white (every council district; a county before its count starts): a little see-through,
          // since the county / council white lines over it are white too and must still show
          if (c && white && (c === white || c === rgbWhite)) op = '0.78';
        }
        if (c) { if (this.style.fill !== c || this.style.fillOpacity !== op) { this.style.fill = c; this.style.fillOpacity = op; } }
        else if (this.style.fill) { this.style.fill = ''; this.style.fillOpacity = ''; }
      });
    });
  }

  function lift(win) {
    var gb = win.document.getElementById('g-base'); if (!gb) return;
    var fills = gb.querySelectorAll(':scope > .ft-mayor-fill'), last = fills[fills.length - 1];
    if (!last || !last.style.fill) return;   // blocks not coloured by V2 (glow shown / other mode): leave the order
    var lines = gb.querySelectorAll(':scope > .ft-mayor-border, :scope > .ft-mayor-trust-border');
    if (!lines.length || [].every.call(lines, function (n) { return last.compareDocumentPosition(n) & 4; })) return;
    // county white lines first, then the trust dashes over them (the engine's own order)
    [].forEach.call(gb.querySelectorAll(':scope > .ft-mayor-border'), function (n) { gb.appendChild(n); });
    [].forEach.call(gb.querySelectorAll(':scope > .ft-mayor-trust-border'), function (n) { gb.appendChild(n); });
  }
  function mayorHover(win) {
    var gb = win.document.getElementById('g-base');
    if (!gb || gb.__v2MayorHov || !window.V2TcBorder) return;
    gb.__v2MayorHov = true;
    var hov = window.V2TcBorder.hover(win, gb, 'v2-mayor-hov');
    gb.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('ft-mayor-fill') && t.style.fill) hov.show(t.getAttribute('d')); else hov.hide();
    });
    gb.addEventListener('mouseout', function (e) {
      var r = e.relatedTarget;
      if (!(r && r.classList && r.classList.contains('ft-mayor-fill'))) hov.hide();
    });
  }

  function tidy(doc) {
    var ml = doc.getElementById('map-legend');
    if (ml) Array.prototype.forEach.call(ml.children, function (el) {
      if (TITLE.test((el.textContent || '').trim())) el.style.display = 'none';
    });
    var leg = doc.getElementById('legend');
    if (leg) Array.prototype.forEach.call(leg.querySelectorAll('div'), function (el) {
      if (el.children.length) return;
      var t = el.textContent, u = t;
      CLAUSE.forEach(function (re) { u = u.replace(re, ''); });
      if (u !== t) el.textContent = u;
    });
  }

  function attach(win) {
    var doc = win.document;
    if (doc.getElementById('v2-noglow-style')) return;
    var st = doc.createElement('style');
    st.id = 'v2-noglow-style';
    st.textContent = CSS;
    doc.head.appendChild(st);
    if (typeof win.MutationObserver !== 'function') return;
    var queued = false;
    var run = function () { queued = false; paint(win); lift(win); };
    var schedule = function () { if (!queued) { queued = true; win.requestAnimationFrame(run); } };
    // the engine repaints glow fills / rebuilds blocks: childList + the `fill` attribute only (V2's own writes are
    // inline styles, so they never re-trigger this)
    ['g-glow', 'g-base'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) new win.MutationObserver(schedule).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['fill'] });
    });
    ['map-legend', 'legend'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) new win.MutationObserver(function () { tidy(doc); }).observe(el, { childList: true, subtree: true });
    });
    paint(win);
    lift(win);
    mayorHover(win);
    tidy(doc);
  }
  window.V2NoGlow = { attach: attach, paint: paint };
})();
