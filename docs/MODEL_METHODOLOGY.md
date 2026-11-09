# Model & data methodology

## 1. 2026 mayoral forecast

The full method, with formulas, is on the site's methodology page (`v2/methodology.html`); this is a summary. County-level code: `regen3.py`; simulation: `_runMC2026` in `council.html`.

1. **Poll weight** `w = h × r × m` — sponsor and pollster (campaign-commissioned 0.4; pollsters with a past partisan lean 0.7; others 1.0), age (`e^(−d/120)`, half weight after ~83 days), and survey mode × the county's share of residents aged 65+ (clipped to 0.6–1.2; removing it moves no county by more than 0.14 points). Primary-season polls, street polls and polls missing a 10%+ candidate are left out.
2. **Undecideds** are split evenly among the main candidates. Backtest on 2018 and 2022: proportional reallocation overstated leaders (most in Kaohsiung, Tainan, Pingtung); the even split lowered the average county error from 7.2 to 5.1 points (2018) and 6.3 to 5.2 (2022).
3. **County estimate** `E = T·P + (1 − T)·A`: the weighted poll average `P`, blended with the candidate's own 2022 result `A` by a trust `T` that grows with more, newer and more neutral polls. Counties without usable polls get no poll-based forecast.
4. **Win probability:** 20,000 Monte Carlo runs with a national error shared by all counties, a regional error shared within seven regions and an independent county error (≈ 6.2 points combined), widened after backtesting polls against the 2018 and 2022 results.
5. **Townships:** an estimate carried down from the county, not township polling.

The forecast model is frozen for the 2026 cycle; it is published until the legal poll blackout before election day.

**Sources:** published polls; CEC results; 內政部戶政司 population.

## 2. Election night: the expected final total

Used for the "certain to win past half" threshold.

- **Prior** for each township: this year's electorate × the township's valid-vote rate in the previous election of the same kind.
- **Estimate** for a county: votes counted + Σ over its townships (share of stations not yet reported × prior × ρ), where ρ is this year's turnout relative to the prior, measured on townships already complete — a national ρ shrunk toward 1, and each county's ρ shrunk toward the national one, so one tiny early township cannot swing a county.
- **Safety margin** on the threshold: +21% up to 30% counted, 15% at 50%, 12% at 70%, 7% at 90%, 0 when complete — the worst 99th-percentile under-estimate in the backtest.

**Backtest** (`live_model/backtest_total.py`, kept local): polling-station results for four election pairs (2022 mayors with 2018 as prior, 2018 ← 2014, 2024 president ← 2020, 2020 ← 2016), each count order simulated 1,000 times — small stations first, size-weighted with noise, random, big stations first.

| | median error early in the count | 99th-pct under-estimate (worst pair) |
|---|---|---|
| counted ÷ share of stations | 44–50% | up to ~90% |
| prior + turnout ratio (used) | 4–13% | 21% at 5–30% counted, 7% at 90% |

The hardest case is a turnout surge (2020 president, turnout +8 points over 2016).

## 3. Election night: race calls and tags

- **Swing:** for each candidate whose party ran last time, the counted-vote-weighted mean over reported townships of (share now − that party's share there last time); applied to each township's uncounted votes (from §2). Candidates without a record (independents, new parties) keep the county's counted share. Within a county a party key goes only to that party's top candidate.
- **Uncertainty:** the spread of (final − projected margin) by share counted × stations counted, calibrated on the other three elections (leave-one-election-out), plus an early-count-bias term (3 points × share not yet counted).
- **Tags:** under 5% counted *Too early*; win probability < 70% *Toss-up*, 70–90% *Lean*, 90–99.5% *Likely* (Likely only after 20% counted); *Certain* needs ≥ 99.5% under the conservative uncertainty, a margin above the 0.3% recount line, and ≥ 10% counted (≥ 70% in counties with fewer than 150 polling stations — Lienchiang, Kinmen, Penghu, whose few, very different townships misled the first version).
- **A call holds:** once a candidate is *Certain*, the tag stays while that candidate still leads the projection. On a finer grid (every 2.5% counted, `live_model/backtest_retract.py`), 3.3% of calls would otherwise have dropped back to *Likely* or *Lean* at a later moment; every first call was on the eventual winner.

**Backtest** (`live_model/backtest_calls.py`, kept local), four elections × four count orders: no wrong *Certain* call in about 145,000 county-moments; the leader won 99.4–100% of *Likely* tags and 95–97% of *Lean* tags (early Leans are conservative by design).

## Limitations

- Count orders are simulated: no real minute-by-minute count timeline survives from past elections (the one archived 2022 snapshot was taken before any votes arrived). The 2026 night will be recorded to recalibrate.
- Turnout surges are the main risk to early estimates; the safety margin is set from the 2020 surge.
- Candidate party for 2026 comes from the site's party table; independents are matched to the previous election by name.
