# Taiwan County/City Council & Mayor Election Map (台灣縣市議員／縣市長選舉地圖)

## Overview

`council.html` is a **separate, standalone HTML file** — not a variant loaded by `test.html`. It started as a copy of `test.html` (the legislative-district map, see `README.md`/`CLAUDE.md`) with the entire 縣市議員/縣市長 (county council / mayor) feature layered on top via a large `<script>` block appended near the end of the file, plus year-specific external data files. It shares `test.html`'s D3 v7 rendering pipeline, DOM layout (`#left-rail`/`#ip`/`#mp`/`#seat-summary-float`), zoom/pan machinery, and `T()`/language-toggle infrastructure — but none of `test.html`'s legislative-district (立委) data is functionally relevant once council mode is active. No build step; open directly or serve with `python3 -m http.server 8080`.

**Scope covered by council.html:**
- 縣市議員 (county/city councilor, SNTV multi-member districts) — 2014 / 2018 / 2022
- 縣市長 (mayor) — 2014 / 2018 / 2022 real results, plus a **2026 prediction mode** (poll-aggregation + Monte Carlo simulation, clearly labeled as a draft/estimate, not real results)

## Running / Development

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/council.html
```

## Architecture: how council mode layers onto test.html

Council/mayor mode does **not** replace `test.html`'s navigation system (`goED`/`goTC`/`goVill`/`goVillAll`/`goTCAllNational`/`goVillAllNational`) — it **overrides** each of those functions late in the file (after the original definitions), dispatching to council/mayor-specific implementations based on state flags:

```js
const _origGoTC = goTC;
goTC = function(ed) {
  if (winnerYear === '2022' && isMayorMode) { _mayorGoTC(ed); return; }
  if (winnerYear === '2022' && isCouncilKey(ed)) { _councilGoTC(ed); return; }
  _origGoTC(ed);
};
```

The same pattern applies to `goVill`, `goVillAll`, `goTCAllNational`, `goVillAllNational`, and `goED` (see `CHANGELOG_council.md` for the `goED` gap that was missing this pattern until it was found and fixed). **`winnerYear === '2022'` is the sentinel that means "council/mayor system is active"** — it is deliberately pinned to `'2022'` regardless of which actual year's data is displayed (`councilDisplayYear`/`mayorDisplayYear` carry the real active year) specifically so this dispatcher condition keeps working; do not repurpose `winnerYear` for anything else while council mode exists.

Three mutually-aware mode flags control which dispatch branch fires: `isCouncilMode`, `isMayorMode`, `is2026Predict` (only meaningful when `isMayorMode` is also true). Only one of council/mayor should be true at a time; switching between them goes through `setCouncilElectionMode(yr)` / `setMayorMode(yr)` / `setMayor2026PredictMode()`, all of which fully reset the relevant flags, data pointers, and DOM.

## Key global state variables

| Variable | Meaning |
|---|---|
| `isCouncilMode` / `isMayorMode` | Which of the two council/mayor systems is currently active (mutually exclusive) |
| `is2026Predict` | Whether mayor mode is showing the 2026 prediction (only meaningful when `isMayorMode` is true) |
| `councilDisplayYear` / `mayorDisplayYear` | `'2014'\|'2018'\|'2022'` — which real year's data is currently loaded (independent state; changing one auto-syncs the other's dropdown via `_syncCouncilYearData`/`_syncMayorYearData` so they don't visually diverge, without triggering a full mode switch) |
| `councilMode` | `'party'` (政黨比例, default) \| `'candidate'` (最高候選人) — council-only coloring sub-mode |
| `councilHeatParty` | `null` \| `'kmt'`/`'dpp'`/`'tpp'`/... — party vote-share heatmap overlay, mayor-mode only, TC/vill level only, forced off in 2026 predict mode |
| `showPviHeat` | Partisan-lean (PVI) background layer toggle, 2026 predict mode only, mutually exclusive with `councilHeatParty` |
| `councilIndMode` | `null` \| `'plains'` \| `'highland'` — 平地/山地原住民 (indigenous) seat sub-view |
| `COUNCIL_2022_TC` / `COUNCIL_2022_VILL` | **Pointers**, not fixed data — reassigned by `setCouncilElectionMode(yr)`/`_syncCouncilYearData(yr)` to whichever year's actual dataset (`_COUNCIL_2022_TC_ACTUAL`/`COUNCIL_2014_TC`/`COUNCIL_2018_TC`, etc.) is active. Despite the `_2022_` in the name, they hold whatever year is currently selected — the name is legacy from before multi-year support was added. Same pattern for `MAYOR_2022_TC`/`MAYOR_2022_VILL`/`COUNCIL_MAYOR_2022` |
| `_councilIndexed` / `_councilIndexedYear` | Whether `buildCouncilIndexes()`'s derived indexes (`_vcToDistKey` etc.) have been built, and for which year — rebuilt whenever `councilDisplayYear` changes (see `CHANGELOG_council.md`, this used to be a permanent one-time build) |
| `_vcToDistKey`, `_tcToDistKey`, `_tcToVCs` | Derived indexes built by `buildCouncilIndexes()`: village→district-key, township→district-key (primary fallback only), township→village-code-list |
| `MC_N`, `MC_NATIONAL_SWING_SD`, `MC_REGIONAL_SWING_SD`, `MC_COUNTY_SD`, `MC_REGIONS` | 2026 predict mode Monte Carlo simulation constants — 20,000 draws, 3-layer Gaussian swing (national/regional/county), 7 regions |
| `_mc2026Cache` | Memoized `_runMC2026()` result, reset to `null` on entering predict mode / county-panel re-render |
| `_mcTownshipCache` | Per-tc-code memoized `_runMCTownship(tc)` results |

## Data files

| File | Declares | Shape |
|---|---|---|
| `council_2014_tc_data.js` | `COUNCIL_2014_TC` | `{tcCode: {dist, seats, tot, cands:[{n,p,v,e,pct,d}]}}` — `d` = that candidate's own district (needed for split townships, see below) |
| `council_2014_vill_data.js` | `COUNCIL_2014_VILL` | `{vcCode: {votes:{name:votes}, tot, d}}` — `d` = that village's own true district |
| `council_2018_tc_data.js` / `council_2018_vill_data.js` | `COUNCIL_2018_TC` / `COUNCIL_2018_VILL` | same shape, 2018 |
| `council_2022.js` / `council_2022_vill.js` | `COUNCIL_2022_TC` / `COUNCIL_2022_VILL` (as `let`, swappable) | same shape, 2022 — this is the file whose pointer gets reassigned on year switch; `_COUNCIL_2022_TC_ACTUAL`/`_COUNCIL_2022_VILL_ACTUAL` hold the original 2022 reference for restoring |
| `council_dist_gj.js` | `COUNCIL_DIST_GJ` | GeoJSON FeatureCollection, council district boundaries (`ed` key format `"cityCode_dist"`, e.g. `"63_01"`) |
| `mayor_2014_tc_data.js` | `MAYOR_2014_TC`, `MAYOR_2014_VILL` | TC and VILL data in one file (unlike council's split files) |
| `mayor_2018_tc_data.js` | `MAYOR_2018_TC`, `MAYOR_2018_VILL` | same, 2018 |
| *(none — embedded inline)* | `MAYOR_2022_TC`, `MAYOR_2022_VILL` | Unlike 2014/2018, the 2022 mayor data is declared directly inside `council.html`'s own `<script>` block (`let MAYOR_2022_TC = {...}` / `let MAYOR_2022_VILL = {...}`), not loaded from an external file. A file named `mayor_2022_tc_data.js` exists in the project directory but is **not referenced anywhere in council.html** — treat it as a stale/orphaned scratch artifact, not a real dependency, unless it gets wired in later |
| `mayor_2014_actual.js` / `mayor_2018_actual.js` | `MAYOR_2014_ACTUAL`, `MAYOR_2018_ACTUAL` | County-level aggregate mayor results (backing `COUNCIL_MAYOR_2022` pointer on year switch) |
| `mayor_turnout_stats.js` | `MAYOR_TURNOUT_STATS` | `{year: {cc: [turnoutPct, validRatePct]}}`, 3 years × 22 counties, built from CEC's `elprof.csv` |
| `data_mayor_hist_2014_2018.js` | `MAYOR_HIST_2014_2018` | Reference dataset used to validate the 2014/2018 mayor parsing scripts against known county-level totals |
| `data_mayor2026_predict.js` | `MAYOR_2026_PREDICT` | `{cc: {name, p, v, pct, tot:10000, cands:[{n,p,v,e}], county_zh, poll_count?, trust?, no_prediction?}}` — poll-blended 2026 mayoral prediction per county, regenerated by `regen3.py` (see below) whenever new polls come in |
| `data_polls_2026.js` | `POLLS_2026`, `POLL_HOUSE_LEAN`, `WIKI_POLL_URL` | Raw poll records keyed by county name (not code!), and a pollster/sponsor → house-lean classification table used for weighting |
| `data_mc2026_snapshot_log.js` | `MC2026_SNAPSHOT_LOG` | Append-only array of `{date, poll_count_total, counties:{cc:{cands:[{n,p,pct50,winProb}]}}}` — one entry per day the model was actually run; **never backfilled retroactively**, see `CHANGELOG_council.md` for the "snapshot every real check-in, not just big changes" policy |
| `data_poll_method_demographics.js` | `POLLSTER_METHOD`, `COUNTY_AGE_DEMOGRAPHICS` | Pollster methodology (phone/online, confidence) and county age-distribution data, used by `regen3.py`'s `method_weight_factor()`. **Build-time only** — not loaded by council.html itself, only read by the Python regeneration script |
| `data_approval_2026.js` | `PRESIDENT_APPROVAL_2024/2025`, `PREMIER_APPROVAL_2024/2025` | National approval-rating poll series, shown in predict mode's hemi-row replacement cards |

**Split-township gotcha (critical, cost a full debugging session — see `CHANGELOG_council.md` v1.0):** 新竹市's 東區 (`tc=10018010`) and 北區 (`10018020`) are each split across two council districts (東區→districts 01+02, 北區→03+04); no other township nationally has this. Every candidate and village record carries its own true `d` (district) field precisely so the front end never has to infer it from the merged township's single `dist` field, which can only hold one of the two districts. If you ever rebuild these data files from scratch, preserve the per-candidate/per-village `d` field — dropping it reintroduces the exact bug that was fixed.

**Build script:** `build_council_multi.py` (in the working scratchpad, not committed to the project directory) parses raw CEC `elctks.csv` files into the `council_YYYY_tc_data.js`/`vill_data.js` shape. It validates output against raw CEC ground truth on every run (seat counts, elected-candidate counts, vote totals, and village-sum-equals-township-total consistency) — treat any future rebuild as untrusted until it passes that same validation.

## Navigation dispatcher pattern (detail)

```
goED()                    →  National ED-level choropleth (council: district-colored map; mayor: county-colored map)
  ↓
