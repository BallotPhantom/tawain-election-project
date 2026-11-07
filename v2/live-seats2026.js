/* Election night (v2/live.html, the real night — not ?demo=1): the engine's council districts and seats switched to 2026
 * (user 2026-11-07: 「開始確認2026縣市市議會的席次數有沒有正確」→「都做」).
 *
 * The engine (live2026.html, V1 untouched) carries the 2022 districts: COUNCIL_SEATS (general seats), COUNCIL_IND_P_DISTS
 * / _M_DISTS (原住民), and its village → district index (_vcToDistKey / _tcToDistKey, from the 2022 results) from which
 * it merges every council district's shape. 2026 (CEC 115/8/20 中選務字第1153150253號, v2/data_council_seats_2026.js):
 * 919 seats; 新竹縣 竹北市 split into two districts by village and every later district renumbered; seats moved between
 * districts in several counties; new 原住民 districts (彰化 山地, 雲林 平地＋山地, 基隆 山地, 新竹市 山地 …). Inside the
 * election-night iframe only:
 *  - COUNCIL_SEATS (a const object) refilled with the 2026 general districts;
 *  - COUNCIL_IND_P_DISTS / _M_DISTS reassigned to the 2026 原住民 districts ({dist, seats, title, cands: []}) after every
 *    setLiveTrack2026Mode (its setCouncilElectionMode('2022') puts the 2022 tables back);
 *  - after every buildCouncilIndexes the village / township → district index rewritten from the 2026 table (a township
 *    split by village maps village by village), the cached district shapes dropped (_combinedEDGJ) so the engine merges
 *    the 2026 shapes; COUNCIL_DIST_GJ gets one entry per 2026 general district (its shape is merged from the villages);
 *  - 新竹縣's multi-district 山地 shapes (COUNCIL_IND_M_GJ, 2022 numbers 12/13) take the 2026 numbers 13/14.
 * V2LiveSeats2026.attach(win) once per engine; does nothing with ?demo=1 (the 2022 rehearsal keeps the 2022 districts).
 */
(function () {
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function cn(n) { return n <= 10 ? CN[n] : n < 20 ? '十' + CN[n - 10] : CN[Math.floor(n / 10)] + '十' + CN[n % 10]; }

  function attach(win) {
    if (!win || win.__v2Seats26 || typeof COUNCIL_SEATS_2026 === 'undefined') return;
    if (G(win, '_LIVE26_DEMO')) return;
    win.__v2Seats26 = true;
    var S = COUNCIL_SEATS_2026, keys = Object.keys(S);

    function ind(kind) {
      var out = {};
      keys.filter(function (k) { return S[k][3] === kind; }).sort().forEach(function (k) {
        var cc = S[k][0], n = +k.split('_')[1];
        (out[cc] = out[cc] || []).push({ dist: k.split('_')[1], seats: S[k][1], title: '第' + cn(n) + '選舉區', cands: [], tot: 0 });
      });
      return out;
    }
    win.__v2Ind26 = { p: ind('p'), m: ind('m') };
    function tables() {
      var CS = G(win, 'COUNCIL_SEATS');
      if (CS) { Object.keys(CS).forEach(function (k) { delete CS[k]; }); keys.forEach(function (k) { if (S[k][3] === 'r') CS[k] = S[k][1]; }); }
      try { win.eval('COUNCIL_IND_P_DISTS = window.__v2Ind26.p; COUNCIL_IND_M_DISTS = window.__v2Ind26.m;'); } catch (e) {}
      try { win.eval('_ccSeatCache = null'); } catch (e) {}
    }
    function index() {
      var V = G(win, '_vcToDistKey'), TC = G(win, '_tcToDistKey'), TV = G(win, '_tcToVCs') || {};
      if (!V || !TC) return;
      // already the 2026 index (a 竹北市 village of 2026 第2選舉區 points there — in 2022 all 竹北市 was 第1): nothing to redo,
      // keep the merged shapes
      var probe = (S['10004_02'] && S['10004_02'][5] || [])[0];
      if (probe && V[probe] === '10004_02') return;
      keys.forEach(function (k) {
        var v = S[k]; if (v[3] !== 'r') return;
        v[4].forEach(function (tc) {
          var own = (v[5] || []).filter(function (vc) { return vc.slice(0, 8) === tc; });
          if (own.length) own.forEach(function (vc) { V[vc] = k; });   // split by village
          else { (TV[tc] || []).forEach(function (vc) { V[vc] = k; }); TC[tc] = k; }
          if (own.length && !TC[tc]) TC[tc] = k;
        });
      });
      // a split township's own key: the district holding most of its villages
      keys.forEach(function (k) {
        var v = S[k]; if (v[3] !== 'r' || !v[5]) return;
        v[4].forEach(function (tc) {
          var cnt = {}; (TV[tc] || []).forEach(function (vc) { if (V[vc]) cnt[V[vc]] = (cnt[V[vc]] || 0) + 1; });
          var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0]; if (best) TC[tc] = best;
        });
      });
      var GJ = G(win, 'COUNCIL_DIST_GJ');
      if (GJ && !GJ.__v2_2026) {   // one entry per 2026 general district (shape merged from the villages by the engine)
        var have = {}; GJ.features.forEach(function (f) { have[f.properties.ed] = f; });
        GJ.features = keys.filter(function (k) { return S[k][3] === 'r'; }).sort().map(function (k) {
          return have[k] && S[k][0] !== '10004' ? have[k] : { type: 'Feature', properties: { ed: k }, geometry: null };
        });
        GJ.__v2_2026 = true;
      }
      var MG = G(win, 'COUNCIL_IND_M_GJ');
      if (MG && !MG.__v2_2026) {   // 新竹縣 山地: 2022 第12／13 → 2026 第13／14
        MG.features.forEach(function (f) {
          var p = (f.properties.ed || '').split('_');
          if (p[0] === '10004' && (p[1] === '12' || p[1] === '13')) f.properties.ed = '10004_' + ('0' + (+p[1] + 1)).slice(-2);
        });
        MG.__v2_2026 = true;
      }
      try { win.eval('_combinedEDGJ = null'); } catch (e) {}
    }
    function wrap(name, after) {
      var o = win[name]; if (typeof o !== 'function') return;
      win[name] = function () { var r = o.apply(this, arguments); after(); return r; };
    }
    // the indexes first, so the tables / shapes are in place before the next draw
    wrap('buildCouncilIndexes', index);
    var sl = win.setLiveTrack2026Mode;
    if (typeof sl === 'function') win.setLiveTrack2026Mode = function () {
      tables();   // before: the mode's own first draw already sees 2026
      var r = sl.apply(this, arguments);
      tables(); index();
      if (win._live2026CurrentSub === 'council' && G(win, 'level') === 'ed' && G(win, 'curED') == null) win.goED();
      return r;
    };
    tables(); index();
  }
  window.V2LiveSeats2026 = { attach: attach };
})();
