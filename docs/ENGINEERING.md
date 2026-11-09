# Engineering notes

Selected problems and how they were solved, with the measurements that drove each decision. Version-by-version detail is in the changelogs; the V2 migration case studies are in [../CASE_STUDY_v2.md](../CASE_STUDY_v2.md).

## Population lights: 476,000 dots without redrawing them

The election-night map shows official village population (Sep 2026) placed on WorldPop 100 m cells as three tiers of dots (one per 64 / 256 / 1,024 people) — 476k sprites in all. As each township reports, that share of its dots lights up in the colour of the party leading it.

- **Problem:** one full redraw took about 0.9 s, so redrawing on every count update (≈5× a second in the rehearsal) was impossible.
- **Approach:** each county keeps its own cropped canvas. Newly lit dots are drawn onto it incrementally. A change of leader rebuilds only that county, within a 6 ms budget per frame, then cross-fades the new canvas in over 1.5 s. The visible base is recomposed only when something changed (22 blits ≈ 1.5 ms).
- **Zoom into a county:** during the 0.6 s animation the existing bitmap is CSS-scaled, then only the picked county is redrawn at the new scale (others fade out). Dot size grows with √zoom and brightness slightly, so dots stay points instead of haze.
- **Result:** ~110 fps during the rehearsal on a laptop (measured in Chrome), no frame over ~30 ms from this layer.

## Comets that crashed Chrome

Votes fly from townships to seats as comets. The first version gave every comet its own gradient; at the peak (~2,000 comets) the page ran at about one frame per second and Chrome killed the tab. Comets are now capped at 400 and drawn in batches — one `Path2D` per colour × width × head/tail — with the bright head and faint tail as two pieces of the same quadratic Bézier. Result: 108–118 fps for a full rehearsal.

In the flat view an arc's control point lies between the township and the seat and inside the hemicycle's width; a quadratic Bézier stays within the convex hull of its three points, so no arc can overshoot the hemicycle.

## A hand-rolled 3D view

The "lying" view projects the floor and a floating hemicycle with a small orbit camera (no WebGL). Two problems came from that:

- **Hit-testing on the floor:** clicking or hovering a county or township needs screen → map coordinates. The page solves `P(x, y) = (sx, sy)` with Newton iterations on the projection itself (finite-difference Jacobian, ≤ 12 steps, start from the picked county's centre), and returns nothing when the point is off the floor.
- **Glow that cost 1.6 s a frame:** a `shadowBlur` glow on township lines that fill the zoomed-in view ran at 2 fps; a wide, faint stroke under the line gives the same look at 91 fps.

## Estimating what has not been counted

Two election-night figures need the final total before it exists: the "certain to win past half" threshold and the race tags. Both were backtested at polling-station level on four past elections before they went on the page — see [MODEL_METHODOLOGY.md](MODEL_METHODOLOGY.md). One result worth stating here: the obvious method (counted ÷ share of stations) under-estimated the final total by 44–50% (median) early in the count whenever small stations report first, which would have shown "certain to win" far too soon.

## Multi-source election night

- Each outlet is scraped politely (about once a minute) and stays its own source — never merged — so staleness and disagreement are visible. A comparison view puts every source side by side, flags rows where sources disagree on the leader, votes more than 1% apart, and sources more than 10 minutes behind.
- Candidate names are normalised (CJK compatibility ideographs → standard forms) before matching across sources.
- The poller originally stamped times in the polling machine's zone; since the machine runs outside Taiwan on the night and most readers are in Taiwan, every timestamp is now written and read as Taiwan time.

## Validation habits

- Data builders are checked against CEC totals by tests in `tests/`.
- Every interface change is checked in a real browser with real mouse events and screenshots — several timing bugs only appeared through real event dispatch, not direct function calls.
- Performance claims are A/B measured against the previous version under the same conditions (for example, a slowdown traced to hovering the side column turned out to exist before the change being blamed).
