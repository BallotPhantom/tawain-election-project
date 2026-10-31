/* History → 全國 → 立委 → 平地 / 山地原住民, 2016 / 2020 / 2024 (user, 2026-10-27).
 *
 * 「因為兩邊應該是以全台當一個大選區所以第一層應該改成是全台灣是一塊大的按了才是22縣市」: each ballot is ONE nationwide
 * district (3 seats), so the map starts as one block — all of Taiwan — and drills 全台 → 22 縣市 → 鄉鎮市區 → 村里, like the
 * other V2 layered modes (no population glow; areas without data take the map's black background). Inside History's own
 * iframe copy of test.html (V1 untouched):
 *  - every block is filled by its leading candidate's party (user: 「得票最高的候選人所屬政黨上色」) via the engine's
 *    winMarginFill / PARTY_COLOR_MAP, deeper = bigger lead of the first candidate over the second;
 *  - the 全台 block's panel (user: 「全台那一塊的面板 可以試試」): the nationwide result with the 3 elected ticked and a
 *    3-seat hemicycle (dropped 2026-10-31 — the left seat cards show it) in the county-council box's dot style (test.html has no generateHemiPoints, so the 3 dots were
 *    placed on the same arc by hand);
 *  - candidate rows in test.html's own legislative row markup (.bar-row / .blb / .bbg / .bpct / .bvote), so legbars.js
 *    gives them the same bar length as the other legislative panels;
 *  - the county panel's 「⊞ 全選區村里」 is the mayor / council modes' glass button (user: the engine's indigenous panel
 *    has a solid-green 「查看村里」 instead), opening every village of the county;
 *  - no legend (user: 「這個圖利請刪掉」): #legend is hidden while the mode is on;
 *  - data: LEGIND (v2/data_legind.js, build_v2_legind.py, tests/reconcile_v2_legind.py), all three years from CEC files.
 * 總統 (2026-10-31, user: 「好做總統」): also one nationwide race, drawn the same way as a third kind 'pres' — data PRES_HIST
 * (v2/data_pres.js, build_v2_pres.py, tests/reconcile_v2_pres.py), 2008–2024; a row's tooltip names the running mate.
 * V2LegInd.draw(win, year, kind 'p' | 'm' | 'pres') / V2LegInd.clear(win).
 */
