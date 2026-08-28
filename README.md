# Taiwan Legislative Election Interactive Map (台灣立委選舉地圖)

## Overview

A Taiwan legislative election interactive map with historical year switching (2024/2020/2016), a PVI (黨派投票指數 / composite partisan-voting-index) mode, scenario simulation (動態模擬), and a party-list-only county/township/village map with its own "推演" simulated year (§13 below). It is a single ~35MB, ~361,000-line HTML file (`test.html`) with inline CSS and JavaScript, rendered with D3.js v7 for the map/SVG layer. There is no build system, no package manager, and no server requirement — geographic/election data is loaded from external JS modules (`data_map_v64.js`, `data_vd_v64.js`, `data_region_v64.js`) plus a large block of data embedded directly in `test.html` itself.

For the data-layer variable reference, navigation-mode diagrams, and the full PVI/simulation formulas, see **`CLAUDE.md`** — this file focuses on the function-level reference, global state, and current DOM layout. Version history is in **`CHANGELOG.md`**.

## Running / Development

```bash
# Open directly in browser (macOS)
open test.html

# Or serve locally to avoid any CORS issues with local file:// access
python3 -m http.server 8080
# then visit http://localhost:8080
```

No build step, no `npm install`, no compilation. Dependencies load from CDN:
- D3.js v7 (`d3.min.js`)
- TopoJSON v3 (`topojson.min.js`)

---

## DOM structure / layout

The page uses a floating "glassmorphism" overlay layout (not a 3-column flex layout — that was refactored away). Top-level structure, confirmed against the current CSS/HTML (search anchors: `#layout` CSS at test.html:343648, `#main`/`#mp` at :344469/:344478, `#ip` at :344563, `#left-rail` at :343663, `#seat-summary-float`/`#hemi-row` at :344048/:344097):

```
#layout                    position: relative; flex:1; overflow:hidden — outer wrapper, holds everything below
├── #map-title              position: fixed; top:12px; left:14px — dashboard title, faded overlay text, always on top of the map
├── #left-rail               position: absolute; top:0; left:0; width:250px (28px when collapsed)
│                             floating glass toolbar (blurred dark background, rounded right edge),
│                             collapsible via #sidebar-toggle (circular floating button) → toggles
│                             `.sidebar-collapsed` on #layout. Contains #toolbar (mode buttons/year
│                             selects), #nav-wrap (breadcrumb + national-view shortcuts)
├── #main                    position: absolute; inset:0 — full-bleed container behind everything else
│   ├── #sim-panel           position:fixed flyout anchored beside the "推演參數" button (not a full-width
│   │                         banner) — region + party-list (§13) columns, each independently collapsible
│   ├── #pl-result-wrap       position:fixed, left sidebar / .zbts gap — §13's always-visible 📊 result chart
│   └── #mp                  flex:1; position:relative — the actual map viewport
│       ├── #ticker          floating vote-share ticker (top-left over the map)
│       ├── svg#map           D3 SVG: layered <g> groups g-bg/g-base/g-glow/g-sw/g-stripe/g-pop
│       ├── .zbts             zoom +/- buttons
│       └── #map-legend       fixed bottom-right legend overlay
├── #lang-toggle              position: fixed; top:10px; right:12px — ZH/EN language switch pill
├── #seat-summary-float       position: fixed; top:38px; right:12px — collapsed by default
│   ├── #seat-summary-strip   always-visible compact strip (73 / 34 / 6 / 113 seat counts); click toggles
│   │                         `.seat-summary-open` on #seat-summary-float, which expands...
│   └── #hemi-row             display:none until expanded — 4 glass cards: Regional hemicycle,
│                             Party-list hemicycle, Indigenous seats, Total hemicycle
└── #ip                       position: absolute; top:76px; right:0; bottom:10px; width:288px
                               floating glass info panel (candidate bars, PVI cards, trend charts,
                               swing-mask toggle, etc.) — content is rewritten per selection by
                               showEDPanel/showTCPanel/showVCPanel and the updateCardsFor* functions
```

Key characteristics vs. the old layout: `#left-rail`, `#ip`, and `#seat-summary-float` are all independently positioned/floating panels over a full-bleed `#mp` map (`#main` is `position:absolute; inset:0`), rather than being flex siblings in a 3-column row. All three floating panels use `backdrop-filter: blur(...)` glass styling and can be collapsed/expanded independently (`toggleSidebar()`, `toggleSeatSummary()`).

---

## Key global state variables

Declared together near the top of the main `<script>` block (around test.html:347638+), unless noted:

| Variable | Line | Meaning |
|---|---|---|
| `level` | 347638 | Current drill-down level: `'ed'` \| `'tc'` \| `'vill'` |
| `mode` | 347638 | Current color mode: `'winner'` \| `'comp'` \| `'third'` \| `'dpp'`/`'kmt'`/`'tpp'`/`'npp'`/`'tsr'`/`'ind'`/`'other'` (heatmap) \| `'sim'` \| `'ind-m'`/`'ind-p'` (indigenous) |
| `curED` / `curTC` / `curVC` | 347638 | Currently selected district / town / village key (null when not drilled in) |
| `showSwing`, `showPop` | 347639 | Toggle: 搖擺區 stripe overlay / population pie charts |
| `twoParty` | 347639 | "藍綠對決" scenario toggle — collapses non-DPP/KMT votes into the two-party sim |
| `wParty` | 347639 | PVI slider weight (0=pure district, 1=pure party-list), default 0.6 |
| `sA, sB, sG` | 347640 | Sim core-3-axis sliders: 政黨基本盤黏著度 / 總統母雞外溢 / 個人現任優勢 |
| `sW, sFG, sFB, sFN` | 347640 | Sim third-party-compression sliders: 民眾黨留存率 / 游離流回綠 / 流向藍 / 不投票 |
| `simCache` | 347641 | Memoized `calculateDynamicVotes(ed)` results, keyed by ED |
| `vcSimCache` | 347642 | Memoized `calcVCSim(vc)` results, keyed by village code |
| `curK` | 347651 | Current D3 zoom scale factor |
| `alphaScale`, `popDensityScale` | 347676/347678 | Value-by-alpha / glow-brightness D3 scale functions, rebuilt by `buildAlphaScale`/`buildPopDensityScale` |
| `currentLang` | 347709 | `'zh'` \| `'en'` — drives `T()` and `applyLang()` |
| `showMismatchMaskOnly` | 350416 | Dim non-mismatched districts in comp/third hemicycle mask |
| `showSwingMaskOnly` | 351223 | 激戰選區遮罩 (dim non-swing EDs) |
| `showFlipMaskOnly` | 351297 | 政黨輪替熱區遮罩 (dim non-flip EDs) |
| `showFlipOverlay`, `showSwingOverlay` | 351501/351502 | Whole-map flip-color / swing-color overlay toggles (mutually exclusive) |
| `villAllMode` | 355223 | "全選區/全台村里總覽" flag — village layer bypassing the town click-through |
| `compYear` | 355866 | Active year for comp/third PVI modes: `'2024'` \| `'2020'` \| `'2016'` |
| `thirdSubMode` | 355867 | Third-force sub-tab: `'pr'` (不分區席次推演) \| `'key'` (關鍵少數) |
| `winnerYear` | 355947 | Active year for winner (歷史勝選) mode |
| `plCountyModeActive`, `_plLevel`, `_plCountyYear` | 349089/349091 | §13's own parallel navigation state — whether the 不分區地圖（縣市） mode is active, its drill level (`'county'\|'township'\|'village'`), and active year (`2024\|2020\|2016\|'sim'`). Deliberately independent of `mode`/`level`/`curED` |
| `_plTurnoutOverride`, `_plMobilizationTilt` | 349093/349094 | §13 sim-year-only sliders: assumed party-list turnout override, and DPP/KMT mobilization-tilt coefficient |

## National view detection

`level === 'tc' && !curED` → 全台鄉鎮市區 (national township view); `level === 'vill' && !curED` → 全台村里 (national village view). See CLAUDE.md for full navigation-mode diagram and PVI/simulation formulas.

