/* History → 地方 → 鄉鎮市民代表 (township representatives), 2014/2018/2022 (user, 2026-10-27:
 * 「做鄉鎮市民代表，請比照市議員的例子，半圓形圖就是在市長的市議員那一塊一樣畫只是畫的是市民代表」).
 *
 * Built like the engine's 縣市議員 mode, nothing of V2's own design — inside History's own iframe copy of
 * council.html (V1 untouched); same level rules as history-townhead.js (no population glow, the top level is the
 * race's own unit as blocks, drill down from it):
 *  - top level: one block per 代表會 (township; the engine's 全台鄉鎮市區 layers as _mayorGoTCAllNational), filled
 *    as councilDistColor's 政黨比例 rule: first party's total votes minus the second's, via _councilPartyColor
 *    (independents count as one party, as the engine's). Only the regular districts colour the map (plains-
 *    indigenous votes are a separate roll, as the council map). Townships without a 代表會 are black;
 *  - hemicycle: the engine's county-council box at the top of the panel (#county-council-panel, the 「移到地圖選區
 *    查看縣市議會席次」 box drawCountyHemiForED fills) now shows the hovered 代表會: same dot geometry
 *    (generateHemiPoints, same size / rows), party badges with logoSVGs and the ▲/▼ change vs the previous cycle
 *    (as _countyPartySeatChangeArrow), seats in COUNCIL_CAMP_ORDER. Plains-indigenous seats belong to the same
 *    代表會 and are included;
 *  - click a township → its village layer (_mayorGoVill's layers), each village by its own party vote margin
 *    (councilVillColor's 政黨比例 rule); hovering a village lights its district's seats in the hemicycle and darkens
 *    the rest (drawCountyHemiForED's council style). Crumb 全台 › 鄉鎮 leads back (no 縣市 level);
 *  - panels from the engine's own pieces (t1, sub-label, _glassBadge, _turnoutTrafficLights, renderCouncilCandRow);
 *  - data: TOWNSHIP_REP (v2/data_township_rep.js, build_v2_township_rep.py, tests/reconcile_township_rep.py).
 * V2TownshipRep.draw(win, year) / V2TownshipRep.clear(win).
 */
