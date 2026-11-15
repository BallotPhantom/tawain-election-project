/* 2026 縣市長預測: the 「不套 2022 錨點」 scenario as a dashed comparison on the 台北 / 新竹市 county panels — shown, not used
 * (user 2026-11-14: 「比照南部民調偏誤的做法加一個虛線」「給參考」). Same look as south26.js.
 *
 * Why: regen3 blends a 2022 winner's own 2022 share into the forecast (weight 1 − trust). In 台北 and 新竹市 the 2022 race had
 * a strong third candidate (24.9% / 17.8%), so 蔣萬安's 41.9 and 高虹安's 44.4 are three-way shares pulling down a 2026 race
 * that is two-way, while the opponent (no 2022 record) is taken from the polls alone. The model stays frozen
 * (feedback_forecast_model_frozen); build_anchor26.py reruns the same regen3.compute_county with only these two counties'
 * anchors removed and writes the vote shares to anchor26_data.js; this re-runs the engine's fixed-seed Monte Carlo with them
 * and draws the scenario median as a dashed tick on each candidate's range bar.
 *   V2Anchor26.attach(win)
 */
(function () {
  function G(win, n) { try { return win.eval(n); } catch (e) { return undefined; } }
  var nm = function (n) { return String(n).split(/[（(]/)[0].trim(); };

  function scenario(win) {
    var P = G(win, 'MAYOR_2026_PREDICT'), A = window.ANCHOR26;
    if (!P || !A || typeof win._runMC2026 !== 'function') return null;
    var saved = [];
    Object.keys(A).forEach(function (cc) {
      var e = P[cc]; if (!e || e.no_prediction) return;
      e.cands.forEach(function (c) { var v = A[cc].v[nm(c.n)]; if (v != null) { saved.push([c, c.v]); c.v = v; } });
    });
    if (!saved.length) return null;
    var r; try { r = win._runMC2026(); } finally { saved.forEach(function (s) { s[0].v = s[1]; }); }
    var out = {};
    Object.keys(A).forEach(function (cc) { if (r && r.summary[cc]) out[cc] = r.summary[cc]; });
    return out;
  }

  function attach(win) {
    var doc = win.document, ic = doc.getElementById('ic');
    if (!ic || win.__v2Anchor26 || !window.ANCHOR26) return;
    var A = window.ANCHOR26, B = null, busy = false;
    var run = function () {
      if (busy || !G(win, "typeof is2026Predict !== 'undefined' && is2026Predict")) return;
      var t1 = ic.querySelector('.t1'); if (!t1 || ic.querySelector('.v2-anchor26')) return;
      var NM = G(win, '_CC_NAME') || {}, title = t1.textContent.trim(), cc = null;
      Object.keys(A).forEach(function (c) { if (NM[c] && title.indexOf(NM[c]) === 0) cc = c; });
      if (!cc) return;
      var bars = [].filter.call(ic.querySelectorAll('div'), function (el) { return el.style.position === 'relative' && el.style.height === '14px'; });
      if (!bars.length) return;
      if (!B) B = scenario(win);
      var S = B && B[cc]; if (!S) return;
      busy = true;
      try {
        var T = win.T, rows = [];
        bars.forEach(function (bar) {
          var head = bar.previousElementSibling, label = head && head.firstElementChild;
          var name = label ? nm(label.textContent) : '';
          var s = S.filter(function (x) { var n = nm(x.n), dn = typeof win._dispCandName === 'function' ? nm(win._dispCandName(x.n)) : n; return name === n || name === dn; })[0];
          if (!s || s.pct50 < 5) return;
          var clr = (G(win, 'COUNCIL_CLR') || {})[s.p] || '#ddd';
          var tick = doc.createElement('div');
          tick.className = 'v2-anchor26';
          tick.title = T('不套 2022 錨點情境的中位數', 'No-2022-anchor scenario median');
          tick.style.cssText = 'position:absolute;left:' + Math.max(0, Math.min(100, s.pct50)) + '%;top:0;bottom:0;border-left:2px dashed ' + clr + ';opacity:.9;filter:brightness(1.6)';
          bar.appendChild(tick);
          var lab = bar.nextElementSibling, note = doc.createElement('div');
          note.className = 'v2-anchor26';
          note.style.cssText = 'font-size:9px;color:rgba(255,255,255,.55);margin-top:1px;text-align:center';
          note.textContent = T('虛線（不套 2022 錨點情境）：中位數 ', 'Dashed (no-2022-anchor scenario): median ') + s.pct50.toFixed(1) + '% · ' +
            T('當選率 ', 'win prob. ') + (s.winProb * 100).toFixed(0) + '%';
          if (lab) lab.parentNode.insertBefore(note, lab.nextSibling);
          rows.push(nm(s.n) + ' ' + (s.winProb * 100).toFixed(0) + '%');
        });
        if (!rows.length) return;
        var a = A[cc], who = Object.keys(a.anchors), anz = who.map(function (n) { return n + ' ' + a.anchors[n]; }).join('、');
        var box = doc.createElement('div');
        box.className = 'v2-anchor26';
        box.style.cssText = 'margin:4px 0 10px;padding:7px 9px;border:1px dashed rgba(255,255,255,.35);border-radius:6px;font-size:10px;line-height:1.6;color:rgba(255,255,255,.7)';
        box.innerHTML = T('<b>虛線＝不套 2022 錨點情境（對照用，未納入預測）</b>：預測會把 2022 當選者本人的得票率（' + anz + '%）當錨點，民調越少、越偏一邊，錨點的比重越高。但 2022 這裡是三強選舉（第三名拿 ' + a.third2022 +
            '%），這個得票率是三分天下時的數字，放到 2026 的兩強對決會偏低；對手沒有 2022 紀錄，只看民調。此情境拿掉錨點、只看民調，重跑同一組模擬：' + rows.join('、') + '。錨點本身在回測中有用，這裡只是讓你看它在這一縣市的影響有多大，請自行判斷。',
          '<b>Dashed = no-2022-anchor scenario (for comparison, not part of the forecast)</b>: the forecast blends in the 2022 winner\'s own share (' + anz + '%) as an anchor, weighted more when polls are few or one-sided. But 2022 here was a three-way race (the third candidate took ' + a.third2022 +
            '%), so that share understates a two-way 2026 race, while the opponent, with no 2022 record, is taken from the polls alone. This scenario drops the anchor, uses the polls alone and re-runs the same simulation: ' + rows.join(', ') + '. The anchor helps in the backtests; this only shows how much it moves this county — judge for yourself.');
        var first = bars[0].parentNode;
        first.parentNode.insertBefore(box, first);
      } finally { busy = false; }
    };
    win.__v2Anchor26 = new win.MutationObserver(run);
    win.__v2Anchor26.observe(ic, { childList: true, subtree: true });
    run();
  }
  window.V2Anchor26 = { attach: attach };
})();