---

## Full function reference

All 285 `function name(...)` declarations and `window.name = function(...)` assignments found in the file (top-level plus nested one-off closures), grouped by purpose. Line numbers were verified against the file at the time this was written; **this file is large and actively edited, so re-`grep -n` before trusting an exact line number for an edit.** Duplicate function names (same identifier reused inside different outer closures for different render contexts) are called out explicitly in the **Duplicate function names** subsection near the end and cross-referenced inline.

> **Line-number drift warning:** sections 1–12 below were last verified before the §13 不分區地圖（縣市） feature was built (roughly +4,000 lines inserted around test.html:346100–349600 and 358550/360400–360900). Everything at or after those insertion points — i.e. most of sections 5 onward — has shifted down from whatever line number is printed; §13's own line numbers are current as of this edit. Re-`grep -n` regardless before editing anything in this file.

### 1. Data loading / lookup / translation helpers

| Function | Line | Params | Description |
|---|---|---|---|
| `getEDGJ` | 346211 | — | Returns the active ED GeoJSON (`ED_GJ` or `ED_GJ_2016`) depending on current mode/year |
| `getTCGJ` | 346222 | — | Returns the active TC GeoJSON (`TC_GJ` or `TC_GJ_2016`) depending on current mode/year |
| `getTCPartyVote` | 346250 | `tcKey` | Aggregates 2024 party-list (不分區) votes for a town from `VC_SIM`, cached in `_tcPartyVoteCache` |
| `getTCPartyDistVote2020` | 346271 | `tcKey` | Aggregates 2020 district third-force vote share for a town from `VC_SIM.v20`, cached |
| `getTCPresVote` | 346300 | `tcKey` | Aggregates 2024 presidential-election vote shares for a town from `VC_SIM`, with `REAL_PRES` fallback |
| `getIndigenousConfig` | 346326 | — | Returns the year-aware array of the 6 indigenous seats' camp assignments (blue/green/other/magenta) |
| `turnoutClass` | 346521 | `pct` | Classifies turnout % into `'green'`/`'yellow'`/`'red'` badge tiers |
| `invalidClass` | 346522 | `pct` | Classifies invalid-vote % into `'green'`/`'yellow'`/`'red'` badge tiers |
| `isMajorParty` | 346909 | `code, year` | Checks if a party code counts as "major" for a given year (dpp/kmt/tpp in 2024, dpp/kmt otherwise) |
| `getCandidateDisplay` | 347513 | `name, p, pct, yr` | Central candidate lookup: resolves display color/label/notability from `KNOWN_PARTY_MAP` / `KNOWN_PARTY_2016` / independents threshold |
| `getWinnerBadgeClass` | 347597 | `p, n, yr` | Maps a winner's party/candidate to a CSS badge class (`bd-green`, `bd-blue`, `bd-npp`, etc.), year-aware |
| `get2020WinnerColor` | 347606 | `d` | Resolves a special-case winner color for 2020 town/district stats (handles 傅崐萁/陳超明/known small parties) |
| `get2016WinnerColor` | 347624 | `d` | Same as above for 2016 data |
| `buildPopDensityScale` | 347679 | — | Builds the `popDensityScale` function (P85-percentile-normalized brightness scale) used for the ED "night-lights" glow layer |
| `buildAlphaScale` | 347699 | — | Builds the `alphaScale` D3 linear scale (value-by-alpha opacity) from village/TC vote totals |
| `getWinnerPartyLabel` | 347713 | `wp` | Translates a party code to its full localized display name (with an internal party-name map) |
| `translateCandidate` | 347736 | `name` | EN-mode candidate-name translation via `candidateTranslationMap`, no-op in ZH |
| `initTranslationMaps` | 347781 | — | Builds county/town/village English name lookup tables from the VD/CD TopoJSON objects |
| `translateED` | 347830 | `edName` | EN-mode electoral district name translation (regex-normalizes "第N選舉區" suffix) |
| `translateTownship` | 347846 | `townName` | EN-mode township name translation via `townshipTranslationMap` |
| `translateVillage` | 347852 | `vc, name` | EN-mode village name translation via `villageTranslationMap`, keyed by village code |
| `T` | 347858 | `zh, en` | Core i18n helper: returns `en` if `currentLang==='en'`, else `zh` |
| `turnoutBadgeHtml` | 347859 | `tr, ir` | Renders the small turnout-rate/invalid-rate pill badges HTML |
| `partyName` | 347866 | `code` | Party-code → short display name, language-aware |
| `initProj` | 347876 | — | Builds the D3 geo-identity projection/path function (`pathFn`) fit to the `#mp` container |
| `throttle` | 347887 | `fn, ms` | Generic trailing-edge throttle wrapper used for slider `oninput` handlers |
| `edMargin` | 349144 | `s` | Computes winner-vs-runner-up margin (0–1) for an ED/TC/VC stats object |
| `edPartyPct` | 349151 | `s, party` | Computes a given party's vote share % within a stats object's `votes` |
| `getVotesAndTot` | 349162 | `level, key, year` | Year-aware unified accessor returning `{votes, tot}` for ed/tc/vc at 2024/2020/2016, normalizing each year's differing data shape |
| `isCandidateForHeatmapMode` | 349237 | `name, party, ed, year, mode` | Determines whether a candidate counts toward a given party-heatmap mode (dpp/kmt/tpp/npp/tsr/ind/other), incl. cooperative-candidate rules |
| `mapEDNameTo2016` | 356038 | `name` | Looks up a 2024/2020 ED name's corresponding 2016 district name via `ED_NAME_2016` |
| `mapEDNameTo2024` | 356039 | `name` | Reverse lookup via `ED_NAME_2024` (built from `ED_NAME_2016`) |
| `getTCPartyVote2016` | 356222 | `tcKey` | 2016 analogue of `getTCPartyVote`, with ED-level `REAL_PL_2016` fallback |
| `getTCPresVote2016` | 356258 | `tcKey` | 2016 analogue of `getTCPresVote`, with national-baseline fallback |
| `getPlVcAggr` | 353118 | `key, year, level` | Aggregates village-level party-list vote data (`PL16_VC`/`PL_VC_2020`/`PL_VC_2024`) up to a town or district for a given year |

### 2. Navigation (drill-down / zoom)

| Function | Line | Params | Description |
|---|---|---|---|
| `mapVisibleCenterX` | 354983 | `W` | Computes the horizontal zoom-center x-offset that accounts for the floating `#left-rail`/`#ip` panels currently covering part of the map, so `zoomTo`/`fitFeats` center on the *visible* map area rather than raw viewport width `W/2` |
| `zoomTo` | 354991 | `feat, cb` | Animates the D3 zoom transform to fit one GeoJSON feature, with completion callback |
| `fitFeats` | 354997 | `fs` | Animates the D3 zoom transform to fit the bounding box of multiple features |
| `clearAll` | 355005 | — | Clears all SVG layer groups (`gBase`, `gSw`, `gPop`, `gBg`, `gGlow`) before a level transition |
| `goED` | 355008 | — | Navigates to the top-level electoral-district choropleth (Taiwan-wide) |
| `goTC` | 355083 | `ed` | Navigates to the town/district level within one electoral district |
| `goVill` | 355169 | `tc, ed` | Navigates to the village level within one town |
| `goVillAll` | 355224 | `ed` | Navigates directly to all villages within a district, bypassing the town level (全選區村里總覽) |
| `villBack` | 355342 | — | Returns from village-all view to the town (or ED, if in national village mode) level |
| `goVillAllNational` | 355347 | — | Navigates to all villages nationally (全台村里總覽); pie charts disabled at this scale |
| `goTCAllNational` | 355430 | — | Navigates to all towns/districts nationally (全台鄉鎮市區總覽) |
| `toggleSidebar` | 355412 | — | Toggles `.sidebar-collapsed` on `#layout`, collapsing/expanding `#left-rail` |
| `toggleSeatSummary` | 355418 | — | Toggles `.seat-summary-open` on `#seat-summary-float`, expanding/collapsing `#hemi-row` |
| `toggleNatAccordion` | 355421 | — | Toggles the "全台村里" accordion sub-button under the national-view shortcut row |