goTC(ed) / _councilGoTC / _mayorGoTC   →  Township level within one district/county
  ↓
goVill(tc,ed) / _councilGoVill / _mayorGoVill  →  Village level within one township
goVillAll(ed) / _councilGoVillAll / _mayorGoVillAll  →  All villages in a district/county, bypassing township

goTCAllNational() / _councilGoTCAllNational / _mayorGoTCAllNational   →  全台鄉鎮市區
goVillAllNational() / _councilGoVillAllNational / _mayorGoVillAllNational  →  全台村里 (no-ops entirely in 2026 predict mode — no village-level prediction data exists)
```

`goED()` additionally re-runs `updateToolbarVisibility()` on every call (see `CHANGELOG_council.md`) so that level-gated UI (party-heatmap row, pie/battleground buttons) is correctly re-evaluated every time the user returns to the national overview, not just when descending into a district.

## Full function reference

Grouped by area. Line numbers current as of the writing of this file — **re-`grep -n` before trusting one**, this file is large and actively edited.

### Indexing / data lookup

| Function | Description |
|---|---|
| `buildCouncilIndexes()` | Builds `_vcToDistKey`/`_tcToDistKey`/`_tcToVCs`/`_realEdByTc` from the currently-loaded `COUNCIL_2022_TC`/`COUNCIL_2022_VILL` pointers. Rebuilds whenever `councilDisplayYear` changes (tracked via `_councilIndexedYear`) — a plain no-op guard here silently serves stale year-A data while year-B is displayed |
| `getCouncilDistData(dk)` | Given a district key (`"cityCode_dist"`), aggregates all candidates whose own `d` field matches that district (not by filtering townships on their single `.dist` field — see split-township gotcha above), reconstructing seats/tot/cands. Returns `null` if no matching candidates found |
| `_councilTypeLbl(dk)` | District-key → localized "縣市議員"/council-type label |
| `_councilTCLevelColor(tc)` | Per-TC winning-candidate color for candidate-mode coloring, lazily caches into `_tcLevelCache` |
| `_councilTrafficLights(dk)` / `_mayorTrafficLights(cc, yr)` | Renders the turnout%/valid-vote-rate% pill badges, percentile-ranked among all districts/counties for that year |
| `_buildCCSeatCache()` | County-level seat tally across all its districts, enumerated via each candidate's own `d` (not `td.dist`, same split-township concern) |
| `_buildCCDistOffsets(cc)` | Per-district party-seat offsets within a county, for the county hemicycle's colored-arc segments |

### Navigation / map layers

| Function | Description |
|---|---|
| `_councilGoTC(ed)` / `_councilGoVill(tc,ed)` / `_councilGoVillAll(ed)` | Council district/township/village layer builders |
| `_mayorGoTC(cc)` / `_mayorGoVill(tc,cc)` / `_mayorGoVillAll(cc)` | Mayor county/township/village layer builders |
| `_councilGoTCAllNational()` / `_councilGoVillAllNational()` | National all-township / all-village council overview |
| `_mayorGoTCAllNational()` / `_mayorGoVillAllNational()` | Same, mayor mode |
| `_councilBuildTCFeats(ed)` | Builds per-township GeoJSON features for one district, merging only the villages that belong to that district (handles split townships correctly by construction, since it filters by `_vcToDistKey`) |
| `_councilDistMergedFeat(ed)` | Merged single-polygon outline for a whole district (union of its townships/villages) |
| `_councilTcHeatColor(ed, tc)` / `_councilTcPartyHeatFill(ed, tc, party)` / `_mayorTcPartyHeatFill(tc, party)` | Township fill-color resolvers for the different color modes |
| `_councilVillFill(vc)` / `_mayorVillFill(vc)` | Village-level fill-color resolvers |

### Panel HTML builders

| Function | Description |
|---|---|
| `_councilShowEDPanel(ed)` / `_councilShowTCPanel(key)` / `_councilShowVCPanel(vc)` | Council info-panel renderers at each level |
| `_councilTCPanelHtml(key)` | Township-level council panel HTML — filters `td.cands` down to the requested district's own candidates via `getCouncilDistData`, applies `COUNCIL_SEATS` (2022-only lookup) only when `councilDisplayYear==='2022'` |
| `_mayorPanelHtml(cc)` / `_mayorTcPanelHtml(tc,cc)` / `_mayorVillPanelHtml(vc)` | Mayor info-panel renderers at each level; `_mayorTcPanelHtml`'s `_predictMode` branch swaps in Monte Carlo range bars (`_mcRangeRowsHtml`) instead of flat vote-share bars |
| `_mayor2026PredictPanelHtml(cc, m)` | Full county-level 2026 predict panel: MC range bars, margin histogram, Sankey data-source diagram, daily-snapshot trend chart, poll-tracking list — all four are `_predict26Fold()` collapsibles |
| `_councilIndPanelHtml(cc)` | 原住民 (indigenous) seat panel, county-level |
| `_pviInfoBlockHtml(tcOrVc)` | Partisan-lean (PVI) info block appended to township/village panels when `showPviHeat` is on |

### Party base-model comparison (催出率), ported/extended from `test.html`'s `baselean` mode

County/township/village-level party-list history (`getCountyPLAggr`/`getTCPLAggr`/`getVillPLAggr`) feeding a shared 4-tier dispatcher, `_base5PLAggrFor(geoKey, year)` — geoKey is a county-name string, 8-digit tc code, 11-digit vc code, or `"cc_dist"` council-district key; the four formats never collide. Real 2022 candidate votes are compared against each party's own 鐵/中/淺 (deep/mid/light) tier ceiling, derived independently per party from its 2008-2024 不分區政黨票 floor/ceiling years.

| Function | Description |
|---|---|
| `_base5CandCampKey(c)` | Candidate → camp key (`'dpp'`/`'kmt'`/`'party:xxx'`/`'third'`), checking `PVI_BACKED_MAP` then `BASE5_CAND_PARTY_OVERRIDE` before falling back to `c.p` — handles nominally-independent-but-really-partisan candidates (鍾東錦→kmt, 黃珊珊→tpp) |
| `_base5CandCampBarHtml(campKey, geoKey, maxV, candVotes, excludeParties, segsOverride)` | Renders one stacked deep/mid/light camp bar; `capturedPct = candVotes/ceiling*100` (green ≥100%, orange <85%); `segsOverride` bypasses the geoKey lookup entirely (used by the council-district comparison to inject pre-scoped segments) |
| `_base5TailHtml(eligKey, geoKey, mainCands, validVotes, maxV)` | Appends the third-force camp bar (if not already shown) + 空氣票 (blind-spot) row, dashed-divider separated; blind-spot gap = derived eligible voters − full grand total across all shown camps |
| `_mayorPanelHtml(cc)` / `_mayorTcPanelHtml(tc,cc)` / `_mayorVillPanelHtml(vc)` | Interleave each real candidate's row with their camp bar (`showBase5`, 2022-only). Village level additionally does its own <5% bucketing (`base5MainCands`) purely for camp-bar placement, to avoid repeating the same third-force ceiling once per minor candidate |
| `_councilBase5RowsHtml(byParty, tot, geoKey)` | Shared row-builder for the council-member comparison: real-vote row + camp bar per tracked party, plus a 第三勢力／無黨籍 residual row for untracked parties |
| `_councilBase5CompareHtml(cc)` / `_councilBase5DistCompareHtml(dk, byParty, tot)` | County-wide (all districts summed) vs. single-district-scoped council comparison; district version uses `_councilDistrictPLAggr(dk, year)` (villages filtered via `_vcToDistKey`) so a district's own ceiling never includes indigenous-seat-only villages |
| `toggleCouncilBase5()` / `showCouncilBase5` | Toggle switch in `#county-council-panel`, gates both the county and (via `_councilTCPanelHtml`) district-level sections |

