/* Election night (v2/live.html) → 縣市議員: the county-council box draws the WHOLE council of the hovered district's county,
 * that district's seats lit (user 2026-11-07: 「縣市議員按照選區畫出席次圖時他沒有畫出該縣市的完整席數，只畫出該選區的席數」,
 * 「山地平地原住民的也是舊版沒有隨著更新」).
 *
 * The engine's live branch of drawCountyHemiForED (live2026.html) draws only the hovered district's seat count, all
 * white. Inside the election-night iframe (V1 untouched) drawCountyHemiForED is wrapped for the council sub-mode:
 *  - seats: every general district (COUNCIL_SEATS) + the 平地／山地原住民 districts (COUNCIL_IND_P_DISTS / _M_DISTS) of the
 *    county; the dots in the engine's camp order (COUNCIL_CAMP_ORDER), as History's council box (history-oldcouncil.js);
 *  - a district's seats go to its top-n candidates by live votes (n = its seats), from the source with the most votes
 *    counted; once the district is final (the source's elected marks adding up to the seats, or the entry's own final
 *    when the source marks no one) its elected candidates. Party: the source's own field (c.p), else the 2022 roster of that district
 *    (getCouncilDistData / the 原住民 tables), else other;
 *  - hollow ring = leading, solid = final (as the 開票動畫 page); a district with no numbers yet keeps white dots;
 *  - the hovered district's seats lit, the rest darkened (History's dark(base)).
 * Mayor sub-mode and every non-live call go to the engine's own function untouched.
 * V2LiveCouncilHemi.attach(win) once per engine.
 */
