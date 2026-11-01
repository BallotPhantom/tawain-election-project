/* History → 全國 → 立委 → 區域選區, 舊制 第3–6屆: 1995 / 1998 / 2001 / 2004 (user 2026-11-01: 「立委舊制就只做ED層跟半圓形圖
 * 鄉鎮市區及以下不做（因為沒可比性）」; 不分區 / 僑選 with no verifiable party split: 「沒的話就沒資料但是不給按」「只畫圖就好了」).
 *
 * In history-legdist.js's design (the engine's 2016 map state underneath, V2 draws the year): 全台 = one block per district,
 * each the townships it covered (today's map — CEC's elbase rows, build_v2_oldleg.py), merged from the village map; district
 * lines between blocks + white county lines (V2TcBorder, as history-legdist.js national()); the yellow hover outline and
 * the engine's county dim mask; the panel in the engine's legislative row markup. The races were multi-member (SNTV), so a
 * block is filled as 縣市議員's 政黨比例 rule — the first party's votes minus the second's, of the valid votes — on the
 * engine's winMarginFill / PARTY_COLOR_MAP. No drill-down: a click does nothing, 全台鄉鎮市區 / 全台村里 are disabled.
 * Seat cards (the map's left): 區域 and 原住民 redrawn for that year's seat count (the engine's buildHemiSeats geometry,
 * camp order); 不分區 / 總席次 say 無資料 and do not switch the map.
 * Data: OLD_LEG (v2/data_oldleg.js, tests/reconcile_v2_oldleg.py). V2OldLeg.draw(win, year) / V2OldLeg.clear(win).
 */
