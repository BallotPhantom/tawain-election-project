/* 政黨基本盤 page: the map in the other pages' structure, plus two panel parts removed (user 2026-10-31: 「第一格把人口光暈
 * 層關掉」「套用新版地圖的結構」, and the 「政黨基本盤陣營鐵/中/淺 → 各屆總統票估算流向」 cards and the 「政黨基本盤（5屆…）
 * 顏色=13分類…僅估算，非官方數字。」 legend 「這些也都刪掉」).
 *
 * Audit (test.html, V1 untouched): the national view draws 22 county blocks (.ft-county-baselean, the interactive layer,
 * placeholder #16161c), 380 township tiles above them (.ft-baselean-glow, the county's colour at a voter-count opacity,
 * pointer-events none), a blurred copy of the tiles (#g-glow .ft-baselean-glowcore) and faint county lines
 * (.ft-baselean-border). Every tile carries its county's colour (_baseLeanCountyColor), so here:
 *  - the tiles and the glow are hidden; each county block takes its colour as an inline style fill (the engine's
 *    attribute stays), so the colour sits on the layer the pointer touches;
 *  - the county lines stay last in the layer, and the yellow hover outline is one overlay path above them
 *    (V2TcBorder.hover), whole on every side;
 *  - _base5PresCrossRefHtml (the 鐵/中/淺 → 總統票 flow cards) returns '' and #legend (the 13-category legend) is hidden.
 *  - fold(win), before the map is drawn: 台聯 / 歐巴桑聯盟 / 綠黨 go into 其他（游離） (see FOLD below).
 * Re-applied when the engine redraws the layer (year / view switches, navigation).
 *   V2BaseLeanMap.fold(win) (before setMode('baselean')); V2BaseLeanMap.attach(win)
 */
