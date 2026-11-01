/* History → 地方 → 縣市長, 1997／98, 2001／02, 2005／06, 2009／10 (user 2026-10-31: 「要繼續更新縣市長嗎？歷年的…」 →
 * 「桌機歷屆選舉＋手機版都放…地圖就不用找了，沒資料對不上就算了」).
 *
 * Drawn on today's map, inside History's own iframe copy of council.html (V1 untouched), like history-townhead.js:
 * setMayorMode('2014') sets the mode up (legend, chips, panel frame), then the map is replaced:
 *  - 全台: one block per race — the race's townships (today's codes) merged — filled by the race winner's party via
 *    winMarginFill / COUNCIL_CLR (deeper = bigger margin). Before the 2010 mergers 臺北縣 / 臺中縣 / 臺南縣 / 高雄縣
 *    had their own races beside the cities, so a cycle can show 25 races on today's 22 counties. No old county outline
 *    exists (user: 「地圖就不用找了」): a race's block is just its townships;
 *  - click a race → its townships, each by its own leader; click a township → its villages, where the cycle has
 *    village rows (1997／98 and 2001／02 縣 races have township rows only); village rows that name no village of
 *    today's map were left out by the builder, those villages stay black (「沒資料對不上就算了」);
 *  - 全台鄉鎮市區 / 全台村里 in the bar: every township / village by its own leader;
 *  - panels from the engine's own pieces (t1, sub-label, _glassBadge, _turnoutTrafficLights, renderCouncilCandRow).
 * Data: OLD_MAYOR (v2/data_oldmayor.js, build_v2_oldmayor.py, tests/reconcile_v2_oldmayor.py).
 * V2OldMayor.draw(win, cycle) / V2OldMayor.clear(win).
 */