### 2026 prediction / Monte Carlo

| Function | Description |
|---|---|
| `_runMC2026()` | Full 22-county Monte Carlo run (`MC_N` draws), 3-layer Gaussian swing (national+regional+county), returns `{summary, marginSamples}` keyed by county code |
| `_getMC2026(cc)` / `_getMC2026Margin(cc)` | Cached accessors into `_runMC2026()`'s result |
| `_runMCTownship(tc)` / `_getMCTownship(tc)` | Township-level MC, reusing the same 3-layer SD structure applied to that township's own `MAYOR_2026_PREDICT_TC[tc]` baseline (derived at render time from the county-level swing applied to 2022 township results — not an independent per-township poll) |
| `_mcRangeRowsHtml(rows)` | Renders the 10–90 percentile range bars + win-probability labels shared by both the county panel and the township panel |
| `_renderMarginHistogramSvg(margins, colorLead, colorTrail)` | Lead-margin distribution histogram across all MC draws, with an "upset scenario" callout |
| `_renderSourceSankeySvg(m)` | Poll-vs-historical-anchor blend-ratio Sankey diagram (trust-weighted) |
| `_mc2026TrendLineSvg(entries, key, H)` / `_renderMC2026TrendHtml(cc, m)` | Daily-snapshot trend chart (median vote-share / win-probability over time), reading `MC2026_SNAPSHOT_LOG` |
| `_predict26Fold(label, content, bodyId, defaultOpen)` | Shared collapsible-section wrapper for the predict panel's 4 sub-sections, state persisted across re-renders via `window._predict26FoldState` |