### 3. Color modes / map coloring

| Function | Line | Params | Description |
|---|---|---|---|
| `winnerColor` | 348007 | `camp, margin` | Base winner-mode fill color for a camp (green/blue/white), lightness scaled by margin |
| `pviColor` | 348015 | `pvi` | Green/blue power-curve PVI color scale, `t=(|pvi|/22)^1.3`, capped ±22% (see CLAUDE.md formulas) |
| `compPVI` | 348038 | `d, p` | Blends district PVI `d` and party-list PVI `p` by `wParty` |
| `thirdPviColor` | 348933 | `pvi` | Cyan-scale color for third-force PVI values |
| `prCatColor` | 348940 | `pct` | Teal-scale color for party-list (不分區) percentage categories |
| `prThirdPct16` | 348948 | `d` | Computes 2016 third-force party-list % from a `PL16_VC`-style record |
| `prThirdPct2x` | 348953 | `d` | Computes 2020/2024 third-force party-list % from a `{dpp,kmt,t}`-style record |
| `pctFill` | 348956 | `party, pct` | Non-linear power-scale fill color for heatmap modes, per party (dpp/kmt/tpp/npp/tsr/np/other_party/ind) |
| `vcSimColor` | 348981 | `vc` | Sim-mode village fill color, derived from `calcVCSim` |
| `edSimColor` | 348985 | `ed` | Sim-mode ED fill color, derived from sorted `simResultsFor(ed)` |
| `winnerCandidateDisplay` | 348997 | `s` | Finds the top vote-getter in a stats object's `votes` and resolves via `getCandidateDisplay` |
| `winMarginFill` | 349006 | `party, margin, realColor` | Margin-scaled fill color for winner mode (5%→pale/battleground, 25%+→saturated/safe seat); supports real candidate colors for notable independents |
| `winPctFill` | 349024 | `party, pct` | Legacy wrapper delegating to `winMarginFill` via a pct→margin conversion |
| `indCandColor` | 349029 | `name, party` | Base color for an indigenous-seat candidate by party name (incl. special-case 高金素梅) |
| `indLegColorFromVotes` | 349037 | `votes, cands` | Resolves the margin-scaled fill color for an indigenous-district vote array |
| `indGetWinners` | 349050 | `indD` | Computes the national top-3 candidates by summing township votes across an indigenous dataset |
| `_indPartyCode` | 349058 | `party` | Maps a Chinese full party name to its short code for indigenous-mode coloring |
| `heatmapFill` | 349322 | `level, key` | Computes the heatmap-mode fill color for a unit based on its top-party vote share |
| `heatmapSimple` | 349369 | `level, key` | Simplified heatmap fill variant used for cooperative-candidate native-party coloring |
| `updateGlowAndBaseED` | 349399 | — | Refreshes the ED-level glow/base-fill population-density overlay colors |
| `edColor` | 349452 | `ed` | Top-level ED fill-color dispatcher across all modes (sim/winner/comp/third/heatmap) |
| `tcColor` | 349501 | `key` | Top-level TC fill-color dispatcher across all modes |
| `vcColor` | 349596 | `vc` | Top-level village fill-color dispatcher across all modes |
| `overlayColorFlip` | 351504 | `p20, p24` | Computes the flip-overlay color transition (e.g. blue→green) between 2020 and current winning camp |
| `overlayColorSwing` | 351525 | `margin` | Computes the swing-overlay color from a margin-change value, interpolated across color stops |
| `getNativeGradColor` *(local, in `redrawStripes`)* | 351101 | `np` | Resolves the "native party" gradient stop color for cooperative-candidate stripe overlays |

### 4. PVI / composite index calculation

| Function | Line | Params | Description |
|---|---|---|---|
| `getThirdPVIValue` | 346914 | `lvl, key, yr` | Year-aware third-force PVI value lookup/computation for a given level+key |
| `dppKmtFromVotes` | 348048 | `votes` | Sums strict DPP/KMT votes from a 2024-style `votes` object, applying `PVI_BACKED_MAP` cooperative-candidate overrides |
| `thirdPartyFromVotes` | 348060 | `votes` | Sums non-DPP/KMT ("third force") vote totals from a 2024-style `votes` object |
| `getPrevPartyNote` | 348688 | `name, yr, currentCode` | Builds the "previously ran as X party" note shown for candidates who switched affiliation |
| `calc24PVI` | 348760 | `govN, oppN, partyPct, w` | 2024 two-party composite PVI: blends district DPP-share and party-list % by weight `w`, relative to national baselines |
| `calc20PVIFromCands` | 348768 | `cands, ed, w, partyPctOvr` | 2020 two-party composite PVI computed from a raw candidate array plus ED-level party-list % |
| `computeTwoPartyMetrics` | 348793 | `district, wDist, wParty, nationalData` | "分頁A" blue/green traditional-baseline PVI panel calculator (district+party-list weighted) |
| `computeThirdPartyMetrics` | 348830 | `district, wDist, wParty, nationalData` | "分頁B" third-force relative-to-national-baseline PVI panel calculator |
| `calc20EdPVI` | 348860 | `ed, w` | Convenience wrapper: looks up `ED_2020[ed]` (with fuzzy name matching) and calls `calc20PVIFromCands` |
| `calc20ThirdEdPVI` | 348865 | `ed, w` | Convenience wrapper: third-force PVI variant of `calc20EdPVI`, via `calc20ThirdPVIFromCands` |
| `calc2016DistPct_by2020boundary` | 348870 | `edName` | Recomputes 2016 DPP% aggregated by *2020* district boundaries (village-level `VC_2016` + `VC_ED`), for 2016→2020 shift comparisons |
| `calc16EdPVI` | 348886 | `ed, w` | 2016 two-party composite PVI, using `ED_2016` cands + `REAL_PL_2016` |
| `calcThirdPVI` | 348903 | `distThirdPct, plThirdPct, w` | 2024 third-force PVI blend formula relative to national baselines; forces `w_eff=1` if no third-force district candidate ran |
| `calc20ThirdPVIFromCands` | 348910 | `cands, ed, w, plPctOvr` | 2020 third-force PVI computed from raw candidates + `PARTY_VOTES_2020` |
| `getDistrictMargin` | 347490 | `ed, yr` | Returns a district's win margin % for a given year (2020 via `ED_2020`, else via `edMargin`) |
| `getKeySwingDistricts` | 347228 | `yr` | Builds the "關鍵搖擺區" list: districts where third-force PVI exceeds the winner's margin |
| `classBadgeHtml` | 352226 | `pvi, suffix, useSimpleColors` | Renders the small colored PVI-category badge (深綠/淺綠/.../深藍) |
| `pviCategoryListHtml` | 352250 | `level, key` | Renders the comp-mode 6-bucket PVI classification column list (predicted-PVI based) for child units |
| `realResultCategoryListHtml` | 352331 | `level, key` | Same classification list but bucketed by *actual* result margin rather than predicted PVI |
| `combinedCategoryListHtml` | 352397 | `level, key` | Comp-mode classification list supporting 2024/2020/2016 comparison years in one function |
| `combinedCategoryListHtmlThird` | 352780 | `level, key` | Third-force-mode ("關鍵少數") 5-bucket classification list (弱→強) for child units |
| `combinedCategoryListHtmlPR` | 352885 | `level, key` | Third-force PR (不分區) classification list variant, sourced from village party-list data |
| `getCompFormulaHtml` | 355516 | — | Renders the collapsible 綜合PVI formula explainer HTML block |
| `getThirdFormulaHtml` | 355528 | — | Renders the collapsible 第三勢力PVI formula explainer HTML block |
| `getPviNoteInnerHtml` | 355540 | `m` | Returns the short PVI-definition footnote text, mode-aware (`'third'` vs. composite) |

### 5. Simulation engine

