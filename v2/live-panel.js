/* Election night (v2/live.html): the county panel's chart and candidate rows (user 2026-11-07: 「舊版的折線圖改成長條圖
 * 按照進來的票數來累積看 pattern，同時把基本盤那一行比較刪掉」; chart style picked: 累積).
 *
 * Inside the election-night iframe (V1 live2026.html untouched):
 *  - _liveMarginTrendSvg (the 「領先幅度隨時間變化」 line) is replaced by a bar per poll update: its height = the votes
 *    counted by then, split by candidate in party colour (stacked, the eventual order kept from the latest update), so
 *    the way the lead builds or narrows shows. Data: LIVE2026_MARGIN_LOG entries' cands (poll_live2026.py writes each
 *    candidate's running count since 2026-11-07); entries without them are skipped. One chart per source, as before.
 *  - LIVE2026_MARGIN_LOG is re-read on every live poll (the engine read it once at page load, so the chart never moved);
 *  - _liveTrack26Html's 「政黨基本盤天花板 … （已達 …）」 line is taken out of every candidate row;
 *  - 推定當選 / 確定 marks and the votes-to-come / edge-gap notes in each 縣市長 / 縣市議員 source card (see 4 below).
 * V2LivePanel.attach(win) once per engine.
 */
(function () {
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function attach(win) {
    if (!win || win.__v2LivePanel) return;
    win.__v2LivePanel = true;
    // the engine's language is a script-level let (currentLang), not a window property
    var T = function (zh, en) { return G(win, 'currentLang') === 'en' ? en : zh; };

    // ── 1. the bar chart ──
    win._liveMarginTrendSvg = function (cc) {
      var LOG = G(win, "typeof LIVE2026_MARGIN_LOG !== 'undefined' ? LIVE2026_MARGIN_LOG : null"), log = LOG && LOG[cc];
      if (!log) return '';
      var CLR = G(win, 'COUNCIL_CLR') || {};
      var out = '';
      Object.keys(log).forEach(function (sk) {
        var pts = (log[sk] || []).filter(function (e) { return e.cands && e.cands.length; }).slice(-40);
        if (!pts.length) return;
        var last = pts[pts.length - 1], order = last.cands.slice().sort(function (a, b) { return b.v - a.v; }).map(function (c) { return c.n; });
        var party = {}; last.cands.forEach(function (c) { party[c.n] = c.p || (typeof win._liveCandParty === 'function' ? win._liveCandParty(cc, c.n) : null) || 'other'; });
        var tot = function (e) { return e.cands.reduce(function (a, c) { return a + (c.v || 0); }, 0); };
        var maxT = Math.max.apply(null, pts.map(tot)) || 1;
        var W = 240, H = 80, padL = 4, padB = 14, gap = 2, bw = Math.max(3, Math.min(18, (W - padL) / pts.length - gap));
        var bars = pts.map(function (e, i) {
          var x = padL + i * (bw + gap), y0 = H - padB, by = {}; e.cands.forEach(function (c) { by[c.n] = c.v || 0; });
          var segs = '', tip = e.ts.slice(11, 16) + '\n' + order.map(function (n) { return n + ' ' + (by[n] || 0).toLocaleString(); }).join('\n');
          order.forEach(function (n) {
            var h = (by[n] || 0) / maxT * (H - padB - 4); if (h <= 0) return;
            y0 -= h;
            segs += '<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + (CLR[party[n]] || '#aaa') + '"></rect>';
          });
          return '<g><title>' + esc(tip) + '</title>' + segs + '</g>';
        }).join('');
        var hhmm = function (e) { return e.ts.slice(11, 16); };
        var lead = last.cands.slice().sort(function (a, b) { return b.v - a.v; });
        out += '<div style="margin-top:6px">' +
          '<div style="font-size:9.5px;color:rgba(255,255,255,0.45);margin-bottom:3px">' + T('累計票數（每次更新一根）', 'Votes counted (one bar per update)') + (Object.keys(log).length > 1 ? ' · ' + esc(sk) : '') + '</div>' +
          '<svg width="' + W + '" height="' + H + '" style="overflow:visible">' +
          '<line x1="0" y1="' + (H - padB) + '" x2="' + W + '" y2="' + (H - padB) + '" stroke="rgba(255,255,255,0.1)"></line>' + bars +
          '<text x="0" y="' + (H - 2) + '" font-size="7" fill="rgba(255,255,255,0.35)">' + hhmm(pts[0]) + '</text>' +
          '<text x="' + W + '" y="' + (H - 2) + '" font-size="7" fill="rgba(255,255,255,0.35)" text-anchor="end">' + hhmm(last) + '</text>' +
          '<text x="' + W + '" y="7" font-size="7" fill="rgba(255,255,255,0.35)" text-anchor="end">' + maxT.toLocaleString() + T(' 票', ' votes') + '</text>' +
          '</svg>' +
          '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:1px">' + lead.slice(0, 3).map(function (c) {
            return '<span style="color:' + (CLR[party[c.n]] || '#aaa') + ';font-weight:600">■</span> ' + esc(c.n); }).join('　') + '</div>' +
          '</div>';
      });
      return out;
    };

    // ── 2. the margin log re-read with every live poll ──
    var poll = win._liveTrack26Poll;
    if (typeof poll === 'function') win._liveTrack26Poll = function () {
      var r = poll.apply(this, arguments);
      win.fetch('data_live2026_margin_log.js?_=' + Date.now(), { cache: 'no-store' }).then(function (x) { return x.text(); }).then(function (txt) {
        var fresh = new win.Function(txt + '\nreturn LIVE2026_MARGIN_LOG;')(), LOG = G(win, 'LIVE2026_MARGIN_LOG');
        if (!LOG || !fresh) return;
        Object.keys(LOG).forEach(function (k) { delete LOG[k]; }); Object.keys(fresh).forEach(function (k) { LOG[k] = fresh[k]; });
      }).catch(function () {});
      return r;
    };

    // ── 3. no 政黨基本盤天花板 line; 4. 推定當選 (the 開票之夜 page's rule) ──
    // 4 (user 2026-11-07: 「舊版要加入新版的公式估算預計當選」, approved 1/2/3): per source card of a 縣市長 (1 seat) or
    // 縣市議員 district (its seats) —
    //   votes still to come ≈ counted × (應開 / 已開 − 1) from the source's polling stations (prog);
    //   the source's own elected marks adding up to the seats → ✓ (確定) on those names;
    //   otherwise the edge gap (last seat − first loser; mayor: first − second) larger than the votes to come →
    //   「推定當選」 after the leading names; under the list 「尚未開出約 N 票（依開票所比例估）」 and, council,
    //   「最後一席與落選頭差 N 票」. No polling-station numbers (the ?demo=1 file) → no estimate. Seat box unchanged.
    function seatsFor(table, key) {
      if (table === G(win, "typeof LIVE_TRACK_CC !== 'undefined' ? LIVE_TRACK_CC : null")) return 1;
      if (table !== G(win, "typeof LIVE_TRACK_ED !== 'undefined' ? LIVE_TRACK_ED : null")) return null;
      var CS = G(win, 'COUNCIL_SEATS') || {}; if (CS[key]) return CS[key];
      var p = key.split('_'), hit = null;
      [G(win, 'COUNCIL_IND_P_DISTS'), G(win, 'COUNCIL_IND_M_DISTS')].forEach(function (m) {
        ((m || {})[p[0]] || []).forEach(function (d) { if (d.dist === p[1]) hit = d.seats; });
      });
      return hit;
    }
    // 縣市長 cards: the county's expected final total and its safe upper bound from this source's township numbers
    // (v2/live-turnout.js, C2; user 2026-11-08: 過半門檻要靠到時候的投票率 → backtest → 「好」), replacing 「counted ÷ share of
    // stations」 for the threshold, the votes-to-come note and 推定當選 (which now needs the gap to beat the upper bound)
    var MUNI = { '63': 1, '64': 1, '65': 1, '66': 1, '67': 1, '68': 1 };
    function ccOf(tc) { return MUNI[tc.slice(0, 2)] ? tc.slice(0, 2) : tc.slice(0, 5); }
    function turnout(k, cc, counted, pr) {
      // TURNOUT_PRIOR is a top-level const (a global binding, not a window property)
      if (!window.LiveTurnout || typeof TURNOUT_PRIOR === 'undefined') return null;
      var prior = TURNOUT_PRIOR['2026'], TC = G(win, "typeof LIVE_TRACK_TC !== 'undefined' ? LIVE_TRACK_TC : null") || {}, towns = [];
      Object.keys(TC).forEach(function (tc) {
        var src = TC[tc] && TC[tc].sources && TC[tc].sources[k]; if (!src || !src.cands) return;
        var cnt = src.cands.reduce(function (a, c) { return a + (c.v || 0); }, 0);
        var s = src.prog && src.prog[1] ? src.prog[0] / src.prog[1] : (cnt > 0 ? null : 0);
        if (s == null) return;   // a township without its own station count: left to the prior
        towns.push({ tc: tc, cnt: cnt, s: s });
      });
      var r = window.LiveTurnout.estimate(prior, towns, cc, ccOf);
      if (!r && pr) r = window.LiveTurnout.estimateCounty(prior, cc, ccOf, counted, pr[0] / pr[1]);
      if (r && counted > r.est) { r.est = counted; r.upper = counted * (1 + r.margin); }
      return r;
    }
    var TAG = 'font-size:9px;font-weight:600;color:#4ade80;margin-left:4px';
    var NOTE = 'font-size:9px;color:rgba(255,255,255,0.45);margin-top:2px';
    var html = win._liveTrack26Html;
    if (typeof html === 'function') win._liveTrack26Html = function (codeKey, table) {
      var s = html.apply(this, arguments);
      if (typeof s !== 'string') return s;
      s = s.replace(/<div style="font-size:9px;color:rgba\(255,255,255,0\.45\);margin-top:1px">(?:政黨基本盤天花板|Party base-lean ceiling)[\s\S]*?<\/span><\/div>/g, '');
      var seats = seatsFor(table, codeKey), entry = table && table[codeKey], isCC = seats === 1 && table === G(win, "typeof LIVE_TRACK_CC !== 'undefined' ? LIVE_TRACK_CC : null");
      if (!seats || !entry || !entry.sources) return s;
      var MARK = '<div style="border:1px solid rgba(220,38,38,0.35);', parts = s.split(MARK);
      Object.keys(entry.sources).forEach(function (k, i) {
        var part = parts[i + 1], src = entry.sources[k]; if (part == null || !src || !src.cands) return;
        var srt = src.cands.slice().sort(function (a, b) { return b.v - a.v; }), counted = srt.reduce(function (a, c) { return a + c.v; }, 0);
        var marked = srt.filter(function (c) { return c.e; }), fin = marked.length === seats;
        var pr = src.prog && src.prog[0] > 0 && src.prog[1] ? src.prog : null;
        var remain = pr ? (pr[0] >= pr[1] ? 0 : counted * (pr[1] / pr[0] - 1)) : null;
        var tr = isCC ? turnout(k, codeKey, counted, pr) : null, safeRemain = remain;
        if (tr) { remain = Math.max(0, tr.est - counted); safeRemain = Math.max(0, tr.upper - counted); }
        var gap = srt.length > seats ? srt[seats - 1].v - srt[seats].v : null;
        var est = !fin && safeRemain != null && gap != null && gap > safeRemain;
        srt.slice(0, seats).forEach(function (c) {
          var n = c.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (fin && c.e) part = part.replace(new RegExp('<span>(?:✓ )?' + n + '</span>'), '<span>✓ ' + c.n + '</span>');
          else if (est) part = part.replace(new RegExp('<span>((?:✓ )?' + n + ')</span>'), '<span>$1<i style="' + TAG + ';font-style:normal">' + T('推定當選', 'projected') + '</i></span>');
        });
        // 縣市長當選門檻 (user 2026-11-07, approved): 選罷法第67條 — the most votes win, no floor; 第70條 — a sole candidate
        // needs 20% of the electorate. Two or more: 「過半保證當選 ≈ expected total ÷ 2」 (expected = counted ÷ the share of
        // stations counted) and a tick on each bar where that is (bars are shares of the votes counted so far); a sole
        // candidate: 選舉人數 × 20% (the engine's _cc26Elig) and how far along
        var thr = '';
        if (isCC) {
          if (srt.length === 1) {
            var el = typeof win._cc26Elig === 'function' ? win._cc26Elig(codeKey) : null;
            thr = '<div style="' + NOTE + '">' + (el ? T('法定當選門檻：選舉人數 × 20% ≈ ' + Math.ceil(el * 0.2).toLocaleString() + ' 票（已達 ' + (srt[0].v / (el * 0.2) * 100).toFixed(1) + '%）', 'Legal floor: 20% of the electorate ≈ ' + Math.ceil(el * 0.2).toLocaleString() + ' (' + (srt[0].v / (el * 0.2) * 100).toFixed(1) + '% reached)')
              : T('唯一候選人：得票須達選舉人總數 20% 才當選（選罷法第70條）', 'Sole candidate: needs 20% of the electorate (art. 70)')) + '</div>';
          } else if (tr || pr || fin) {
            var expT = tr ? tr.upper : (remain != null ? counted + remain : counted), half = Math.ceil(expT / 2), pos = Math.min(100, half / (counted || 1) * 100);
            var estT = tr ? Math.round(tr.est / 100) * 100 : Math.round(expT), mg = tr ? Math.round(tr.margin * 100) : 0;
            thr = '<div style="' + NOTE + '">' + T('過半保證當選 ≈ ' + half.toLocaleString() + ' 票（預估總票數約 ' + estT.toLocaleString() + (mg ? '，含 +' + mg + '% 安全邊際' : '') + '）',
              'Certain win past half ≈ ' + half.toLocaleString() + ' (expected total ~' + estT.toLocaleString() + (mg ? ', with a +' + mg + '% safety margin' : '') + ')') + '</div>';
            if (pos < 100) part = part.split('<div style="height:7px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">').join(
              '<div style="height:7px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;position:relative"><div style="position:absolute;left:' + pos.toFixed(2) + '%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.8)"></div>');
          }
        }
        var notes = thr + (remain != null && remain > 0 ? '<div style="' + NOTE + '">' + (tr ? T('尚未開出約 ' + Math.round(remain).toLocaleString() + ' 票（依各鄉鎮投票率估）', '~' + Math.round(remain).toLocaleString() + ' votes to come (from each township\'s turnout)')
          : T('尚未開出約 ' + Math.round(remain).toLocaleString() + ' 票（依開票所比例估）', '~' + Math.round(remain).toLocaleString() + ' votes to come (from the share of stations counted)')) + '</div>' : '') +
          (seats > 1 && gap != null ? '<div style="' + NOTE + '">' + T('最後一席與落選頭差 ' + gap.toLocaleString() + ' 票', 'Edge gap (last seat vs first loser) ' + gap.toLocaleString()) + '</div>' : '');
        var close = part.indexOf('\n    </div>');   // the card's own closing tag (rows close at a deeper indent)
        if (notes && close >= 0) part = part.slice(0, close) + notes + part.slice(close);
        parts[i + 1] = part;
      });
      return parts.join(MARK);
    };
  }
  window.V2LivePanel = { attach: attach };
})();