(function () {
  // #map-legend: its 亮度＝投票人數 / 五五波 → 鐵票區 key no longer describes this map (no glow; colours are categories);
  // the 政黨得票折線趨勢圖（總覽） button and its row go too (user 2026-10-31: 「也隱藏直接刪掉」)
  var CSS = '#g-glow .ft-baselean-glowcore, .ft-baselean-glow { display: none !important; } #legend, #map-legend { display: none !important; }' +
    ' div:has(> button[onclick^="_base5OpenTrendModal"]), button[onclick^="_base5OpenTrendModal"] { display: none !important; }';
  // 台聯 / 歐巴桑聯盟 / 綠黨 are not their own category any more — they fall into 其他（游離）(user 2026-10-31: 「歐巴桑綠黨
  // 全部歸類於其他」「不給獨立」「台聯也是」). The engine's 其他 = all party-list votes minus its main parties
  // (baseLean5CountyPLPct), so taking the three out of every party / camp list moves their votes there; every base-vote
  // cache is emptied so nothing computed with the old lists survives. Panel texts that list them are rewritten.
  var FOLD = ['tsu', 'spgp', 'gp'];
  var LISTS = ['BASE5_MAIN_PARTIES', 'BASE5_ONE_TIER_PARTIES', 'BASE5_EXPANDED_PARTIES', 'BASE5_CAMPS_3.third.parties',
    'BASE5_CAMPS_4.green.parties', 'BASE5_EXPANDED_CAMPS_3.third.parties'];
  var CACHES = ['_baseLeanCache', '_base5FloorCeilCache', '_base5GeoFloorCeilCache', '_base5GeoFloorCeilEligCache', '_baseLeanEdVotesCache',
    '_base5CountyPresYearCache', '_base5GeoFloorCeilCutoffCache'];
  var TEXT = [
    // the overview's title keeps only 「全台總覽」 (user 2026-10-31: 「— 政黨基本盤（5屆，2008–2024） 這些文字刪掉」)
    [' — 政黨基本盤（5屆，2008–2024）', ''], [' — Party Base (5 Cycles, 2008–2024)', ''],
    // and its pointer line goes (user 2026-10-31: 「滑鼠移到地圖上的縣市查看該縣市自己的分類 這個也刪」) — a line left empty is hidden
    ['滑鼠移到地圖上的縣市查看該縣市自己的分類', ''], ['Hover a county on the map to see its own breakdown', ''],
    // one word for the top tier: the panel's labels say 深民進黨 / 中 / 淺, the notes said 鐵 (user 2026-10-31: 「文字要更新」)
    ['鐵＝地板年原始票數', '深＝地板年原始票數'], ['沒有「中」，鐵＝地板年', '沒有「中」，深＝地板年'],
    ['民眾黨(鐵/淺)', '民眾黨(深/淺)'], ['台灣基進(鐵/淺)', '台灣基進(深/淺)'],
    // the overview's section title goes in all three views (user 2026-10-31: 「逐分類票數（全國＝22縣市分類加總）文字刪掉」)
    ['逐分類票數（全國＝22縣市分類加總）', ''], ['藍／綠／白陣營票數（全國＝22縣市分類加總）', ''], ['泛綠／泛藍／中間陣營票數（全國＝22縣市分類加總）', ''],
    ["Category vote totals (national = sum of 22 counties' own classification)", ''], ["Blue／Green／White camp totals (national = sum of 22 counties' own classification)", ''],
    ["Pan-Green／Pan-Blue／Middle camp totals (national = sum of 22 counties' own classification)", ''],
    ['民進黨+時代力量+台灣基進+台聯+歐巴桑聯盟+綠黨→泛綠', '民進黨+時代力量+台灣基進→泛綠'],
    ['親民黨/新黨票數太小', '台聯/歐巴桑聯盟/綠黨/親民黨/新黨票數太小'],
    ['+台聯/歐巴桑聯盟/綠黨(鐵)+其他(游離)→第三勢力', '+其他(游離，含台聯/歐巴桑聯盟/綠黨)→第三勢力'],
    ['台聯/歐巴桑聯盟/綠黨例外：票數太小不做五屆分析，固定只看2024單一數字，一律算「鐵」。', '台聯/歐巴桑聯盟/綠黨票數太小，併入「其他(游離)」。'],
    ['DPP + NPP + TSP + TSU + SPGP + Green Party → Pan-Green', 'DPP + NPP + TSP → Pan-Green'],
    ['PFP/New Party are too small', 'TSU/SPGP/Green Party/PFP/New Party are too small'],
    [' + TSU/SPGP/Green Party (deep) + other (floating) → Third Force', ' + other (floating, incl. TSU/SPGP/Green Party) → Third Force'],
    ['TSU/SPGP/Green Party exception: too small for a 5-cycle analysis, so only the 2024 figure is used, always counted as Deep.', 'TSU/SPGP/Green Party are too small and are folded into "other (floating)".']
  ];
  function fold(win) {
    if (win.__v2BaseLeanFold) return;
    win.__v2BaseLeanFold = true;
    LISTS.forEach(function (n) {
      var a; try { a = win.eval(n); } catch (e) { return; }
      if (!Array.isArray(a)) return;
      for (var i = a.length - 1; i >= 0; i--) if (FOLD.indexOf(a[i]) >= 0) a.splice(i, 1);
    });
    CACHES.forEach(function (n) {
      var c; try { c = win.eval(n); } catch (e) { return; }
      if (c && typeof c === 'object') Object.keys(c).forEach(function (k) { delete c[k]; });
    });
  }
  function fixText(root) {
    var tw = root.ownerDocument.createTreeWalker(root, 4), n, hit = [];
    while ((n = tw.nextNode())) if (/鐵|台聯|TSU|政黨基本盤（5屆|Party Base \(5 Cycles|滑鼠移到地圖上的縣市|Hover a county on the map to see its own|全國＝22縣市分類加總|sum of 22 counties/.test(n.nodeValue)) hit.push(n);
    hit.forEach(function (t) {
      var v = t.nodeValue;
      TEXT.forEach(function (r) { v = v.split(r[0]).join(r[1]); });
      if (v === t.nodeValue) return;
      t.nodeValue = v;
      var el = t.parentNode;
      if (!v.trim() && el && el.tagName === 'DIV' && !el.textContent.trim()) el.style.display = 'none';
    });
  }
  function attach(win) {
    var doc = win.document;
    if (win.__v2BaseLeanMap) return;
    win.__v2BaseLeanMap = true;
    if (!doc.getElementById('v2-baselean-map')) {
      var st = doc.createElement('style'); st.id = 'v2-baselean-map'; st.textContent = CSS; doc.head.appendChild(st);
    }
    if (typeof win._base5PresCrossRefHtml === 'function') win._base5PresCrossRefHtml = function () { return ''; };
    // back to 全台總覽 = the first view exactly (user 2026-10-31: 「點進縣市再回台灣…不會直接回到居中」): the engine refits
    // the 22 counties with a 15 % margin (fitFeats), a different size and place from the page's opening view; after it
    // runs, the zoom goes back to the identity transform the map opened with
    var back = win._baseLeanBackToCounties;
    if (typeof back === 'function' && !back.v2) {
      win._baseLeanBackToCounties = function () {
        var r = back.apply(this, arguments);
        try { win.eval('svg.transition().duration(380).call(zm.transform, d3.zoomIdentity)'); } catch (e) {}
        return r;
      };
      win._baseLeanBackToCounties.v2 = true;
    }
    // switching the view (13分類 / 藍綠白 / 泛綠泛藍) recolours the map where it is — same county / township / national
    // layer, same zoom (user 2026-10-31: 「在某一縣市或區域改分類不回全台，而是直接在那個位置改染色」). The engine redraws only
    // its county layer and only at level 'ed' — which a county or township drill-down still is, so it wiped those views —
    // and refreshed the overview only there. So after it: the view the reader was on is drawn again with the new colours
    // (the engine's own function for it), the zoom is put back as it was, and the overview is redrawn at every level.
    var tog = win._baseLeanToggleCampMode;
    if (typeof tog === 'function' && !tog.v2) {
      win._baseLeanToggleCampMode = function () {
        var E = function (c) { try { return win.eval(c); } catch (e) { return undefined; } };
        var lv = E('level'), county = E('_baseLeanCurCounty'), town = E('_baseLeanCurTown');
        var t = E('d3.zoomTransform(svg.node())');
        var r = tog.apply(this, arguments);
        try {
          var redraw = town ? function () { win._baseLeanGoVillage(town); }
            : county ? function () { win._baseLeanGoTown(county); }
            : lv === 'tc' ? function () { win.eval('goTCAllNational()'); }
            : lv === 'vill' ? function () { win.eval('goVillAllNational()'); }
            : null;
          if (redraw) {
            redraw();
            win.__v2ZoomBack = t;
            E('svg.interrupt(); svg.call(zm.transform, window.__v2ZoomBack)');
          }
          if (typeof win._renderBaseleanHemiRow === 'function') win._renderBaseleanHemiRow();
          paint();
        } catch (e) {}
        return r;
      };
      win._baseLeanToggleCampMode.v2 = true;
    }
    // 全台總覽 on the map's left (user 2026-10-31: 「重新設計，把全台總覽移到左邊空白處」, as on the 2026 forecast page).
    // The engine keeps the full overview (category totals, the 藍綠白 / 泛綠泛藍 / 13分類 switch, notes) in #hemi-row —
    // the top-right 「全台總覽 ▾」 fold card — and only a two-line pointer in the info panel. So #hemi-row itself moves
    // into #v2-bl-left (the engine keeps writing to it by id, the switch keeps working), the fold card is hidden, and
    // the info panel's pointer says the overview is on the left.
    var ic = doc.getElementById('ic'), main = doc.getElementById('main'), NAT = /^(全台總覽|National Overview)/;
    if (main && !doc.getElementById('v2-bl-left-css')) {
      var lc = doc.createElement('style'); lc.id = 'v2-bl-left-css';
      lc.textContent = '#v2-bl-left{position:absolute;top:64px;left:16px;bottom:16px;width:300px;overflow-y:auto;z-index:10;font-size:12px;scrollbar-width:none;word-break:break-word}' +
        '#v2-bl-left::-webkit-scrollbar{display:none}#v2-bl-left .t1{font-size:17px}' +
        '#v2-bl-left #hemi-row{display:block!important;width:auto!important;max-height:none!important;overflow:visible!important;background:none!important;border:0!important;padding:0!important;margin:0!important;box-shadow:none!important;backdrop-filter:none!important}' +
        '#v2-bl-left [style*="sticky"]{position:static!important}' +   // the switch's sticky strip covered the line above it
        '#v2-bl-switch{position:absolute;top:30px;right:12px;z-index:11;display:flex;gap:6px;align-items:center}' +
        '#v2-bl-switch button{font:inherit;font-size:11px!important;font-weight:600;padding:5px 12px!important;border-radius:8px!important;background:rgba(18,24,38,.85)!important;border:1px solid rgba(255,255,255,.18)!important;color:#e7eaf0!important}' +
        '#seat-summary-float{display:none!important}';
      doc.head.appendChild(lc);
    }
    var left = null, sw = null, noteHtml = '';
    var place = function () {
      var hr = doc.getElementById('hemi-row');
      if (!main || !hr) return;
      if (!left) { left = doc.createElement('div'); left.id = 'v2-bl-left'; main.appendChild(left); }
      if (hr.parentNode !== left) left.appendChild(hr);
      // the 簡化為藍／綠／白 · 泛綠／泛藍／中間 · 13分類 switch: top right, above the info panel, where the 全台總覽 ▾ card
      // was (user 2026-10-31: 「簡化為藍綠白的全台總覽按鈕改回到右邊資訊欄右邊上面」). The engine writes a new one into
      // #hemi-row on every switch; it is moved out each time.
      var btn = hr.querySelector('button[onclick^="_baseLeanToggleCampMode"]');
      if (!sw) {
        sw = doc.createElement('div'); sw.id = 'v2-bl-switch'; main.appendChild(sw);
        sw.innerHTML = '<span class="v2-bl-tog"></span>';
      }
      if (btn) {
        var strip = btn.parentNode, tog = sw.querySelector('.v2-bl-tog');
        tog.innerHTML = ''; tog.appendChild(btn);
        if (strip && strip !== hr && !strip.textContent.trim()) strip.remove();
      }
      fixText(hr);
      // party folds (民進黨 / 國民黨 / …) start closed on every fresh render (user 2026-10-31: 「左邊全台總覽民進黨國民黨這些分類
      // 預設是關掉」); a fold the reader opens stays open until the overview is redrawn
      [].forEach.call(hr.querySelectorAll('details'), function (dt) { if (!dt.__v2Seen) { dt.__v2Seen = true; dt.open = false; } });
      // the overview's note (how 深／中／淺 are computed, what each camp holds) moves into the bar's 「i」 (user 2026-10-31:
      // 「這個改放政黨基本盤的i按鈕」「i按鈕要用上方欄位的i」 — baselean.html passes V2BaseLeanMap.note as cfg.infoNote); each
      // view writes its own note in the same slot
      var fn = hr.querySelector('div[style*="font-size:8.5px;color:rgba(255,255,255,0.35)"]');
      if (fn && fn.textContent.trim()) { noteHtml = fn.innerHTML; win.__v2BaseLeanNote = noteHtml; fn.style.display = 'none'; }
    };
    var hint = function () {
      var T = win.T || function (z) { return z; };
      return '<div class="t1 v2-bl-hint">' + T('政黨基本盤', 'Party base votes') + '</div><div style="color:#999;font-size:11px;line-height:1.7;margin-top:6px">' +
        T('全台總覽在左邊。滑到地圖上的縣市，這裡會顯示該縣市的深／中／淺分類；點一下進入鄉鎮市區。', 'The national overview is on the left. Hover a county for its deep / mid / light breakdown here; click to open its townships.') + '</div>';
    };
    var busy = false;
    var tidyIc = function () {
      if (busy || !ic) return;
      var t1 = ic.querySelector('.t1');
      if (!t1 || !NAT.test(t1.textContent.trim())) return;
      busy = true; try { ic.innerHTML = hint(); } finally { busy = false; }
    };
    place();
    var hr0 = doc.getElementById('hemi-row');
    if (hr0) new win.MutationObserver(function () { place(); }).observe(hr0, { childList: true, subtree: true });
    if (ic) {
      fixText(ic); tidyIc();
      new win.MutationObserver(function () { fixText(ic); tidyIc(); place(); }).observe(ic, { childList: true, subtree: true });
    }
    var gb = doc.getElementById('g-base'); if (!gb) return;
    var color = function (d) {
      try { return d && d.properties && typeof win._baseLeanCountyColor === 'function' ? win._baseLeanCountyColor(d.properties.county) : null; } catch (e) { return null; }
    };
    // 全台鄉鎮市區 / 全台村里: the engine has no base-vote colouring there (every block #e0e0e0, a V1 gap); the colour
    // comes from the same function the county drill-down uses (_baseLeanCountyColor(tc / vc)), kept per view
    var cache = {}, cacheMode = null;
    var unitColor = function (key) {
      var m; try { m = win.eval('_baseLeanDisplayMode'); } catch (e) { m = ''; }
      if (m !== cacheMode) { cache = {}; cacheMode = m; }
      if (!(key in cache)) { try { cache[key] = win._baseLeanCountyColor(key) || null; } catch (e) { cache[key] = null; } }
      return cache[key];
    };
    // county name (the engine's, 台 or 臺) → the indices of its villages in VD (the order tcborder.js indexes them in)
    var vByCounty = null;
    var countyVillages = function (name) {
      if (!vByCounty) {
        vByCounty = {};
        var CD = win.eval('CD'), VD = win.eval('VD'), cc = {};
        win.topojson.feature(CD, CD.objects.counties).features.forEach(function (f) { cc[String(f.properties.cn).replace(/台/g, '臺')] = f.properties.cc; });
        var byCc = {};
        VD.objects.villages.geometries.forEach(function (g, i) { var vc = g.properties && g.properties.vc; if (vc) (byCc[String(vc).slice(0, 5)] = byCc[String(vc).slice(0, 5)] || []).push(i); });
        Object.keys(cc).forEach(function (n) { vByCounty[n] = byCc[cc[n]] || []; });
      }
      return vByCounty[String(name || '').replace(/台/g, '臺')] || null;
    };
    var paint = function () {
      var pathFn = null; try { pathFn = win.eval('pathFn'); } catch (e) {}
      [].forEach.call(gb.querySelectorAll(':scope > .ft-county-baselean'), function (p) {
        var c = color(p.__data__);
        if (c && p.style.fill !== c) p.style.fill = c;
        // the engine's county blocks are merged villages with the village map's gaps (air bases, river beds) left as
        // holes — the black dots (user 2026-11-01: 「政黨基本盤的地圖ED層也有不少洞洞」). Filled the shared way
        // (V2TcBorder.solid, as every other map's county / district level); real enclaves (臺北市 in 新北市, 嘉義市 in
        // 嘉義縣) stay, their own block covers them
        var dd = p.__data__;
        if (dd && dd.geometry && window.V2TcBorder && pathFn) {
          if (!dd.__v2Solid) { window.V2TcBorder.solid(win, dd.geometry); dd.__v2Solid = true; }
          // its villages, so tcborder.js fills the gaps between counties (river beds) in the nearest county's colour
          if (!dd.__v2Vill) dd.__v2Vill = countyVillages(dd.properties && dd.properties.county);
          if (!p.classList.contains('v2-gap-owner')) p.classList.add('v2-gap-owner');
          if (p.__v2SolidD !== p.getAttribute('d') || !p.__v2SolidD) { var nd = pathFn(dd); if (nd) { p.setAttribute('d', nd); p.__v2SolidD = nd; } }
        }
      });
      if (typeof win._baseLeanCountyColor === 'function') {
        [].forEach.call(gb.querySelectorAll(':scope > path.ft-tc, :scope > path.ft-vill'), function (p) {
          var pr = p.__data__ && p.__data__.properties; if (!pr || p.getAttribute('fill') !== '#e0e0e0') return;
          var c = unitColor(pr.vc || pr.tc);
          if (c && p.style.fill !== c) p.style.fill = c;
        });
      }
      // county lines after the last block (they are drawn after it already; keep it so if the engine re-joins the blocks)
      var last = gb.querySelector(':scope > .ft-county-baselean:last-of-type');
      [].forEach.call(gb.querySelectorAll(':scope > .ft-baselean-border'), function (n) {
        if (last && !(last.compareDocumentPosition(n) & 4)) gb.appendChild(n);
      });
    };
    var queued = false;
    new win.MutationObserver(function () {
      if (queued) return; queued = true;
      win.requestAnimationFrame(function () { queued = false; paint(); });
    }).observe(gb, { childList: true });
    paint();
    if (window.V2TcBorder) {
      var hov = window.V2TcBorder.hover(win, gb, 'v2-baselean-hov');
      gb.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (t.classList && t.classList.contains('ft-county-baselean')) hov.show(t.getAttribute('d')); else hov.hide();
      });
      gb.addEventListener('mouseout', function (e) {
        var r = e.relatedTarget;
        if (!(r && r.classList && r.classList.contains('ft-county-baselean'))) hov.hide();
      });
    }
  }
  window.V2BaseLeanMap = { attach: attach, fold: fold, note: function (win) { return win && win.__v2BaseLeanNote || ''; } };
})();