| Function | Line | Params | Description |
|---|---|---|---|
| `calculateDynamicVotes` | 347900 | `ed` | Core district vote-simulation model: two-stage (PVI×α + presidential×β, then incumbent bonus×γ) with a white-vote flow matrix (`sW`/`sFG`/`sFB`/`sFN`) and tactical-split adjustment; returns simulated `pct` per candidate |
| `calcVCSim` | 347969 | `vc` | Village-level simulation using `VC_SIM` per-village decomposed PVI/pres data, cached in `vcSimCache` |
| `simResultsFor` | 349701 | `ed` | Memoized accessor for `calculateDynamicVotes(ed)`, backed by `simCache` |
| `resetSim` (`window.resetSim`) | 349769 | — | Resets all district-sim sliders (α/β/γ/W/flow) to defaults and re-renders |
| `toggle2Party` (`window.toggle2Party`) | 349778 | — | Toggles "藍綠對決" two-party-only simulation mode |
| `getSimulatedPRSeats` | 347095 | `yr, w` | Party-list seat simulation via Largest Remainder Method (5% threshold, 34 seats) — see CLAUDE.md formulas |
| `runDHondt` | 347077 | `shares, totalSeats` | Generic D'Hondt-quotient seat-allocation helper (currently used as a comparison/utility, not the primary PR method) |
| `simBarHtml` | 352055 | `ed` | Renders the sim-mode candidate vote-share bar list for the ED info panel |
| `simParamsHtml` | 353459 | — | Renders the small "推演參數" summary chip (α/β/γ/W%/twoParty) shown atop comp/sim cards |
| `onThirdForceSim` | 356392 | `changedSlider` | Handles the "third-force year" slider: rescales the 5-small-party pie to a historical year's real share, writing deltas back to party sliders |
| `calculateSimulatedPartyVotes` | 356443 | — | Core party-list vote simulator: applies user slider deltas to historical baseline shares, computes qualifying-party seats |
| `onPLFlow` | 356582 | `which` | Handles the party-list "游離票流向" three-way-linked sliders (回綠/流藍/不投票), keeping them summed to 100% |
| `onPLSim` | 356606 | `changedParty` | Main party-list slider change handler: updates `__userDeltas`, recomputes seats, redraws sim result panel and hemicycle |
| `resetPLSim` | 356728 | — | Resets all party-list sim sliders and deltas to defaults |
| `toggleSimPanel` | 356744 | — | Opens/closes the `#sim-panel` slide-out and re-triggers `onPLSim()` once visible (fixes zero-height measurement bug) |
| `switchSimTab` | 356758 | `tab` | Switches between the sim panel's "region" and "pl" (party-list) column tabs |
| `onPVISlider` (`window.onPVISlider`) | 355801 | `v` | Updates `wParty` from the PVI weight slider and re-renders |
| `setCompYear` (`window.setCompYear`) | 355874 | `yr` | Sets `compYear`/`winnerYear` for comp/third modes and re-renders dependent UI |
| `setWinnerYear` (`window.setWinnerYear`) | 356041 | `yr` | Sets `winnerYear`/`compYear` for winner mode and re-renders dependent UI, handling 2016 boundary-name remapping |
| `setMode` (`window.setMode`) | 355547 | `m` | Top-level mode switch (winner/comp/third/heatmap/sim/ind-m/ind-p); toggles UI panels, gating, and triggers redraw |
| `updateNonSimGating` | 355740 | — | Enables/disables pies, swing checkbox, flip-mask checkbox based on current level/curED (non-sim modes) |
| `updateSimGating` | 355770 | — | Enables/disables sim-panel-specific controls (params button, 2-party toggle) based on `mode==='sim'` and drill-down state |

### 6. Info panel / card HTML builders

| Function | Line | Params | Description |
|---|---|---|---|
| `candName` | 352053 | `c` | Formats a sim candidate's display name (incumbent name, or "[party] 挑戰者" for challengers) |
| `tvotes` | 352054 | `pct, totalVoters` | Formats an estimated vote count (萬/thousands) from a pct + elector-base estimate |
| `collapseSection` | 352065 | `label, content, bodyId` | Generic collapsible `<div>` section wrapper (click-to-expand arrow) used across info-panel cards |
| `histBoxHtml` | 352069 | `ed` | Builds the 2024 "歷史真實得票" box (district/president/party-list bars) for the ED info panel; contains local `threeBar`/`fourBar`/`regionBar` |
| `histBoxHtml2020` | 353736 | `ed, cands, tot, presData, plData` | 2020-year analogue of `histBoxHtml`; contains local `fourBar`/`plBar2020`/`regionBar` |
| `histBoxHtml2016` | 356298 | `ed, cands, tot, presData, plData` | 2016-year analogue; contains local `plBar2016`/`regionBar` |
| `threeBar` *(local, in `histBoxHtml`)* | 352073 | `label, gv, bv, wv` | Renders a normalized 3-way (green/blue/white) stacked bar (used for presidential vote row) |
| `fourBar` *(local, in `histBoxHtml`, line 352065; also in `histBoxHtml2020`, line 353718)* | 352065 / 353718 | `label, gv, bv, wv, ov` | Renders a normalized 4-way (green/blue/white/other) stacked bar; each copy renders that function's own year's data context |
| `regionBar` *(local, in `histBoxHtml` 352081, `histBoxHtml2020` 353760, `histBoxHtml2016` 356280)* | 352081 / 353760 / 356280 | `label, segs` | Renders a dynamic multi-segment district-vote stacked bar supporting arbitrary candidate colors/labels for that year's context |
| `plBar2020` *(local, in `histBoxHtml2020`)* | 353754 | `label, gv, bv, wv, ov, realD` | 2020-specific party-list bar builder that splits "other" into NPP/TSR estimates via `PL_RATIOS_2020` when real breakdown is unavailable |
| `plBar2016` *(local, in `histBoxHtml2016`)* | 356299 | `label, gv, bv, wv, ov` | 2016-specific party-list bar builder (green/blue/NPP/other) |
| `mobRateBarHtml` | 352150 | `votes, elig` | Renders horizontal "催票率" (mobilization rate = candidate votes ÷ eligible voters) bars |
| `mobRateBarVertHtml` | 352176 | `votes, elig, year` | Vertical SVG variant of the mobilization-rate chart, year-aware |
| `mobRateBarVertHtmlThird` | 352710 | `votes, elig, year` | Third-force ("關鍵少數") variant of the vertical mobilization-rate chart |
| `distTrendChartHtml` | 352577 | `level, key` | Renders the 2016→2020→2024 DPP/(DPP+KMT) trend line SVG chart for comp mode; contains local `fromCands`/`toPct`/`yS` |
| `distTrendChartHtmlThird` | 352950 | `level, key` | Third-force analogue trend chart (TPP + small-party lines); contains local `breakdown24`/`breakdown20`/`breakdown16`/`pct`/`yS` |
| `distTrendChartHtmlPR` | 353066 | `level, key` | Party-list (不分區) DPP/KMT/small-party trend chart aggregated from village PL data; contains local `agg24`/`agg20`/`agg16`/`pct`/`yS`/`drawLine` |
| `tcTurnoutTrendHtml` | 352659 | `key` | Renders a 2016/2020/2024 turnout-rate trend line chart for a town; contains local `yS` |
| `plVcBarHtml` | 353148 | `vcData, elig` | Renders the party-list vote-share vertical bar chart for a village/town in PR submode |
| `plVcTrendHtml` | 353191 | `vc, isAggr` | Renders the party-list vote trend line chart (2016/2020/2024) for a village or pre-aggregated data object; contains several local helpers (`tot16`, `pct16`, `pctOf`, `_tot3rd16`, `_tot3rd2x`, `yS`) |
| `updateCardsForTC` | 353253 | `tcKey, opts` | Rewrites the hemi-row card contents (mob-rate / village classification / district trend) for the currently-hovered town, in comp/third modes |
| `restoreCardsFromTC` | 353332 | — | Restores the hemi-row cards' original content after leaving town-hover in comp/third modes |
| `updateCardsForVC` | 353342 | `vc` | Rewrites hemi-row cards for the currently-selected village, in comp/third modes |
| `updateCardsForED` | 353409 | `ed` | Rewrites the ED-level trend card for comp/third modes |
| `restoreCardsFromED` | 353447 | — | Restores the ED-level card's original content and refreshes hemicycle/mismatch/PVI-margin cards |
| `thirdBoxHtml` | 353462 | `s, edName, plPct, cands20, distPctOpt, pl20Pct` | Renders the third-force PVI info box (district/party-list/weighted CP rows + historical growth delta) |
| `cmpBoxHtml` | 353579 | `s, edName, opts` | Renders the composite (綜合) PVI info box (district/party/weighted PVI rows + 2016→2020 shift delta, year-aware) |
| `winBadge` | 353668 | `s, wpct, subLevel` | Renders the "勝選"/"最多票" winner badge span with party-aware styling |
| `regionSegs2020` | 353691 | `cands, tot` | Builds display segments for the 2020 district bar chart, with `_GRAY_IND_2020` display-only overrides (does not affect PVI); contains local `_eff` |
| `_compHistCandBarsHtml` | 353818 | `candsArr, tot, yr` | Renders the collapsible major/minor candidate vote-bar breakdown used in comp-mode ED panels |
| `showEDPanel` | 353845 | `ed` | Main ED-level info-panel renderer: builds the full `#ic` content (candidate bars, hist box, PVI box, formulas, nav button); contains local `_makeTurnoutRow` |
| `showTCPanel` | 354226 | `key, tc` | Main TC-level info-panel renderer; contains local `tcPartyVoteBarHtml`/`tcPresVoteBarHtml` |
| `showVCPanel` | 354496 | `vc` | Main village-level info-panel renderer; contains local `vcCapsuleRow` |
| `tcPartyVoteBarHtml` *(local, in `showTCPanel`)* | 354401 | `pv` | Renders the town-level party-list vote bar (green/blue/white/other) from `getTCPartyVote` data |
| `tcPresVoteBarHtml` *(local, in `showTCPanel`)* | 354417 | `pv` | Renders the town-level presidential-vote bar from `getTCPresVote` data |
| `vcCapsuleRow` *(local, in `showVCPanel`)* | 354507 | `label, gv, bv, wv, ov, divider` | Renders a compact capsule-style 4-way vote-share row for the village info panel |
| `_makeTurnoutRow` *(local, in `showEDPanel`)* | 354102 | `trVal, irVal` | Thin wrapper around `turnoutBadgeHtml` for the ED panel's turnout row |
| `nationalPanelHtml` | 349881 | — | Builds the (largely superseded) national vote-summary panel HTML; contains local `stackBar` |
| `stackBar` *(local, in `nationalPanelHtml`)* | 349882 | `items` | Renders a generic stacked horizontal bar from an `{n,v,c}` item array |
| `calcNationalVotes` | 349917 | `yr` | Sums national-level green/blue/white/ind/other vote totals across all districts for a given year |
| `renderLegend` | 356766 | — | Renders the mode-dependent legend content in `#legend` (sim margin scale / heatmap scale / pie-size legend, etc.) |
| `renderMapLegend` | 356821 | — | Renders the fixed bottom-right map-corner legend (`#map-legend`), constant across ED/TC/VC levels |