(function () {
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }

  function attach(win) {
    if (!win || win.__v2LiveHemi || typeof win.drawCountyHemiForED !== 'function') return;
    win.__v2LiveHemi = true;
    var orig = win.drawCountyHemiForED, roster = {};

    function distsOf(cc) {   // [{dk, seats, kind}] general by number, then 平地, then 山地
      var out = [], SEATS = G(win, 'COUNCIL_SEATS') || {};
      Object.keys(SEATS).filter(function (k) { return k.split('_')[0] === cc; }).sort()
        .forEach(function (k) { out.push({ dk: k, seats: SEATS[k], kind: 'r' }); });
      [['p', G(win, 'COUNCIL_IND_P_DISTS')], ['m', G(win, 'COUNCIL_IND_M_DISTS')]].forEach(function (pr) {
        ((pr[1] || {})[cc] || []).forEach(function (d) { out.push({ dk: cc + '_' + d.dist, seats: d.seats, kind: pr[0], cands: d.cands }); });
      });
      return out;
    }
    function partyOf(d, c) {   // the source's own party, else (2022 rehearsal only) the 2022 roster of the district
      if (c.p) return c.p;
      if (!G(win, '_LIVE26_DEMO')) return 'other';   // 2026: districts renumbered (新竹縣) — a 2022 roster would mislabel
      var r = roster[d.dk];
      if (!r) {
        r = roster[d.dk] = {};
        var list = d.cands || (function () { try { var x = win.getCouncilDistData(d.dk); return x && x.cands; } catch (e) { return null; } })() || [];
        list.forEach(function (y) { r[y.n] = y.p; });
      }
      return r[c.n] || 'other';
    }
    function seatsOf(d) {   // [{p, st}] for the district's seats; st 'final' | 'lead' | 'none'
      var LED = G(win, 'LIVE_TRACK_ED') || {}, e = LED[d.dk], best = null, bv = 0;
      Object.keys((e && e.sources) || {}).forEach(function (k) {
        var s = e.sources[k], v = (s.cands || []).reduce(function (a, c) { return a + (c.v || 0); }, 0);
        if (v > bv) { bv = v; best = s; }
      });
      var out = [];
      if (!best) { for (var i = 0; i < d.seats; i++) out.push({ p: null, st: 'none' }); return out; }
      var marked = best.cands.filter(function (c) { return c.e; });
      // final: the entry's own final with no marks (vote order) or marks that add up; marks that do not add up stay
      // 'leading' (the 開票動畫 page's rule; 2022: 新竹縣第8選區 5 of 6)
      var fin = marked.length ? marked.length === d.seats : !!e.final;
      var who = marked.length === d.seats ? marked : best.cands.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, d.seats);
      who.forEach(function (c) { out.push({ p: partyOf(d, c), st: fin ? 'final' : 'lead' }); });
      while (out.length < d.seats) out.push({ p: null, st: 'none' });
      return out;
    }

    win.drawCountyHemiForED = function (ed, highlightBp, indType) {
      var live = G(win, "typeof isLiveTrack26 !== 'undefined' && isLiveTrack26");
      if (!live || win._live2026CurrentSub !== 'council' || !ed || ed.indexOf('_') < 0) return orig.apply(this, arguments);
      var doc = win.document, T = G(win, 'T'), CLR = G(win, 'COUNCIL_CLR') || {}, ORDER = G(win, 'COUNCIL_CAMP_ORDER') || {};
      var NODATA = G(win, '_LIVE26_NO_DATA_COLOR') || '#f5f5f5';
      var panel = doc.getElementById('county-council-panel'); if (panel) panel.style.display = '';
      var cc = ed.split('_')[0], dists = distsOf(cc);
      var dots = [];
      dists.forEach(function (d, idx) { seatsOf(d).forEach(function (s) { dots.push({ p: s.p, st: s.st, idx: idx, on: d.dk === ed }); }); });
      if (!dots.length) return orig.apply(this, arguments);
      dots.sort(function (a, b) {
        var oa = a.p ? (ORDER[a.p] || 99) : 50, ob = b.p ? (ORDER[b.p] || 99) : 50;   // no numbers yet: the middle
        return (oa - ob) || (a.idx - b.idx);
      });
      var titleEl = doc.getElementById('ccp-county-title');
      if (titleEl) { titleEl.textContent = (typeof win.translateED === 'function' ? win.translateED(ed) : ed); titleEl.style.color = ''; }
      var bp = {}; dots.forEach(function (s) { if (s.p) bp[s.p] = (bp[s.p] || 0) + 1; });
      var srEl = doc.getElementById('ccp-seat-ratio');
      if (srEl) srEl.innerHTML = Object.keys(bp).sort(function (a, b) { return (ORDER[a] || 99) - (ORDER[b] || 99); }).map(function (p) {
        var col = CLR[p] || '#aaa';
        return '<div class="sr-badge" style="display:inline-flex;align-items:center;gap:3px;margin:0 4px;"><span style="width:8px;height:8px;border-radius:50%;background:' + col +
          ';display:inline-block;vertical-align:middle;flex-shrink:0"></span><span class="sr-num" style="font-weight:700;font-size:11px;vertical-align:middle;color:' + col + '">' + bp[p] + '</span></div>';
      }).join('');
      var centerEl = doc.getElementById('ccp-hemi-center'); if (centerEl) centerEl.textContent = dots.length;
      var b5 = doc.getElementById('ccp-base5-compare'); if (b5) b5.innerHTML = '';
      var svg = win.d3.select('#ccp-hemi-svg');
      var W = 185, H = 95, cx = 92, cy = 90, sR = 28, eR = 84, total = dots.length, R = total > 70 ? 3.6 : total > 50 ? 4.2 : 5.0;
      var rows = total <= 20 ? 3 : total <= 35 ? 4 : total <= 55 ? 5 : total <= 75 ? 6 : 7;
      svg.attr('width', W).attr('height', H).selectAll('*').remove();
      var dark = function (hex) { var h = (hex || '').length === 7 ? hex : '#888888'; return 'rgb(' + ((parseInt(h.slice(1, 3), 16) * 0.3) | 0) + ',' + ((parseInt(h.slice(3, 5), 16) * 0.3) | 0) + ',' + ((parseInt(h.slice(5, 7), 16) * 0.3) | 0) + ')'; };
      win.generateHemiPoints(total, cx, cy, sR, eR, rows, 0.38, 1.2).forEach(function (pt, i) {
        var d = dots[i], base = d.p ? (CLR[d.p] || CLR.other || '#aaa') : NODATA, col = d.on ? base : dark(base);
        var c = svg.append('circle').attr('cx', pt.cx).attr('cy', pt.cy).attr('r', R);
        if (d.st === 'lead') c.attr('fill', 'rgba(10,13,22,.9)').attr('stroke', col).attr('stroke-width', R * 0.38);   // hollow = leading
        else c.attr('fill', col).attr('stroke', d.on ? '#fff' : 'rgba(255,255,255,.25)').attr('stroke-width', R * 0.12);   // solid = final; white = no numbers
      });
    };
  }
  window.V2LiveCouncilHemi = { attach: attach };
})();
