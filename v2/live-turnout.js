/* A county's expected FINAL mayoral valid-vote total part-way through the count, and a safe upper bound for the
 * 「過半保證當選」 threshold (user 2026-11-08: 過半門檻要靠到時候的投票率 → backtest → 「好」). Shared by
 * v2/live-flow.html (2026 開票之夜) and v2/live-panel.js (舊版開票頁).
 *
 * Method 「C2」 (live_model/backtest_total.py, 2022←2018, 2018←2014, 2024←2020, 2020←2016 at polling-station level,
 * small / mixed / random / big-first count orders):
 *   expected = counted + Σ over the county's townships (1 − share of its stations reported) × prior × ρ
 *   prior    = the township's expected valid votes before the count (TURNOUT_PRIOR, build_v2_turnout_prior.py)
 *   ρ        = this year's turnout vs the prior, from townships already complete: a national ρ (shrunk toward 1 by 2% of
 *              the national prior) and the county's own ρ shrunk toward it by 15% of the county's prior
 *   upper    = expected × (1 + margin), margin by the county's share reported (prior-weighted): 21% up to 30%, 15% at
 *              50%, 12% at 70%, 7% at 90%, 0 when complete — the worst 99th-percentile under-estimate over the four
 *              elections × four orders (1,000 runs each), so the threshold is set too low < 1% of the time.
 * The page's old rule (counted ÷ share of stations) under-estimated by up to ~50% early when small stations report first.
 *   LiveTurnout.estimate(prior, towns, cc, ccOf) → {est, upper, margin, f, counted} | null (null: no township numbers)
 *     prior       {tc: votes}
 *     towns       [{tc, cnt, s}] — this source's township numbers, nationwide (s = share of the township's stations
 *                 reported, 0–1); townships without numbers may be left out
 *     cc          the county; ccOf(tc) → county
 *   LiveTurnout.estimateCounty(prior, cc, ccOf, counted, share) — a source with county numbers only: counted + the
 *     unreported share of the county's prior (no ρ), with the same margin
 */
(function () {
  var MARGIN = [[0, 0.21], [0.3, 0.21], [0.5, 0.15], [0.7, 0.12], [0.9, 0.07], [1, 0]];
  function margin(f) {
    f = Math.max(0, Math.min(1, f));
    for (var i = 1; i < MARGIN.length; i++) {
      var a = MARGIN[i - 1], b = MARGIN[i];
      if (f <= b[0]) return a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0]);
    }
    return 0;
  }
  function estimate(prior, towns, cc, ccOf) {
    if (!prior) return null;
    var byTc = {}, prAll = 0, cntDone = 0, prDone = 0;
    (towns || []).forEach(function (t) { if (t && prior[t.tc] != null) byTc[t.tc] = t; });
    Object.keys(prior).forEach(function (tc) {
      prAll += prior[tc];
      var t = byTc[tc]; if (t && t.s >= 0.999) { cntDone += t.cnt; prDone += prior[tc]; }
    });
    var K0 = 0.02 * prAll, rhoNat = (cntDone + K0) / (prDone + K0);
    var cnt = 0, prC = 0, cDone = 0, pDone = 0, seen = 0, rep = 0, unrep = 0;
    Object.keys(prior).forEach(function (tc) {
      if (ccOf(tc) !== cc) return;
      var p = prior[tc], t = byTc[tc], s = t ? Math.max(0, Math.min(1, t.s || 0)) : 0;
      prC += p;
      if (t) { cnt += t.cnt; seen++; if (s >= 0.999) { cDone += t.cnt; pDone += p; } }
      rep += p * s; unrep += p * (1 - s);
    });
    if (!prC) return null;
    if (!seen) return null;   // no township numbers for this county → estimateCounty
    var Kc = 0.15 * prC, rho = (cDone + Kc * rhoNat) / (pDone + Kc);
    var f = rep / prC, est = cnt + unrep * rho, m = margin(f);
    return { est: est, upper: est * (1 + m), margin: m, f: f, counted: cnt };
  }
  // county numbers only (no township split): counted + the unreported share of the county's prior, with the margin
  function estimateCounty(prior, cc, ccOf, counted, share) {
    if (!prior || share == null) return null;
    var prC = 0; Object.keys(prior).forEach(function (tc) { if (ccOf(tc) === cc) prC += prior[tc]; });
    if (!prC) return null;
    share = Math.max(0, Math.min(1, share));
    var est = Math.max(counted, counted + (1 - share) * prC), m = margin(share);
    return { est: est, upper: est * (1 + m), margin: m, f: share, counted: counted };
  }
  window.LiveTurnout = { estimate: estimate, estimateCounty: estimateCounty, margin: margin };
})();