### 7. Indigenous (原住民) legislator panel

| Function | Line | Params | Description |
|---|---|---|---|
| `showIndLegPanel` | 349065 | `level, code, tcCode` | Renders the indigenous-district info panel (candidate vote bars) for `ind-m`/`ind-p` modes |
| `setIndLegMode` | 349124 | `type` | Toggles into/out of indigenous-legislator map mode (`'m'` mountain / `'p'` plains), restoring comp/third cards if leaving |

### 8. Hemicycle / seat visualizations & PVI summary cards

| Function | Line | Params | Description |
|---|---|---|---|
| `buildHemiSeats` | 350114 | `rowsConfig, cx, cy, startR, step` | Geometrically lays out semicircle seat-dot coordinates from row-count config, sorted left-to-right |
| `getPLSimSeats` | 350139 | — | Returns party-list seat counts, either from historical results or the live PR simulation |
| `getRegionSimSeats` | 350167 | — | Returns regional (73-seat) camp counts (green/blue/white/other), either historical or from `edSimColor`-derived winners |
| `getIndigenousSeats` | 350192 | — | Returns the 6 indigenous seats' camp counts from `getIndigenousConfig` |
| `getTotalSimSeats` | 350206 | — | Sums regional + party-list + indigenous seat counts into the 113-seat total breakdown |
| `getRegionHemiData` | 350225 | — | Builds the sorted per-seat data array (camp, score) for the regional hemicycle dot visualization |
| `getTotalHemiData` | 350268 | — | Builds the combined 113-seat hemicycle dot data (regional + PL + indigenous) |
| `renderSeatRatio` | 350331 | `elId, seats` | Renders the small colored seat-count badge row (e.g. "民 51 · 國 45 · ...") into a given element |
| `updateSeatRatioDisplay` | 350381 | — | Refreshes all three seat-ratio badge rows (region/pl/total) |
| `refreshRegionHemiDots` | 350591 | — | Redraws/recolors the 73-seat regional hemicycle SVG dots |
| `refreshPLHemiDots` | 350620 | — | Redraws/recolors the party-list hemicycle SVG dots |
| `updateHemicycle` | 350816 | `duration, oldYr` | Master hemicycle refresh: updates all dot colors/positions, indigenous badges, seat ratios and summary strip; contains local `setDot`/`doneDot` transition helpers |
| `setDot` *(local, in `updateHemicycle`)* | 350817 | `sel` | Suppresses CSS transition for instantaneous (duration=0) dot updates |
| `doneDot` *(local, in `updateHemicycle`)* | 350822 | `sel` | Re-enables CSS transition after an instantaneous update completes |
| `updateSeatSummaryStrip` | 351033 | — | Syncs the collapsed `#seat-summary-strip` numbers from the expanded hemicycle center labels |
| `applyMismatchMask` | 350417 | — | Dims districts that don't match the "PVI-predicted vs actual winner" mismatch set, at ED/national-TC/national-vill levels |
| `toggleMismatchMask` (`window.toggleMismatchMask`) | 350481 | — | Toggles `showMismatchMaskOnly` and re-applies the mismatch mask / hemicycle |
| `getWinnerCamp` | 350488 | `name, wp, year` | Resolves a candidate's PVI-relevant camp (dpp/kmt/other), applying `COMP_BACKED_MAP`/`PVI_BACKED_MAP` cooperative overrides |
| `getPVIModelPredictedSeats` | 350496 | — | Computes how many seats the PVI model would predict green/blue/other to win, year-aware |
| `getMismatchedDistricts` | 350531 | — | Builds the list of districts where the PVI-predicted camp differs from the actual 2020 winner |
| `toggleCardCollapse` (`window.toggleCardCollapse`) | 350649 | `el` | Generic collapse/expand toggle for a hemi-row card, rotating its arrow icon |
| `updateMismatchedCard` | 350659 | — | Rewrites hemi-row card 3 with the sorted mismatch-district list |
| `updatePVIMarginCard` | 350715 | `oldYr` | Rewrites hemi-row card 4 with the PVI-margin ranking list (with NEW-district badges / shift arrows) |
| `updateDHondtCard` | 347151 | — | Rewrites the D'Hondt/largest-remainder seat-simulation result card |
| `getKeySwingDistricts` | 347228 | `yr` | *(also listed under PVI section)* Builds the 關鍵搖擺區 list feeding card 4 in 'third'+'key' submode |
| `updateThirdPVICards` | 347289 | — | Refreshes the third-force-mode hemi-row cards (PR seat sim / key-swing-district list), gated on `mode==='third'` |
| `setThirdSubMode` (`window.setThirdSubMode`) | 347468 | `subMode` | Switches the third-force sub-tab (`'pr'`/`'key'`) and re-renders dependent cards/hemicycle |
| `syncThirdSubToolbarStyles` | 347500 | — | Applies active/active-key CSS classes to the third-force sub-tab buttons |

