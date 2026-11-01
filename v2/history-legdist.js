/* History → 全國 → 立委 → 區域選區, 2008 / 2012 (user 2026-10-28: 「你可以把區域立委的data延伸到2008嗎？」 → 「ok」).
 *
 * The engine (test.html, untouched) has district results for 2016 / 2020 / 2024 only. 2008 and 2012 were fought on the
 * same 73 districts as 2016, so V2 draws them on the engine's 2016 district map (ED_GJ_2016 / TC_GJ_2016, both rebuilt
 * from the village map by v2/tcborder.js) inside History's own iframe copy of test.html:
 *   全台 73 選區 → 選區的鄉鎮市區 → 鄉鎮的村里 (and a district's 「⊞ 全選區村里」),
 * in the 原住民 mode's design (history-legind.js): blocks filled by the leading candidate's party, deeper = bigger lead
 * (the engine's winMarginFill / PARTY_COLOR_MAP); candidate rows in test.html's legislative row markup (legbars.js);
 * township lines / white outline from the shared V2TcBorder style; the 2027 補選 yellow hover outline. The 全台 panel has
 * the 73-seat hemicycle on the engine's own seat layout (dropped 2026-10-31 — the left seat cards show it).
 * Data: LEGDIST (v2/data_legdist.js, build_v2_legdist.py, tests/reconcile_v2_legdist.py), CEC files on today's codes.
 * V2LegDist.draw(win, year) / V2LegDist.clear(win).
 */
