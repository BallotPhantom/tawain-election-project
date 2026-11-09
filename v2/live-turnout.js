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
  // ---- projected winner + Toss-up / Lean / Likely / 推估當選 (user 2026-11-08: 「做」; backtest live_model/backtest_calls.py,
  // 0 wrong 推估當選 over 2022←2018, 2018←2014, 2024←2020, 2020←2016 × four count orders; data CALL_MODEL from
  // live_model/build_call_model.py). Per candidate key (dpp / kmt / tpp / pfp / npp, else 'ind:<name>'):
  //   swing = counted-vote-weighted mean over the county's townships with votes of (share now − that key's share there
  //           last time); a key with no record keeps the county's counted share
  //   each township's uncounted votes = (1 − share reported) × prior × ρ (as estimate) at (last share + swing), renormalised
  //   M = (1st − 2nd) ÷ projected total; σ by the county's share reported × stations reported → P = Φ(M / σ)
  //   tag: P < .70 toss · < .90 lean · else likely; under 5% counted 'early' (too early to call); proj = Φ(M / σ_call) ≥ .995, M > 0.3% (recount line), share reported
  //   ≥ 10% (≥ 70% in a county of < 150 stations: 連江, 金門, 澎湖)
  //   LiveTurnout.call(model, year, prior, towns, cc, ccOf, nRep) → {lead, second, M, P, tag, f} | null
  //     towns [{tc, s, by: {key: votes}}] nationwide (this source); nRep = [stations in, stations] for the county if the
  //     source gives them (else share × CALL_MODEL.stations)
  function phi(x) {   // standard normal CDF (Abramowitz–Stegun 7.1.26)
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  function call(model, year, prior, towns, cc, ccOf, nRep) {
    if (!model || !prior) return null;
    var shares = (model.shares || {})[year] || {}, R = model.rules, byTc = {}, prAll = 0, cntDone = 0, prDone = 0;
    (towns || []).forEach(function (t) {
      if (!t || prior[t.tc] == null) return;
      var n = 0; for (var k in t.by) n += t.by[k];
      byTc[t.tc] = { s: Math.max(0, Math.min(1, t.s || 0)), by: t.by, n: n };
    });
    Object.keys(prior).forEach(function (tc) { prAll += prior[tc]; var t = byTc[tc]; if (t && t.s >= 0.999) { cntDone += t.n; prDone += prior[tc]; } });
    var K0 = 0.02 * prAll, rhoNat = (cntDone + K0) / (prDone + K0);
    var tcs = Object.keys(prior).filter(function (tc) { return ccOf(tc) === cc; });
    var C = {}, tot = 0, prC = 0, cD = 0, pD = 0, rep = 0;
    tcs.forEach(function (tc) {
      var t = byTc[tc], p = prior[tc]; prC += p;
      if (!t) return;
      for (var k in t.by) { C[k] = (C[k] || 0) + t.by[k]; tot += t.by[k]; }
      if (t.s >= 0.999) { cD += t.n; pD += p; }
      rep += p * t.s;
    });
    var keys = Object.keys(C);
    if (!tot || keys.length < 2 || !prC) return null;
    var Kc = 0.15 * prC, rho = (cD + Kc * rhoNat) / (pD + Kc), q = {}, swing = {};
    keys.forEach(function (k) {
      q[k] = C[k] / tot;
      var num = 0, den = 0;
      tcs.forEach(function (tc) {
        var t = byTc[tc], ps = shares[tc]; if (!t || !t.n || !ps || ps[k] == null) return;
        num += t.n * ((t.by[k] || 0) / t.n - ps[k]); den += t.n;
      });
      swing[k] = den ? num / den : null;
    });
    var V = {}; keys.forEach(function (k) { V[k] = C[k]; });
    tcs.forEach(function (tc) {
      var t = byTc[tc], s = t ? t.s : 0, Rv = (1 - s) * prior[tc] * rho; if (Rv <= 0) return;
      var ps = shares[tc] || {}, sh = {}, z = 0;
      keys.forEach(function (k) { sh[k] = swing[k] != null && ps[k] != null ? Math.max(0, ps[k] + swing[k]) : q[k]; z += sh[k]; });
      keys.forEach(function (k) { V[k] += Rv * sh[k] / (z || 1); });
    });
    var srt = keys.slice().sort(function (a, b) { return V[b] - V[a]; }), T = 0; keys.forEach(function (k) { T += V[k]; });
    var M = (V[srt[0]] - V[srt[1]]) / T;
    var N = (model.stations || {})[cc] || 0, f = nRep && nRep[1] ? nRep[0] / nRep[1] : rep / prC, n = nRep ? nRep[0] : f * N;
    var bk = 0; R.buckets.forEach(function (b, i) { if (f >= b) bk = i; });
    var g = 0; R.ngroups.forEach(function (b, i) { if (n >= b) g = i; });
    // + an early-count-bias term (R.early × (1 − f), in quadrature): one camp's strongholds counted first — the station
    // simulation lacks it; the rehearsal showed 屏東 2022 「Likely 蘇清泉」 at 99.5% early before 周春米 won
    var sg = model.sigma[String(bk)][String(g)], eb = (R.early || 0) * (1 - f);
    var P = phi(M / Math.sqrt(sg[0] * sg[0] + eb * eb)), Pc = phi(M / Math.sqrt(sg[1] * sg[1] + eb * eb));
    var minF = (nRep && nRep[1] ? nRep[1] : N) < R.smallStations ? R.smallMinShare : R.minShare;
    var tag = Pc >= R.call && M > R.recount && f >= minF ? 'proj' : null;
    // under R.likelyMin (20%) counted a tag says at most Lean (the rehearsal's exaggerated early bias had 屏東 「Likely」 the
    // eventual loser until 15%)
    if (!tag) { P = Math.min(P, f >= (R.likelyMin || 0) ? R.call - 0.0001 : 0.89); tag = P >= R.likely ? 'likely' : P >= R.toss ? 'lean' : 'toss'; }
    // under R.tooEarly (5%) of the county counted: 'early' — too early to call (user 2026-11-08: 「可以加入 too early to call」);
    // Toss-up stays for a close race further on
    if (tag !== 'proj' && f < (R.tooEarly != null ? R.tooEarly : 0.05)) tag = 'early';
    return { lead: srt[0], second: srt[1], M: M, P: P, tag: tag, f: f, V: V };
  }
  window.LiveTurnout = { estimate: estimate, estimateCounty: estimateCounty, margin: margin, call: call };
})();