(function () {
  var BLACK = '#0a0d16';   // mapBgColor()'s base colour
  var IND_CLR = '#8a8a8a';

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(year, kind) {
    if (kind === 'pres') return (typeof PRES_HIST !== 'undefined' ? PRES_HIST : {})[year] || null;
    return ((typeof LEGIND !== 'undefined' ? LEGIND : {})[year] || {})[kind] || null;
  }

  function partyClr(win, p) { var M = G(win, 'PARTY_COLOR_MAP') || {}; return M[p] || IND_CLR; }
  // [elig, cast, valid, v0, ...] → candidates sorted by votes here
  function ranked(c, vec) {
    return c.d.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], m: x[3], v: vec[3 + i] }; })
      .sort(function (a, b) { return b.v - a.v; });
  }
  function fill(c, vec) {
    if (!vec || !vec[2]) return BLACK;
    var r = ranked(c, vec), top = r[0];
    if (!top || !top.v) return BLACK;
    var margin = r.length > 1 ? (top.v - r[1].v) / vec[2] : 1;
    var M = G(c.win, 'PARTY_COLOR_MAP') || {};
    return c.win.winMarginFill(top.p, margin, M[top.p]);
  }
  function villVec(c, vc) {
    if (c.d.vc[vc]) return { vec: c.d.vc[vc] };
    var j = c.d.jv[vc];
    return j ? { vec: c.d.jr[j].slice(1), joint: c.d.jr[j][0] } : null;
  }

  // ── panels (test.html's legislative row markup) ──
  // 總統's nationwide / big-county figures don't fit the vote column: 萬 from a million up (as the 不分區 panel), full number in the tooltip
  function votes(win, v) { return v >= 1e6 ? win.T((v / 1e4).toFixed(1) + '萬', (v / 1e6).toFixed(2) + 'M') : v.toLocaleString(); }
  function rowsHtml(c, vec, maxRows) {
    var win = c.win, T = win.T, logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    var r = ranked(c, vec).filter(function (x, i) { return x.v > 0 || i < 3; });
    if (maxRows) r = r.slice(0, maxRows);
    return r.map(function (x) {
      var pct = vec[2] ? x.v / vec[2] * 100 : 0;
      var ns = x.e ? 'font-weight:700;color:#e8eaed' : 'color:#777';
      var check = x.e ? '<span style="color:#2ebd59;font-weight:bold;margin-right:2px">&#10004;</span>' : '';
      var ico = logos[x.p] ? '<span style="display:inline-block;width:12px;height:12px;flex-shrink:0;vertical-align:middle;">' + logos[x.p] + '</span>' : '';
      var nm = typeof win.translateCandidate === 'function' ? win.translateCandidate(x.n) : x.n;
      return '<div class="bar-row"><div class="blb" style="border-right:none;' + ns + '" title="' + x.n + (x.m ? '／' + x.m : '') + '">' + check + nm + '</div>' + ico +
        '<div class="bbg"><div class="bfill" style="width:' + pct.toFixed(1) + '%;background:' + partyClr(win, x.p) + ';opacity:' + (x.e ? '1' : '0.4') + '"></div></div>' +
        '<div class="bpct" style="' + ns + '">' + pct.toFixed(1) + '%</div><div class="bvote" style="' + ns + '" title="' + x.v.toLocaleString() + '">' + votes(win, x.v) + '</div></div>';
    }).join('');
  }
  // the engine's own turnout pills (turnoutBadgeHtml): the same 紅綠燈 dots as every other panel (user 2026-10-31:
  // 「原住民的投票率跟有效票率tag沒有紅綠燈」)
  function turnoutLine(win, vec) {
    if (!vec[0] || !vec[1]) return '';
    return '<div style="margin-bottom:6px">' + win.turnoutBadgeHtml(vec[1] / vec[0] * 100, (vec[1] - vec[2]) / vec[1] * 100) + '</div>';
  }

  function raceName(c) {
    if (c.kind === 'pres') return c.year + ' ' + c.win.T('總統', 'Presidential');
    return c.year + ' ' + (c.kind === 'p' ? c.win.T('平地原住民立委', 'Lowland Indigenous Legislator') : c.win.T('山地原住民立委', 'Highland Indigenous Legislator'));
  }

  function nationalPanel(c) {
    // 全台 panel: no hemicycle — the seat cards on the map's left show it all the time (user 2026-10-31: 「把hist mode的右邊全台總覽的半圓形圖都刪掉（左邊有常駐顯示了）」)

    var T = c.win.T;
    return '<div class="t1">' + T('全台', 'All Taiwan') + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px">' + raceName(c) + (c.kind === 'pres' ? T('・全國一個選區，應選 1 人', ' · one nationwide race, 1 winner') : T('・全國一個選區，應選 3 席', ' · one nationwide district, 3 seats')) + '</div>' +
      turnoutLine(c.win, c.d.nat) +
      '<div class="sec-title" style="margin-bottom:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rowsHtml(c, c.d.nat) + '</div>' +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('點擊地圖進入 22 縣市 ▶', 'Click the map to enter the 22 counties ▶') + '</div>';
  }
  function areaPanel(c, title, vec, extra) {
    var T = c.win.T;
    if (!vec || !vec[2]) return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>';
    return '<div class="t1">' + title + '</div><div style="font-size:10px;color:#888;margin-top:2px">' + raceName(c) + '</div>' +
      turnoutLine(c.win, vec) + '<div class="sec-title" style="margin-bottom:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + rowsHtml(c, vec) + '</div>' + (extra || '');
  }
  function ccName(c, cc) {
    var f = c.cos.features.find(function (x) { return x.properties.cc === cc; });
    var n = f ? f.properties.cn : cc;
    return typeof c.win.translateCounty === 'function' ? c.win.translateCounty(n) : n;
  }
  function tcName(c, tc) {
    var NM = G(c.win, 'NM'), raw = (NM && NM.t && NM.t[tc]) || tc;
    return typeof c.win.translateTownship === 'function' ? c.win.translateTownship(raw) : raw;
  }
  function vcName(c, vc) {
    var NM = G(c.win, 'NM'), raw = (NM && NM.v && NM.v[vc]) || vc;
    var n = raw.indexOf(' ') !== -1 ? raw.split(' ').slice(1).join(' ') : raw;
    return typeof c.win.translateVillage === 'function' ? c.win.translateVillage(vc, n) : n;
  }
  // the mayor / council modes' 「⊞ 全選區村里」 glass button (renderCouncilCandRow panels' markup)
  // hint: 縣市 panels say 「點選鄉鎮進入」, township panels 「點擊進入村里層」 (as _mayorPanelHtml / _mayorTcPanelHtml)
  function villAllButton(c, cc, inTownship) {
    var T = c.win.T;
    var hint = inTownship ? T('點擊進入村里層 ▶', 'Click to enter village level ▶') : T('點選鄉鎮進入 ▶', 'Click a township to enter ▶');
    return '<div style="display:flex;gap:6px;margin-top:10px"><div class="hint" style="flex:1;text-align:center;opacity:0.5">' + hint + '</div>' +
      '<button class="btn v2-li-villall" data-cc="' + cc + '" style="flex:1;font-size:10px;padding:4px 6px;background:rgba(27,158,75,0.18);color:#4ade80;border:1px solid rgba(27,158,75,0.45);border-radius:4px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 0 6px rgba(74,222,128,0.4);cursor:pointer"><span>' + T('⊞ 全選區村里', '⊞ All Villages') + '</span></button></div>';
  }

  // ── map layers ──
  function fresh(c) {   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg');
  }
  function ic(c, html) {
    var el = c.win.document.getElementById('ic'); if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.v2-li-villall').forEach(function (b) { b.onclick = function () { villagesOfCounty(c, b.dataset.cc); }; });
  }
  function begin(c, view) {
    fresh(c);
    c.view = view;
    if (typeof navActive === 'function') navActive(c, null);
    c.win.eval("level = 'tc'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(c.win, 'clearAll')();
    c.win.document.getElementById('mp').style.background = c.win.mapBgColor();
  }
  function blocks(c, feats, fillOf, onOver, onClick, extraClass) {
    var f = function (d) { return fillOf(d); };
    return c.gBase.selectAll('.v2-li-blk').data(feats).join('path')
      .attr('class', 'ft v2-li-blk v2-own ' + (extraClass || '')).attr('d', c.pathFn)
      .style('animation', 'none')   // the engine's .ft fadeIn would restart from opacity 0 when hoverOn() raises a block
      .attr('fill', f).attr('stroke', f).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', onClick ? 'pointer' : 'default')
      .on('mouseover', function (e, d) { hoverOn(c, this); onOver.call(this, e, d); })
      .on('mouseleave', function () { hoverOff(c); })
      .on('click', onClick || null);
  }
  // yellow hover outline (user 2026-10-28: 「「山地平地立委」加回滑鼠互動黃匡」): the block's own stroke, the engine's
  // hover colour (#ffcd78, as its .ft-plcounty / district blocks), raised so neighbours don't cover it
  var HOVER = '#f5c518';   // = the 2027 補選預測 page (user 2026-10-28)
  // the yellow outline: one overlay path last in the layer (V2TcBorder.hover) — the block itself is never moved, so its
  // mouseleave always fires and nothing stays yellow (2026-10-28 audit; raising the block under the pointer lost it)
  function hov(c) {
    var layer = c.gBase.node();
    if (!c.hov || c.hovLayer !== layer) { c.hov = window.V2TcBorder.hover(c.win, layer, 'v2-blk-hov'); c.hovLayer = layer; }
    return c.hov;
  }
  function hoverOn(c, el) { hov(c).show(el.getAttribute('d')); }
  function hoverOff(c) { hov(c).hide(); }

  // kind 'tc' (township lines) / 'outline' (white area outline): the shared style, v2/tcborder.js
  function border(c, cls, data, kind) { window.V2TcBorder.lines(c.gBase, c.pathFn, cls, data, kind); }
  function zoomAll(c) {
    if (!c.svg) return;
    c.svg.transition().duration(380).call(G(c.win, 'zm').transform, c.win.d3.zoomIdentity);
    try { c.win.eval('curK = 1'); } catch (e) {}
  }
  function crumb(c, parts) {   // parts: [[label, fn|null], ...]
    var el = c.win.document.getElementById('crumb'); if (!el) return;
    el.innerHTML = parts.map(function (p, i) { return p[1] ? '<span class="cl" data-i="' + i + '">' + p[0] + '</span>' : p[0]; }).join(' › ');
    el.querySelectorAll('.cl').forEach(function (s) { s.onclick = parts[+s.dataset.i][1]; });
  }
  function townshipFeature(c, tc) {
    if (c.tcGeom[tc]) return c.tcGeom[tc];
    var vg = c.VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && vc.indexOf(tc) === 0; });
    if (!vg.length) return null;
    var m = c.win._cleanMergedGeom(c.win.topojson.merge(c.VD, vg));
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, m.type === 'Feature' ? m.geometry : m);   // VD gaps aren't holes
    return (c.tcGeom[tc] = { type: 'Feature', properties: { tc: tc }, geometry: m.type === 'Feature' ? m.geometry : m });
  }

  // 1. 全台: one block
  function national(c) {
    begin(c, ['nat']);
    var T = c.win.T;
    var all = c.win.topojson.merge(c.CD, c.CD.objects.counties.geometries);
    // the river channels between 臺北 / 新北 (淡水河, 新店溪) are in no county: fill them (v2/tcborder.js)
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, all.type === 'Feature' ? all.geometry : all);
    var feat = { type: 'Feature', properties: {}, geometry: all.type === 'Feature' ? all.geometry : all };
    blocks(c, [feat], function () { return fill(c, c.d.nat); }, function () { ic(c, nationalPanel(c)); }, function () { counties(c); });
    border(c, 'v2-li-coast', [feat], 'outline');
    ic(c, nationalPanel(c));
    crumb(c, [[T('全台', 'All'), null], [raceName(c), null]]);
    zoomAll(c);
  }
  // 2. 22 縣市
  function counties(c) {
    begin(c, ['cc']);
    var T = c.win.T;
    blocks(c, c.cos.features, function (d) { return fill(c, c.d.cc[d.properties.cc]); },
      function (e, d) { ic(c, areaPanel(c, ccName(c, d.properties.cc), c.d.cc[d.properties.cc], villAllButton(c, d.properties.cc))); },
      function (e, d) { county(c, d.properties.cc); });
    border(c, 'v2-li-ccb', [c.win.topojson.mesh(c.CD, c.CD.objects.counties, function (a, b) { return a !== b; })], 'outline');
    ic(c, nationalPanel(c).replace(T('點擊地圖進入 22 縣市 ▶', 'Click the map to enter the 22 counties ▶'), T('移到各縣市查看資料，點選進入鄉鎮市區', 'Hover a county; click to enter its townships')));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('22 縣市', '22 counties'), null]]);
    zoomAll(c);
  }
  // 3. one county's townships
  function county(c, cc) {
    begin(c, ['county', cc]);
    var T = c.win.T, seen = {}, feats = [];
    c.win.getTCGJ().features.forEach(function (f) {
      var tc = f.properties.tc; if (tc.indexOf(cc) !== 0 || seen[tc]) return; seen[tc] = 1;
      feats.push(townshipFeature(c, tc) || f);
    });
    var ef = c.cos.features.find(function (f) { return f.properties.cc === cc; });
    if (ef) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(ef)).attr('pointer-events', 'none');
    blocks(c, feats, function (d) { return fill(c, c.d.tc[d.properties.tc]); },
      function (e, d) { ic(c, areaPanel(c, ccName(c, cc) + ' ' + tcName(c, d.properties.tc), c.d.tc[d.properties.tc], villAllButton(c, cc, true))); },
      function (e, d) { township(c, d.properties.tc); });
    border(c, 'v2-li-tcb', feats, 'tc');
    if (ef) border(c, 'v2-li-ccb', [ef], 'outline');
    ic(c, areaPanel(c, ccName(c, cc), c.d.cc[cc], villAllButton(c, cc)));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('22 縣市', '22 counties'), function () { counties(c); }], [ccName(c, cc), null]]);
    G(c.win, 'fitFeats')(feats);
  }
  function villageLayer(c, feats, onTitle) {
    blocks(c, feats, function (d) { var r = villVec(c, d.properties.vc); return fill(c, r && r.vec); },
      function (e, d) {
        var vc = d.properties.vc, r = villVec(c, vc), T = c.win.T;
        var banner = r && r.joint ? '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
          T('與「' + r.joint + '」合併開票，以下為合併後的數字', 'Counted jointly with 「' + r.joint + '」 — the figures below are the joint station\'s') + '</div>' : '';
        ic(c, banner + areaPanel(c, onTitle(vc), r && r.vec));
      }, null);
    c.gBase.selectAll('.v2-li-blk').attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4);
  }
  function villFeats(c, prefix) {
    return c.win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && vc.indexOf(prefix) === 0; });
  }
  // 4. one township's villages
  function township(c, tc) {
    begin(c, ['tc', tc]);
    var T = c.win.T, cc = tc.slice(0, 5), feats = villFeats(c, tc);
    if (!feats.length) return;
    var tf = townshipFeature(c, tc);
    if (tf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(tf)).attr('pointer-events', 'none');
    villageLayer(c, feats, function (vc) { return vcName(c, vc); });
    if (tf) border(c, 'v2-li-tcb', [tf], 'tc');
    ic(c, areaPanel(c, ccName(c, cc) + ' ' + tcName(c, tc), c.d.tc[tc]));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('22 縣市', '22 counties'), function () { counties(c); }], [ccName(c, cc), function () { county(c, cc); }], [tcName(c, tc), null]]);
    G(c.win, 'fitFeats')(feats);
  }
  // 「⊞ 全選區村里」: every village of one county
  function villagesOfCounty(c, cc) {
    begin(c, ['ccvill', cc]);
    var T = c.win.T, feats = villFeats(c, cc);
    if (!feats.length) return;
    villageLayer(c, feats, function (vc) { return tcName(c, vc.slice(0, 8)) + ' ' + vcName(c, vc); });
    var ef = c.cos.features.find(function (f) { return f.properties.cc === cc; });
    if (ef) border(c, 'v2-li-ccb', [ef], 'outline');
    ic(c, areaPanel(c, ccName(c, cc), c.d.cc[cc]));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('22 縣市', '22 counties'), function () { counties(c); }], [ccName(c, cc), function () { county(c, cc); }], [T('全選區村里', 'All villages'), null]]);
    G(c.win, 'fitFeats')(feats);
  }
  // 全台鄉鎮市區 / 全台村里 (the bar's buttons; user 2026-10-31: 「全台底線那個也不能用（至少原住民有bug）」 — the engine's own
  // views there are its 2024 原住民 layer, blank for 2008 / 2012): every township / village of Taiwan, same colouring
  function navActive(c, id) {
    ['btn-tc-nat', 'btn-vill-nat'].forEach(function (b) { var el = c.win.document.getElementById(b); if (el) el.classList.toggle('active', b === id); });
  }
  function allTowns(c) {
    begin(c, ['alltc']);
    var T = c.win.T, seen = {}, feats = [];
    c.win.getTCGJ().features.forEach(function (f) { var tc = f.properties.tc; if (seen[tc]) return; seen[tc] = 1; feats.push(f); });
    blocks(c, feats, function (d) { return fill(c, c.d.tc[d.properties.tc]); },
      function (e, d) { var tc = d.properties.tc; ic(c, areaPanel(c, ccName(c, tc.slice(0, 5)) + ' ' + tcName(c, tc), c.d.tc[tc])); },
      function (e, d) { township(c, d.properties.tc); });
    border(c, 'v2-li-tcb', feats, 'tc');
    border(c, 'v2-li-ccb', [c.win.topojson.mesh(c.CD, c.CD.objects.counties, function (a, b) { return a !== b; })], 'outline');
    ic(c, nationalPanel(c));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台鄉鎮市區', 'All townships'), null]]);
    navActive(c, 'btn-tc-nat');
    zoomAll(c);
  }
  function allVillages(c) {
    begin(c, ['allvill']);
    var T = c.win.T;
    villageLayer(c, villFeats(c, ''), function (vc) { return ccName(c, vc.slice(0, 5)) + ' ' + tcName(c, vc.slice(0, 8)) + ' ' + vcName(c, vc); });
    border(c, 'v2-li-ccb', [c.win.topojson.mesh(c.CD, c.CD.objects.counties, function (a, b) { return a !== b; })], 'outline');
    ic(c, nationalPanel(c));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台村里', 'All villages'), null]]);
    navActive(c, 'btn-vill-nat');
    zoomAll(c);
  }
  // the engine calls goED / goTCAllNational / goVillAllNational for its own redraws too (resize, setMode…): only a click
  // in the bar (v2/navbar.js sets __v2NavClick) opens V2's view; any other call keeps V2's current view on screen
  function hookNav(win) {
    var to = { goED: national, goTCAllNational: allTowns, goVillAllNational: allVillages };
    Object.keys(to).forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function' || o.v2LegInd) return;
      var w = function () {
        var c = win.__v2LegIndCtx;
        if (!c || win.__v2LegIndKey !== c.key) return o.apply(this, arguments);
        if (win.__v2NavClick) to[n](c); else redraw(c);
      };
      w.v2LegInd = true; win[n] = w;
    });
  }
  function redraw(c) {
    var v = c.view || ['nat'];
    if (v[0] === 'alltc') allTowns(c);
    else if (v[0] === 'allvill') allVillages(c);
    else if (v[0] === 'cc') counties(c);
    else if (v[0] === 'county') county(c, v[1]);
    else if (v[0] === 'tc') township(c, v[1]);
    else if (v[0] === 'ccvill') villagesOfCounty(c, v[1]);
    else national(c);
  }

  // No legend in this mode (user 2026-10-27: 「這個圖利請刪掉」 — the party key V2 drew here first). The engine's own
  // 原住民 legend lists its 2024 candidates in candidate colours (IND_LEG_*), wrong for 2016 / 2020 and for this map's
  // party colouring, so #legend is hidden while the mode is on: the engine's renderLegend() is followed by the hide
  // (wrapped at runtime like v2-shell.js's setMode, V1 untouched), and clear() shows it again.
  function hideLegend(win) { var leg = win.document.getElementById('legend'); if (leg) leg.style.display = 'none'; }
  function hookLegend(win) {
    if (typeof win.renderLegend !== 'function' || win.renderLegend.v2LegInd) return;
    var orig = win.renderLegend;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      var c = win.__v2LegIndCtx;
      if (c && win.__v2LegIndKey === c.key) hideLegend(win);
      return r;
    };
    wrapped.v2LegInd = true;
    win.renderLegend = wrapped;
  }
  function chrome(c) {
    var mt = c.win.document.getElementById('map-title');
    if (mt) mt.textContent = raceName(c) + c.win.T('地圖', ' Map');
    hideLegend(c.win);
  }
  // keep V2's map on top of the engine (same reasons as history-townhead.js: the engine's deferred redraws after
  // setIndLegMode, a quick click reaching its own view first, and its resize handler's goED): checked by .v2-own
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    var win = c.win;
    if (win.__v2LegIndKey !== c.key) return;
    chrome(c);
    var gB = G(win, 'gBase');
    if (G(win, 'curED') != null || gB.select('.v2-own').empty()) redraw(c);
    else if ((c.view[0] === 'county' || c.view[0] === 'tc' || c.view[0] === 'ccvill') && win.d3.zoomTransform(G(win, 'svg').node()).k < 1.5) {
      var fs = []; gB.selectAll('.v2-own').each(function (d) { fs.push(d); });
      G(win, 'fitFeats')(fs);
    }
  }
  function schedule(c) {
    (c.win.__v2LegIndTimers || []).forEach(clearTimeout);
    c.win.__v2LegIndTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }

  function draw(win, year, kind) {
    clear(win);
    var d = dataFor(year, kind), CD = G(win, 'CD'), VD = G(win, 'VD');
    if (!d || !CD || !VD) return 0;
    var c = { win: win, year: year, kind: kind, d: d, CD: CD, VD: VD, cos: win.topojson.feature(CD, CD.objects.counties), tcGeom: {}, key: year + kind };
    win.__v2LegIndKey = c.key;
    win.__v2LegIndCtx = c;
    hookLegend(win);
    hookNav(win);
    national(c);
    chrome(c);
    schedule(c);
    win.__v2LegIndResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2LegIndResize);
    win.document.addEventListener('fullscreenchange', win.__v2LegIndResize);
    return d.cands.length;
  }
  function clear(win) {
    if (win.__v2LegIndResize) {
      win.removeEventListener('resize', win.__v2LegIndResize);
      win.document.removeEventListener('fullscreenchange', win.__v2LegIndResize);
      win.__v2LegIndResize = null;
    }
    (win.__v2LegIndTimers || []).forEach(clearTimeout);
    win.__v2LegIndTimers = [];
    var was = win.__v2LegIndKey;
    win.__v2LegIndKey = null;
    win.__v2LegIndCtx = null;
    var leg = win.document.getElementById('legend');
    if (was && leg) leg.style.display = '';
  }
  window.V2LegInd = { draw: draw, clear: clear };
})();