(function () {
  var BLACK = '#0a0d16';   // mapBgColor()'s base colour
  // no data ≠ no election (user 2026-11-01: 「沒有資料的村里應該…灰底…沒有選舉的黑底不必改」): a place without data takes the
  // engine's own no-data grey — '#e0e0e0' (councilVillColor / councilTCTcColor; test.html's vcColor)
  var NO_DATA_FILL = '#e0e0e0';
  var IND_CLR = '#888888';   // the engine's independent grey (its 2016 桃園6 趙正宇 block)
  var HOVER = '#f5c518';   // = the 2027 補選預測 page
  // seats left → right in camp order (council.html's COUNCIL_CAMP_ORDER: 綠 … 無黨籍 … 藍)
  var ORDER = { dpp: 1, tsr: 2, gp: 3, sdp: 4, npp: 5, tsu: 6, ind: 7, other: 8, npsu: 9, tpp: 10, pfp: 11, np: 12, kmt: 13 };

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(year) { return (typeof LEGDIST !== 'undefined' ? LEGDIST : {})[year] || null; }
  function partyClr(win, p) { var M = G(win, 'PARTY_COLOR_MAP') || {}; return M[p] || IND_CLR; }
  function partyName(win, p) {
    var M = G(win, 'PARTY_NAME_MAP') || {};
    return M[p] || (p === 'ind' ? win.T('無黨籍', 'Independent') : win.T('其他', 'Other'));
  }

  // [elig, cast, valid, v0, ...] of district `r` → its candidates sorted by votes here
  function ranked(r, vec) {
    return r.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], v: vec[3 + i] }; })
      .sort(function (a, b) { return b.v - a.v; });
  }
  function fill(c, r, vec) {
    if (!r || !vec || !vec[2]) return NO_DATA_FILL;
    var s = ranked(r, vec), top = s[0];
    if (!top || !top.v) return NO_DATA_FILL;
    var margin = s.length > 1 ? (top.v - s[1].v) / vec[2] : 1;
    return c.win.winMarginFill(top.p, margin, partyClr(c.win, top.p));
  }
  function villVec(r, vc) {
    if (r.vc[vc]) return { vec: r.vc[vc] };
    var j = r.jv[vc];
    return j ? { vec: r.jr[j].slice(1), joint: r.jr[j][0] } : null;
  }

  // ── panels (test.html's legislative row markup, as history-legind.js) ──
  function rowsHtml(c, r, vec, ed) {
    var win = c.win, logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    return ranked(r, vec).map(function (x) {
      var pct = vec[2] ? x.v / vec[2] * 100 : 0;
      var ns = x.e ? 'font-weight:700;color:#e8eaed' : 'color:#777';
      var check = x.e ? '<span style="color:#2ebd59;font-weight:bold;margin-right:2px">&#10004;</span>' : '';
      var ico = logos[x.p] ? '<span style="display:inline-block;width:12px;height:12px;flex-shrink:0;vertical-align:middle;">' + logos[x.p] + '</span>' : '';
      var nm = typeof win.translateCandidate === 'function' ? win.translateCandidate(x.n) : x.n;
      return '<div class="bar-row"><div class="blb" style="border-right:none;' + ns + '" title="' + x.n + '（' + partyName(win, x.p) + '）">' + check + nm + '</div>' + (ed ? termSlot(c, ed, x) : '') + ico +
        '<div class="bbg"><div class="bfill" style="width:' + pct.toFixed(1) + '%;background:' + partyClr(win, x.p) + ';opacity:' + (x.e ? '1' : '0.4') + '"></div></div>' +
        '<div class="bpct" style="' + ns + '">' + pct.toFixed(1) + '%</div><div class="bvote" style="' + ns + '">' + x.v.toLocaleString() + '</div></div>';
    }).join('');
  }
  // the engine's own turnout pills (turnoutBadgeHtml): the same 紅綠燈 dots as every other panel (user 2026-10-31:
  // 「原住民的投票率跟有效票率tag沒有紅綠燈」)
  function turnoutLine(win, vec) {
    if (!vec[0] || !vec[1]) return '';
    return '<div style="margin-bottom:6px">' + win.turnoutBadgeHtml(vec[1] / vec[0] * 100, (vec[1] - vec[2]) / vec[1] * 100) + '</div>';
  }

  function raceName(c) { return c.year + ' ' + c.win.T('區域立委', 'District Legislator'); }
  // the district's result tag: the 區域立委 win-badge (test.html getWinnerBadgeClass classes)
  var BADGE = { dpp: 'bd-green', kmt: 'bd-blue', tpp: 'bd-white', tsr: 'bd-tsr', npp: 'bd-npp', pfp: 'bd-pfp', tsu: 'bd-tsu', np: 'bd-np', npsu: 'bd-npu' };
  // result tags in the engine's words: a district 「民進黨 65.2% 勝選」, a township / village 「民進黨 67.2% 最多票」
  function winBadge(c, r) {
    var w = ranked(r, r.ed).filter(function (x) { return x.e; })[0]; if (!w) return '';
    var pct = r.ed[2] ? (w.v / r.ed[2] * 100).toFixed(1) + '% ' : '';
    return '<span class="win-badge ' + (BADGE[w.p] || 'bd-other') + '">' + partyName(c.win, w.p) + ' ' + pct + c.win.T('勝選', 'won') + '</span>';
  }
  function topBadge(c, r, vec) {
    var t = ranked(r, vec)[0]; if (!t || !t.v || !vec[2]) return '';
    return '<span class="win-badge ' + (BADGE[t.p] || 'bd-other') + '">' + partyName(c.win, t.p) + ' ' + (t.v / vec[2] * 100).toFixed(1) + '% ' + c.win.T('最多票', 'most votes') + '</span>';
  }
  function edLabel(c, ed) { return typeof c.win.translateED === 'function' ? c.win.translateED(ed) : ed; }
  // ── the 區域立委 / 總統大選 / 不分區政黨票 comparison box, in the engine's own markup (histTripleBoxWrap, .hist-row /
  // .hist-seg / .hist-nums — its 2016 district panels). 總統: 2008 is the 3 / 22 election (user 2026-10-28: 「要用」),
  // 2012 the same day; colours as the engine's 2016 box (民進黨 green, 國民黨 blue, the third candidate orange).
  // 不分區: the parties that won seats that year, the rest 其他 grey. key: {ed} | {tc} | {vc}
  function sideVec(r, side, key) {
    var t = r[side]; if (!t) return null;
    if (key.ed) return t.ed;
    if (key.tc) return t.tc[key.tc];
    if (t.vc[key.vc]) return t.vc[key.vc];
    var j = t.jv[key.vc]; return j ? t.jr[j].slice(1) : null;
  }
  var SEG_CLR = { dpp: '#1b9e4b', kmt: '#1555b4', pfp: '#f06a0a', npsu: '#C20F51', ind: '#555', other: '#777777' };
  function segColor(win, p) { return SEG_CLR[p] || partyClr(win, p); }
  function histRow(label, segs, first) {
    var tot = segs.reduce(function (a, x) { return a + x.v; }, 0) || 1;
    var bar = segs.map(function (x) { return '<div class="hist-seg" style="width:' + (x.v / tot * 100).toFixed(2) + '%;background:' + x.color + '" title="' + x.label + ' ' + (x.v / tot * 100).toFixed(1) + '%"></div>'; }).join('');
    var nums = segs.map(function (x) { return '<span style="color:' + x.color + ';font-weight:700">' + (x.v / tot * 100).toFixed(1) + '%</span>'; }).join('');
    return '<div class="hist-row"' + (first ? '' : ' style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06)"') + '><div class="hist-label">' + label + '</div>' +
      '<div class="hist-bar-wrap">' + bar + '</div><div class="hist-nums" style="grid-template-columns:repeat(' + segs.length + ',1fr);gap:4px">' + nums + '</div></div>';
  }
  function boxHtml(c, r, vec, key) {
    var win = c.win, T = win.T, d = c.d, rows = [];
    if (vec && vec[2]) {   // 區域立委: 民進黨 / 國民黨 always, any other candidate with ≥ 10 %, the rest 其他
      var segs = [], oth = 0;
      ranked(r, vec).forEach(function (x) {
        if (x.p === 'dpp' || x.p === 'kmt' || x.v / vec[2] >= 0.1) segs.push({ v: x.v, color: segColor(win, x.p === 'ind' ? 'ind' : x.p), label: x.n });
        else oth += x.v;
      });
      if (oth) segs.push({ v: oth, color: '#aaa', label: T('其他', 'Other') });
      rows.push(histRow(T('區域立委', 'District'), segs, true));
    }
    var pv = sideVec(r, 'pres', key);
    if (pv && pv[0] && d.presCands) {
      var ps = d.presCands.map(function (x, i) { return { v: pv[1 + i], color: x[1] === 'dpp' ? '#1b9e4b' : x[1] === 'kmt' ? '#1555b4' : '#f06a0a', label: x[0], o: x[1] === 'dpp' ? 0 : x[1] === 'kmt' ? 1 : 2 }; })
        .sort(function (a, b) { return a.o - b.o; });
      rows.push(histRow(T('總統大選', 'Presidential Election') + (c.year === '2008' ? T('（3/22）', ' (Mar 22)') : ''), ps));
    }
    var lv = sideVec(r, 'pl', key);
    if (lv && lv[0] && d.plKeys) {
      rows.push(histRow(T('不分區政黨票', 'Party-list Votes'), d.plKeys.map(function (k, i) {
        return { v: lv[1 + i], color: k === 'other' ? '#777777' : segColor(win, k), label: k === 'other' ? T('其他', 'Other') : partyName(win, k) };
      })));
    }
    if (!rows.length) return '';
    return '<div style="border:1.5px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;margin:6px 0;background:rgba(255,255,255,0.02)">' + rows.join('') + '</div>';
  }
  function districtPanel(c, ed, extra) {
    var T = c.win.T, r = c.d.eds[ed];
    if (!r) return '<div class="t1">' + edLabel(c, ed) + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>';
    // CEC's own name that year (臺北縣第06選區 …) as the title's tooltip; the panel itself as the engine's district panel
    return '<div class="t1" title="' + T('當年名稱：', 'Then: ') + r.name + '">' + edLabel(c, ed) + '</div>' + winBadge(c, r) +
      turnoutLine(c.win, r.ed) + boxHtml(c, r, r.ed, { ed: true }) +    // no section title: the engine's district panels go straight to the rows
      
      '<div style="max-height:320px;overflow-y:auto">' + rowsHtml(c, r, r.ed, ed) + '</div>' + (extra || '');
  }
  function areaPanel(c, ed, title, vec, banner, key) {
    var T = c.win.T, r = c.d.eds[ed];
    if (!r || !vec || !vec[2]) return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料（村里已合併或改制）', 'No data (village merged or redrawn since)') + '</div>';
    return (banner || '') + '<div class="t1">' + title + '</div><div style="font-size:10px;color:#888;margin-top:2px">' + edLabel(c, ed) + '</div>' +
      topBadge(c, r, vec) + turnoutLine(c.win, vec) + (key ? boxHtml(c, r, vec, key) : '') +    // no section title: the engine's district panels go straight to the rows
      
      '<div style="max-height:320px;overflow-y:auto">' + rowsHtml(c, r, vec, ed) + '</div>';
  }

  function nationalPanel(c) {
    // 全台 panel: no hemicycle — the seat cards on the map's left show it all the time (user 2026-10-31: 「把hist mode的右邊全台總覽的半圓形圖都刪掉（左邊有常駐顯示了）」)

    var T = c.win.T;
    return '<div class="t1">' + T('全台', 'All Taiwan') + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px">' + raceName(c) + (+c.year < 2016 ? T('・73 選區，選區界線與 2016 相同', ' · 73 districts, the same lines as 2016') : T('・73 選區', ' · 73 districts')) + '</div>' +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('移到選區查看資料，點選進入鄉鎮市區 ▶', 'Hover a district; click to enter its townships ▶') + '</div>';
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
  function villAllButton(c, ed, inTownship) {
    var T = c.win.T;
    var hint = inTownship ? T('點擊進入村里層 ▶', 'Click to enter village level ▶') : T('點擊地圖進入鄉鎮市區 ▶', 'Click the map to enter townships ▶');
    return '<div style="display:flex;gap:6px;margin-top:10px"><div class="hint" style="flex:1;text-align:center;opacity:0.5">' + hint + '</div>' +
      '<button class="btn v2-ld-villall" data-ed="' + ed + '" style="flex:1;font-size:10px;padding:4px 6px;background:rgba(27,158,75,0.18);color:#4ade80;border:1px solid rgba(27,158,75,0.45);border-radius:4px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 0 6px rgba(74,222,128,0.4);cursor:pointer"><span>' + T('⊞ 全選區村里', '⊞ All Villages') + '</span></button></div>';
  }

  // ── map layers ──
  function fresh(c) { c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg'); }
  function ic(c, html) {
    var el = c.win.document.getElementById('ic'); if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.v2-ld-villall').forEach(function (b) { b.onclick = function () { villagesOfDistrict(c, b.dataset.ed); }; });
  }
  function begin(c, view) {
    fresh(c);
    c.view = view;
    c.win.eval("level = 'tc'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(c.win, 'clearAll')();
    c.win.document.getElementById('mp').style.background = c.win.mapBgColor();
  }
  // cls: 'ft-tc' for township blocks (V2TcBorder fills the village-map gaps under them), 'ft-vill' for villages
  function blocks(c, feats, fillOf, onOver, onClick, cls) {
    return c.gBase.selectAll('.v2-ld-blk').data(feats).join('path')
      .attr('class', 'ft v2-ld-blk v2-own ' + (cls || '')).attr('d', c.pathFn)
      .style('animation', 'none')
      .attr('fill', fillOf).attr('stroke', fillOf).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', onClick ? 'pointer' : 'default')
      .on('mouseover', function (e, d) { hoverOn(c, this); onOver.call(this, e, d); })
      .on('mouseleave', function () { hoverOff(c); })
      .on('click', onClick || null);
  }
  // the yellow outline: one overlay path last in the layer (V2TcBorder.hover) — the block itself is never moved, so its
  // mouseleave always fires and nothing stays yellow (2026-10-28 audit; raising the block under the pointer lost it)
  function hov(c) {
    var layer = c.gBase.node();
    if (!c.hov || c.hovLayer !== layer) { c.hov = window.V2TcBorder.hover(c.win, layer, 'v2-blk-hov'); c.hovLayer = layer; }
    return c.hov;
  }
  function hoverOn(c, el) { hov(c).show(el.getAttribute('d')); }
  function hoverOff(c) { hov(c).hide(); }

  function border(c, cls, data, kind) { window.V2TcBorder.lines(c.gBase, c.pathFn, cls, data, kind).classed('v2-ld-line', true); }
  function zoomAll(c) {
    if (!c.svg) return;
    c.svg.transition().duration(380).call(G(c.win, 'zm').transform, c.win.d3.zoomIdentity);
    try { c.win.eval('curK = 1'); } catch (e) {}
  }
  function crumb(c, parts) {
    var el = c.win.document.getElementById('crumb'); if (!el) return;
    el.innerHTML = parts.map(function (p, i) { return p[1] ? '<span class="cl" data-i="' + i + '">' + p[0] + '</span>' : p[0]; }).join(' › ');
    el.querySelectorAll('.cl').forEach(function (s) { s.onclick = parts[+s.dataset.i][1]; });
  }
  // the engine's 2016 district / township shapes (winnerYear '2016': getEDGJ / getTCGJ hand out the rebuilt 2016 sets)
  function edFeats(c) { return c.win.getEDGJ().features; }
  function pieces(c, ed) { return c.win.getTCGJ().features.filter(function (f) { return f.properties.ed === ed; }); }
  // a piece's villages: the ones V2TcBorder gave it, else (an unsplit township) all of the township's
  function pieceVillages(c, f) {
    var VD = c.VD, gs = VD.objects.villages.geometries, tc = f.properties.tc;
    var idx = f.__v2Vill && f.__v2Vill.length ? f.__v2Vill : null;
    var list = idx ? idx.map(function (i) { return gs[i]; }) : gs.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && vc.indexOf(tc) === 0; });
    return list.map(function (g) { return c.win.topojson.feature(VD, g); });
  }

  // 1. 全台: 73 districts
  function national(c) {
    begin(c, ['nat']);
    var T = c.win.T, feats = edFeats(c);
    blocks(c, feats, function (d) { var r = c.d.eds[d.properties.ed]; return fill(c, r, r && r.ed); },
      function (e, d) {
        // the engine's grey mask over the other counties while a district is hovered (its goED mouseover)
        if (typeof c.win._setCountyDim === 'function' && typeof c.win.edToCounty === 'function') c.win._setCountyDim(c.win.edToCounty(d.properties.ed));
        ic(c, districtPanel(c, d.properties.ed, villAllButton(c, d.properties.ed)));
      },
      function (e, d) { if (typeof c.win._clearCountyDim === 'function') c.win._clearCountyDim(); if (c.d.eds[d.properties.ed]) district(c, d.properties.ed); });
    c.gBase.selectAll('.v2-ld-blk').on('mouseleave.dim', function () { if (typeof c.win._clearCountyDim === 'function') c.win._clearCountyDim(); });
    var CD = c.CD;
    // district lines: the edges between district blocks (each drawn once), county lines white
    var edMesh = meshOf(c);
    if (edMesh) border(c, 'v2-ld-edb', [edMesh], 'tc');
    border(c, 'v2-ld-ccb', [c.win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; })], 'outline');
    ic(c, nationalPanel(c));
    crumb(c, [[T('全台', 'All'), function () { national(c); }]]);
    zoomAll(c);
    after(c);
  }
  // the lines between districts: the village arcs whose two sides are in different districts (one village map, so the
  // lines sit exactly on the blocks' edges)
  function meshOf(c) {
    var m = c.win.__v2VMap, ed = c.win.__v2VcEd2016;
    if (!m || !ed) return null;
    return c.win.topojson.mesh(c.VD, c.VD.objects.villages, function (a, b) {
      if (a === b) return false;
      var ea = ed[m.index.get(a)], eb = ed[m.index.get(b)];
      return ea && eb && ea !== eb;
    });
  }
  // 2. one district's townships
  function district(c, ed) {
    begin(c, ['ed', ed]);
    var T = c.win.T, r = c.d.eds[ed], feats = pieces(c, ed);
    var ef = edFeats(c).find(function (f) { return f.properties.ed === ed; });
    if (ef) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(ef)).attr('pointer-events', 'none');
    blocks(c, feats, function (d) { return fill(c, r, r.tc[d.properties.tc]); },
      function (e, d) { ic(c, areaPanel(c, ed, tcName(c, d.properties.tc), r.tc[d.properties.tc], '', { tc: d.properties.tc }) + villAllButton(c, ed, true)); },
      function (e, d) { township(c, ed, d); }, 'ft-tc');
    border(c, 'v2-ld-tcb', feats, 'tc');
    if (ef) border(c, 'v2-ld-ccb', [ef], 'outline');
    ic(c, '<div class="t1">' + edLabel(c, ed) + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('移到鄉鎮查看資料', 'Hover over a township to view data') + '</div>' +
      villAllButton(c, ed).replace(T('點擊地圖進入鄉鎮市區 ▶', 'Click the map to enter townships ▶'), T('點選鄉鎮進入 ▶', 'Select a township ▶')));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [edLabel(c, ed), function () { district(c, ed); }]]);
    G(c.win, 'fitFeats')(feats);
    after(c);
  }
  function villageLayer(c, ed, feats, onTitle) {
    var r = c.d.eds[ed];
    blocks(c, feats, function (d) { var v = villVec(r, d.properties.vc); return fill(c, r, v && v.vec); },
      function (e, d) {
        var vc = d.properties.vc, v = villVec(r, vc), T = c.win.T;
        var banner = v && v.joint ? '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
          T('與「' + v.joint + '」合併開票，以下為合併後的數字', 'Counted jointly with 「' + v.joint + '」 — the figures below are the joint station\'s') + '</div>' : '';
        ic(c, areaPanel(c, ed, onTitle(vc), v && v.vec, banner, { vc: vc }));
      }, null, 'ft-vill');
    c.gBase.selectAll('.v2-ld-blk').attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4);
  }
  // 3. one township (piece) of a district: its villages
  function township(c, ed, piece) {
    var tc = piece.properties.tc;
    begin(c, ['tc', ed, tc]);
    var T = c.win.T, feats = pieceVillages(c, piece);
    if (!feats.length) return;
    c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(piece)).attr('pointer-events', 'none');
    villageLayer(c, ed, feats, function (vc) { return vcName(c, vc); });
    border(c, 'v2-ld-ccb', [piece], 'outline');
    ic(c, areaPanel(c, ed, tcName(c, tc), c.d.eds[ed].tc[tc], '', { tc: tc }));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [edLabel(c, ed), function () { district(c, ed); }], [tcName(c, tc), null]]);
    G(c.win, 'fitFeats')(feats);
    after(c);
  }
  // 「⊞ 全選區村里」: every village of one district
  function villagesOfDistrict(c, ed) {
    begin(c, ['edvill', ed]);
    var T = c.win.T, feats = [];
    pieces(c, ed).forEach(function (f) { feats = feats.concat(pieceVillages(c, f)); });
    if (!feats.length) return;
    villageLayer(c, ed, feats, function (vc) { return tcName(c, vc.slice(0, 8)) + ' ' + vcName(c, vc); });
    var ef = edFeats(c).find(function (f) { return f.properties.ed === ed; });
    if (ef) border(c, 'v2-ld-ccb', [ef], 'outline');
    ic(c, districtPanel(c, ed));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [edLabel(c, ed), function () { district(c, ed); }], [T('全選區村里', 'All villages'), null]]);
    G(c.win, 'fitFeats')(feats);
    after(c);
  }
  // the engine's 「全台鄉鎮市區」/「全台村里」 buttons (#btn-tc-nat / #btn-vill-nat) would show its own 2016 results: in this
  // mode they open these instead — every township piece / village, each coloured by its own district's race
  function natTownships(c) {
    begin(c, ['nattc']);
    var T = c.win.T, feats = c.win.getTCGJ().features.filter(function (f) { return c.d.eds[f.properties.ed]; });
    blocks(c, feats, function (d) { var r = c.d.eds[d.properties.ed]; return fill(c, r, r.tc[d.properties.tc]); },
      function (e, d) { ic(c, areaPanel(c, d.properties.ed, tcName(c, d.properties.tc), c.d.eds[d.properties.ed].tc[d.properties.tc], '', { tc: d.properties.tc })); },
      function (e, d) { township(c, d.properties.ed, d); }, 'ft-tc');
    border(c, 'v2-ld-tcb', feats, 'tc');
    var edMesh = meshOf(c);
    if (edMesh) border(c, 'v2-ld-edb', [edMesh], 'outline');
    ic(c, nationalPanel(c).replace(/<div class="hint"[\s\S]*$/, '') + '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('移到鄉鎮查看資料，點選進入村里 ▶', 'Hover a township; click to enter its villages ▶') + '</div>');
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台鄉鎮市區', 'All townships'), null]]);
    zoomAll(c);
    after(c);
  }
  function natVillages(c) {
    begin(c, ['natvill']);
    var T = c.win.T, m = c.win.__v2VMap, eds = c.win.__v2VcEd2016;
    if (!m || !eds) return;
    var feats = [];
    m.geoms.forEach(function (g, i) { if (eds[i] && c.d.eds[eds[i]]) { var f = c.win.topojson.feature(c.VD, g); f.v2Ed = eds[i]; feats.push(f); } });
    blocks(c, feats, function (d) { var r = c.d.eds[d.v2Ed], v = villVec(r, d.properties.vc); return fill(c, r, v && v.vec); },
      function (e, d) {
        var vc = d.properties.vc, v = villVec(c.d.eds[d.v2Ed], vc);
        ic(c, areaPanel(c, d.v2Ed, tcName(c, vc.slice(0, 8)) + ' ' + vcName(c, vc), v && v.vec, '', { vc: vc }));
      }, null, 'ft-vill');
    c.gBase.selectAll('.v2-ld-blk').attr('stroke', 'none');
    var edMesh = meshOf(c);
    if (edMesh) border(c, 'v2-ld-edb', [edMesh], 'outline');
    ic(c, nationalPanel(c).replace(/<div class="hint"[\s\S]*$/, '') + '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('移到村里查看資料', 'Hover a village to view data') + '</div>');
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台村里', 'All villages'), null]]);
    zoomAll(c);
    after(c);
  }
  function hookButtons(win) {
    if (win.__v2LegDistBtn) return;
    win.__v2LegDistBtn = function (e) {
      var c = win.__v2LegDistCtx, b = e.target.closest && e.target.closest('#btn-tc-nat, #btn-vill-nat');
      if (!c || !b) return;
      e.stopPropagation(); e.preventDefault();
      if (b.id === 'btn-tc-nat') natTownships(c); else natVillages(c);
    };
    win.document.addEventListener('click', win.__v2LegDistBtn, true);   // capture: before the buttons' own onclick
    // the bar's copies of those buttons (navbar.js, 2026-10-30) run goTCAllNational() / goVillAllNational() directly, never
    // clicking the engine's buttons: with 2008 / 2012 on screen the engine then drew its own 2016 view and hid 政黨輪替分析
    // (user 2026-11-01: 「政黨輪替分析在全台村里跟全台鄉鎮市區就被隱藏且不能用了（區域立委的）」「在12年就是這樣」).
    // A bar click (__v2NavClick) opens this year's view; the engine's own calls keep the view on screen
    ['goTCAllNational', 'goVillAllNational'].forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function' || o.v2LegDistNav) return;
      var w = function () {
        var c = win.__v2LegDistCtx;
        if (!c) return o.apply(this, arguments);
        if (win.__v2NavClick) return n === 'goTCAllNational' ? natTownships(c) : natVillages(c);
        return redraw(c);
      };
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) w[k] = o[k];
      w.v2LegDistNav = true; win[n] = w;
    });
  }
  // ── 圓餅 / 激戰區域 (2008, 2012) and 政黨輪替分析 (2012 vs 2008; user 2026-10-28: 「政黨輪替分析加在2012(2008隱藏），
  // 圓餅、激戰區域加入08,12」). The engine's own controls and drawing are reused — #chk-pop / #chk-swing set its showPop /
  // showSwing and call redrawPies / redrawSwing, which are wrapped here to feed them this year's data (drawOnePie /
  // renderAllPies, the .swing-ov layer); the 政黨輪替分析 buttons are taken over (capture click) and follow the engine's
  // rules: 激戰 = margin ≤ 5 %; 翻盤 = the leading party differs from 2008; 搖擺地圖 = the change in (green − blue) % of
  // valid, coloured by the engine's ramp; flips coloured and counted as the engine does.
  var PREV = { '2012': '2008' };
  function camp(p) {
    if (['dpp', 'tsr', 'sdp', 'gp', 'spgp', 'npp', 'fa'].indexOf(p) >= 0) return 'green';
    if (['kmt', 'pfp', 'np', 'cup', 'cupp', 'cup2'].indexOf(p) >= 0) return 'blue';
    return p === 'tpp' ? 'white' : 'other';
  }
  // the unit a block stands for: [district, key, legislative vec]
  function unitOf(c, d, year) {
    var D = year ? dataFor(year) : c.d, v = c.view[0], ed, key, r, vec;
    if (v === 'nat') { ed = d.properties.ed; key = { ed: true }; }
    else if (v === 'ed' || v === 'nattc') { ed = d.properties.ed; key = { tc: d.properties.tc }; }
    else { ed = d.v2Ed || c.view[1]; key = { vc: d.properties.vc }; }
    r = D && D.eds[ed];
    if (!r) return null;
    if (key.ed) vec = r.ed; else if (key.tc) vec = r.tc[key.tc]; else { var x = villVec(r, key.vc); vec = x && x.vec; }
    return vec && vec[2] ? { r: r, ed: ed, key: key, vec: vec } : null;
  }
  function leadOf(u) { var t = ranked(u.r, u.vec)[0]; return t && t.v ? t.p : null; }
  function marginOf(u) { var s = ranked(u.r, u.vec); return s.length > 1 ? (s[0].v - s[1].v) / u.vec[2] : 1; }
  function netOf(u) {
    var g = 0, b = 0;
    ranked(u.r, u.vec).forEach(function (x) { var k = camp(x.p); if (k === 'green') g += x.v; else if (k === 'blue') b += x.v; });
    return (g - b) / u.vec[2] * 100;
  }
  function swingColor(win, m) {
    if (typeof win.overlayColorSwing === 'function') return win.overlayColorSwing(m);
    return null;
  }
  function flipColor(win, a, b) { return typeof win.overlayColorFlip === 'function' ? win.overlayColorFlip(a, b) : (a !== b ? '#aaaaaa' : null); }
  function isVillView(c) { return ['tc', 'edvill', 'natvill'].indexOf(c.view[0]) >= 0; }
  function isNatView(c) { return ['nat', 'nattc', 'natvill'].indexOf(c.view[0]) >= 0; }

  function pies(c) {
    var win = c.win; if (!G(win, 'showPop') || c.view[0] === 'natvill') return;
    var units = [];
    c.gBase.selectAll('.v2-ld-blk').each(function (d) { var u = unitOf(c, d); if (u) units.push([d, u]); });
    if (!units.length) return;
    var tots = units.map(function (x) { return x[1].vec[2]; }), max = Math.max.apply(null, tots);
    var baseR = c.view[0] === 'nat' ? 22 : c.view[0] === 'ed' ? 18 : c.view[0] === 'nattc' ? 10 : 13;
    var med = tots.slice().sort(function (a, b) { return a - b; })[Math.floor(tots.length / 2)];
    win.eval('_pieSpecs = []; _pieSizeInfo = ' + JSON.stringify({ medianTot: med, minTot: Math.min.apply(null, tots), maxTot: max, baseR: baseR }) + ';');
    units.forEach(function (x) {
      var u = x[1], segs = [], oth = 0;
      ranked(u.r, u.vec).forEach(function (y) {
        var pct = y.v / u.vec[2] * 100;
        if (y.p === 'dpp' || y.p === 'kmt' || pct >= 10) segs.push({ v: pct, c: segColor(win, y.p) }); else oth += pct;
      });
      if (oth > 0) segs.push({ v: oth, c: '#777' });
      win.drawOnePie(x[0], segs, u.vec[2], max, baseR);
    });
    win.renderAllPies();
  }
  function swingLayer(c) {
    var win = c.win, gSw = G(win, 'gSw');
    if (!gSw || !G(win, 'showSwing') || c.view[0] === 'nat') return;
    var feats = [];
    c.gBase.selectAll('.v2-ld-blk').each(function (d) { var u = unitOf(c, d); if (u && marginOf(u) <= 0.05) feats.push(d); });
    var sel = gSw.selectAll('path.v2-ld-sw').data(feats).join('path').attr('class', 'swing-ov v2-ld-sw').attr('d', c.pathFn);
    if (isVillView(c)) sel.attr('fill', '#FFB74D').attr('fill-opacity', 0.85);
  }
  function hookDraw(win) {
    ['redrawPies', 'redrawSwing'].forEach(function (n) {
      if (typeof win[n] !== 'function' || win[n].v2LegDist) return;
      var o = win[n];
      var w = function () {
        var c = win.__v2LegDistCtx;
        if (!c) return o.apply(this, arguments);
        if (n === 'redrawPies') { var gp = G(win, 'gPop'); if (gp) gp.selectAll('*').remove(); pies(c); }
        else { var gs = G(win, 'gSw'); if (gs) gs.selectAll('*').remove(); swingLayer(c); }
      };
      w.v2LegDist = true; win[n] = w;
    });
  }

  // 政黨輪替分析 (2012 only)
  function flipState(c) { return c.flip || (c.flip = { swingMask: false, flipMask: false, swingMap: false, overlay: null }); }
  function edUnit(c, year, ed) { var D = dataFor(year), r = D && D.eds[ed]; return r ? { r: r, ed: ed, key: { ed: true }, vec: r.ed } : null; }
  function masks(c) {
    var f = flipState(c), prev = PREV[c.year];
    if (!isNatView(c)) return;
    c.gBase.selectAll('.v2-ld-blk').attr('opacity', function (d) {
      if (!f.swingMask && !f.flipMask) return 1;
      var ed = d.properties.ed || d.v2Ed, u = edUnit(c, c.year, ed), p = prev && edUnit(c, prev, ed);
      if (!u) return 1;
      var sw = marginOf(u) <= 0.05, fl = p && leadOf(p) !== leadOf(u);
      return (f.swingMask && sw) || (f.flipMask && fl) ? 1 : 0.2;
    });
  }
  function overlays(c) {
    var f = flipState(c), win = c.win, prev = PREV[c.year];
    if (!prev || (!f.swingMap && !f.overlay)) return;
    var res = document.getElementById ? win.document.getElementById('flip-result') : null, flips = [];
    c.gBase.selectAll('.v2-ld-blk').each(function (d) {
      var u = unitOf(c, d), p = unitOf(c, d, prev), col;
      if (f.swingMap) col = (u && p) ? swingColor(win, netOf(u) - netOf(p)) : null;
      else {
        if (!u || !p) col = '#333';
        else {
          var a = leadOf(p), b = leadOf(u);
          col = flipColor(win, a, b) || '#555';
          if (a && b && a !== b) flips.push({ a: a, b: b });
        }
      }
      col = col || '#16161c';
      this.setAttribute('fill', col); this.setAttribute('stroke', col);
    });
    if (f.overlay && res) res.innerHTML = flipSummary(c, flips, f.overlay);
  }
  function flipSummary(c, flips, lvl) {
    var T = c.win.T, label = lvl === 'village' ? T('村里', 'villages') : T('鄉鎮區', 'townships');
    if (!flips.length) return '<div style="color:#999;padding:8px;text-align:center">' + T('沒有發現政黨輪替的', 'No party flips found in ') + label + '</div>';
    var G2 = function (p) { return camp(p) === 'green'; }, B2 = function (p) { return camp(p) === 'blue'; }, O = function (p) { return !G2(p) && !B2(p) && p !== 'tpp'; };
    var cnt = function (fn) { return flips.filter(fn).length; };
    var g2b = cnt(function (x) { return G2(x.a) && B2(x.b); }), b2g = cnt(function (x) { return B2(x.a) && G2(x.b); });
    var o2b = cnt(function (x) { return !G2(x.a) && !B2(x.a) && B2(x.b); }), o2g = cnt(function (x) { return !G2(x.a) && !B2(x.a) && G2(x.b); });
    var g2o = cnt(function (x) { return G2(x.a) && O(x.b); }), b2o = cnt(function (x) { return B2(x.a) && O(x.b); });
    var rest = flips.length - g2b - b2g - o2b - o2g - g2o - b2o;
    var part = function (n, color, zh, en) { return n > 0 ? '<span style="color:' + color + ';margin-left:4px">' + n + ' ' + T(zh, en) + '</span>' : ''; };
    return '<div style="font-size:10px;color:#444;font-weight:600">' + T('共', 'Total') + ' <b>' + flips.length + '</b> ' + T('個', '') + label + T('翻盤', ' flips') +
      part(g2b, '#1555b4', '綠→藍', 'Green→Blue') + part(b2g, '#1b9e4b', '藍→綠', 'Blue→Green') + part(o2b, '#6699cc', '其他→藍', 'Other→Blue') +
      part(o2g, '#66bb88', '其他→綠', 'Other→Green') + part(g2o, '#aaa', '綠→其他', 'Green→Other') + part(b2o, '#aaa', '藍→其他', 'Blue→Other') +
      part(rest, '#999', '其他', 'Other') + '</div>';
  }
  function flipBox(c) {
    var doc = c.win.document, box = doc.getElementById('flip-analysis-box'), on = !!PREV[c.year], f = flipState(c);
    doc.documentElement.classList.toggle('v2-legdist-noflip', !on);
    if (!box || !on) return;
    box.style.display = '';
    ['chk-swing-mask', 'btn-swing-map', 'chk-flip-mask', 'btn-flip-town', 'btn-flip-village'].forEach(function (id) {
      var b = doc.getElementById(id); if (!b) return;
      b.disabled = false; b.title = ''; b.style.opacity = ''; b.style.pointerEvents = '';
    });
    var set = function (id, v) { var b = doc.getElementById(id); if (b) b.classList.toggle('on', !!v); };
    set('chk-swing-mask', f.swingMask); set('chk-flip-mask', f.flipMask); set('btn-swing-map', f.swingMap);
    set('btn-flip-town', f.overlay === 'town'); set('btn-flip-village', f.overlay === 'village');
  }
  function after(c) {
    // 圓餅 / 激戰區域 row: below the 全台 district map, as the engine shows it (it gates on curED, which V2 leaves null)
    var row = c.win.document.getElementById('pie-swing-row');
    if (row) {
      row.style.display = c.view[0] === 'nat' ? 'none' : 'grid';
      ['chk-pop', 'chk-swing'].forEach(function (id) { var x = c.win.document.getElementById(id); if (x) { x.disabled = id === 'chk-pop' && c.view[0] === 'natvill'; } });
    }
    flipBox(c);
    masks(c);
    overlays(c);
    if (typeof c.win.redrawSwing === 'function') c.win.redrawSwing();
    if (typeof c.win.redrawPies === 'function') c.win.redrawPies();
  }
  function hookFlip(win) {
    if (win.__v2LegDistFlip) return;
    win.__v2LegDistFlip = function (e) {
      var c = win.__v2LegDistCtx, b = e.target.closest && e.target.closest('#chk-swing-mask, #btn-swing-map, #chk-flip-mask, #btn-flip-town, #btn-flip-village');
      if (!c || !b) return;
      e.stopPropagation(); e.preventDefault();
      var f = flipState(c), T = win.T, res = win.document.getElementById('flip-result');
      var msg = function (zh, en) { if (res) res.innerHTML = '<div style="color:#999;padding:8px;text-align:center;font-size:11px">' + T(zh, en) + '</div>'; };
      if (!PREV[c.year]) return;
      if (b.id === 'chk-swing-mask') f.swingMask = !f.swingMask;
      else if (b.id === 'chk-flip-mask') f.flipMask = !f.flipMask;
      else if (b.id === 'btn-swing-map') { f.swingMap = !f.swingMap; if (f.swingMap) f.overlay = null; return redraw(c); }
      else if (b.id === 'btn-flip-town') {
        if (f.overlay === 'town') { f.overlay = null; if (res) res.innerHTML = '<span style="color:#aaa">' + T('點擊按鈕查詢政黨輪替情形', 'Click button to view flip analysis') + '</span>'; return redraw(c); }
        if (c.view[0] !== 'ed' && c.view[0] !== 'nattc') return msg(c.view[0] === 'nat' ? '請先點選選區' : '請先進入鄉鎮區層級', c.view[0] === 'nat' ? 'Please select a district first' : 'Please go to town level first');
        f.overlay = 'town'; f.swingMap = false; return redraw(c);
      } else if (b.id === 'btn-flip-village') {
        if (f.overlay === 'village') { f.overlay = null; if (res) res.innerHTML = '<span style="color:#aaa">' + T('點擊按鈕查詢政黨輪替情形', 'Click button to view flip analysis') + '</span>'; return redraw(c); }
        if (c.view[0] === 'nat') return msg('請先點選選區', 'Please select a district first');
        f.overlay = 'village'; f.swingMap = false;
        if (c.view[0] === 'nattc') return natVillages(c);
        if (c.view[0] === 'ed' || c.view[0] === 'tc') return villagesOfDistrict(c, c.view[1]);
        return redraw(c);
      }
      flipBox(c); masks(c);
    };
    win.document.addEventListener('click', win.__v2LegDistFlip, true);
  }

  function redraw(c) {
    var v = c.view || ['nat'];
    if (v[0] === 'nattc') return natTownships(c);
    if (v[0] === 'natvill') return natVillages(c);
    if (v[0] === 'ed') district(c, v[1]);
    else if (v[0] === 'tc') { var p = pieces(c, v[1]).find(function (f) { return f.properties.tc === v[2]; }); if (p) township(c, v[1], p); else district(c, v[1]); }
    else if (v[0] === 'edvill') villagesOfDistrict(c, v[1]);
    else national(c);
  }

  function chrome(c) {
    var mt = c.win.document.getElementById('map-title');
    if (mt) mt.textContent = c.win.T(c.year + ' 台灣立委選舉儀表板', c.year + ' Taiwan Legislative Election Dashboard');   // the engine's title
  }
  // keep V2's map on top of the engine's deferred redraws (as history-legind.js)
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    var win = c.win;
    if (win.__v2LegDistKey !== c.key) return;
    chrome(c);
    var gB = G(win, 'gBase');
    if (G(win, 'curED') != null || gB.select('.v2-own').empty()) redraw(c);
  }
  function schedule(c) {
    (c.win.__v2LegDistTimers || []).forEach(clearTimeout);
    c.win.__v2LegDistTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }

  // ── the seat cards under the engine's 「區域 73 不分區 34 原民 6 總 113 ▾」 strip (#seat-summary-float): the engine fills
  // them from its own 2016 / 2020 / 2024 tables, so in 2008 / 2012 they are repainted here (user 2026-10-28: 「區域73不分區34
  // 那個要更新到2008,2012了」) — 區域 from LEGDIST seats, 不分區 from PL_NATIONAL_V2 (data_pl_national.js), 原住民 from
  // LEGDIST ind, 總 = all three; dots on the engine's own circles (left → right in camp order), chips in its sr-badge markup
  function seatList(seats) {
    var list = [];
    Object.keys(seats).sort(function (a, b) { return (ORDER[a] || 8) - (ORDER[b] || 8); })
      .forEach(function (p) { for (var i = 0; i < seats[p]; i++) list.push(p); });
    return list;
  }
  function chipsHtml(win, seats) {
    var logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    return Object.keys(seats).sort(function (a, b) { return (ORDER[a] || 8) - (ORDER[b] || 8); }).map(function (p) {
      var ico = logos[p] || '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="' + partyClr(win, p) + '"/></svg>';
      return '<div class="sr-badge" title="' + partyName(win, p) + '" style="display:inline-flex;align-items:center;gap:3px;margin:0 4px">' +
        '<span style="display:inline-block;width:12px;height:12px;transform:scale(0.8);transform-origin:center;vertical-align:middle;">' + ico + '</span>' +
        '<span class="sr-num" style="font-weight:700;font-size:11px;vertical-align:middle;color:' + partyClr(win, p) + '">' + seats[p] + '</span></div>';
    }).join('');
  }
  function paintDots(win, sel, list) {
    var dots = [].slice.call(win.document.querySelectorAll(sel)).sort(function (a, b) { return (+a.getAttribute('data-idx') || 0) - (+b.getAttribute('data-idx') || 0); });
    dots.forEach(function (el, i) {
      win.d3.select(el).interrupt();
      el.setAttribute('fill', list[i] ? partyClr(win, list[i]) : '#eee'); el.setAttribute('opacity', list[i] ? 1 : 0.2);
    });
  }
  function seatCards(c) {
    var win = c.win, doc = win.document, d = c.d;
    if (!d.ind) return;
    var pl = {};
    ((typeof PL_NATIONAL_V2 !== 'undefined' && PL_NATIONAL_V2[c.year]) || { parties: [] }).parties.forEach(function (x) { if (x[3]) pl[x[1]] = (pl[x[1]] || 0) + x[3]; });
    var ind = {}, indList = d.ind.p.concat(d.ind.m);
    indList.forEach(function (x) { ind[x[1]] = (ind[x[1]] || 0) + 1; });
    var total = {};
    [d.seats, pl, ind].forEach(function (t) { Object.keys(t).forEach(function (p) { total[p] = (total[p] || 0) + t[p]; }); });
    var set = function (id, html) { var el = doc.getElementById(id); if (el) el.innerHTML = html; };
    set('region-seat-ratio-display', chipsHtml(win, d.seats));
    set('pl-seat-ratio-display', chipsHtml(win, pl));
    set('total-seat-ratio-display', chipsHtml(win, total));
    var note = doc.getElementById('pl-year-note'); if (note) note.style.display = 'none';
    paintDots(win, '#region-hemi-svg circle.region-dot', seatList(d.seats));
    paintDots(win, '#pl-hemi-svg circle.pl-dot', seatList(pl));
    paintDots(win, '#total-hemi-svg circle.total-dot', seatList(total));
    indList.forEach(function (x, i) {
      var dot = doc.getElementById('ind-dot-' + i); if (dot) { win.d3.select(dot).interrupt(); dot.setAttribute('fill', partyClr(win, x[1])); dot.setAttribute('opacity', 1); }
      var b = doc.getElementById('ind-badge-' + i);
      if (b) { b.className = 'badge ' + (BADGE[x[1]] || 'bd-other'); b.textContent = typeof win.translateCandidate === 'function' ? win.translateCandidate(x[0]) : x[0]; }
    });
  }
  function hookEngine(win) {
    if (typeof win.updateHemicycle === 'function' && !win.updateHemicycle.v2LegDist) {
      var oh = win.updateHemicycle;
      var wh = function () { var r = oh.apply(this, arguments); var c = win.__v2LegDistCtx || win.__v2LegCardsCtx; if (c) seatCards(c); return r; };
      wh.v2LegDist = true; win.updateHemicycle = wh;
    }
    // 2016 / 2020 / 2024 (the engine's own map): its 全台 view gets the same 全台 panel (user 2026-10-28: 「這個在2016,2020,
    // 2024 都要有然後應該要加入一個全台層顯示這個且可以回去看的」) — goED is the 全台 crumb's own target
    if (typeof win.goED === 'function' && !win.goED.v2LegDist) {
      var og = win.goED;
      var wg = function () {
        var r = og.apply(this, arguments), y = win.__v2LegDistNatYear;
        if (y && !win.__v2LegDistKey && dataFor(y) && G(win, 'level') === 'ed' && G(win, 'curED') == null && G(win, 'mode') === 'winner') {
          var el = win.document.getElementById('ic');
          if (el) el.innerHTML = nationalPanel({ win: win, year: y, d: dataFor(y) });
        }
        return r;
      };
      wg.v2LegDist = true; win.goED = wg;
    }
  }
  // ── 連任 tags (×2 / 回鍋 / 新 / 連任失敗) counted from 2008 (user 2026-10-28: 「區域立委2016開始有的tag x2之類的從08開始算」).
  // The engine (test.html, untouched) tracks 2024 / 2020 / 2016 only (_LEG_YEARS_DESC) and shows no tag in 2016 ("no earlier
  // year"). In its iframe: 2012 and 2008 are appended to that list (a const array, extended in place), its county winner
  // sets for them come from LEGDIST (district winners whose townships are in the county), and _legTermBadgeSlot is
  // re-made from its own source with the first tracked year moved to 2008 (tooltips say 2008年起). 2008 / 2012 rows here
  // use the same slot.
  function extendTerms(win) {
    if (win.__v2LegTerms || typeof win._legTermBadgeSlot !== 'function' || typeof win._legWinnersInCounty !== 'function') return;
    var years = G(win, '_LEG_YEARS_DESC');
    if (!years || years.indexOf('2008') >= 0) return;
    win.__v2LegTerms = true;
    years.push('2012', '2008');
    var ow = win._legWinnersInCounty, cache = {};
    win._legWinnersInCounty = function (cc, y) {
      if (y !== '2008' && y !== '2012') return ow.apply(this, arguments);
      var k = cc + '|' + y; if (cache[k]) return cache[k];
      var set = new Set(), D = dataFor(y);
      Object.keys((D && D.eds) || {}).forEach(function (ed) {
        var r = D.eds[ed];
        if (!Object.keys(r.tc).some(function (tc) { return tc.indexOf(cc) === 0; })) return;
        r.cands.forEach(function (x) { if (x[2]) set.add(x[0]); });
      });
      return (cache[k] = set);
    };
    var src = win._legTermBadgeSlot.toString()
      .replace("yearLabel === '2016'", "yearLabel === '2008'")
      .replace(/2016年起/g, '2008年起').replace(/tracked from 2016/g, 'tracked from 2008');
    try { win._legTermBadgeSlot = win.eval('(' + src + ')'); } catch (e) { if (win.console) win.console.warn('[V2] term badges from 2008 skipped:', e); }
  }
  function termSlot(c, ed, x) {
    var f = c.win._legTermBadgeSlot;
    return typeof f === 'function' ? f(ed, x.n, !!x.e, true, c.year) : '';
  }

  // ── 2016's 政黨輪替分析 (vs 2012) on the engine's own map (user 2026-10-28: 「2016也要有政黨輪替分析捲軸工具」). The engine
  // disables the box in 2016 (no earlier year in its data). Here its five buttons are taken over in 2016 and applied to
  // the engine's blocks (.ft-ed / .ft-tc / .ft-vill) at whatever level it shows, with the same rules as 2012: 2016 from
  // the engine's ED_2016 / TC_2016 / VC_2016, 2012 from LEGDIST (same district names: 2012 was fought on the 2016 lines).
  // Re-applied after each engine redraw (goED / goTC / goVill… wrapped); all off → the engine's setMode('winner') redraws.
  function u16(cands, tot) {
    if (!cands || !tot) return null;
    var s = cands.slice().sort(function (a, b) { return b.v - a.v; }), g = 0, b = 0;
    cands.forEach(function (x) { var k = camp(x.p); if (k === 'green') g += x.v; else if (k === 'blue') b += x.v; });
    return { lead: s[0] && s[0].v ? s[0].p : null, margin: s.length > 1 ? (s[0].v - s[1].v) / tot : 1, net: (g - b) / tot * 100 };
  }
  function u12(ed, key) {
    var D = dataFor('2012'), r = D && D.eds[ed]; if (!r) return null;
    var vec = key.ed ? r.ed : key.tc ? r.tc[key.tc] : (function () { var x = villVec(r, key.vc); return x && x.vec; })();
    if (!vec || !vec[2]) return null;
    var u = { r: r, vec: vec };
    return { lead: leadOf(u), margin: marginOf(u), net: netOf(u) };
  }
  function units16(win) {
    var lvl = G(win, 'level'), cur = G(win, 'curED'), g = G(win, 'gBase'), out = [];
    if (!g) return { lvl: lvl, nat: false, list: out };
    var E = G(win, 'ED_2016') || {}, TC = G(win, 'TC_2016') || {}, VC = G(win, 'VC_2016') || {}, m = win.__v2VMap, eds = win.__v2VcEd2016;
    var sel = lvl === 'ed' ? '.ft-ed' : lvl === 'tc' ? '.ft-tc' : '.ft-vill';
    g.selectAll(sel).each(function (d) {
      if (!d || !d.properties) return;
      var p = d.properties, ed, now, prev;
      if (lvl === 'ed') { ed = p.ed; var e = E[ed]; now = e && u16(e.cands, e.tot); prev = u12(ed, { ed: true }); }
      else if (lvl === 'tc') { ed = cur || p.ed; var t = TC[ed + '__' + p.tc]; now = t && u16(t.cands, t.tot); prev = u12(ed, { tc: p.tc }); }
      else {
        var i = m && m.byVc()[p.vc]; ed = cur || (eds && i != null ? eds[i] : null);
        var v = VC[p.vc]; now = v && u16(v.cands, v.tot); prev = ed ? u12(ed, { vc: p.vc }) : null;
      }
      out.push({ el: this, ed: ed, now: now, prev: prev });
    });
    return { lvl: lvl, nat: lvl === 'ed' || !cur, list: out };
  }
  function apply16(win) {
    var f = win.__v2Flip16; if (!f) return;
    var doc = win.document, box = doc.getElementById('flip-analysis-box');
    if (box) box.style.display = '';
    ['chk-swing-mask', 'btn-swing-map', 'chk-flip-mask', 'btn-flip-town', 'btn-flip-village'].forEach(function (id) {
      var b = doc.getElementById(id); if (b) { b.disabled = false; b.title = ''; b.style.opacity = ''; b.style.pointerEvents = ''; }
    });
    var set = function (id, v) { var b = doc.getElementById(id); if (b) b.classList.toggle('on', !!v); };
    set('chk-swing-mask', f.swingMask); set('chk-flip-mask', f.flipMask); set('btn-swing-map', f.swingMap);
    set('btn-flip-town', f.overlay === 'town'); set('btn-flip-village', f.overlay === 'village');
    var U = units16(win), flips = [];
    // district-level facts for the masks (national views)
    var E = G(win, 'ED_2016') || {}, edFact = function (ed) {
      var e = E[ed], now = e && u16(e.cands, e.tot), prev = u12(ed, { ed: true });
      return { sw: now && now.margin <= 0.05, fl: now && prev && now.lead && prev.lead && now.lead !== prev.lead };
    };
    U.list.forEach(function (x) {
      if (U.nat && (f.swingMask || f.flipMask)) {
        var fa = x.ed ? edFact(x.ed) : { sw: true, fl: true };
        x.el.setAttribute('opacity', (f.swingMask && fa.sw) || (f.flipMask && fa.fl) ? 1 : 0.2);
      } else if (U.nat) x.el.setAttribute('opacity', 1);
      if (!f.swingMap && !f.overlay) return;
      var col;
      if (f.swingMap) col = x.now && x.prev ? swingColor(win, x.now.net - x.prev.net) : null;
      else if (!x.now || !x.prev) col = '#333';
      else { col = flipColor(win, x.prev.lead, x.now.lead) || '#555'; if (x.prev.lead !== x.now.lead) flips.push({ a: x.prev.lead, b: x.now.lead }); }
      if (!x.el.__v2Orig16) x.el.__v2Orig16 = { f: x.el.style.fill, s: x.el.style.stroke };   // put back when switched off
      x.el.style.fill = col || '#16161c';
      if (x.el.style.stroke) x.el.style.stroke = col || '#16161c';   // V2TcBorder strokes blocks in their own fill
    });
    var gl = G(win, 'gGlow');
    if (U.lvl === 'ed' && gl) gl.selectAll('.glow-core').attr('opacity', (f.swingMap || f.overlay) ? 0 : null);
    var res = doc.getElementById('flip-result');
    if (f.overlay && res) res.innerHTML = flipSummary({ win: win }, flips, f.overlay);
  }
  function hook16(win) {
    if (win.__v2Flip16Hooked) return;
    win.__v2Flip16Hooked = true;
    ['goED', 'goTC', 'goVill', 'goVillAll', 'goTCAllNational', 'goVillAllNational', 'setMode'].forEach(function (n) {
      if (typeof win[n] !== 'function') return;
      var o = win[n];
      var w = function () { var r = o.apply(this, arguments); if (win.__v2Flip16) setTimeout(function () { apply16(win); }, 60); return r; };
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) w[k] = o[k];
      win[n] = w;
    });
    win.document.addEventListener('click', function (e) {
      var f = win.__v2Flip16, b = e.target.closest && e.target.closest('#chk-swing-mask, #btn-swing-map, #chk-flip-mask, #btn-flip-town, #btn-flip-village');
      if (!f || !b || win.__v2LegDistCtx) return;
      e.stopPropagation(); e.preventDefault();
      var T = win.T, res = win.document.getElementById('flip-result'), lvl = G(win, 'level'), cur = G(win, 'curED');
      var msg = function (zh, en) { if (res) res.innerHTML = '<div style="color:#999;padding:8px;text-align:center;font-size:11px">' + T(zh, en) + '</div>'; };
      var idle = '<span style="color:#aaa">' + T('點擊按鈕查詢政黨輪替情形', 'Click button to view flip analysis') + '</span>';
      var restore = function () {
        var g = G(win, 'gBase');
        if (g) g.selectAll('.ft-ed, .ft-tc, .ft-vill').each(function () {
          var o = this.__v2Orig16; if (!o) return;
          this.style.fill = o.f; this.style.stroke = o.s; this.__v2Orig16 = null;
        });
        win.setMode('winner');
      };
      if (b.id === 'chk-swing-mask') f.swingMask = !f.swingMask;
      else if (b.id === 'chk-flip-mask') f.flipMask = !f.flipMask;
      else if (b.id === 'btn-swing-map') { f.swingMap = !f.swingMap; if (f.swingMap) f.overlay = null; else return restore(); }
      else if (b.id === 'btn-flip-town') {
        if (f.overlay === 'town') { f.overlay = null; if (res) res.innerHTML = idle; return restore(); }
        if (lvl === 'ed') return msg('請先點選選區', 'Please select a district first');
        if (lvl !== 'tc') return msg('請先進入鄉鎮區層級', 'Please go to town level first');
        f.overlay = 'town'; f.swingMap = false;
      } else {
        if (f.overlay === 'village') { f.overlay = null; if (res) res.innerHTML = idle; return restore(); }
        if (lvl === 'ed') return msg('請先點選選區', 'Please select a district first');
        f.overlay = 'village'; f.swingMap = false;
        if (lvl !== 'vill' || !G(win, 'villAllMode')) { if (cur) win.goVillAll(cur); else win.goVillAllNational(); return; }
      }
      apply16(win);
    }, true);
  }

  // History calls this for 2016 / 2020 / 2024 区域 (null for every other mode)
  function setNationalYear(win, year) {
    hookEngine(win);
    extendTerms(win);
    hook16(win);
    win.__v2Flip16 = year === '2016' ? { swingMask: false, flipMask: false, swingMap: false, overlay: null } : null;
    if (year === '2016') setTimeout(function () { apply16(win); }, 80);
    win.__v2LegDistNatYear = year || null;
    if (year && G(win, 'level') === 'ed' && G(win, 'curED') == null) win.goED();
  }

  function draw(win, year) {
    clear(win);
    var d = dataFor(year), CD = G(win, 'CD'), VD = G(win, 'VD');
    if (!d || !CD || !VD) return 0;
    var c = { win: win, year: year, d: d, CD: CD, VD: VD, key: 'ld' + year };
    win.getEDGJ(); win.getTCGJ();   // the engine is on winnerYear '2016': V2TcBorder rebuilds both sets on first use
    win.__v2LegDistKey = c.key;
    win.__v2LegDistCtx = c;
    hookButtons(win);
    hookEngine(win);
    hookDraw(win);
    hookFlip(win);
    extendTerms(win);
    national(c);
    seatCards(c);
    chrome(c);
    schedule(c);
    win.__v2LegDistResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2LegDistResize);
    win.document.addEventListener('fullscreenchange', win.__v2LegDistResize);
    return Object.keys(d.eds).length;
  }
  function clear(win) {
    if (win.__v2LegDistResize) {
      win.removeEventListener('resize', win.__v2LegDistResize);
      win.document.removeEventListener('fullscreenchange', win.__v2LegDistResize);
      win.__v2LegDistResize = null;
    }
    (win.__v2LegDistTimers || []).forEach(clearTimeout);
    win.__v2LegDistTimers = [];
    var was = !!win.__v2LegDistKey;
    win.document.documentElement.classList.remove('v2-legdist-noflip');
    if (was) { var gp = G(win, 'gPop'), gs = G(win, 'gSw'); if (gp) gp.selectAll('*').remove(); if (gs) gs.selectAll('*').remove(); }
    win.__v2LegDistKey = null;
    win.__v2LegDistCtx = null;
    win.__v2LegCardsCtx = null;
    win.__v2LegDistNatYear = null;
    win.__v2Flip16 = null;
    if (was && typeof win.updateHemicycle === 'function') { try { win.updateHemicycle(0); } catch (e) {} }   // the engine's own seat cards back
    return was;   // true: V2's map is still on screen, the caller must have the engine redraw (2008 → 2016 changes no engine state)
  }
  // 2008 / 2012 seat cards under the 不分區 / 原住民 maps (user 2026-10-31: 「四張圖要按照年的不同更新」): the engine only
  // knows 2016–2024, so its cards would stay on its own year — fill them from LEGDIST and keep them on re-render
  function cards(win, year) {
    var d = dataFor(year);
    win.__v2LegCardsCtx = null;
    if (!d || !d.ind) return false;
    hookEngine(win);
    win.__v2LegCardsCtx = { win: win, year: year, d: d };
    seatCards(win.__v2LegCardsCtx);
    return true;
  }
  window.V2LegDist = { draw: draw, clear: clear, setNationalYear: setNationalYear, cards: cards };
})();