### 9. Swing / flip analysis

| Function | Line | Params | Description |
|---|---|---|---|
| `isSwingByMargin` | 351066 | `s` | Boolean: whether a stats object's margin is within the swing threshold (`SWING_MARGIN`, ≤5%) |
| `isSwingVC` | 351067 | `info, vc` | Village-level swing check, year-aware (uses `VC_SIM.v20` for 2020 mode) |
| `isSwing` | 351087 | `d, p` | Legacy PVI-based swing check (superseded by margin-based checks; kept for compatibility) |
| `redrawStripes` | 351088 | — | Redraws heatmap-mode diagonal-stripe gradient overlays for cooperative candidates; contains local `getNativeGradColor` |
| `redrawSwing` | 351172 | — | Redraws the orange 搖擺區 (battleground) stripe overlay across the current view; calls `redrawStripes` |
| `toggleSwing` (`window.toggleSwing`) | 351219 | `v` | Sets `showSwing` and triggers `redrawSwing` |
| `applySwingMask` | 351224 | — | Dims non-swing districts/villages when `showSwingMaskOnly` is active |
| `toggleSwingMask` (`window.toggleSwingMask`) | 351262 | — | Toggles `showSwingMaskOnly` and re-applies the swing + flip masks |
| `getStripeOpacity` | 351268 | `ed` | Computes stripe-overlay opacity for a district factoring in both swing-mask and flip-mask state |
| `applyStripeOpacity` | 351290 | — | Applies `getStripeOpacity` to all rendered stripe overlay elements |
| `applyFlipMask` | 351298 | — | Dims non-2020→2024-flip districts/villages when `showFlipMaskOnly` is active |
| `toggleFlipMask` (`window.toggleFlipMask`) | 351332 | — | Toggles `showFlipMaskOnly` and re-applies the flip mask |
| `buildFlipCacheTown` | 351352 | — | Builds/caches the list of townships whose winning party flipped between comparison years |
| `buildFlipCacheVill` | 351375 | — | Builds/caches the list of villages whose winning party flipped between comparison years |
| `clearFlipCaches` | 351406 | — | Clears `_flipCacheTown`/`_flipCacheVill` (called on navigation/year change) |
| `onFlipClick` | 351407 | `type` | Handles the "翻盤鄉鎮/村里" button click, drilling into the appropriate view and computing flips |
| `computeFlips` (`window.computeFlips`) | 351462 | `lvl` | Computes and renders the flip-count summary text into `#flip-result` |
| `overlayColorFlip` | 351504 | `p20, p24` | *(also listed under Color modes)* Flip-transition color helper |
| `overlayColorSwing` | 351525 | `margin` | *(also listed under Color modes)* Swing-magnitude color helper |
| `applyFlipMap` | 351547 | — | Applies the whole-map flip-color overlay (`showFlipOverlay`) across ED/TC/VC levels |
| `_partyCamp` | 351595 | `p` | Maps a raw party code to a broad camp (`green`/`blue`/`white`/`other`) |
| `_netCampPct` | 351603 | `cands, tot` | Computes (green − blue) net percentage from a 2020-style candidate array |
| `_netCampVotesPct` | 351617 | `votes, tot` | Computes (green − blue) net percentage from a 2024-style votes object |
| `getSwingPct` | 351628 | `d, lvl` | Computes the swing (net-camp-% change) between the comparison year and current year for a unit |
| `applySwingMap` | 351664 | — | Applies the whole-map swing-color overlay (`showSwingOverlay`) |
| `recolorOverlay` | 351692 | — | Dispatches to `applyFlipMap` or `applySwingMap` depending on which overlay is active |
| `activateFlipOverlay` | 351696 | — | Activates flip-overlay mode (disables swing-overlay) and applies it |
| `updateSwingFlipGating` | 351703 | — | Enables/disables swing/flip buttons and mask checkboxes based on `winnerYear` (no 2016 comparison data) |
| `toggleSwingMap` (`window.toggleSwingMap`) | 351743 | — | Toggles `showSwingOverlay` and (de)activates the swing map overlay |

### 10. Population / vote pie charts