(function () {
  var NO_DATA_FILL = '#e0e0e0';   // the engine's no-data grey (history-legdist.js)
  var IND_CLR = '#888888';
  var ORDER = { dpp: 1, tsr: 2, gp: 3, sdp: 4, npp: 5, tsu: 6, ind: 7, other: 8, npsu: 9, tpp: 10, pfp: 11, np: 12, kmt: 13 };
  var BADGE = { dpp: 'bd-green', kmt: 'bd-blue', tpp: 'bd-white', tsr: 'bd-tsr', npp: 'bd-npp', pfp: 'bd-pfp', tsu: 'bd-tsu', np: 'bd-np', npsu: 'bd-npu' };
  var YEARS = ['1995', '1998', '2001', '2004'];

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(year) { return (typeof OLD_LEG !== 'undefined' ? OLD_LEG : {})[year] || null; }
  function partyClr(win, p) { var M = G(win, 'PARTY_COLOR_MAP') || {}; return M[p] || IND_CLR; }
  function partyName(win, p) {
    var M = G(win, 'PARTY_NAME_MAP') || {};
    return M[p] || (p === 'ind' ? win.T('無黨籍', 'Independent') : win.T('其他', 'Other'));
  }
  function ranked(e) {
    return e.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], v: e.v[3 + i] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function partyVotes(e) {
    var pv = {};
    ranked(e).forEach(function (x) { pv[x.p] = (pv[x.p] || 0) + x.v; });
    return Object.keys(pv).map(function (p) { return [p, pv[p]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function seatsOf(list) { var s = {}; list.forEach(function (x) { if (x[2]) s[x[1]] = (s[x[1]] || 0) + 1; }); return s; }
  function fill(c, e) {
    if (!e || !e.v[2]) return NO_DATA_FILL;
    var pr = partyVotes(e);
    return c.win.winMarginFill(pr[0][0], (pr[0][1] - (pr[1] ? pr[1][1] : 0)) / e.v[2], partyClr(c.win, pr[0][0]));
  }

  // ── names ──
  function multi(c, e) { return c.d.eds.filter(function (x) { return x.n === e.n; }).length > 1; }
  function edName(c, e) {
    var T = c.win.T, n = typeof c.win.translateCounty === 'function' ? T(e.n, c.win.translateCounty(e.n) || e.n) : e.n;
    return multi(c, e) ? n + T('第' + (+e.a) + '選區', ' District ' + (+e.a)) : n;
  }
  function raceName(c) { return c.year + ' ' + c.win.T('第' + c.d.term + '屆區域立委', (['', '', '', '3rd', '4th', '5th', '6th'][+c.d.term]) + ' LY, districts'); }

  // ── panels (test.html's legislative row markup, as history-legdist.js rowsHtml) ──
  function rowsHtml(c, e) {
    var win = c.win, logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    return ranked(e).map(function (x) {
      var pct = e.v[2] ? x.v / e.v[2] * 100 : 0;
      var ns = x.e ? 'font-weight:700;color:#e8eaed' : 'color:#777';
      var check = x.e ? '<span style="color:#2ebd59;font-weight:bold;margin-right:2px">&#10004;</span>' : '';
      var ico = logos[x.p] ? '<span style="display:inline-block;width:12px;height:12px;flex-shrink:0;vertical-align:middle;">' + logos[x.p] + '</span>' : '';
      var nm = typeof win.translateCandidate === 'function' ? win.translateCandidate(x.n) : x.n;
      return '<div class="bar-row"><div class="blb" style="border-right:none;' + ns + '" title="' + x.n + '（' + partyName(win, x.p) + '）">' + check + nm + '</div>' + ico +
        '<div class="bbg"><div class="bfill" style="width:' + pct.toFixed(1) + '%;background:' + partyClr(win, x.p) + ';opacity:' + (x.e ? '1' : '0.4') + '"></div></div>' +
        '<div class="bpct" style="' + ns + '">' + pct.toFixed(1) + '%</div><div class="bvote" style="' + ns + '">' + x.v.toLocaleString() + '</div></div>';
    }).join('');
  }
  function turnoutLine(win, v) {
    if (!v[0] || !v[1]) return '';
    return '<div style="margin-bottom:6px">' + win.turnoutBadgeHtml(v[1] / v[0] * 100, (v[1] - v[2]) / v[1] * 100) + '</div>';
  }
  // the district's seats by party: the sr-badge chips of the seat cards (history-legdist.js chipsHtml)
  function chipsHtml(win, seats) {
    var logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : {}") || {};
    // 2001 / 2004 hold 6–7 parties: tighter chips keep them on one line, so the card keeps its title (as the engine's cards)
    var m = Object.keys(seats).length > 5 ? '0 1px' : '0 4px';
    return Object.keys(seats).sort(function (a, b) { return (ORDER[a] || 8) - (ORDER[b] || 8); }).map(function (p) {
      var ico = logos[p] || '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="' + partyClr(win, p) + '"/></svg>';
      return '<div class="sr-badge" title="' + partyName(win, p) + '" style="display:inline-flex;align-items:center;gap:2px;margin:' + m + '">' +
        '<span style="display:inline-block;width:12px;height:12px;transform:scale(0.8);transform-origin:center;vertical-align:middle;">' + ico + '</span>' +
        '<span class="sr-num" style="font-weight:700;font-size:11px;vertical-align:middle;color:' + partyClr(win, p) + '">' + seats[p] + '</span></div>';
    }).join('');
  }
  function districtPanel(c, e) {
    var T = c.win.T, n = e.cands.filter(function (x) { return x[2]; }).length;
    return '<div class="t1">' + edName(c, e) + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px">' + raceName(c) + T('・應選 ' + n + ' 席', ' · ' + n + (n === 1 ? ' seat' : ' seats')) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;margin:6px 0 0">' + chipsHtml(c.win, seatsOf(e.cands)) + '</div>' +
      miniHemi(c.win, e) +
      turnoutLine(c.win, e.v) +
      '<div style="max-height:360px;overflow-y:auto">' + rowsHtml(c, e) + '</div>';
  }
  function nationalPanel(c) {
    var T = c.win.T;
    return '<div class="t1">' + T('全台', 'All Taiwan') + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px">' + raceName(c) + T('・' + c.d.eds.length + ' 個複數選區，應選 ' + c.d.seats.r + ' 席', ' · ' + c.d.eds.length + ' multi-member districts, ' + c.d.seats.r + ' seats') + '</div>' +
      '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + T('移到選區查看資料（舊制複數選區：鄉鎮市區以下無可比性，不提供）', 'Hover a district (old multi-member system: no township / village level — not comparable)') + '</div>';
  }

  // ── the map ──
  function fresh(c) { c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.svg = G(c.win, 'svg'); }
  function ic(c, html) { var el = c.win.document.getElementById('ic'); if (el) el.innerHTML = html; }
  function hov(c) {
    var layer = c.gBase.node();
    if (!c.hov || c.hovLayer !== layer) { c.hov = window.V2TcBorder.hover(c.win, layer, 'v2-blk-hov'); c.hovLayer = layer; }
    return c.hov;
  }
  function border(c, cls, data, kind) { window.V2TcBorder.lines(c.gBase, c.pathFn, cls, data, kind).classed('v2-ld-line', true); }
  // district of every village (by its township), and each district's merged shape
  function shapes(c) {
    if (c.shapes) return c.shapes;
    var VD = c.VD, tcOf = {}, ccName = {};
    c.d.eds.forEach(function (e, i) { e.tcs.forEach(function (tc) { tcOf[tc] = i; }); });
    G(c.win, 'topojson').feature(c.CD, c.CD.objects.counties).features.forEach(function (f) { ccName[f.properties.cc] = f.properties.cn; });
    var groups = c.d.eds.map(function () { return []; }), idx = new Map();
    VD.objects.villages.geometries.forEach(function (g) {
      var vc = g.properties && g.properties.vc, i = vc != null ? tcOf[String(vc).slice(0, 8)] : undefined;
      if (i === undefined) return;
      groups[i].push(g); idx.set(g, i);
    });
    var tj = c.win.topojson;
    // the shared merge (V2TcBorder.merged — VD's gaps filled, as every other layer; user 2026-11-01: 「04年之類的就會有一堆點點小洞」)
    var feats = c.d.eds.map(function (e, i) { return { type: 'Feature', properties: { i: i, cn: ccName[e.mc] }, geometry: window.V2TcBorder.merged(c.win, VD, groups[i]) }; });
    var mesh = tj.mesh(VD, VD.objects.villages, function (a, b) { return a !== b && idx.has(a) && idx.has(b) && idx.get(a) !== idx.get(b); });
    c.shapes = { feats: feats, mesh: mesh };
    return c.shapes;
  }
  function national(c) {
    fresh(c);
    var win = c.win, T = win.T;
    win.eval("level = 'ed'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var S = shapes(c);
    c.gBase.selectAll('.v2-ol-blk').data(S.feats).join('path')
      .attr('class', 'ft v2-ol-blk v2-own').attr('d', c.pathFn)
      .style('animation', 'none')
      .attr('fill', function (f) { return fill(c, c.d.eds[f.properties.i]); })
      .attr('stroke', function (f) { return fill(c, c.d.eds[f.properties.i]); })
      .attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', 'default')
      .on('mouseover', function (ev, f) {
        hov(c).show(this.getAttribute('d'));
        if (typeof win._setCountyDim === 'function') win._setCountyDim(f.properties.cn);   // the engine's county dim (goED's mouseover)
        ic(c, districtPanel(c, c.d.eds[f.properties.i]));
      })
      .on('mouseleave', function () { hov(c).hide(); if (typeof win._clearCountyDim === 'function') win._clearCountyDim(); });
    border(c, 'v2-ld-edb', [S.mesh], 'tc');
    border(c, 'v2-ld-ccb', [win.topojson.mesh(c.CD, c.CD.objects.counties, function (a, b) { return a !== b; })], 'outline');
    ic(c, nationalPanel(c));
    var cr = win.document.getElementById('crumb');
    if (cr) { cr.innerHTML = '<span class="cl">' + T('全台', 'All') + '</span>'; cr.firstChild.onclick = function () { national(c); }; }
    if (c.svg) { c.svg.transition().duration(380).call(G(win, 'zm').transform, win.d3.zoomIdentity); try { win.eval('curK = 1'); } catch (e) {} }
    navOff(c);
  }
  // 全台鄉鎮市區 / 全台村里: disabled (navbar.js copies the engine buttons' disabled state)
  function navOff(c) {
    ['btn-tc-nat', 'btn-vill-nat'].forEach(function (id) {
      var b = c.win.document.getElementById(id); if (!b) return;
      b.disabled = true; b.style.opacity = '.35'; b.style.cursor = 'default';
    });
  }
  function navOn(win) {
    ['btn-tc-nat', 'btn-vill-nat'].forEach(function (id) {
      var b = win.document.getElementById(id); if (!b) return;
      b.disabled = false; b.style.opacity = ''; b.style.cursor = '';
    });
  }

  // ── seat cards (user 2026-11-01: 「舊制的應該設計包括半圓形跟分類（僑選不分區）等等等要分開畫分開填的」) ──
  // test.html's buildHemiSeats, generalised to n seats: `rows` arcs from radius r0 by `step` around (cx, cy), each arc's
  // share of the seats in proportion to its radius, left → right by angle (the engine's seat order)
  function hemiSeats(n, rows, cx, cy, r0, step) {
    var R = [], tot = 0, i;
    rows = Math.max(1, Math.min(rows, n));
    for (i = 0; i < rows; i++) { R.push(r0 + i * step); tot += r0 + i * step; }
    var cnt = R.map(function (r) { return Math.max(1, Math.round(n * r / tot)); }), diff = n - cnt.reduce(function (a, b) { return a + b; }, 0);
    cnt[rows - 1] += diff;
    var seats = [];
    R.forEach(function (r, row) {
      var k = cnt[row];
      for (var j = 0; j < k; j++) { var ang = k > 1 ? Math.PI - j / (k - 1) * Math.PI : Math.PI / 2; seats.push({ ang: ang, cx: cx + r * Math.cos(ang), cy: cy - r * Math.sin(ang) }); }
    });
    seats.sort(function (a, b) { return b.ang - a.ang; });
    return seats;
  }
  // the engine's card look for any n (user 2026-11-01: 「舊制的區域立委跟總席次的半圓形圖還是跟08集以後長得不同」): the same
  // band as its card (radius rIn → rOut around cx, cy), as many rows as keep its packing — along-arc spacing ≈ 0.78 of the
  // row step (its 73 / 113 cards: 0.76 / 0.78) — and the dot radius at its 0.42 of that spacing (3.5 on 8.35, 3.6 on 8.62)
  function packed(n, cx, cy, rIn, rOut) {
    var best = 2, bd = 1e9;
    for (var k = 2; k <= 14; k++) {
      var step = (rOut - rIn) / (k - 1), arc = 0;
      for (var i = 0; i < k; i++) arc += Math.PI * (rIn + i * step);
      var dd = Math.abs(arc / n / step - 0.78);
      if (dd < bd) { bd = dd; best = k; }
    }
    if (n < best * 2) best = Math.max(1, Math.floor(n / 2));
    var st = best > 1 ? (rOut - rIn) / (best - 1) : 0, tot = 0;
    for (var j = 0; j < best; j++) tot += Math.PI * (rIn + j * st);
    // never bigger than the engine's own dots (3.5–3.8) by much: a few seats stay small dots, not balls
    return { pts: hemiSeats(n, best, cx, cy, best > 1 ? rIn : (rIn + rOut) / 2, st), r: Math.min(0.42 * tot / n, best > 1 ? 0.48 * st : 9, 4.5) };
  }
  // a seat list in camp order; null = a seat with no verifiable party (grey), kept in the middle with 無黨籍 / 其他
  function seatList(seats, unknown) {
    var keys = Object.keys(seats).concat(unknown ? ['?'] : []), list = [];
    keys.sort(function (a, b) { return (a === '?' ? 8.5 : ORDER[a] || 8) - (b === '?' ? 8.5 : ORDER[b] || 8); })
      .forEach(function (p) { var k = p === '?' ? unknown : seats[p]; for (var i = 0; i < k; i++) list.push(p === '?' ? null : p); });
    return list;
  }
  var UNKNOWN = '#5b6270';   // a seat drawn, its party not filled (no verifiable source)
  function dotsSvg(win, pts, list, r) {
    return pts.map(function (s, i) {
      var p = list[i];
      return '<circle class="v2-ol-dot" cx="' + s.cx.toFixed(2) + '" cy="' + s.cy.toFixed(2) + '" r="' + r + '" fill="' + (p ? partyClr(win, p) : UNKNOWN) + '" stroke="' + (p ? '#fff' : 'rgba(255,255,255,.35)') + '" stroke-width="0.4"></circle>';
    }).join('');
  }
  function addSeats(t, s) { Object.keys(s).forEach(function (p) { t[p] = (t[p] || 0) + s[p]; }); return t; }
  function cardOf(doc, id) { var el = doc.getElementById(id); return el && el.closest('.stats-card'); }
  // n: the seat count, drawn at the arc's foot inside the svg (the engine's .hemi-center-lbl look) so it scales with it
  function drawSvg(doc, id, w, h, html, n) {
    var svg = doc.getElementById(id); if (!svg) return;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.innerHTML = html + (n != null ? '<text x="' + w / 2 + '" y="' + (h - 3) + '" font-size="' + Math.round(h * 0.17) + '" fill="rgba(255,255,255,0.85)" font-weight="800" text-anchor="middle">' + n + '</text>' : '');
  }
  function seatCards(c) {
    var win = c.win, doc = win.document, d = c.d, T = win.T, S = d.seats;
    var hr = doc.getElementById('hemi-row'); if (!hr) return;
    if (win.__v2OldLegCards == null) win.__v2OldLegCards = hr.innerHTML;   // the engine's own cards, put back by clear()
    var set = function (id, html) { var el = doc.getElementById(id); if (el) el.innerHTML = html; };
    // 區域: every district's elected, by party
    var rs = {}; d.eds.forEach(function (e) { addSeats(rs, seatsOf(e.cands)); });
    set('region-seat-ratio-display', chipsHtml(win, rs));
    set('region-hemi-center', String(S.r));
    var H = packed(S.r, 90, 80, 32, 65);   // REGION_SEATS' band
    drawSvg(doc, 'region-hemi-svg', 180, 90, dotsSvg(win, H.pts, seatList(rs), H.r.toFixed(2)), S.r);
    // 不分區: its seats (憲法增修條文) by party — computed by the rule of the time (build_v2_oldleg.party_list); no map of
    // its own, so not a button
    var pc = cardOf(doc, 'pl-hemi-svg');
    if (pc) { pc.classList.add('v2-ol-nodata'); pc.title = T('依當年法定公式（各黨區域＋原住民得票、5% 門檻、最大餘數）由中選會票數推算', 'Computed by the rule of the time from CEC votes'); }
    set('pl-seat-ratio-display', chipsHtml(win, d.pl));
    set('pl-hemi-center', String(S.pl));
    H = packed(S.pl, 80, 70, 25, 47);   // PL_SEATS' band
    drawSvg(doc, 'pl-hemi-svg', 160, 80, dotsSvg(win, H.pts, seatList(d.pl), H.r.toFixed(2)), S.pl);
    var note = doc.getElementById('pl-year-note'); if (note) note.style.display = 'none';
    // 僑選: its own card after 不分區 (the engine has none — 2008 on it is one list with 不分區)
    var oc = doc.getElementById('v2-ol-ovcard');
    if (!oc && pc) {
      oc = doc.createElement('div'); oc.id = 'v2-ol-ovcard'; oc.className = 'stats-card v2-ol-nodata';   // no map: not a button
      oc.innerHTML = '<div class="card-title" style="text-align:center;display:flex;justify-content:center;width:100%"><span id="v2-ol-ov-title"></span></div>' +
        '<div class="seat-ratio-row" id="v2-ol-ov-ratio" style="display:flex;justify-content:center;width:100%"></div>' +
        '<div class="svg-container"><svg id="v2-ol-ov-svg"></svg><div class="hemi-center-lbl" id="v2-ol-ov-center"></div></div>';
      pc.parentNode.insertBefore(oc, pc.nextSibling);
    }
    set('v2-ol-ov-title', T('僑居國外國民', 'Overseas Compatriots'));
    if (oc) oc.title = pc ? pc.title : '';
    set('v2-ol-ov-ratio', chipsHtml(win, d.ov));
    set('v2-ol-ov-center', String(S.ov));
    H = packed(S.ov, 80, 70, 25, 47);
    drawSvg(doc, 'v2-ol-ov-svg', 160, 80, dotsSvg(win, H.pts, seatList(d.ov), H.r.toFixed(2)), S.ov);
    // 原住民: 3 + 3 (1995) or 4 + 4 seats, the elected of each nationwide race
    var ip = d.ind.p.cands.filter(function (x) { return x[2]; }), im = d.ind.m.cands.filter(function (x) { return x[2]; }), all = ip.concat(im);
    var isvg = doc.getElementById('ind-svg');
    if (isvg) {
      var per = Math.max(ip.length, im.length), xs = [], i;
      for (i = 0; i < per; i++) xs.push(per === 1 ? 40 : 10 + i * 60 / (per - 1));
      isvg.innerHTML = all.map(function (x, k) {
        var row = k < ip.length ? 0 : 1, col = row ? k - ip.length : k;
        return '<circle cx="' + xs[col].toFixed(1) + '" cy="' + (row ? 46 : 14) + '" r="6.5" fill="' + partyClr(win, x[1]) + '" stroke="#fff" stroke-width="0.8"></circle>';
      }).join('') + '<text x="40" y="35" font-size="13" fill="rgba(255,255,255,0.8)" font-weight="800" text-anchor="middle">' + all.length + '</text>';
    }
    var rows = doc.querySelectorAll('#hemi-row .ind-card .ind-badges');
    [ip, im].forEach(function (L, r) {
      if (!rows[r]) return;
      rows[r].innerHTML = L.map(function (x) {
        var nm = typeof win.translateCandidate === 'function' ? win.translateCandidate(x[0]) : x[0];
        return '<span class="badge ' + (BADGE[x[1]] || 'bd-other') + '">' + nm + '</span>';
      }).join('');
    });
    var ic2 = cardOf(doc, 'ind-svg'); if (ic2) ic2.classList.add('v2-ol-noclick');
    // 總席次: all four by party
    var known = addSeats(addSeats(addSeats(addSeats({}, rs), seatsOf(all)), d.pl), d.ov), tot = S.r + S.p + S.m + S.pl + S.ov;
    var tc = cardOf(doc, 'total-hemi-svg'); if (tc) tc.classList.add('v2-ol-noclick');
    set('total-seat-ratio-display', chipsHtml(win, known));
    set('total-hemi-center', String(tot));
    H = packed(tot, 110, 90, 40, 84);   // TOTAL_SEATS' band
    drawSvg(doc, 'total-hemi-svg', 220, 100, dotsSvg(win, H.pts, seatList(known), H.r.toFixed(2)), tot);
  }
  // the right panel's small hemicycle of one multi-member district (user 2026-11-01: 「既然一個選區選出多個那就要在右側資訊欄
  // 也畫出小半圓形圖」): its seats left → right in camp order, the same dots as the cards
  function miniHemi(win, e) {
    var s = seatsOf(e.cands), n = e.cands.filter(function (x) { return x[2]; }).length;
    var rows = n <= 5 ? 1 : n <= 12 ? 2 : 3, r0 = rows === 1 ? 38 : rows === 2 ? 34 : 30;
    var pts = hemiSeats(n, rows, 90, 64, r0, rows === 3 ? 13 : 16), rad = n <= 5 ? 8.5 : n <= 12 ? 7 : 5.2;
    return '<div style="display:flex;justify-content:center;margin:4px 0 2px"><svg viewBox="0 0 180 74" width="180" height="74" style="overflow:visible">' +
      dotsSvg(win, pts, seatList(s), rad) +
      '<text x="90" y="70" font-size="13" fill="rgba(255,255,255,0.85)" font-weight="800" text-anchor="middle">' + n + '</text></svg></div>';
  }

  function ensureCss(win) {
    if (win.document.getElementById('v2-oldleg-css')) return;
    var st = win.document.createElement('style'); st.id = 'v2-oldleg-css';
    // the cards without data / without a map of their own: dimmed, not buttons; 圓餅 / 激戰區域 / 政黨輪替分析: no earlier
    // comparable year and no township level
    st.textContent = 'html.v2-oldleg #v2-leg-left .stats-card.v2-ol-nodata{cursor:default!important;pointer-events:none}' +
      'html.v2-oldleg #v2-leg-left .stats-card.v2-ol-noclick, html.v2-oldleg #v2-leg-left .stats-card.v2-ol-noclick .v2-ind-row{cursor:default!important;pointer-events:none}' +
      // 4 + 4 原住民 seats (1998 on): the badges wrap instead of running out of the card
      'html.v2-oldleg #v2-leg-left .ind-card .ind-badges{flex-wrap:wrap;row-gap:2px;min-width:0;flex:1 1 auto}' +
      // five cards (僑選 added) share the column: title and badge rows keep their height, the hemicycle shrinks to what is
      // left (user 2026-11-01: 「舊制的title 僑選不分區被下面的圖示擠掉蓋掉了」)
      'html.v2-oldleg #v2-leg-left .stats-card{justify-content:flex-start!important}' +
      'html.v2-oldleg #v2-leg-left .stats-card > .card-title, html.v2-oldleg #v2-leg-left .stats-card > .seat-ratio-row{flex:0 0 auto}' +
      'html.v2-oldleg #v2-leg-left .stats-card > .svg-container{flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;position:relative}' +
      'html.v2-oldleg #v2-leg-left .stats-card > .svg-container svg{height:100%;max-height:72px;width:auto}' +
      // the seat count is drawn inside the svg (drawSvg) so it shrinks with the hemicycle; the 原住民 card keeps its rows
      'html.v2-oldleg #v2-leg-left .stats-card > .svg-container > .hemi-center-lbl{display:none!important}' +
      'html.v2-oldleg #v2-leg-left .stats-card.ind-card{flex:0 0 auto!important}' +
      'html.v2-oldleg #pie-swing-row, html.v2-oldleg #flip-analysis-box, html.v2-oldleg #ticker, html.v2-oldleg #map-legend .ml-swing{display:none!important}';
    win.document.head.appendChild(st);
  }
  function chrome(c) {
    var mt = c.win.document.getElementById('map-title');
    if (mt) mt.textContent = c.win.T(c.year + ' 台灣立委選舉儀表板', c.year + ' Taiwan Legislative Election Dashboard');
  }
  // keep V2's map / cards on top of the engine's deferred redraws (as history-legdist.js)
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    var win = c.win;
    if (win.__v2OldLegKey !== c.key) return;
    chrome(c);
    if (G(win, 'curED') != null || G(win, 'gBase').select('.v2-ol-blk').empty()) national(c);
    seatCards(c);
    navOff(c);
  }
  function schedule(c) {
    (c.win.__v2OldLegTimers || []).forEach(clearTimeout);
    c.win.__v2OldLegTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }
  function hookEngine(win) {
    // the engine's own redraws (updateHemicycle, goED, setLang) repaint its cards / map: put this year back
    ['updateHemicycle', 'goED', 'goTCAllNational', 'goVillAllNational'].forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function' || o.v2OldLeg) return;
      var w = function () {
        var c = win.__v2OldLegCtx;
        if (c && (n === 'goTCAllNational' || n === 'goVillAllNational')) return;   // no township / village level
        var r = o.apply(this, arguments);
        if (c) { if (n === 'goED') national(c); seatCards(c); }
        return r;
      };
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) w[k] = o[k];
      w.v2OldLeg = true; win[n] = w;
    });
  }

  function draw(win, year) {
    clear(win);
    var d = dataFor(year), CD = G(win, 'CD'), VD = G(win, 'VD');
    if (!d || !CD || !VD) return 0;
    var c = { win: win, year: year, d: d, CD: CD, VD: VD, key: 'ol' + year };
    win.__v2OldLegKey = c.key;
    win.__v2OldLegCtx = c;
    win.document.documentElement.classList.add('v2-oldleg');
    ensureCss(win);
    hookEngine(win);
    national(c);
    seatCards(c);
    chrome(c);
    schedule(c);
    win.__v2OldLegResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2OldLegResize);
    return d.eds.length;
  }
  function clear(win) {
    if (win.__v2OldLegResize) { win.removeEventListener('resize', win.__v2OldLegResize); win.__v2OldLegResize = null; }
    (win.__v2OldLegTimers || []).forEach(clearTimeout);
    win.__v2OldLegTimers = [];
    var was = !!win.__v2OldLegKey;
    win.__v2OldLegKey = null;
    win.__v2OldLegCtx = null;
    win.document.documentElement.classList.remove('v2-oldleg');
    if (was) {
      navOn(win);
      var hr = win.document.getElementById('hemi-row');
      // the engine's own cards back (its circles, its 6 原住民 dots / badges), then its own year painted on them
      if (hr && win.__v2OldLegCards != null) hr.innerHTML = win.__v2OldLegCards;
      [].forEach.call(win.document.querySelectorAll('.v2-ol-nodata, .v2-ol-noclick'), function (el) { el.classList.remove('v2-ol-nodata', 'v2-ol-noclick'); });
      if (typeof win.updateHemicycle === 'function') { try { win.updateHemicycle(0); } catch (e) {} }
    }
    win.__v2OldLegCards = null;
    return was;
  }
  window.V2OldLeg = { draw: draw, clear: clear, YEARS: YEARS };
})();
