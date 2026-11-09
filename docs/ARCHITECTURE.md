# Architecture

Taiwan Election Atlas is a static site — HTML, vanilla JavaScript and plain JS data modules served by GitHub Pages. There is no build step and no server. Data is prepared offline by Python builders.

## Pages

| Page | Rendering | Notes |
|---|---|---|
| `v2/index.html` | HTML | Home: links to every public page; desktop and mobile. |
| `v2/history.html` | V1 engines in iframes | A V2 shell (navigation, language, year / race controls) around the unmodified V1 engines `council.html` (local races) and `test.html` (national races). Both engines are mounted once and kept alive; V2 calls their own entry points (`setMayorMode`, `setWinnerYear`, …). V2-only additions (older years, presidents, indigenous seats) are separate modules (`history-*.js`) that draw into the engine. See [../CASE_STUDY_v2.md](../CASE_STUDY_v2.md). |
| `v2/profile.html` | D3 SVG + Canvas | County / township profile with a population-lights canvas under the SVG map. |
| `v2/predict.html` · `v2/methodology.html` | V1 engine + HTML | The 2026 mayoral forecast and its method. |
| `v2/live-flow.html` | Canvas 2D (four stacked canvases) | Election night. Layers: `cv-bg` (population lights, county lines), `cv-pil` (3D pillars and floor lines), `cv-trail` (comets), `cv-top` (hemicycle seats and labels); HTML overlays for the side columns, focus card, tooltips and the source comparison. |
| `v2/m/*.html` | D3 SVG | Mobile versions of History, Profile and Prediction. |

The V1 pages (`index.html`, `test.html`, `council.html`, `party_list.html`, `live2026.html`) remain published as the original site; V2 does not modify them.

## Data flow

```
CEC raw files (votedata/, local)  ┐
household-registration population ├─► Python builders ─► JS data modules (const X = {...})
WorldPop R2024B 100 m raster      ┘                          │  loaded with <script src>
                                                             ▼
                                                     pages (D3 / Canvas)
```

- Builders sit at the repository root (`build_*.py`, `regen3.py` for the forecast) and in `prototype_popdots/` (population dots). Each writes a generated module with a "do not hand-edit" header.
- Tests in `tests/` rebuild or re-read the data and check it against CEC totals (for example `test_turnout_prior.py`, `test_poll_cna_tvbs.py`).
- Large geometry is shared: `data_map_v64.js` (TopoJSON boundaries and name lookups) is cached by the browser across pages.

### Election-night data

```
news-site result feeds ─► poll_live2026.py (every 60 s) ─► data_live2026.js + margin log
                              validate: no empty list, no negative or
                              decreasing votes, no changed candidates
                                                     │ on the night, pushed to the public site about every 7 min
                                                     ▼
                                     v2/live-flow.html re-reads it every 60 s
```

- One source key per outlet; numbers are never merged across sources — each has its own tab and its own column in the comparison view.
- Every timestamp is written in Taiwan time, so ages are right for readers anywhere.

## Election-night page modules

| File | Role |
|---|---|
| `v2/live-flow.html` | Page, state, rendering, interaction |
| `v2/data_liveflow.js` | Geometry and seat structure: township centres and population points, population lights with their township, coastline, county and township outlines, seat tables, party lookups (`build_v2_liveflow.py`) |
| `v2/data_council_seats_2026.js` | 2026 council seats from the CEC announcement (919 seats, 221 districts) |
| `v2/live-turnout.js` | Expected-total and race-call models (see [MODEL_METHODOLOGY.md](MODEL_METHODOLOGY.md)) |
| `v2/data_turnout_prior.js` · `v2/data_call_model.js` | Model inputs: township priors, previous-election shares, calibrated uncertainty |

## Publishing

`publish.sh` copies an allow-listed subset of the working tree to the `main` branch through a temporary worktree (GitHub Pages serves `main`). Pages still in development are excluded by the public `.gitignore`; retired pages are removed through the script's `RETIRE` list.