### Poll tracking

| Function | Description |
|---|---|
| `_pollParseEndDate(dateStr)` | Extracts the last `YYYY-MM-DD` from a poll's date-range string |
| `_pollHouseWeight(pollster, sponsor)` / `_pollTotalWeight(p)` | House-effect discount lookup and combined weight for a single poll |
| `_renderPollLineChartSvg(polls, mc)` | Scatter + Gaussian-kernel-smoothed trend line of poll-reported vote share over time, with the model's current 10–90 estimate marked at the right edge |
| `_pchMove(evt)` / `_pchLeave(evt)` | Shared mouse-interaction handlers for the poll chart and the approval-trend chart (crosshair + tooltip, hooked via `.pch-*` class names) |
| `_renderApprovalTrendSvg(polls, seriesDefs)` / `_renderApprovalCardHtml(title, polls)` / `_renderApproval2026HemiRow()` | President/Premier approval-rating trend cards that temporarily replace the `#hemi-row` 4-card strip while in predict mode |

### Mode switching / year sync

| Function | Description |
|---|---|
| `setCouncilElectionMode(yr)` / `setMayorMode(yr)` | Full mode switch: swaps data pointers, resets caches, re-renders `goED()`, updates hemicycle/toolbar/title |
| `setMayor2026PredictMode()` | Enters 2026 predict mode |
| `_syncCouncilYearData(yr)` / `_syncMayorYearData(yr)` | Lightweight cross-dropdown sync (swap the *other* mode's data pointer + its dropdown's displayed value) without a full mode switch, so changing one year dropdown keeps the other visually in sync |
| `updateCouncilHemicycle()` | National-totals hemicycle card (top of predict/council panel); the 2022 branch uses hardcoded real seat totals, other years compute from `_councilSeatBreakdown(yr)` |
| `drawCountyHemiForED(ed, highlightBp, indType)` | County-level council-seat hemicycle side panel, hidden entirely in 2026 predict mode |
| `updateToolbarVisibility()` | Central gating function for level/mode-dependent toolbar rows (party-heatmap row, ticker, village-national button disable state, etc.) — called from every navigation entry point including `goED()` |
| `updateNonSimGating()` | Gates the pie-chart/battleground-area row and flip-mask checkbox by level; also force-hides them in 2026 predict mode (no real vote-composition or margin data exists for MC estimates) |
| `renderHeatPartyBtns()` / `setHeatParty(party)` / `togglePviHeat()` | Party-heatmap toggle row builder and its two mutually-exclusive overlay toggles |

## Known invariants (read before touching navigation/data-loading code)

1. **`winnerYear` stays `'2022'` for the entire lifetime of council/mayor mode.** It is the dispatcher sentinel, not the displayed year — never repoint it at council/mayor's actual active year.
2. **A merged split-township's own `.dist`/`.tot`/`.seats` fields are fallback-only.** Anything that needs a specific district's data must go through `getCouncilDistData(dk)` (candidate-level `d` filtering) or `_vcToDistKey` (village-level truth), never the township-level aggregate directly.
3. **`buildCouncilIndexes()` must rebuild on year change.** A permanent one-time-build guard silently serves stale village→district mappings for every year after the first one loaded.
4. **Anything gated by `is2026Predict` needs to be re-checked at every level, not just where it was first noticed.** Several bugs this project has hit were the same missing check surfacing at a different navigation entry point (TC level fixed, ED level still broken; goTC fixed, goED never called the gating function at all).
5. **CEC raw `elctks.csv` village-level rows include BOTH a village-aggregate row (`polling='0'`/`'0000'`) and one row per individual polling station.** Summing all `village != '0000'` rows without filtering on `polling` double-counts every village. This is unrelated to the split-township issue and affects the whole dataset if reintroduced.