(function () {
  var BLACK = '#0a0d16';   // mapBgColor()'s base colour (mapBgColor itself returns a CSS gradient, not an SVG fill)
  var YEARS = ['2014', '2018', '2022'];

  // the engine's top-level const / let bindings are not window properties: read them in its scope
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function repData(year) { return (typeof TOWNSHIP_REP !== 'undefined' ? TOWNSHIP_REP : {})[year] || null; }   // top-level const

  // [[n, p, v, e]] → [{n, p, v, e}]
  function cands(arr) { return arr.map(function (c) { return { n: c[0], p: c[1], v: c[2], e: c[3] }; }); }
  function distLabel(win, dk, kind) {
    var T = win.T, no = String(+dk.slice(1));
    return kind === 'P' ? T('平地原住民第' + no + '選區', 'Plains-indigenous district ' + no) : T('第' + no + '選區', 'District ' + no);
  }
  // 政黨比例 fill (councilDistColor / councilVillColor): party vote totals, first minus second
  function partyFill(win, pv, tot) {
    var pairs = Object.keys(pv).map(function (p) { return [p, pv[p]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (!pairs.length || !tot) return BLACK;
    var margin = (pairs[0][1] - (pairs[1] ? pairs[1][1] : 0)) / tot;
    return win._councilPartyColor(pairs[0][0], Math.max(0.05, Math.min(0.5, margin)));
  }
  function tcFill(win, body) {
    if (!body) return BLACK;   // no 代表會 (直轄市 / 省轄市 區)
    var pv = {}, tot = 0;
    Object.keys(body.d).forEach(function (dk) {
      var d = body.d[dk]; if (d[0] !== 'R') return;
      tot += d[1];
      d[2].forEach(function (c) { pv[c[1]] = (pv[c[1]] || 0) + c[2]; });
    });
    return partyFill(win, pv, tot);
  }
  function villRow(c, body, vc) {
    if (body.v[vc]) return body.v[vc];
    var to = c.year === '2022' && c.merged22 && c.merged22[vc];   // merged / joint-station villages, as the engine's 2022 data
    return (to && body.v[to]) || null;
  }
  function villFill(c, body, vc) {
    var r = body && villRow(c, body, vc);
    if (!r || !r[1]) return BLACK;   // no data (臺東市 before 2022) — user: 「沒資料就反黑吧」
    var pv = {}, cs = body.d[r[0]][2];
    cs.forEach(function (x, i) { pv[x[1]] = (pv[x[1]] || 0) + r[4 + i]; });
    return partyFill(c.win, pv, r[1]);
  }
  // {code: [turnout %, valid-vote %]} — the shape _turnoutTrafficLights ranks
  function villTurnout(data) {
    var o = {};
    Object.keys(data).forEach(function (tc) {
      var v = data[tc].v;
      Object.keys(v).forEach(function (vc) { var r = v[vc]; if (r[2] && r[3]) o[vc] = [+(r[3] / r[2] * 100).toFixed(2), +(r[1] / r[3] * 100).toFixed(2)]; });
    });
    return o;
  }
  // seats by party of one 代表會: [{p, dk}] (one per seat)
  function seatsOf(body) {
    var out = [];
    Object.keys(body.d).sort().forEach(function (dk) {
      body.d[dk][2].forEach(function (x) { if (x[3]) out.push({ p: x[1], dk: dk }); });
    });
    return out;
  }
  function names(win, tc) {
    var NM = G(win, 'NM'), cc = win._tcCityKey(tc);
    var raw = (NM && NM.t && NM.t[tc]) || tc;
    return { cc: cc, cn: (G(win, '_CC_NAME') || {})[cc] || cc, tn: typeof win.translateTownship === 'function' ? win.translateTownship(raw) : raw };
  }

  // ── hemicycle in the engine's county-council box (drawCountyHemiForED's markup and geometry) ──
  function hemi(c, tc, hiDk) {
    c.lastHemi = [tc, hiDk];
    var win = c.win, doc = win.document, T = win.T, CLR = G(win, 'COUNCIL_CLR'), ORDER = G(win, 'COUNCIL_CAMP_ORDER') || {};
    var panel = doc.getElementById('county-council-panel'); if (panel) panel.style.display = '';
    var b5 = doc.getElementById('council-base5-toggle-row'); if (b5) b5.style.display = 'none';   // 縣市議員-only feature
    var b5c = doc.getElementById('ccp-base5-compare'); if (b5c) b5c.innerHTML = '';
    var titleEl = doc.getElementById('ccp-county-title'), srEl = doc.getElementById('ccp-seat-ratio');
    var centerEl = doc.getElementById('ccp-hemi-center'), svg = win.d3.select('#ccp-hemi-svg');
    var body = tc && c.data[tc];
    if (!body) {
      if (titleEl) { titleEl.textContent = tc ? T('沒有代表會（區長官派）', 'No representative council (appointed district chief)') : T('移到鄉鎮查看代表會席次', 'Hover a township to see its council seats'); titleEl.style.color = '#bbb'; }
      if (srEl) srEl.innerHTML = ''; if (centerEl) centerEl.textContent = '';
      svg.selectAll('*').remove();
      return;
    }
    var nm = names(win, tc);
    if (titleEl) { titleEl.textContent = c.year + ' ' + nm.tn + T('代表會', ' Council'); titleEl.style.color = ''; }
    var seats = seatsOf(body), bp = {};
    seats.forEach(function (s) { bp[s.p] = (bp[s.p] || 0) + 1; });
    // ▲/▼ vs the previous cycle, as _countyPartySeatChangeArrow (omitted when there is no prior 代表會 data)
    var prevY = YEARS[YEARS.indexOf(c.year) - 1], prev = prevY && repData(prevY) && repData(prevY)[tc], pbp = null;
    if (prev) { pbp = {}; seatsOf(prev).forEach(function (s) { pbp[s.p] = (pbp[s.p] || 0) + 1; }); }
    var arrow = function (p, n) {
      if (!pbp) return '';
      var was = pbp[p] || 0; if (was === n) return '';
      var diff = n - was;
      return '<span title="' + T('上屆' + was + '席', 'Was ' + was + ' seats last cycle') + '" style="margin-left:2px;font-weight:700;font-size:11px;color:' + (diff > 0 ? '#22c55e' : '#ef4444') + '">' + (diff > 0 ? '▲+' : '▼') + diff + '</span>';
    };
    var parties = Object.keys(bp).sort(function (a, b) { return (ORDER[a] || 99) - (ORDER[b] || 99); });
    var logos = G(win, "typeof logoSVGs !== 'undefined' ? logoSVGs : null");
    if (srEl) srEl.innerHTML = parties.map(function (p) {
      var clr = CLR[p] || '#aaa';
      var logo = logos && logos[p]
        ? '<span style="display:inline-block;width:12px;height:12px;transform:scale(0.8);transform-origin:center;vertical-align:middle;">' + logos[p] + '</span>'
        : '<span style="width:8px;height:8px;border-radius:50%;background:' + clr + ';display:inline-block;vertical-align:middle;flex-shrink:0"></span>';
      return '<div class="sr-badge" style="display:inline-flex;align-items:center;gap:3px;margin:0 4px;">' + logo +
        '<span class="sr-num" style="font-weight:700;font-size:11px;vertical-align:middle;color:' + clr + '">' + bp[p] + '</span>' + arrow(p, bp[p]) + '</div>';
    }).join('');
    if (centerEl) centerEl.textContent = seats.length;
    // dots: parties in camp order, each party's seats grouped by district (so a district's seats sit together)
    var dots = seats.slice().sort(function (a, b) { return ((ORDER[a.p] || 99) - (ORDER[b.p] || 99)) || (a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0); });
    var W = 185, H = 95, cx = 92, cy = 90, sR = 28, eR = 84, total = dots.length, DOT_R = 5.0;
    var numRows = total <= 20 ? 3 : total <= 35 ? 4 : total <= 55 ? 5 : 6;
    svg.attr('width', W).attr('height', H).selectAll('*').remove();
    var toBlack = function (hex, amt) {
      var h = (hex || '').length === 7 ? hex : '#888888';
      return 'rgb(' + ((parseInt(h.slice(1, 3), 16) * (1 - amt)) | 0) + ',' + ((parseInt(h.slice(3, 5), 16) * (1 - amt)) | 0) + ',' + ((parseInt(h.slice(5, 7), 16) * (1 - amt)) | 0) + ')';
    };
    win.generateHemiPoints(total, cx, cy, sR, eR, numRows, 0.38, 1.2).forEach(function (pt, i) {
      var d = dots[i] || { p: 'other', dk: '' }, base = CLR[d.p] || '#aaa', on = !hiDk || d.dk === hiDk;
      svg.append('circle').attr('cx', pt.cx).attr('cy', pt.cy).attr('r', DOT_R)
        .attr('fill', on ? base : toBlack(base, 0.7))
        .attr('stroke', '#fff').attr('stroke-width', DOT_R * 0.12).attr('opacity', on ? 1 : 0.9);
    });
  }

  // township panel: each district's candidates (renderCouncilCandRow, ✓ = elected), regular districts first
  function tcPanelHtml(c, tc) {
    var win = c.win, T = win.T, nm = names(win, tc), body = c.data[tc];
    if (!body) return '<div class="t1">' + nm.cn + ' ' + nm.tn + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' +
      T('直轄市與省轄市的區沒有代表會（直轄市山地原住民區除外）', 'No representative council — appointed district (except the six indigenous districts)') + '</div>';
    var seats = seatsOf(body).length;
    var dks = Object.keys(body.d).sort(function (a, b) { return (a[0] === b[0]) ? (a < b ? -1 : 1) : (a[0] === 'R' ? -1 : 1); });
    var html = dks.map(function (dk) {
      var d = body.d[dk], cs = cands(d[2]), n = cs.filter(function (x) { return x.e; }).length, maxV = (cs[0] || {}).v || 1;
      return '<div class="sec-title" style="margin:8px 0 4px">' + distLabel(win, dk, d[0]) + T('（應選' + n + '席）', ' (' + n + ' seats)') + '</div>' +
        cs.map(function (x) { return win.renderCouncilCandRow(x, d[1], maxV); }).join('');
    }).join('');
    return '<div class="t1">' + nm.cn + ' ' + nm.tn + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + c.year + T(' 鄉鎮市民代表選舉', ' Township Representative Election') + '</div>' +
      win._glassBadge('#5eead4', T('代表會 ' + seats + ' 席', seats + ' seats')) +
      '<div style="max-height:320px;overflow-y:auto">' + html + '</div>';
  }
  // village panel: _mayorVillPanelHtml's pieces — this village's votes of its district's candidates, every one on its own row
  function vcPanelHtml(c, tc, vc) {
    var win = c.win, T = win.T, CLR = G(win, 'COUNCIL_CLR'), NM = G(win, 'NM'), body = c.data[tc], nm = names(win, tc);
    var raw = (NM && NM.v && NM.v[vc]) || vc;
    var vnRaw = raw.indexOf(' ') !== -1 ? raw.split(' ').slice(1).join(' ') : raw;
    var vn = typeof win.translateVillage === 'function' ? win.translateVillage(vc, vnRaw) : vnRaw;
    var r = villRow(c, body, vc);
    if (!r || !r[1]) return '<div class="t1">' + vn + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>';
    var key = body.v[vc] ? vc : c.merged22[vc], banner = '';
    if (key !== vc) {
      var toRaw = (NM && NM.v && NM.v[key]) || key, toName = toRaw.indexOf(' ') !== -1 ? toRaw.split(' ').slice(1).join(' ') : toRaw;
      banner = '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
        T('此村里已併入「' + toName + '」，2022年地圖染色／候選人資料沿用「' + toName + '」', 'This village has been merged into "' + toName + '" — the 2022 map color and candidate data shown here belong to "' + toName + '"') + '</div>';
    }
    var d = body.d[r[0]];
    var cs = cands(d[2]).map(function (x, i) { return { n: x.n, p: x.p, v: r[4 + i], e: x.e }; }).sort(function (a, b) { return b.v - a.v; });
    var maxV = (cs[0] || {}).v || 1, wclr = (cs[0] && CLR[cs[0].p]) || '#888';
    return banner + '<div class="t1" style="color:' + wclr + '">' + vn + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + nm.cn + ' ' + nm.tn + ' ' + distLabel(win, r[0], d[0]) + ' · ' + c.year + T(' 鄉鎮市民代表選舉', ' Township Representative Election') + '</div>' +
      win._turnoutTrafficLights(c.vtl, key, 'v2trv' + c.year) +
      '<div class="sec-title" style="margin-bottom:5px;margin-top:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + cs.map(function (x) { return win.renderCouncilCandRow(x, r[1], maxV); }).join('') + '</div>';
  }

  // re-read the engine's projection and layer handles: it rebuilds them on resize (e.g. when the page's control
  // rows wrap), and drawing with a stale pathFn puts the map off-screen while fitFeats uses the new one
  function fresh(c) {
    c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg');
  }
  function ic(win, html) { var el = win.document.getElementById('ic'); if (el) el.innerHTML = html; }
  function tcFeature(c, tc) {
    if (c.merged[tc]) return c.merged[tc];
    var vg = c.VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && vc.indexOf(tc) === 0; });
    if (!vg.length) return null;
    var m = c.win._cleanMergedGeom(c.win.topojson.merge(c.VD, vg));
    if (window.V2TcBorder && window.V2TcBorder.solid) window.V2TcBorder.solid(c.win, m.type === 'Feature' ? m.geometry : m);   // VD gaps aren't holes
    return (c.merged[tc] = { type: 'Feature', properties: { tc: tc }, geometry: m.type === 'Feature' ? m.geometry : m });
  }
  // crumb: 全台 › 鄉鎮 — no 縣市 level in these modes, 全台 goes straight back to the national map
  // (user 2026-10-27: 「把縣市那層隱藏…點進去出來回全台地圖是直接回到全台的」)
  function setCrumb(c, tc) {
    var win = c.win, T = win.T, el = win.document.getElementById('crumb');
    if (!el) return;
    if (!tc) el.innerHTML = '<span class="cl">' + T('全台', 'All') + '</span> › ' + T(c.year + ' 鄉鎮市民代表選舉', c.year + ' Township Representative Election');
    else { var nm = names(win, tc); el.innerHTML = '<span class="cl">' + T('全台', 'All') + '</span> › ' + nm.tn; }
    var all = el.querySelector('.cl');
    if (all) all.onclick = function () { national(c); };
  }

  // top level: one block per 代表會 (_mayorGoTCAllNational's layers)
  function national(c) {
    fresh(c);   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    var win = c.win, d3 = win.d3, T = win.T;
    win.__v2TrTC = null;
    win.eval("level = 'tc'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var CD = G(win, 'CD'), seen = {}, feats = [];
    win.getTCGJ().features.forEach(function (f) { var tc = f.properties.tc; if (seen[tc]) return; seen[tc] = 1; feats.push(tcFeature(c, tc) || f); });
    var countyMesh = win.topojson.mesh(CD, CD.objects.counties, function (a, b) { return a !== b; });
    var fill = function (d) { return tcFill(win, c.data[d.properties.tc]); };
    c.gBase.selectAll('.ft-tc').data(feats).join('path').attr('class', 'ft ft-tc v2-own').attr('d', c.pathFn)
      .attr('fill', fill).attr('stroke', fill).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke')
      .attr('cursor', function (d) { return c.data[d.properties.tc] ? 'pointer' : 'default'; })
      .on('mouseover', function (e, d) {
        var tc = d.properties.tc;
        ic(win, tcPanelHtml(c, tc));
        hemi(c, tc, null);
      })
      .on('click', function (e, d) { if (c.data[d.properties.tc]) township(c, d.properties.tc); });
    // township lines + white county lines: the shared style (v2/tcborder.js, user 2026-10-28: 「所有的版面…一致」)
    window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-tc-natborder', feats, 'tc');
    window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-ed-border', [countyMesh], 'outline');
    // no yellow county frame on hover (user 2026-10-27: 「滑鼠移過去時的黃色縣框」 removed): the hovered township keeps
    // the engine's own .ft hover highlight
    ic(win, '<div class="t1">' + T(c.year + ' 鄉鎮市民代表選舉', c.year + ' Township Representative Election') + '</div>' +
      '<div style="color:#bbb;font-size:11px;margin-top:4px">' + T('移到各鄉鎮查看代表會，點選進入村里層', 'Hover over a township to view its council; click to enter its villages') + '</div>');
    hemi(c, null, null);
    setCrumb(c, null);
    if (c.svg) {
      c.svg.transition().duration(380).call(G(win, 'zm').transform, d3.zoomIdentity);
      try { win.eval('curK = 1'); } catch (e) {}
    }
    setTimeout(function () { if (typeof win.renderLegend === 'function') win.renderLegend(); }, 50);
  }

  // one 代表會's villages (_mayorGoVill's layers)
  function township(c, tc) {
    fresh(c);   // the engine rebuilds its projection on resize: never draw with a stale pathFn / layer handle
    var win = c.win, body = c.data[tc];
    win.__v2TrTC = tc;
    win.eval("level = 'vill'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(win, 'clearAll')();
    win.document.getElementById('mp').style.background = win.mapBgColor();
    var feats = win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && vc.indexOf(tc) === 0; });
    if (!feats.length) return;
    var tf = tcFeature(c, tc);
    if (tf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(tf)).attr('pointer-events', 'none');
    var show = function (e, d) {
      var vc = d.properties.vc, r = villRow(c, body, vc);
      ic(win, vcPanelHtml(c, tc, vc));
      hemi(c, tc, r ? r[0] : null);
    };
    c.gBase.selectAll('.ft-vill').data(feats).join('path')
      .attr('class', 'ft ft-vill v2-own').attr('d', c.pathFn)
      .attr('fill', function (d) { return villFill(c, body, d.properties.vc); }).attr('fill-opacity', 1)
      .attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke')
      .on('mouseover', show).on('click', show);
    if (tf) window.V2TcBorder.lines(c.gBase, c.pathFn, 'ft-tc-border', [tf], 'tc');
    // 選區 outlines in the white county-border style of the national map (.ft-ed-border: white .9, 2.5px), user
    // 2026-10-27: 「市民代表在村里層應該要有用鄉鎮市區長的縣市邊界白粗線一樣有畫出選區範圍」. Arcs between villages of
    // different regular districts, plus the township's own outline (arcs to outside villages / the coast)
    var distOf = function (g) {
      var vc = g && g.properties && g.properties.vc;
      if (!vc || vc.indexOf(tc) !== 0) return null;
      var r = villRow(c, body, vc);
      return r ? r[0] : '?';
    };
    var distMesh = win.topojson.mesh(c.VD, c.VD.objects.villages, function (a, b) {
      var da = distOf(a), db = distOf(b);
      if (da === null && db === null) return false;
      return a === b || da !== db;
    });
    c.gBase.selectAll('.v2-tr-dist-border').data([distMesh]).join('path')
      .attr('class', 'v2-tr-dist-border').attr('d', c.pathFn)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.9)').attr('stroke-width', 2.5)
      .attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
    G(win, 'fitFeats')(feats);
    ic(win, tcPanelHtml(c, tc));
    hemi(c, tc, null);
    setCrumb(c, tc);
    setTimeout(function () { if (typeof win.renderLegend === 'function') win.renderLegend(); }, 420);
  }

  function chrome(c) {
    var win = c.win, T = win.T, tcs = Object.keys(c.data);
    var mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = T(c.year + ' 鄉鎮市民代表地圖', c.year + ' Township Representative Map');
    var set = function (id, zh, en, val) {
      var l = win.document.getElementById(id + '-lbl'), v = win.document.getElementById(id);
      if (l) { l.dataset.zh = zh; l.dataset.en = en; l.textContent = G(win, 'currentLang') === 'en' ? en : zh; }
      if (v) { v.textContent = val; v.style.color = ''; }
    };
    var seats = 0, ind = 0;
    tcs.forEach(function (tc) { seatsOf(c.data[tc]).forEach(function (s) { seats++; if (s.p === 'ind') ind++; }); });
    set('ss-region', '代表會', 'Councils', String(tcs.length));
    set('ss-pl', '無黨籍席次', 'Independent seats', String(ind));
    set('ss-total', '代表席次', 'Seats', String(seats));
    return seats;
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
    if (win.__v2TownRepYear !== year) return;
    chrome(c);
    var glow = G(win, 'gGlow'), glowBack = glow && !glow.selectAll('.glow-core').empty();
    var moved = G(win, 'curED') != null, gB = G(win, 'gBase');
    var t = win.__v2TrTC;
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
    else hemi(c, c.lastHemi ? c.lastHemi[0] : null, c.lastHemi ? c.lastHemi[1] : null);   // keep what the mouse last showed
  }
  function schedule(c, year) {
    (c.win.__v2TownRepTimers || []).forEach(clearTimeout);
    c.win.__v2TownRepTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c, year); }, ms); });
  }

  // setMayorMode(year) has just set up the engine; replace its glow map with the 代表會 blocks, then keep it there
  // (ensure() on a schedule and after every resize).
  function draw(win, year) {
    clear(win);
    var data = repData(year), VD = G(win, 'VD'), gBase = G(win, 'gBase'), gBg = G(win, 'gBg'), pathFn = G(win, 'pathFn');
    if (!data || !VD || !gBase || !gBg || !pathFn) return 0;
    var c = { win: win, year: year, data: data, vtl: villTurnout(data), VD: VD, gBase: gBase, gBg: gBg, pathFn: pathFn,
              svg: G(win, 'svg'), merged: {}, merged22: G(win, "typeof VC_MERGED_2022 !== 'undefined' ? VC_MERGED_2022 : null") || {} };
    win.__v2TownRepYear = year;
    national(c);
    var n = chrome(c);
    schedule(c, year);
    win.__v2TrResize = function () { schedule(c, year); };
    win.addEventListener('resize', win.__v2TrResize);
    win.document.addEventListener('fullscreenchange', win.__v2TrResize);
    return n;
  }
  function clear(win) {
    if (win.__v2TrResize) {
      win.removeEventListener('resize', win.__v2TrResize);
      win.document.removeEventListener('fullscreenchange', win.__v2TrResize);
      win.__v2TrResize = null;
    }
    (win.__v2TownRepTimers || []).forEach(clearTimeout);
    win.__v2TownRepTimers = [];
    var was = win.__v2TownRepYear;
    win.__v2TownRepYear = null;
    win.__v2TrTC = null;
    var svg = G(win, 'svg');
    if (svg) svg.on('mouseleave.v2tr', null);
    // hand the county-council box back to the engine (its own empty state)
    if (was && typeof win.drawCountyHemiForED === 'function') { try { win.drawCountyHemiForED(null); } catch (e) {} }
  }
  window.V2TownshipRep = { draw: draw, clear: clear };
})();