(function () {
  var BLACK = '#0a0d16';
  // no data ≠ no election (user 2026-11-01: 「沒有資料的村里應該跟2014縣市長沒資料村里一樣不是全黑而是灰底…沒有選舉的黑底不必改」):
  // a place without data takes the engine's own no-data grey — 縣市長 mode's '#aaa' (_mayorVillFill / _mayorTcFillColor)
  var NO_DATA_FILL = '#aaa';      // mapBgColor()'s base colour
  var ENGINE_YEAR = '2014';   // the engine year set up underneath (its mayor-mode legend / panel frame)

  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function dataFor(cyc) { return (typeof OLD_MAYOR !== 'undefined' ? OLD_MAYOR : {})[cyc] || null; }
  function isMuni(c, r) { return !!r.m; }

  function clr(c, p) { var CLR = G(c.win, 'COUNCIL_CLR') || {}, PM = G(c.win, 'PARTY_COLOR_MAP') || {}; return CLR[p] || PM[p] || '#aaa'; }
  // [elig, cast, valid, v0, ...] → [{n, p, e, v}] sorted by votes here
  function ranked(r, vec) {
    return r.cands.map(function (x, i) { return { n: x[0], p: x[1], e: x[2], v: vec[3 + i] }; })
      .sort(function (a, b) { return b.v - a.v; });
  }
  function fill(c, r, vec) {
    if (!r || !vec || !vec[2]) return NO_DATA_FILL;
    var s = ranked(r, vec);
    if (!s[0].v) return NO_DATA_FILL;
    var margin = s.length > 1 ? (s[0].v - s[1].v) / vec[2] : 1;
    return c.win.winMarginFill(s[0].p, margin, clr(c, s[0].p));
  }
  function villVec(r, vc) {
    if (!r) return null;
    if (r.vc[vc]) return { vec: r.vc[vc] };
    var j = r.jv[vc];
    return j ? { vec: r.jr[j].slice(1), joint: r.jr[j][0] } : null;
  }
  function tl(vec) { return vec && vec[0] && vec[1] ? [+(vec[1] / vec[0] * 100).toFixed(2), +(vec[2] / vec[1] * 100).toFixed(2)] : null; }

  // ── names ──
  // council.html has no translateCounty (test.html's): English names of every race / county name here (audit 2026-10-31:
  // the English crumb and panel titles stayed Chinese)
  var EN = { '臺北市': 'Taipei City', '高雄市': 'Kaohsiung City', '新北市': 'New Taipei City', '臺中市': 'Taichung City', '臺南市': 'Tainan City',
    '桃園市': 'Taoyuan City', '臺北縣': 'Taipei County', '臺中縣': 'Taichung County', '臺南縣': 'Tainan County', '高雄縣': 'Kaohsiung County',
    '桃園縣': 'Taoyuan County', '宜蘭縣': 'Yilan County', '新竹縣': 'Hsinchu County', '苗栗縣': 'Miaoli County', '彰化縣': 'Changhua County',
    '南投縣': 'Nantou County', '雲林縣': 'Yunlin County', '嘉義縣': 'Chiayi County', '屏東縣': 'Pingtung County', '臺東縣': 'Taitung County',
    '花蓮縣': 'Hualien County', '澎湖縣': 'Penghu County', '基隆市': 'Keelung City', '新竹市': 'Hsinchu City', '嘉義市': 'Chiayi City',
    '金門縣': 'Kinmen County', '連江縣': 'Lienchiang County' };
  function nameOf(c, zh) { return c.win.T(zh, EN[zh.replace(/台/g, '臺')] || zh); }
  function ccName(c, cc) {
    var f = c.cos.features.find(function (x) { return x.properties.cc === cc; });
    return nameOf(c, f ? f.properties.cn : cc);
  }
  function raceName(c, r) { return nameOf(c, r.n); }
  function tcName(c, tc) {
    var NM = G(c.win, 'NM'), raw = (NM && NM.t && NM.t[tc]) || tc;
    return typeof c.win.translateTownship === 'function' ? c.win.translateTownship(raw) : raw;
  }
  function vcName(c, vc) {
    var NM = G(c.win, 'NM'), raw = (NM && NM.v && NM.v[vc]) || vc;
    var n = raw.indexOf(' ') !== -1 ? raw.split(' ').slice(1).join(' ') : raw;
    return typeof c.win.translateVillage === 'function' ? c.win.translateVillage(vc, n) : n;
  }
  function elecName(c) { return c.d.label + c.win.T(' 縣市長選舉', ' Mayoral Election'); }
  // the race's own year (user 2026-10-31: 「還是要再小title標示…是哪一年投票的」): 縣市長 in the cycle year, 直轄市長 a year later
  function raceElec(c, r) { return r.y + (r.m ? c.win.T(' 直轄市長選舉', ' Municipal Mayoral Election') : c.win.T(' 縣市長選舉', ' County / City Mayoral Election')); }

  // ── panels ──
  // _mayorPanelHtml's rule: independents / others who lost with under 5% are one 「其他」 row
  function candRows(c, r, vec) {
    var s = ranked(r, vec), main = [], other = [], cm = {};
    s.forEach(function (x) { ((x.p === 'ind' || x.p === 'other') && !x.e && vec[2] && x.v / vec[2] < 0.05 ? other : main).push(x); });
    if (other.length) main.push({ n: T_(c, '其他', 'Others'), p: 'other', v: other.reduce(function (a, x) { return a + x.v; }, 0), e: 0 });
    var maxV = (main[0] || {}).v || 1;
    main.forEach(function (x) { cm[x.n] = clr(c, x.p); });
    return main.map(function (x) { return c.win.renderCouncilCandRow(x, vec[2], maxV, cm); }).join('');
  }
  function T_(c, zh, en) { return c.win.T(zh, en); }
  // a race / township / village panel: title in the area's own leader colour; the race panel adds the winner badge
  function panel(c, title, sub, r, vec, tlKey, code, extra) {
    var win = c.win, T = win.T;
    if (!r || !vec || !vec[2]) return '<div class="t1">' + title + '</div><div style="color:#bbb;font-size:11px;margin-top:4px">' + T('無資料', 'No data') + '</div>' + (extra || '');
    var s = ranked(r, vec), lead = clr(c, s[0].p), badge = '';
    if (tlKey === 'race') {
      var w = r.cands.filter(function (x) { return x[2]; })[0] || r.cands[0], LBL = G(win, 'COUNCIL_LBL') || {};
      // _mayorPanelHtml's badge: 「國民黨 勝選」
      badge = win._glassBadge(clr(c, w[1]), (LBL[w[1]] || w[1]) + T(' 勝選', ' wins') + (r.cands.length === 1 ? T('（同額競選）', ' (uncontested)') : ''));
    }
    return '<div class="t1" style="color:' + lead + '">' + title + '</div>' +
      '<div style="font-size:10px;color:#888;margin-top:2px;margin-bottom:5px">' + sub + '</div>' + badge +
      win._turnoutTrafficLights(c.tl[tlKey], code, 'v2om' + c.cyc + tlKey) +
      '<div class="sec-title" style="margin-bottom:5px;margin-top:5px">' + T('候選人得票', 'Candidate Votes') + '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' + candRows(c, r, vec) + '</div>' + (extra || '');
  }
  function hint(c, zh, en) { return '<div class="hint" style="text-align:center;opacity:0.5;margin-top:8px">' + c.win.T(zh, en) + '</div>'; }
  function todayNote(c, r) {
    // only a race renamed since (臺北縣 → 新北市 …); the map's county names write 台, the CEC files 臺 (user 2026-10-31:
    // 「台東縣不應該寫台東縣（今台東縣）」)
    var f = c.cos.features.find(function (x) { return x.properties.cc === r.cc; });
    if (!f || f.properties.cn.replace(/台/g, '臺') === r.n.replace(/台/g, '臺')) return '';
    var cn = ccName(c, r.cc);
    return c.win.T('（今' + cn + '）', ' (today ' + cn + ')');
  }
  // that county's council of the same years in the engine's county-council box (history-oldcouncil.js), as 2014+ 縣市長
  var COUNCIL_CYCLE = { '1997': '1998', '2001': '2002', '2005': '2005', '2009': '2009' };
  function councilHemi(c, r) {
    var w = r && (r.cands.filter(function (x) { return x[2]; })[0] || r.cands[0]);
    if (window.V2OldCouncil && window.V2OldCouncil.hemiFor) window.V2OldCouncil.hemiFor(c.win, COUNCIL_CYCLE[c.cyc], r ? r.n : null, w ? w[1] : null);
  }
  // 跳槽 tags (career.js) for this race's own year (1997 縣市長, 1998 直轄市長 …)
  function careerCtx(c, r) { c.win.__v2CareerCtx = r ? { race: 'M', year: r.y } : null; }
  function racePanel(c, i) {
    var r = c.d.races[i];
    careerCtx(c, r);
    return panel(c, raceName(c, r) + todayNote(c, r), raceElec(c, r), r, r.v, 'race', String(i), villAllButton(c, i, '點選進入鄉鎮市區 ▶', 'Click to enter its townships ▶'));
  }
  function hasVill(r, tc) { return r && (Object.keys(r.vc).some(function (vc) { return vc.indexOf(tc) === 0; }) || Object.keys(r.jv).some(function (vc) { return vc.indexOf(tc) === 0; })); }
  function raceHasVill(r) { return r && (Object.keys(r.vc).length > 0 || Object.keys(r.jv).length > 0); }
  // the mayor / council modes' 「⊞ 全選區村里」 glass button (as history-legind.js; user 2026-10-31: 「全選區村里按鈕要有」):
  // every village of the race; races with township rows only (1997／98, 2001／02 縣) say so instead
  function villAllButton(c, i, zh, en) {
    var T = c.win.T;
    if (!raceHasVill(c.d.races[i])) return hint(c, zh, en) + hint(c, '此屆無村里層資料', 'No village-level data for this election');
    return '<div style="display:flex;gap:6px;margin-top:10px"><div class="hint" style="flex:1;text-align:center;opacity:0.5">' + T(zh, en) + '</div>' +
      '<button class="btn v2-om-villall" data-ri="' + i + '" style="flex:1;font-size:10px;padding:4px 6px;background:rgba(27,158,75,0.18);color:#4ade80;border:1px solid rgba(27,158,75,0.45);border-radius:4px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 0 6px rgba(74,222,128,0.4);cursor:pointer"><span>' + T('⊞ 全選區村里', '⊞ All Villages') + '</span></button></div>';
  }
  function tcPanel(c, tc) {
    var i = c.raceOf[tc], r = c.d.races[i];
    careerCtx(c, r);
    var extra = !r ? '' : hasVill(r, tc) ? villAllButton(c, i, '點擊進入村里層 ▶', 'Click to enter village level ▶')
      : hint(c, '此屆無村里層資料', 'No village-level data for this election');
    return panel(c, tcName(c, tc), r ? raceName(c, r) + ' · ' + raceElec(c, r) : elecName(c), r, r && r.tc[tc], 'tc', tc, extra);
  }
  function vcPanel(c, vc) {
    var tc = vc.slice(0, 8), r = c.d.races[c.raceOf[tc]], x = villVec(r, vc), T = c.win.T;
    careerCtx(c, r);
    var banner = x && x.joint ? '<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:4px 6px;margin-bottom:6px">' +
      T('與「' + x.joint + '」合併開票，以下為合併後的數字', 'Counted jointly with 「' + x.joint + '」 — the figures below are the joint station\'s') + '</div>' : '';
    return banner + panel(c, vcName(c, vc), tcName(c, tc) + (r ? ' · ' + raceName(c, r) + ' · ' + raceElec(c, r) : ''), r, x && x.vec, x && x.joint ? null : 'vc', vc);
  }
  function nationalPanel(c) {
    var T = c.win.T;
    return '<div class="t1">' + elecName(c) + '</div>' +
      '<div style="color:#bbb;font-size:11px;margin-top:4px;line-height:1.6">' +
      T('以今日行政區畫出；各縣市長選區就是它當年涵蓋的鄉鎮市區。移到各區塊查看資料，點選進入鄉鎮市區',
        'Drawn on today\'s map: each race covers the townships it had then. Hover a block to view it; click to enter its townships') + '</div>';
  }

  // ── map layers ──
  function fresh(c) { c.pathFn = G(c.win, 'pathFn'); c.gBase = G(c.win, 'gBase'); c.gBg = G(c.win, 'gBg'); c.svg = G(c.win, 'svg'); }
  function ic(c, html) {
    var el = c.win.document.getElementById('ic'); if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.v2-om-villall').forEach(function (b) { b.onclick = function () { raceVillages(c, +b.dataset.ri); }; });
  }
  function navActive(c, id) {
    ['btn-tc-nat', 'btn-vill-nat'].forEach(function (b) { var el = c.win.document.getElementById(b); if (el) el.classList.toggle('active', b === id); });
  }
  function begin(c, view, lvl) {
    fresh(c);
    c.view = view;
    navActive(c, null);
    c.win.eval("level = '" + lvl + "'; villAllMode = false; curED = null; curTC = null; curVC = null;");
    G(c.win, 'clearAll')();
    undim(c);
    c.win.document.getElementById('mp').style.background = c.win.mapBgColor();
  }
  // the engine's 縣市暗色遮罩 (_councilSetCountyDim's look): every other race darkened while one is hovered (user 2026-11-01:
  // 「黑色遮罩 縣市長09跟以前沒有」) — by race, so 臺北縣 also darkens 臺北市
  function dim(c, i) {
    if (c.dimFor === i) { clearTimeout(c.dimT); return; }
    clearTimeout(c.dimT);
    c.dimT = setTimeout(function () {
      c.dimFor = i;
      var g = G(c.win, 'gCountyDim'); if (!g) return;
      g.selectAll('*').remove();
      var others = c.d.races.map(function (r, j) { return j === i ? null : raceFeature(c, j); }).filter(Boolean);
      g.selectAll('.ft-cdim').data(others).join('path').attr('class', 'ft-cdim').attr('d', c.pathFn).attr('fill', 'rgba(0,0,0,0.45)').attr('pointer-events', 'none');
    }, 80);
  }
  function undim(c) { clearTimeout(c.dimT); c.dimFor = null; var g = G(c.win, 'gCountyDim'); if (g) g.selectAll('*').remove(); }
  function hov(c) {
    var layer = c.gBase.node();
    if (!c.hov || c.hovLayer !== layer) { c.hov = window.V2TcBorder.hover(c.win, layer, 'v2-blk-hov'); c.hovLayer = layer; }
    return c.hov;
  }
  function blocks(c, feats, fillOf, onOver, onClick, villStroke) {
    var sel = c.gBase.selectAll('.v2-om-blk').data(feats).join('path')
      .attr('class', 'ft v2-om-blk v2-own').attr('d', c.pathFn)
      .style('animation', 'none')
      .attr('fill', fillOf)
      .attr('cursor', function (d) { return onClick && onClick.can(d) ? 'pointer' : 'default'; })
      .on('mouseover', function (e, d) { hov(c).show(this.getAttribute('d')); onOver(d); })
      .on('mouseleave', function () { hov(c).hide(); })
      .on('click', function (e, d) { if (onClick && onClick.can(d)) onClick.go(d); });
    if (villStroke) sel.attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke');
    else sel.attr('stroke', fillOf).attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke');
  }
  function border(c, cls, data, kind) { window.V2TcBorder.lines(c.gBase, c.pathFn, cls, data, kind); }
  function countyMesh(c) { return c.win.topojson.mesh(c.CD, c.CD.objects.counties, function (a, b) { return a !== b; }); }
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
  function legend(c) { setTimeout(function () { if (typeof c.win.renderLegend === 'function') c.win.renderLegend(); }, 50); }
  function vgeoms(c, test) { return c.VD.objects.villages.geometries.filter(function (g) { var vc = g.properties && g.properties.vc; return vc && test(vc.slice(0, 8)); }); }
  function merged(c, key, geoms) {
    if (c.geom[key]) return c.geom[key];
    if (!geoms.length) return null;
    return (c.geom[key] = { type: 'Feature', properties: {}, geometry: window.V2TcBorder.merged(c.win, c.VD, geoms) });   // the shared merge (VD gaps aren't holes)
  }
  function tcFeature(c, tc) {
    var f = merged(c, 't' + tc, vgeoms(c, function (t) { return t === tc; }));
    if (f) f.properties.tc = tc;
    return f;
  }
  function raceFeature(c, i) {
    var f = merged(c, 'r' + i, vgeoms(c, function (t) { return c.raceOf[t] === i; }));
    if (f) f.properties.ri = i;
    return f;
  }
  function allTcFeats(c, test) {
    var seen = {}, feats = [];
    c.win.getTCGJ().features.forEach(function (f) {
      var tc = f.properties.tc; if (seen[tc] || !test(tc)) return; seen[tc] = 1;
      feats.push(tcFeature(c, tc) || f);
    });
    return feats;
  }
  function villFeats(c, test) {
    return c.win.topojson.feature(c.VD, c.VD.objects.villages).features.filter(function (f) { var vc = f.properties.vc; return vc && test(vc); });
  }
  function tcFill(c) { return function (d) { var tc = d.properties.tc, r = c.d.races[c.raceOf[tc]]; return fill(c, r, r && r.tc[tc]); }; }
  function vcFill(c) {
    return function (d) { var vc = d.properties.vc, r = c.d.races[c.raceOf[vc.slice(0, 8)]], x = villVec(r, vc); return fill(c, r, x && x.vec); };
  }
  var toTc = function (c) { return { can: function (d) { return hasVill(c.d.races[c.raceOf[d.properties.tc]], d.properties.tc); }, go: function (d) { township(c, d.properties.tc); } }; };

  // 1. 全台: one block per race
  function national(c) {
    begin(c, ['nat'], 'ed');
    var T = c.win.T, feats = c.d.races.map(function (r, i) { return raceFeature(c, i); }).filter(Boolean);
    blocks(c, feats, function (d) { var r = c.d.races[d.properties.ri]; return fill(c, r, r.v); },
      function (d) { ic(c, racePanel(c, d.properties.ri)); councilHemi(c, c.d.races[d.properties.ri]); dim(c, d.properties.ri); },
      { can: function () { return true; }, go: function (d) { race(c, d.properties.ri); } });
    // no white outline here (user 2026-10-31: 「白匡不要…排版應該要跟2014跟以後一樣」): the engine's own 縣市長 county line
    // (_addMayorLayer's .ft-mayor-border, rgba(255,255,255,.18)), between races
    var key = function (g) { var vc = g.properties && g.properties.vc; return vc ? c.raceOf[vc.slice(0, 8)] : undefined; };
    c.gBase.append('path').datum(c.win.topojson.mesh(c.VD, c.VD.objects.villages, function (a, b) { return a !== b && key(a) !== key(b); }))
      .attr('class', 'ft ft-mayor-border v2-om-rb').attr('d', c.pathFn).attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,.18)').attr('stroke-width', '1').attr('vector-effect', 'non-scaling-stroke').attr('pointer-events', 'none');
    ic(c, nationalPanel(c));
    councilHemi(c, null);
    if (c.svg) c.svg.on('mouseleave.v2om', function () { undim(c); });
    crumb(c, [[T('全台', 'All'), null]]);   // the year is in the bar's year select (a longer crumb wrapped the bar)
    zoomAll(c); legend(c);
  }
  // 2. one race's townships
  function race(c, i) {
    begin(c, ['race', i], 'tc');
    var T = c.win.T, r = c.d.races[i];
    var feats = allTcFeats(c, function (tc) { return c.raceOf[tc] === i; });
    var rf = raceFeature(c, i);
    if (rf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(rf)).attr('pointer-events', 'none');
    blocks(c, feats, tcFill(c), function (d) { ic(c, tcPanel(c, d.properties.tc)); }, toTc(c));
    border(c, 'v2-om-tcb', feats, 'tc');
    if (rf) border(c, 'v2-om-rb', [rf], 'outline');
    ic(c, racePanel(c, i).replace(T('點選進入鄉鎮市區 ▶', 'Click to enter its townships ▶'), T('點選鄉鎮進入 ▶', 'Click a township to enter ▶')));
    councilHemi(c, r);
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [raceName(c, r), null]]);
    G(c.win, 'fitFeats')(feats); legend(c);
  }
  // 3. one township's villages
  function township(c, tc) {
    begin(c, ['tc', tc], 'vill');
    var T = c.win.T, i = c.raceOf[tc], r = c.d.races[i];
    var feats = villFeats(c, function (vc) { return vc.indexOf(tc) === 0; });
    if (!feats.length) return;
    var tf = tcFeature(c, tc);
    if (tf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(tf)).attr('pointer-events', 'none');
    blocks(c, feats, vcFill(c), function (d) { ic(c, vcPanel(c, d.properties.vc)); }, null, true);
    if (tf) border(c, 'v2-om-tcb', [tf], 'tc');
    ic(c, tcPanel(c, tc).replace(T('點擊進入村里層 ▶', 'Click to enter village level ▶'), ''));
    councilHemi(c, r);
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [raceName(c, r), function () { race(c, i); }], [tcName(c, tc), null]]);
    G(c.win, 'fitFeats')(feats); legend(c);
  }
  // 「⊞ 全選區村里」: every village of one race
  function raceVillages(c, i) {
    begin(c, ['racevill', i], 'vill');
    var T = c.win.T, r = c.d.races[i];
    var feats = villFeats(c, function (vc) { return c.raceOf[vc.slice(0, 8)] === i; });
    if (!feats.length) return;
    var rf = raceFeature(c, i);
    if (rf) c.gBg.append('path').attr('class', 'bg-fill').attr('d', c.pathFn(rf)).attr('pointer-events', 'none');
    blocks(c, feats, vcFill(c), function (d) { ic(c, vcPanel(c, d.properties.vc)); }, null, true);
    border(c, 'v2-om-tcb', allTcFeats(c, function (tc) { return c.raceOf[tc] === i; }), 'tc');
    if (rf) border(c, 'v2-om-rb', [rf], 'outline');
    ic(c, racePanel(c, i).replace(/<div style="display:flex;gap:6px;margin-top:10px">[\s\S]*$/, ''));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [raceName(c, r), function () { race(c, i); }], [T('全選區村里', 'All villages'), null]]);
    G(c.win, 'fitFeats')(feats); legend(c);
  }
  // 全台鄉鎮市區 / 全台村里 (the bar's buttons)
  function allTowns(c) {
    begin(c, ['alltc'], 'tc');
    var T = c.win.T, feats = allTcFeats(c, function () { return true; });
    blocks(c, feats, tcFill(c), function (d) { ic(c, tcPanel(c, d.properties.tc)); councilHemi(c, c.d.races[c.raceOf[d.properties.tc]]); }, toTc(c));
    border(c, 'v2-om-tcb', feats, 'tc');
    border(c, 'v2-om-ccb', [countyMesh(c)], 'outline');
    ic(c, nationalPanel(c).replace(T('點選進入鄉鎮市區', 'click to enter its townships'), T('點選進入村里層', 'click to enter its villages')));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台鄉鎮市區', 'All townships'), null]]);
    navActive(c, 'btn-tc-nat');
    zoomAll(c); legend(c);
  }
  function allVillages(c) {
    begin(c, ['allvill'], 'vill');
    var T = c.win.T, feats = villFeats(c, function () { return true; });
    blocks(c, feats, vcFill(c), function (d) { ic(c, vcPanel(c, d.properties.vc)); }, null, true);
    border(c, 'v2-om-ccb', [countyMesh(c)], 'outline');
    ic(c, nationalPanel(c) + (c.cyc === '1997' || c.cyc === '2001' ? '<div style="color:#bbb;font-size:11px;margin-top:6px">' +
      T('這一屆只有直轄市（臺北市、高雄市）有村里層資料，其餘為黑色', 'This cycle has village data for the special municipalities (Taipei, Kaohsiung) only; the rest are black') + '</div>' : ''));
    crumb(c, [[T('全台', 'All'), function () { national(c); }], [T('全台村里', 'All villages'), null]]);
    navActive(c, 'btn-vill-nat');
    zoomAll(c); legend(c);
  }
  function redraw(c) {
    var v = c.view || ['nat'];
    if (v[0] === 'race') race(c, v[1]);
    else if (v[0] === 'tc') township(c, v[1]);
    else if (v[0] === 'racevill') raceVillages(c, v[1]);
    else if (v[0] === 'alltc') allTowns(c);
    else if (v[0] === 'allvill') allVillages(c);
    else national(c);
  }
  // the engine calls goED / goTCAllNational / goVillAllNational for its own redraws too: only a bar click (navbar.js sets
  // __v2NavClick) opens V2's view; any other call keeps V2's current view (as history-legind.js)
  function hookNav(win) {
    // setLang: the engine's applyLang rewrites its own pieces (crumb, titles): V2's view is drawn again in the new language
    if (typeof win.setLang === 'function' && !win.setLang.v2OldMayor) {
      var sl = win.setLang, wl = function () { var r = sl.apply(this, arguments), c = win.__v2OldMayorCtx; if (c) { chrome(c); redraw(c); } return r; };
      wl.v2OldMayor = true; win.setLang = wl;
    }
    var to = { goED: national, goTCAllNational: allTowns, goVillAllNational: allVillages };
    Object.keys(to).forEach(function (n) {
      var o = win[n]; if (typeof o !== 'function' || o.v2OldMayor) return;
      var w = function () {
        var c = win.__v2OldMayorCtx;
        if (!c) return o.apply(this, arguments);
        if (win.__v2NavClick) to[n](c); else redraw(c);
      };
      w.v2OldMayor = true; win[n] = w;
    });
  }

  function chrome(c) {
    var win = c.win, T = win.T;
    var mt = win.document.getElementById('map-title');
    if (mt) mt.textContent = c.d.label + T(' 縣市長地圖', ' Mayoral Map');
    var set = function (id, zh, en, val) {
      var l = win.document.getElementById(id + '-lbl'), v = win.document.getElementById(id);
      if (l) { l.dataset.zh = zh; l.dataset.en = en; l.textContent = G(win, 'currentLang') === 'en' ? en : zh; }
      if (v) { v.textContent = val; v.style.color = ''; }
    };
    var n = c.d.races.length, m = c.d.races.filter(function (r) { return isMuni(c, r); }).length;
    set('ss-region', '直轄市長', 'Municipal mayors', String(m));
    set('ss-pl', '縣市長', 'County mayors', String(n - m));
    set('ss-total', '縣市首長', 'Local executives', String(n));
  }
  var ENSURE_AT = [300, 1000, 2500, 5000];
  function ensure(c) {
    var win = c.win;
    if (win.__v2OldMayorCtx !== c) return;
    chrome(c);
    var gB = G(win, 'gBase'), glow = G(win, 'gGlow');
    var glowBack = glow && !glow.selectAll('.glow-core').empty();
    if (G(win, 'curED') != null || glowBack || gB.select('.v2-own').empty()) {
      if (G(win, 'curED') != null) { win.eval("level = 'ed'; curED = null; curTC = null; curVC = null; villAllMode = false;"); win.setMayorMode(ENGINE_YEAR); }
      redraw(c);
    } else if ((c.view[0] === 'race' || c.view[0] === 'tc' || c.view[0] === 'racevill') && win.d3.zoomTransform(G(win, 'svg').node()).k < 1.5) {
      var fs = []; gB.selectAll('.v2-om-blk').each(function (d) { fs.push(d); });
      G(win, 'fitFeats')(fs);
    }
  }
  function schedule(c) {
    (c.win.__v2OldMayorTimers || []).forEach(clearTimeout);
    c.win.__v2OldMayorTimers = ENSURE_AT.map(function (ms) { return setTimeout(function () { ensure(c); }, ms); });
  }

  // after win.setMayorMode(V2OldMayor.ENGINE_YEAR)
  function draw(win, cyc) {
    clear(win);
    var d = dataFor(cyc), CD = G(win, 'CD'), VD = G(win, 'VD');
    if (!d || !CD || !VD) return 0;
    var c = { win: win, cyc: cyc, d: d, CD: CD, VD: VD, cos: win.topojson.feature(CD, CD.objects.counties), geom: {}, raceOf: {}, view: ['nat'] };
    var tlr = {}, tlt = {}, tlv = {};
    d.races.forEach(function (r, i) {
      tlr[i] = tl(r.v);
      Object.keys(r.tc).forEach(function (tc) { c.raceOf[tc] = i; var x = tl(r.tc[tc]); if (x) tlt[tc] = x; });
      Object.keys(r.vc).forEach(function (vc) { var x = tl(r.vc[vc]); if (x) tlv[vc] = x; });
    });
    c.tl = { race: tlr, tc: tlt, vc: tlv };
    win.__v2OldMayorCtx = c;
    hookNav(win);
    national(c);
    chrome(c);
    schedule(c);
    win.__v2OmResize = function () { schedule(c); };
    win.addEventListener('resize', win.__v2OmResize);
    win.document.addEventListener('fullscreenchange', win.__v2OmResize);
    return d.races.length;
  }
  function clear(win) {
    if (win.__v2OmResize) {
      win.removeEventListener('resize', win.__v2OmResize);
      win.document.removeEventListener('fullscreenchange', win.__v2OmResize);
      win.__v2OmResize = null;
    }
    (win.__v2OldMayorTimers || []).forEach(clearTimeout);
    win.__v2OldMayorTimers = [];
    var oc = win.__v2OldMayorCtx;
    if (oc) { undim(oc); if (oc.svg) oc.svg.on('mouseleave.v2om', null); }
    win.__v2OldMayorCtx = null;
  }
  window.V2OldMayor = { draw: draw, clear: clear, ENGINE_YEAR: ENGINE_YEAR, CYCLES: ['1997', '2001', '2005', '2009'] };
})();