| Function | Line | Params | Description |
|---|---|---|---|
| `medianOf` | 351762 | `arr` | Simple array-median helper used to normalize pie-chart radius scaling |
| `pieRadiusByLog` | 351768 | `tot, maxTot, baseR` | Computes a pie's radius proportional to sqrt(votes/maxVotes), with a 3px floor |
| `drawOnePie` | 351774 | `feat, segs, tot, maxTot, baseR` | Computes centroid + radius for one feature's pie and pushes a spec into `_pieSpecs` (deferred draw) |
| `resolvePieCollisions` | 351783 | `specs` | (Currently unused by the main render path) collision-avoidance shrink algorithm for overlapping pie specs |
| `renderAllPies` | 351813 | — | Draws all collected `_pieSpecs` as animated D3 pie-arc groups into `gPop` |
| `segsFrom2020Cands` | 351829 | `cands, tot` | Builds pie-chart color segments from a 2020 candidate array (green/blue/white/notable-other/small-other) |
| `solidC` | 351844 | `c` | Extracts the first solid hex color from a CSS linear-gradient string (for SVG/text use where gradients aren't valid) |
| `redrawPies` | 351849 | — | Main pie-chart redraw entry point: rebuilds `_pieSpecs` from current-level data, then calls `renderAllPies` |
| `togglePop` (`window.togglePop`) | 352048 | `v` | Sets `showPop` and triggers `redrawPies`/`renderLegend` |

### 11. Ticker

| Function | Line | Params | Description |
|---|---|---|---|
| `updateTicker` | 349948 | `duration` | Recomputes and animates the top ticker's national green/blue/white/ind/other vote totals and seat count |
| `initTickerLogos` | 356361 | — | Populates the ticker's party-logo `<img>` elements from the shared `logoSVGs`/emblem asset map |

### 12. Core render pipeline / language / resize

| Function | Line | Params | Description |
|---|---|---|---|
| `updateAll` | 349706 | — | Central full-redraw dispatcher: re-colors the current level's map fills, redraws pies/ticker/hemicycle, and refreshes the open info panel |
| `setLang` (`window.setLang`, via `#lang-toggle`) | 356918 | `lang` | Sets `currentLang` explicitly and calls `applyLang()` |
| `toggleLang` | 356923 | — | Flips `currentLang` between `'zh'`/`'en'` and calls `applyLang()` |
| `applyLang` | 356927 | `oldYr, skipHemiUpdate` | Re-applies the active language across the whole UI: toolbar labels, breadcrumb, map title, ticker names, legend, all `[data-zh][data-en]` elements, and re-triggers the open panel's render |
| `_redrawOnResize` *(local, IIFE at end of file)* | 356884 | — | Recomputes the map projection and re-renders the current drill-down level on window resize/fullscreen change |
| `_scheduleRedraw` *(local, IIFE at end of file)* | 356904 | — | Debounces `_redrawOnResize` (120ms) |

### 13. 不分區地圖（縣市）/ Party-list County Map

A 6th, self-contained navigation mode added alongside the original five (winner/comp/third/heatmap/sim/ind), triggered from its own toolbar button+year-select pair rather than `setMode()`. It deliberately does **not** touch the shared `mode`/`level`/`curED` state — see the block comment at test.html:349085+ for the rationale. Because of that decoupling, several shared functions (`goED()`, `updateSimGating()`, the sim-panel-wide `disabled` lock) have explicit `plCountyModeActive`-aware branches bolted on; search for `plCountyModeActive` to find all of them.

**Entry point / toolbar:** `#btn-plcounty` (test.html:346143) + `#plcounty-year-select` (346145, options `sim`/`2024`/`2020`/`2016`, `2024` marked `selected` so that's the default even though `推演` is listed first) → `window.setPLCountyMode(year)` (349432).

**Drill levels:** county (全台縣市總覽) → township (`_addPLTownshipLayer`) → village (`_addPLVillageLayer`), tracked independently via `_plLevel` (349091: `'county'|'township'|'village'`) rather than the shared `level` variable. `_plCurCN`/`_plCurTcFilter` (349092) remember the current drill-in target so slider-driven re-renders (`_plSimRerender`, 349095) know what to redraw.

**"推演" (Simulated) year:** the 4th year option reuses the *existing* 情境推演 sim-panel's 不分區立委推演 sliders directly (`calculateSimulatedPartyVotes()`, 360494) rather than a separate engine. `villagePLRaw(vc,'sim')` (349030) routes to `getVillagePLSimAggr(vc)` (348991), which applies the sim panel's national-level per-bucket swing (`_getPLSimBucketSwing()`, 348972, cached in `_plSimSwingCache` and invalidated via `_invalidatePLSimCache()`, 348971) uniformly onto each village's real 2024 numbers, then redistributes the merged tgg/oth buckets back into granular party codes using each village's own relative proportions. `getCountyPLAggr('sim')`/`getTownshipPLAggr('sim')` (348773/348890) aggregate from the same per-village sim numbers rather than a static table.

**Turnout & mobilization sliders (sim-year only):** `_plTurnoutOverride` (349093, null = default ~70.4%) and `_plMobilizationTilt` (349094, -1..1, DPP/KMT-only) both feed into `calculateSimulatedPartyVotes(overrides)` (360494 — now accepts an optional `overrides` object so baseline recomputation never has to touch live slider DOM elements, see below). UI lives in `#pl-turnout-box` (346648), handlers `onPLTurnoutChange`/`resetPLTurnout` (360851/360858) and `onPLMobilizeChange`/`resetPLMobilize` (360864/360869). Turnout alone has zero effect unless a slider delta or the mobilization tilt is also non-zero (deadCore cancels out at 100% retention — see CLAUDE.md-style reasoning in the code comment at 360517).

**"第三勢力分票模擬器" year-accurate scaling:** `onThirdForceSim` (360421) numerically inverts `calculateSimulatedPartyVotes()` via secant-method root-finding (rather than a fixed linear-delta formula) so the 5-small-party total exactly hits the selected historical year's real third-force %, regardless of how the cross-flow-to-big-party mechanics distort a naive linear scaling.

**推演參數 panel redesign:** `#sim-panel` (CSS at 344350) is now a compact `position:fixed` flyout anchored next to the "推演參數" button (`toggleSimPanel()`, 360876, computes `top`/`max-height` from the button's own bounding rect) instead of a full-width banner across the map top. `#stab-pl-panel`'s three groups (政黨得票調整 / 假設情形 / 第三勢力分票模擬器) are each an independent `boxedCollapseSection`-style fold (政黨得票調整 open by default, the other two collapsed). 假設情形 is further split into a 國民黨/民進黨/民眾黨 tab selector (`window._selectPlScenario`, 358562) — only 民眾黨 has real content (existing TPP-shrinkage model); the other two are placeholder "尚未提供此情境模擬" panels. `_applySimPanelLock()` (349158) re-evaluates whether `#sim-panel`'s inputs should be `disabled` (originally only driven by `setMode()`'s historical-mode lock, which the PL pathway never re-triggers — see "known gotcha" below) and is called from both `setMode()` and `_updatePLTurnoutUI()` (349173, itself called on every PL-mode layer entry/navigation).

**推演結果 floating result chart:** moved out of the sim panel entirely into its own always-visible (when relevant) floating widget, `#pl-result-wrap` (346392) — a circular 📊 toggle button + collapsible chart, positioned in the gap between the left sidebar and the map's `.zbts` zoom buttons. Gated open/closed via the same `plSimActive` condition as the sim panel itself, independent of whether the sim panel itself is open.

**開票結果 list grouping:** 時代力量/台灣基進/綠黨/歐巴桑聯盟 (npp/tsr/gp/spgp) collapse into one clickable "台灣前進" row (`_tggGroupRowHtml`, 349273; `_buildPLRows`, 349298) using the shared `window._toggleFold`/`_foldOpenState` mechanism — same pattern as the trend/third-force/vote-result `boxedCollapseSection`s, and deliberately given the **same** `_foldOpenState` key (`'pl-trend'`/`'pl-thirdforce'`/`'pl-votes'`/`'pl-tgg'`, not level-prefixed) across `plCountyPanelHtml`/`plTownshipPanelHtml`/`plVillagePanelHtml` (349314/349439/349477) so expand state survives drilling county→township→village.

**Trend chart year set:** the 3-bar 不分區得票演變/兩黨vs第三勢力 mini-charts show `[2016,2020,2024]` when viewing a real year, or `[2020,2024,'sim']` only when the panel's own `yr==='sim'` — computed per-call as `trendYears`, not hardcoded, so the simulated bar never appears while looking at real 2024/2020/2016 data.

**Known gotcha (fixed, but a good example of the coupling risk this parallel-mode design creates):** `setMode()`'s pre-existing "disable all `#sim-panel` inputs in historical modes" pass only re-runs when `setMode()` itself is called — which the 不分區推演 pathway intentionally never does. Combined with the onboarding modal's dismiss handler (`closeCompOnboarding(true)` → `setMode('winner')`, only reached when the modal is dismissed by picking a party, not by pressing Escape) this could leave every party-list slider permanently `disabled` from first page load onward. `_applySimPanelLock()` re-running inside `_updatePLTurnoutUI()` is the fix — any future code path that can flip `plCountyModeActive`/`_plCountyYear` needs to remember to call it (or `_updatePLTurnoutUI()`) too.

### 14. Local one-off chart/classification closures

Small single-use helpers declared `function` inside one of the card/chart builders above (mostly percentage/margin calculators and SVG y-scale closures for the trend charts). Each is only visible within, and used once by, its enclosing function — listed here individually for completeness rather than repeated in every parent row's prose.

| Function | Line | Enclosing function | Description |
|---|---|---|---|
| `margin` | 352341 | `realResultCategoryListHtml` | DPP-vs-KMT margin % (−50..+50) from a 2024-style `votes` object |
| `margin2p` | 352412 | `combinedCategoryListHtml` | Same margin calc from a 2020-style `cands` array, using `COMP_BACKED_MAP` |
| `marginFromVotes` | 352417 | `combinedCategoryListHtml` | Same margin calc from a 2024-style `votes` object |
| `tcPvi2020` | 352431 | `combinedCategoryListHtml` | Town's 2020 composite PVI, from `TC_2020` + `PL20_TC` |
| `vcPvi2020` | 352447 | `combinedCategoryListHtml` | Village's 2020 composite PVI, from `VC_SIM.v20` |
| `margin2p16` | 352456 | `combinedCategoryListHtml` | 2016-style DPP/KMT margin from `cands`, using `BACKED_MAP_2016` |
| `tcPvi2016` | 352461 | `combinedCategoryListHtml` | Town's 2016 composite PVI, from `TC_2016` + `REAL_PL_2016` |
| `vcPvi2016` | 352474 | `combinedCategoryListHtml` | Village's 2016 composite PVI, from `VC_SIM.v16` |
| `fromCands` | 352580 | `distTrendChartHtml` | Sums DPP/KMT votes from a 2020/2016-style `cands` array via a `backed` override map |
| `toPct` | 352619 | `distTrendChartHtml` | Converts `{dpp,kmt}` totals to DPP/(DPP+KMT) % |
| `thirdPctVotes` | 352792 | `combinedCategoryListHtmlThird` | 2024 third-force % from a `votes` object |
| `thirdPctCands20` | 352800 | `combinedCategoryListHtmlThird` | 2020 third-force % from a `cands` array |
| `thirdPctCands16` | 352805 | `combinedCategoryListHtmlThird` | 2016 third-force % from a `cands` array |
| `_prPct16` | 352896 | `combinedCategoryListHtmlPR` | Village 2016 party-list third-force % from `PL16_VC` |
| `_prPct20` | 352897 | `combinedCategoryListHtmlPR` | Village 2020 party-list third-force % from `PL_VC_2020` |
| `_prPct24` | 352898 | `combinedCategoryListHtmlPR` | Village 2024 party-list third-force % from `PL_VC_2024` |
| `breakdown24` | 352954 | `distTrendChartHtmlThird` | Splits a 2024 `votes` object into TPP / other-small / total third-force vote counts |
| `breakdown20` | 352963 | `distTrendChartHtmlThird` | Same split for a 2020 `cands` array |
| `breakdown16` | 352972 | `distTrendChartHtmlThird` | Same split for a 2016 `cands` array (no TPP bucket) |
| `agg24` | 353075 | `distTrendChartHtmlPR` | Aggregates 2024 DPP/KMT/small-party PL votes across a village list (`vcList`) |
| `agg20` | 353076 | `distTrendChartHtmlPR` | Same aggregation for 2020 |
| `agg16` | 353077 | `distTrendChartHtmlPR` | Same aggregation for 2016 (from `PL16_VC`, green/blue/small buckets) |
| `drawLine` | 353093 | `distTrendChartHtmlPR` | Draws one SVG polyline (+ optional end label) for a party's 3-year trend |
| `tot16` | 353197 | `plVcTrendHtml` | Sums all fields of a `PL16_VC`-style record into a total |
| `pct16` | 353198 | `plVcTrendHtml` | A party's % of `tot16(d)` |
| `pctOf` | 353199 | `plVcTrendHtml` | A party's % of `d.t` (2020/2024-style total field) |
| `_tot3rd16` | 353218 | `plVcTrendHtml` | 2016 total third-force % (NPP+PFP+TSU+GSP+NP) via `tot16` |
| `_tot3rd2x` | 353219 | `plVcTrendHtml` | 2020/2024 total third-force % (`t - dpp - kmt`) |
| `_eff` | 353695 | `regionSegs2020` | Display-only camp override for 2020 bar-chart segments (forces 傅崐萁/`_GRAY_IND_2020` names to gray; does **not** affect PVI calculation — see CLAUDE.md's `regionSegs2020` constraint) |

---

### 15. Party base model (`mode==='baselean'`) — 2008-2024 鐵/中/淺 tier estimate

Standalone map mode, independent of the ED-based winner/comp/third modes (own county-merged shape layer, own click-through navigation, doesn't touch `level`/`curED`). For each party independently, finds its own lowest-vote year (floor/deep tier) and highest-vote year (ceiling) among 2008-2024 不分區政黨票 — not fixed years, auto-detected per party since TPP only exists from 2020 and NPP from 2016. Deep = floor-year raw votes; mid = (avg of 2020+2024) − floor; light = ceiling − (avg of 2020+2024); the three sum to the ceiling year's total.

| Function | Description |
|---|---|
| `getCountyPLAggr(year)` / `getTCPLAggr(year)` / `getVillPLAggr(year)` | County-name / 8-digit-tc / 11-digit-vc party-list vote aggregation. Only `getCountyPLAggr` needed a real aggregation loop originally significant enough to note; `getTCPLAggr` sums by `vc.slice(0,8)`; `getVillPLAggr` needs no aggregation at all (`PL08_VC` etc. are already vc-keyed) — just per-year g/b→dpp/kmt normalization for 2016 |
| `_base5PLAggrFor(geoKey, year)` | Shared dispatcher every downstream function reads through — tries county → tc → vc in sequence, the three key formats never collide |
| `baseLean5FloorCeil(party)` | Auto-detects a party's national floor/ceiling year from whichever of 2008/2012/2016/2020/2024 it actually has data for |
| `baseLean5PartySegments(geoKey, party)` | Deep/mid/light vote counts for one party at one geoKey; `null` if either the floor or ceiling year is missing at that geoKey (e.g. a village with only 2024 data) |
| `_baseLeanCountyPanelHtml(county)` / `_baseLeanTownPanelHtml(tc)` / `_baseLeanVillPanelHtml(vc)` | Hover panels at each of the three levels — identical 13-party detail/camp3/camp4 rendering (`_base5PLAggrFor` already generalizes), only the presidential cross-reference Sankey is county-only (2008/2012 presidential data doesn't exist below county level, and adding it at finer granularity would fabricate precision the underlying data can't support) |
| `_base5RealElig2024(geoKey)` / `_base5EligGapRowHtml(geoKey, grand)` | "空氣人" blind-spot row: real/derived 2024 eligible voters minus the grand (all-parties) ceiling total. County uses official `PRES_TURNOUT_COUNTY`; township derives from `TC_STATS`' `ed__tc` keys (may need summing across multiple EDs); village reads `VC_ED[vc].tr/.ir/.total` directly (a village belongs to exactly one ED, no summing needed) |
| `_baseLeanGoTown(county)` / `_baseLeanGoVillage(tc)` / `_baseLeanBackToCounties()` / `_baseLeanBackToTowns()` | Click-through navigation, each level rendering shapes merged from `VD` (village-level topojson, no ED-boundary artifacts) — village level uses each village's own unmerged geometry directly, no merge step needed |
| `_base5TrendChartSvg(geoKey)` / `_base5TrendLines(geoKey)` | Line chart of real per-cycle party-list votes (2008-2024) at any county/tc/vc geoKey — distinct from the floor/ceiling snapshot, shows the actual trajectory shape. Line grouping follows the current `_baseLeanDisplayMode` (detail = one line per party, camp3/camp4 = one line per camp, summed via `_base5YearlyCampVotes`); years before a party existed count as 0 via `_base5YearlyPartyVotes` (`\|\| 0`), not omitted |
| `_base5OpenTrendModal()` / `_base5TrendScopeChanged()` / `_base5TrendTcForVcChanged()` / `_base5TrendUnitChanged()` | Modal + cascading scope(county/tc/vc)→unit dropdowns for the trend chart above — village scope requires picking a township first (7713 villages won't fit one flat dropdown) |

---

### Duplicate function names

The following identifiers are declared more than once, each time as a `function` local to a *different* outer closure, rendering that outer function's own data context. This is intentional (not a bug) — each copy is independent and only visible within its enclosing function:

| Name | Occurrences (line → enclosing function) |
|---|---|
| `cls` | 352259 → `pviCategoryListHtml`; 352340 → `realResultCategoryListHtml`; 352406 → `combinedCategoryListHtml`; 352788 → `combinedCategoryListHtmlThird`; 352893 → `combinedCategoryListHtmlPR` — each is a local PVI/margin-bucket classifier using that function's own `CATS` thresholds |
| `regionBar` | 352103 → `histBoxHtml` (2024); 353782 → `histBoxHtml2020`; 356312 → `histBoxHtml2016` — each renders that year's own district-vote segment bar |
| `fourBar` | 352087 → `histBoxHtml` (2024); 353740 → `histBoxHtml2020` — 4-way (green/blue/white/other) stacked bar for that year's data |
| `yS` | 352631 → `distTrendChartHtml`; 352681 → `tcTurnoutTrendHtml`; 353022 → `distTrendChartHtmlThird`; 353090 → `distTrendChartHtmlPR`; 353227 → `plVcTrendHtml` — each is a local y-value→SVG-pixel scale closure for that chart's own y-domain |
| `pct` | 353011 → `distTrendChartHtmlThird` (`pct(n,tot)`); 353079 → `distTrendChartHtmlPR` (`pct(r,k)`) — differently-shaped percentage helpers, same name |
| `tcPvi2024` | 352261 → `pviCategoryListHtml`; 352422 → `combinedCategoryListHtml` — both compute a town's 2024 composite PVI from `TC_STATS`, identical logic duplicated across the two card builders |
| `vcPvi2024` | 352270 → `pviCategoryListHtml`; 352439 → `combinedCategoryListHtml` — village-level analogue of the above |

Additionally, `getKeySwingDistricts` (347227) and `overlayColorFlip`/`overlayColorSwing` (351482/351503) are cross-referenced in two sections above because they're used by both the PVI-summary-card logic and the swing/flip overlay logic — these are single top-level declarations, not duplicates, just multi-purpose.
