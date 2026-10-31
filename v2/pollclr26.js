/* 2026 縣市長預測: candidate colours in the 得票率趨勢 poll chart (user 2026-10-29: 「嘉義市張啓楷的折線圖的線顏色不對…應該是
 * 民眾黨藍」「雖然高虹安可能被我放在民眾黨但兩個要分開」).
 *
 * Audit: _renderPollLineChartSvg (council.html, V1) colours each candidate by the poll table's camp tag through its own
 * map {blue #60a5fa, green #4ade80, white #a78bfa, other #aaa} — 民眾黨 ("white") came out purple, and 綠 / 藍 differ from
 * the party colours every other chart and the map use (COUNCIL_CLR). The poll tables tag 高虹安 "white" too, though the
 * forecast (MAYOR_2026_PREDICT) has her as 無黨籍 (ind), so she and 張啓楷 shared the purple.
 * Now: a candidate in the forecast takes COUNCIL_CLR[their forecast party] (張啓楷 tpp → 民眾黨 #26b5c4, 高虹安 ind → 無黨
 * grey; colour-blind mode follows); anyone else in the polls (pre-primary names) by the camp tag mapped to the same
 * colours (blue → kmt, green → dpp, white → tpp). V1 is untouched: the function's two `const clr = partyClr[…]` lines are
 * swapped at runtime in the iframe. V2PollClr26.attach(win).
 */
(function () {
  var CAMP = { blue: 'kmt', green: 'dpp', white: 'tpp', other: 'other' };
  var LINE = "const clr = partyClr[series[0].party] || '#888';";
  function attach(win) {
    var f = win._renderPollLineChartSvg;
    if (typeof f !== 'function' || f.v2PollClr) return;
    var src = f.toString();
    if (src.indexOf(LINE) < 0) return;   // the engine changed: leave it
    var byName = null;
    win.__v2PollClr = function (name, camp) {
      var C = win.eval('COUNCIL_CLR');
      if (!byName) {
        byName = {};
        var P = win.eval("typeof MAYOR_2026_PREDICT !== 'undefined' ? MAYOR_2026_PREDICT : {}");
        Object.keys(P).forEach(function (cc) {
          (P[cc].cands || []).forEach(function (c) { byName[String(c.n).split(/[（(]/)[0].trim()] = c.p; });
        });
      }
      var p = byName[String(name).split(/[（(]/)[0].trim()] || CAMP[camp];
      return p && C[p] ? C[p] : null;
    };
    win.eval(src.split(LINE).join("const clr = (typeof __v2PollClr === 'function' && __v2PollClr(name, series[0].party)) || partyClr[series[0].party] || '#888';"));
    if (win._renderPollLineChartSvg !== f) win._renderPollLineChartSvg.v2PollClr = true;
  }
  window.V2PollClr26 = { attach: attach };
})();
