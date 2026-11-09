# Taiwan Election Atlas V2 · 台灣選舉地圖

**Interactive geospatial visualization and forecasting of Taiwan's elections — thirty years of results down to the village, a 2026 mayoral forecast, and a live election-night map.**

**Live site:** https://BallotPhantom.github.io/tawain-election-project/v2/index.html (desktop; a mobile version is linked from the home page)

---

## Core features

| Page | What it does |
|---|---|
| **History** (`v2/history.html`) | Every national and local race from the mid-1990s to 2024 on one map: presidents (1996–2024), legislators (1995–2024; indigenous and party-list seats from 2008), mayors and county magistrates (1997–2022), councils, township heads and village chiefs. Drill down Taiwan → county → township → village; year and race switch in place. |
| **Profile** (`v2/profile.html`) | A county / township profile: every election at that place over time, plus a population "night-lights" layer — official village population placed on 100 m WorldPop cells and drawn as glowing dots. |
| **Prediction** (`v2/predict.html`) | The 2026 mayoral forecast: weighted poll average, historical anchors, Monte Carlo win probabilities, carried down to townships. Published until Taiwan's legal poll blackout before election day. Method: `v2/methodology.html`. |
| **2026 Election Night** (`v2/live-flow.html`) | A canvas animation of the count: votes stream from each township into a 919-seat hemicycle; population lights turn party-coloured as townships report; a 3D "lying" view with vote pillars; click a county for its township layer; per-source tabs and a side-by-side source comparison; a turnout-aware "certain to win" threshold and Toss-up / Lean / Likely / Certain race tags from a backtested model. |

Everything is bilingual (中文 / English).

## Tech stack

- **Front end:** vanilla JavaScript (no framework, no build step), **D3.js v7** + **TopoJSON v3** for SVG maps, **Canvas 2D** for the election-night animation, population lights and 3D projection (hand-written camera and projection, no WebGL library).
- **Data pipeline:** Python — CEC (Central Election Commission) raw result files, household-registration population, WorldPop rasters; `shapely`, `numpy`, `Pillow`, `pypinyin`. Builders write plain `const X = {...}` JS data modules the pages load with `<script src>`.
- **Election-night scraper:** `poll_live2026.py` — polite polling of public news-site result feeds, every read validated before it is written (no decreasing votes, no changed candidate lists).
- **Testing:** Python tests that rebuild data and check it against the CEC totals; JavaScriptCore syntax checks; every UI change verified in a real browser.
- **Hosting:** GitHub Pages; `publish.sh` publishes an allow-listed subset of the working tree.

## Engineering highlights

- **Migrating a 360k-line legacy app without rewriting it.** The V2 History page runs the original V1 map engines unmodified inside iframes and drives them through their own entry points — see [CASE_STUDY_v2.md](CASE_STUDY_v2.md).
- **476,000 population lights at interactive frame rates.** A full redraw costs ~0.9 s, so each county keeps its own cropped canvas: new lights are drawn incrementally, a leader change rebuilds one county a few milliseconds per frame and cross-fades it in; zooming CSS-scales the old bitmap during the animation and redraws only the picked county.
- **Election-night animation:** 400 batched comet strokes per frame (one `Path2D` per colour × width) after per-comet gradients crashed Chrome at ~2,000 comets; arcs stay inside the hemicycle by construction (quadratic Bézier control point in the convex hull).
- **Screen ↔ map in a hand-rolled 3D view:** hit-testing counties and townships on the projected floor with Newton iterations on the projection.
- **Backtested decisions, not guesses:** the election-night models were tested at polling-station level on four past elections before going on the page — details in [docs/MODEL_METHODOLOGY.md](docs/MODEL_METHODOLOGY.md).

More in [docs/ENGINEERING.md](docs/ENGINEERING.md).

## Architecture

```
CEC raw files · population · WorldPop ──► Python builders ──► v2/data_*.js (const modules)
                                                                   │
          V1 engines (test.html, council.html) ◄── iframes ── v2/history.html
                                                                   │
                     v2/profile.html · v2/predict.html · v2/live-flow.html  (D3 SVG / Canvas)
                                                                   ▲
       news-site result feeds ──► poll_live2026.py ──► data_live2026.js (validated, every minute on the night)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Model & data methodology

- **2026 mayoral forecast:** poll weights (sponsor, age, survey mode × county age profile), even split of undecideds (backtest: county error 7.2→5.1 and 6.3→5.2 points in 2018 / 2022), a trust-weighted blend with each candidate's 2022 result, and 20,000 Monte Carlo runs with shared national / regional / county errors.
- **Election night:** expected final turnout per county from each township's prior and this year's observed turnout (the naive "counted ÷ share of stations" under-estimated by up to ~50% early in simulation), and race calls from township swing against the previous election, calibrated leave-one-election-out.
- **Sources:** CEC election results; 內政部戶政司 village population; WorldPop R2024B (CC BY 4.0); published polls.

Full write-up: [docs/MODEL_METHODOLOGY.md](docs/MODEL_METHODOLOGY.md) and the site's methodology page.

## Development & testing

```bash
python3 -m http.server 8080          # then open http://localhost:8080/v2/index.html
python3 tests/test_turnout_prior.py  # e.g. one of the data tests in tests/
```

No `npm install`, no compilation — D3 and TopoJSON load from a CDN. Data builders live at the repository root (`build_*.py`, `regen3.py`) and in `prototype_popdots/`.

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pages, data flow, modules |
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | Performance and interaction work, with measurements |
| [docs/MODEL_METHODOLOGY.md](docs/MODEL_METHODOLOGY.md) | Forecast and election-night models, backtests, assumptions |
| [CASE_STUDY_v2.md](CASE_STUDY_v2.md) | Engineering case studies from the V2 migration |
| [docs/V1_FUNCTION_REFERENCE.md](docs/V1_FUNCTION_REFERENCE.md) | V1 map engine: DOM layout, global state, full function table |
| [README_council.md](README_council.md) | V1 mayor / council engine notes |
| [CHANGELOG.md](CHANGELOG.md) · [CHANGELOG_council.md](CHANGELOG_council.md) | Version history |

## Roadmap

- Election night, 28 Nov 2026: swap in the CEC's 2026 electorate before the count; keep the first real minute-by-minute count timeline to recalibrate the night models.
- A global elections map (V3) — in development, not yet published.

## License

See [LICENSE](LICENSE).
