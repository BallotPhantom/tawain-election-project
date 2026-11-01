/* 2026 縣市長預測: the 「南部修正」 scenario as a dashed comparison on the 高雄 / 台南 / 屏東 county panels — shown, not used
 * (user 2026-10-31: 「南部先不修，然後b就是一樣測試但是適當對照給看的人自己判斷好了」「就是可能改成虛線給b」).
 *
 * Why: backtest_undecided_south.py / backtest_2014_south.py (mayoral polls vs results, three cycles) found polls in these
 * three counties overstated the DPP candidate even after the undecided are split evenly — by 2.2 points on average in 2014
 * (a DPP wave year; every poll checked against its original report), 4.4 in 2018 and 10.2 in 2022 (both good KMT years;
 * Wikipedia poll tables) — while the other counties went the national way (2014 −4.5, 2018 +3.4, 2022 −1.5). The scenario
 * takes half of the three cycles' average: DPP −2.8, KMT +2.8 (share of the vote; user 2026-11-01: 「改說明跟修正量」 —
 * it was half of the 2018 / 2022 average, 3.6, until 2014 was added). Each cycle corrected by half the other two's
 * average improves (south |error| 2014 2.2→1.5, 2018 4.4→1.3, 2022 10.2→8.5),
 * then re-runs the engine's Monte Carlo (the fixed-seed run of ratings26.js, same national / regional swings). The model's
 * own numbers stay as they are; the panel draws the scenario's median as a dashed tick on each candidate's range bar and
 * says what it is. 屏東 has no 2026 poll (no forecast to shift), so only 高雄 and 台南 show it today.
 *   V2South26.attach(win)
 */
(function () {
  var SHIFT = 2.8, CCS = ['64', '67', '10013'];
  function G(win, n) { try { return win.eval(n); } catch (e) { return undefined; } }

  // the scenario's Monte Carlo: the forecast with the south shift, run once (restored right after)
  function scenario(win) {
    var P = G(win, 'MAYOR_2026_PREDICT'); if (!P || typeof win._runMC2026 !== 'function') return null;
    var saved = [];
    CCS.forEach(function (cc) {
      var e = P[cc]; if (!e || e.no_prediction) return;
      var d = e.cands.filter(function (c) { return c.p === 'dpp'; })[0], k = e.cands.filter(function (c) { return c.p === 'kmt'; })[0];
      if (!d || !k) return;
      var u = SHIFT / 100 * (e.tot || 10000);
      saved.push([d, d.v], [k, k.v]);
      d.v -= u; k.v += u;
    });
    if (!saved.length) return null;
    var r; try { r = win._runMC2026(); } finally { saved.forEach(function (s) { s[0].v = s[1]; }); }
    var out = {};
    CCS.forEach(function (cc) { if (r && r.summary[cc] && P[cc] && !P[cc].no_prediction) out[cc] = r.summary[cc]; });
    return out;
  }

  function attach(win) {
    var doc = win.document, ic = doc.getElementById('ic');
    if (!ic || win.__v2South26) return;
    var B = null, busy = false;
    var nm = function (n) { return String(n).split(/[（(]/)[0].trim(); };
    var run = function () {
      if (busy || !G(win, "typeof is2026Predict !== 'undefined' && is2026Predict")) return;
      var t1 = ic.querySelector('.t1'); if (!t1 || ic.querySelector('.v2-south26')) return;
      var NM = G(win, '_CC_NAME') || {}, title = t1.textContent.trim(), cc = null;
      CCS.forEach(function (c) { if (NM[c] && title.indexOf(NM[c]) === 0) cc = c; });
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
          var name = label ? nm(label.textContent) : '';   // the label carries the poll note in （…）
          var s = S.filter(function (x) { var n = nm(x.n), dn = typeof win._dispCandName === 'function' ? nm(win._dispCandName(x.n)) : n; return name === n || name === dn; })[0];
          if (!s) return;
          var clr = (G(win, 'COUNCIL_CLR') || {})[s.p] || '#ddd';
          var tick = doc.createElement('div');
          tick.className = 'v2-south26';
          tick.title = T('南部修正情境的中位數', 'South-adjusted scenario median');
          tick.style.cssText = 'position:absolute;left:' + Math.max(0, Math.min(100, s.pct50)) + '%;top:0;bottom:0;border-left:2px dashed ' + clr + ';opacity:.9;filter:brightness(1.6)';
          bar.appendChild(tick);
          var lab = bar.nextElementSibling, note = doc.createElement('div');
          note.className = 'v2-south26';
          note.style.cssText = 'font-size:9px;color:rgba(255,255,255,.55);margin-top:1px;text-align:center';
          note.textContent = T('虛線（南部修正情境）：中位數 ', 'Dashed (south-adjusted scenario): median ') + s.pct50.toFixed(1) + '% · ' +
            T('當選率 ', 'win prob. ') + (s.winProb * 100).toFixed(0) + '%';
          if (lab) lab.parentNode.insertBefore(note, lab.nextSibling);
          rows.push(nm(s.n) + ' ' + (s.winProb * 100).toFixed(0) + '%');
        });
        if (!rows.length) return;
        var box = doc.createElement('div');
        box.className = 'v2-south26';
        box.style.cssText = 'margin:4px 0 10px;padding:7px 9px;border:1px dashed rgba(255,255,255,.35);border-radius:6px;font-size:10px;line-height:1.6;color:rgba(255,255,255,.7)';
        box.innerHTML = T('<b>虛線＝南部修正情境（對照用，未納入預測）</b>：回測 2014、2018、2022 三屆縣市長選舉，高雄／台南／屏東的民調在未表態平分後，仍分別高估綠營 2.2、4.4、10.2 點；同年其他縣市則跟著全國走向（−4.5、+3.4、−1.5）。民進黨大勝的 2014 年也看得到，因此不只是國民黨有利年份的現象。此情境取三屆平均的一半，綠營候選人 −' + SHIFT + ' 點、國民黨 +' + SHIFT +
            ' 點後重跑同一組模擬：' + rows.join('、') + '。每一屆改用另外兩屆的數字修正，南部誤差都變小（2.2→1.5、4.4→1.3、10.2→8.5）；但證據仍只有三屆、三個縣市，且 2018／2022 的民調取自維基百科整理、未逐筆核對，請自行判斷。',
          '<b>Dashed = south-adjusted scenario (for comparison, not part of the forecast)</b>: in the 2014, 2018 and 2022 mayoral races, polls in Kaohsiung / Tainan / Pingtung still overstated the DPP candidate after splitting the undecided evenly — by 2.2, 4.4 and 10.2 points — while the other counties followed the national swing (−4.5, +3.4, −1.5). It shows up in 2014, a DPP landslide, so it is not just a feature of good KMT years. This scenario takes half of the three-cycle average: DPP −' + SHIFT + ', KMT +' + SHIFT +
            ' points, re-running the same simulation: ' + rows.join(', ') + '. Correcting each cycle with the other two shrinks the southern error every time (2.2→1.5, 4.4→1.3, 10.2→8.5), but it is still three cycles and three counties, and the 2018 / 2022 polls come from Wikipedia tables not checked poll by poll — judge for yourself.');
        var first = bars[0].parentNode;
        first.parentNode.insertBefore(box, first);
      } finally { busy = false; }
    };
    win.__v2South26 = new win.MutationObserver(run);
    win.__v2South26.observe(ic, { childList: true, subtree: true });
    run();
  }
  window.V2South26 = { attach: attach };
})();
