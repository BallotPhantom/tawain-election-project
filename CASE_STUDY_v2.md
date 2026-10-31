# Case Study: Migrating a Legacy Map App Without Rewriting It

**Project:** PVI Map — Taiwan election data visualization (縣市長/縣市議員/立法委員/不分區 maps, 2014–2024, plus a 2026 mayor-election forecast model)
**Scope of this case study:** the "Unified History" migration (`v2/history.html`) — reorganizing four separate, multi-megabyte HTML applications behind one coherent navigation layer, without rewriting any of their underlying logic.

## The problem

The project had grown into four independent, self-contained HTML files, each 13–16MB, each embedding its own copy of the full election-data pipeline:

- `test.html` — legislative district maps (2016/2020/2024)
- `party_list.html` — party-list (不分區) results, a near-duplicate of `test.html`
- `council.html` — county mayor and councilor races (2014/2018/2022), plus a 2026 forecast model
- `live2026.html` — election-night live tracking

Each file had its own navigation, its own year selectors, its own conventions for switching between modes. Moving between, say, a 2022 mayor map and a 2024 legislative map meant leaving one page entirely and loading another. The natural next step — a single, coherent "History" browsing experience across all of it — couldn't be bolted onto any one of the four files without either duplicating a huge amount of logic into a fifth file, or risking the validated behavior already living in the other four.

## The constraint that shaped everything

The explicit rule for this migration, set before any code was written, was:

> **V2 is orchestration and information architecture. V1 is the validated rendering engine. V2 must never rewrite, fork, or duplicate V1's logic.**

This ruled out the obvious approach (extract shared code into a new module, rebuild the UI on top of it) in favor of something less common: a thin outer page that embeds one of the existing files in an `<iframe>`, and drives it entirely by calling the *exact same JavaScript functions* the original page's own buttons already call. No V1 file was ever edited during this entire migration — confirmed by `git diff` after every phase.

## Reading the code as the source of truth, not the plan

The original architecture audit assumed National Legislative history could be reached from the same file as Local (Mayor/Councilor) navigation. It couldn't. Reading `council.html`'s own source turned up a comment, dated a month earlier, explaining that its legislative year-selector had been *deliberately disabled* — an earlier bug fix, because selecting a legislative year while in county mode corrupted an internal sentinel value the rest of the county-mode code depended on. The actual, currently-working legislative engine lived in a completely different file, `test.html`.

This became a pattern for the whole project: every "which V1 function should V2 call" question was answered by grepping the actual button `onclick` handlers in V1's own source, not by inference from documentation or from what seemed architecturally clean. Twice this directly overturned an assumption:

- **Party-List's real entry point** wasn't the year-switching function used everywhere else (`setWinnerYear`) — calling that on the party-list page silently reverted it to a generic district map. The real function, `setPLCountyMode`, was only found by reading the party-list page's own "Yearly Analysis" button.
- **Party-List didn't need a third page to embed at all.** A side-by-side comparison of rendered map colors showed `setPLCountyMode` produces byte-identical output whether called on `test.html` or on `party_list.html` — the two files share one engine, differing by a single CSS rule that decides which panel is visible by default. That meant Party-List could be added as "just another button" on the already-loaded legislative page, with zero additional complexity.
- **Party-List's real historical range was 2008–2024, not 2016–2024** — five elections, not three — found by reading the actual `<option>` values in its year dropdown rather than trusting an earlier planning document's assumption.

## A bug that looked like a race condition, but wasn't

The most instructive moment in this project was a bug where switching to National scope and picking a year sometimes did nothing at all — no error, no visual change, no console output. The first, reasonable hypothesis was a timing race: the app swaps which file is loaded in the iframe depending on scope, and if a leftover background check from the *previous* file resolved late, it could plausibly act on stale state. A defensive fix for exactly that hazard was built, tested, and shipped — and it was a legitimate fix for a real risk. But the reported bug still happened immediately afterward.

Told explicitly not to layer a second guess on top of an unconfirmed diagnosis, the actual cause was found by adding temporary logging and reproducing the failure one deliberate step at a time. It turned out to be much simpler than a race condition: the code that decided *what to do* when the user picked a year was structured as "if Local, do X; otherwise if Legislative, do Y" — and nothing ever guaranteed that switching to National scope also updated which election *type* was selected. If the type was still left over as "Councilor" from whatever the user had been doing a moment before, neither branch matched, and the function did nothing at all. It looked exactly like an intermittent timing bug because the failure was completely silent — but it was a deterministic logic gap, reproducible on command, once the right two clicks were made in the right order. The fix was one guard clause enforcing that switching scope always leaves the election type in a valid state for that scope — a much smaller, and much more confidently-correct, change than the timing fix would have suggested.

The lesson carried forward explicitly for the rest of the project: **when a bug looks intermittent, verify the actual state at every step before assuming timing is the cause.** A bug that reproduces 100% of the time under the right sequence of clicks is not a race condition, no matter how much it might resemble one from the outside.

## Validation discipline

Throughout, a screenshot that "looked right" was never treated as sufficient proof that the new navigation layer was correctly driving the old engine. The standing method was:

1. Extract a compact fingerprint of the app's actual internal state — a hash of every rendered map shape's color, or the specific values of key variables like the currently selected year — from a session driven through the new navigation.
2. Extract the same fingerprint from a session where a person clicks through the *original* interface by hand.
3. Diff them byte-for-byte.

This caught real bugs that a purely visual check would have missed, including the Party-List/Indigenous year-reset bug described above, which produced a map that still looked plausible but was quietly showing the wrong year's data.

## What the migration achieved

By the end of this phase, one navigation surface could reach every historical election result the four original files could produce — 2014–2022 local mayor and councilor races (with party-vote and top-candidate views), 2016–2024 legislative geographic districts, 2024 indigenous legislative seats, and 2008–2024 party-list results — entirely by calling into the original, unmodified engines. Every combination was validated against real application state, not just visual inspection, and the year controls only ever offer combinations the underlying data actually supports for whichever mode is selected.

## Performance findings (measured, not yet acted on)

A follow-up, read-only performance audit (no code changed) measured what actually makes the app feel slow, using the browser's own timing APIs rather than guessing:

- **Every full-screen redraw — regardless of which mode — costs 5.8 to 8.6 seconds of uninterrupted computation**, even switching between years within the same already-loaded page. Notably, this is *slower* than building a much bigger map from scratch (rendering all ~10,000 villages nationally took only 3.2 seconds) — meaning most of that time isn't spent drawing the map at all, but in secondary calculations (seat-count summaries, candidate panels, turnout stats) that run on every redraw regardless of what actually needs to update.
- **Switching between Local and National scope costs 15–25 seconds**, because it means loading an entirely separate multi-megabyte file from scratch — each of the four original files independently contains its own ~60–90MB of geographic and election data, so nothing is shared or reused across them even when the underlying geography is identical.

Neither finding has been acted on yet — the audit's purpose was to establish a factual baseline before deciding what, if anything, is worth optimizing, and to flag that the current redraw cost should probably be addressed *before* adding a planned population/profile feature that would rely on the same rendering path at an even larger scale (7,700+ villages).

## Takeaways

- **Constraint-driven design forces better questions.** "Don't touch the validated code" isn't a limitation to work around — it's what made every subsequent decision (where does this function actually live, what does it actually depend on) get answered by reading real code instead of by assumption.
- **Read the comments already left by past debugging.** The single most load-bearing piece of information in this entire migration — that the legislative engine had been deliberately disabled in one file — was sitting in a one-paragraph code comment from a prior bug fix.
- **A silent failure is not evidence of a timing bug.** It's evidence you haven't yet found which specific state combination causes the code to do nothing.
- **Measure before optimizing.** A five-to-nine-second stall could plausibly have been blamed on map rendering; instrumentation showed rendering itself was comparatively fast, and the real cost was somewhere else entirely.

---

# Case Study 2: Reusing a Legacy App's *Visual Language*, Not Just Its Functions

**Scope of this case study:** `v2/profile.html`, the "Place / Profile" workspace — a from-scratch page (no `<iframe>`, no shared runtime with V1) that nonetheless has to look and behave as though it grew out of the same app as `test.html`/`council.html`. Where Case Study 1 (above) was about orchestrating V1's *functions* from the outside, this one is about a harder problem: porting V1's *rendering techniques and data semantics* into a page that shares none of V1's live state.

## The problem this architecture creates

Profile has no iframe and no shared JS runtime with V1 — it's a clean-room page. That means every visual behavior that should feel like "the same app" — hover glow, choropleth coloring, drill-down zoom, candidate emblems — has to be **re-derived from V1's source**, not called. This trades one risk (breaking a shared runtime) for another: silently reinventing something V1 already solved, producing a page that *looks* similar but is quietly wrong in ways a screenshot won't catch — wrong colors, wrong hierarchy, wrong data grain.

The standing discipline that emerged to manage this: **before writing a new visual behavior, find and cite the exact V1 function/constant that already does it — a line number, not a paraphrase — and port the technique with new data bound to it, never invent something "inspired by" V1.** This case study is mostly about what happened on the two occasions this discipline slipped, and what put it back on track.

## Misreading a spatial complaint as a data complaint

Building the second election-map mode (不分區/Party-list, after Legislative had already been approved as a reference), the user's core objection was: "你少掉南投縣一整個層" (you're missing a whole layer). The first fix attempt read this as *the map is missing a level of geometry* — technically correct — but a garbled, voice-to-text follow-up exchange led to also adding a small results-summary card into the right-hand info panel, on the theory that "the missing thing" might partly be informational. It wasn't. The user's actual complaint was entirely about **map drill hierarchy** — Taiwan → County *polygon* → Township *polygons* → Village *polygons* — and the panel change was pure scope creep in the wrong layer, requiring an explicit "STOP" and a full revert.

What made the correction land cleanly wasn't just reverting the wrong change — it was that the user, in the same message, drew a sharp permanent line: **election-result content lives entirely in map geometry/color/hover for this class of mode; the right panel is frozen and never gets a new card for it.** That rule was then applied mechanically to every subsequent mode (and to this session's own left-rail architecture proposal): if new information needs to be conveyed, the first question is always "does this belong in the map, or did I just default to the panel because that's where I put things last time?"

## Turning two mistakes into one reusable architecture instead of a one-off fix

The same Party-list build surfaced a second, more structural problem: Profile's *own* base navigation (`renderCountyFocus()`) had never had a whole-county polygon view — it always jumped straight from Taiwan to 13 townships. Party-list had unknowingly inherited this gap by "recoloring whatever's currently on screen" rather than owning its own geometry, which is also why the fix for it couldn't be a one-line patch.

Rather than hard-code a fix scoped to Party-list, the user explicitly asked for the drill state to be designed as a shared, generic mechanism — the same reasoning applied later to the left-rail audit (see below): a future mode (Mayor, President, County Council) should never need to re-litigate "does this election type get its own whole-county layer." The result, `ADMIN_DRILL_MODES`, is a small registry where each mode supplies exactly 3 data-lookup functions and shares one set of draw/state functions — Party-list became the *first* consumer of a framework built to be reused, not a special case with its own code path.

## A second "looks like a real bug, isn't" — this time framed correctly from the start

Later in the same work, a village-level zoom appeared to silently fail under browser automation — the correct DOM elements existed with correct data, but the map never visually zoomed in. This is the same *category* of bug documented in the very first Profile phase (`## 2026-09-26 — Diagnosed and resolved: county click-to-drill appeared broken`) — an automation artifact, not application logic — but this time it was investigated with the lesson from that earlier entry already in hand: instrument first, don't assume the code is wrong. A debug hook confirmed the app's own zoom-target math was correct every single time; the actual defect was that Chrome does not run `requestAnimationFrame` (which every `d3-transition` depends on) for a backgrounded tab, and the automation harness's tab wasn't focused during a bare `wait`. Confirmed by noting that a `screenshot` call — which happens to bring the tab to the foreground as a side effect — was, on its own, sufficient to let the exact same pending transition complete. No code changed; the validation *procedure* changed instead (screenshot immediately after each drill step, not after a blind wait).

## Retracting your own prior conclusion, on purpose

An earlier session had concluded 2020/2016 presidential data was simply missing from the project, based on grepping for guessed field names and finding nothing. When the user pushed back — reasoning from what they remembered seeing on a real V1 screen, not from the codebase — the right response wasn't to defend the earlier conclusion or quietly patch around it, but to redo the investigation the correct way: start from the *rendered chart the user remembered*, and trace backward through the actual render function to whatever data it reads, however unexpectedly named. That produced the opposite conclusion — `PRES_VC_2020`/`PRES_VC_2016`/`PRES_TC_2020`/`PRES_TC_2016` are real, complete, village- and township-level tables that had simply been missed by the first (name-guessing) search — and the earlier conclusion was retracted explicitly, in writing, rather than silently overwritten.

The follow-through mattered as much as the retraction: cross-checking the village-level table against the township-level table (rather than trusting either alone) surfaced a real, small, pre-existing gap — 4 townships in both years where the village table quietly undercounts by a handful of missing records — and the fix used the *complete* table for the county total rather than the *first* table found, with the discrepancy reported rather than silently absorbed.

## A symptom that looked like a CSS-precedence bug, and wasn't one at all

Once the generic `ADMIN_DRILL_MODES` drill framework existed for Party-list, the left rail was still just the *old*, unconnected 13-township list — it happened to show the right 13 names (since it read the same underlying township data), which made it easy to mistake for "mostly working, just needs its colors fixed" rather than "not wired up at all." The reported symptoms invited exactly the wrong diagnosis: hovering a rail row did nothing on the map, and clicking through to a township's villages rendered real geometry with no election coloring. Both look, from the outside, like a styling bug — and this exact codebase had a real, previously-documented CSS-precedence bug in this neighborhood (`.town-path`/`.village-path`'s class `fill` rule silently beating a `.attr('fill', ...)` call), which made it a tempting first guess.

It wasn't that. Tracing the actual click handler chain (not the visual symptom) showed the rail was calling Profile's *own* base-navigation function — the one that predates the election-mode work entirely — which draws a completely different, unrelated set of `<path>` elements (`.village-path`, neutral gray, no election data involved at all) instead of the admin-drill framework's own `.admin-vc-path` layer. The villages on screen weren't miscolored; they were the *wrong villages* — geometrically identical, but from a different rendering pipeline that had never been told a color scheme existed. No amount of auditing the fill-precedence rules would have found this, because the bug wasn't downstream of any coloring logic at all — it was a routing problem one level up, in which function got called in the first place. The fix was to give the rail its own state-aware dispatch (rendering from the same `_resolveNavHierarchy()` result the map already used, calling the exact same `_adminDrillEnterCounty`/`_adminDrillEnterTownship` functions the map's own click handlers call) rather than trying to patch color into the wrong pipeline.

A second, distinct bug surfaced once real interaction was wired up: a gold hover-outline preview would occasionally survive navigating away, left glowing on the map at the wrong scale over content it no longer corresponded to. This one *was* a lifecycle bug, but not the obvious one — the preview element's cleanup lived entirely in its own `mouseleave` handler, and removing a hovered DOM node out from under the pointer (which is exactly what re-rendering the rail on every navigation does) doesn't reliably fire `mouseleave` on it in the first place. The element wasn't failing to clean up after itself; it was never being told to. The fix wasn't a timeout or a defensive re-check — it was recognizing that *every real geometry redraw* is already a moment where "nothing stale should still be on screen" is true by definition, and adding one cleanup line to each of those six existing draw functions, rather than trying to make the hover handler more defensive.

## Takeaways

- **A user's spatial vocabulary is precise — "layer" almost never means "information."** When a complaint is phrased in terms of geography (a missing level, a missing polygon), resist the instinct to satisfy it by adding text to the nearest panel.
- **When two mistakes come from the same root gap, fix the gap generically, not the two symptoms separately.** The Party-list summary-card revert and the missing-county-polygon fix were one underlying problem — treating them as one design task (a reusable drill framework) instead of two patches is what made it safe to reuse for future modes.
- **A bug that "looks exactly like" one you've already solved probably has the same shape.** The village-zoom investigation moved fast precisely because the county-click-to-drill entry from months earlier had already established "check the automation harness before the app code" as the default hypothesis for this category of symptom.
- **Retract conclusions in writing, the same way you'd report a bug fix.** "I was wrong, here's why, here's the corrected finding" is more useful to future work than quietly overwriting a stale `null` with no trace of the earlier mistake.
- **"Looks like the last CSS bug" and "is the last CSS bug" are different claims — check the call chain, not just the stylesheet.** A missing-coloring symptom in a codebase with a known fill-precedence gotcha will always tempt that diagnosis first; the actual fix here was one directory level up, in which function got called at all.
- **A cleanup that only runs in its own on/off handler is a cleanup that assumes its own handler always fires.** DOM removal doesn't guarantee a paired `mouseleave`; put the cleanup at the start of whatever *always* runs when the old state stops being true (here, every real redraw), not only in the code path that turned the thing on.

---

# Case Study 3: When Your Own Shipped, Approved Design Was Wrong

**Scope of this case study:** `v2/profile.html`'s County Council (縣市議員) map mode — the largest single feature built on the `ADMIN_DRILL_MODES`/`NavHierarchy` architecture from Case Study 2, and the one that produced this project's most consequential retraction: a design decision that was audited, implemented, tested, and approved was later proven wrong by a more rigorous audit of the same question — and fixed in the open, not quietly patched.

## A metric that looks like another metric, but isn't

Before any code, the first real question was definitional: what does "who won" mean for a county council seat? The obvious candidate — the party holding the most *seats* in the resulting council — is already a real, existing, correctly-implemented feature (the 縣議會組成 hemicycle). But a choropleth map coloring townships/districts by winning margin needs a completely different computation: aggregate every candidate's raw vote count by party (winners and losers alike, multi-seat SNTV races routinely run 2–3 candidates from the same party), take the top two parties' vote share, and compute a margin — a number that has nothing to do with how many seats each party ended up holding. Confirming this distinction *before* writing a line of drawing code, and keeping the two metrics in genuinely separate code paths for the rest of the feature, prevented an entire category of "the map and the hemicycle disagree" bug reports that a less careful start would have produced.

## An oversimplification that passed every test it was given

Nantou has two townships officially classified as 山地鄉 (mountain indigenous townships): 信義鄉 and 仁愛鄉. The county also has exactly two 山地原住民 council seats. The inference — one seat per mountain township — is the kind of assumption that's *almost* right, matches every piece of data available inside the project itself (vote totals, seat counts, candidate lists all checked out), and would pass a code review, a data audit, and a working demo without raising any flags. It was implemented this way, labeled this way in the UI, described this way in code comments, and approved.

It was wrong, and the project's own data couldn't have caught it — the mistake wasn't in any number, it was in what the numbers were assumed to *mean*. `COUNCIL_IND_M_GJ`'s polygon for "district 7" genuinely extends far beyond Xinyi Township's own boundary, spanning roughly half the county. Under the "one township, one district" assumption, that looked like — and was initially diagnosed as — a geometry bug: wrong data, mismatched boundary, maybe an outdated source file. It was investigated as exactly that, with real quantitative rigor: vertex-level nearest-point distance between the district polygon and every nearby boundary, not a visual guess. The result was decisive but pointed the wrong way at first — roughly 20% of the polygon's boundary matched the county's outer edge almost exactly, and the rest didn't match anything in the project's own geometry at all. That's consistent with either "this data is corrupted" or "this shape is correct and my mental model of what it represents is too small" — and only external verification could tell the two apart.

## Reaching outside the codebase when the codebase can't settle the question

This is the one investigation in the whole project, so far, where the answer legitimately wasn't in any file on disk. A targeted web search against Wikipedia's own 2022 council-election-district list settled it immediately and precisely: Nantou's 第7選舉區 isn't "信義鄉's council seat" — it's "信義鄉's own indigenous electorate, *plus* the mountain-indigenous electors registered in six other, mostly lowland, townships (南投市、竹山鎮、集集鎮、名間鄉、鹿谷鄉、水里鄉)." District 8 has the identical structure around 仁愛鄉 and five more townships. The "50% of the boundary doesn't match anything nearby" finding wasn't a data error at all — it was the honest shape of a real, larger electoral district that the shipped design had simply never been told existed.

The geometry (`COUNCIL_IND_M_GJ`) had been correct from the very first commit. Every line of code that used it — the labels, the rail text, the panel copy, the code comments explaining "why" — was built on a plausible-sounding, internally-consistent, thoroughly-tested wrong premise.

## Retracting in public, a second time

This project already has one precedent for this exact move — the 2020/2016 presidential-data conclusion in Case Study 1 that turned out to be backwards. The response here followed the same discipline: no quiet edit, no rewritten history. The changelog entry documenting the original 07/08 implementation stayed exactly as written, and a new entry above it states plainly that the labeling was wrong, cites the specific source that proved it, and describes exactly what changed as a result — a UI/labeling fix (`第7選舉區｜山地原住民・濁水溪線`, a neutral river-valley descriptor, replacing a false single-township claim; the full multi-township composition preserved in a detail-panel string, not deleted), with an explicit instruction to **not** touch the geometry, the election data, or the aggregation logic, none of which had ever been wrong.

The instruction that shaped the fix's scope was itself notable: rather than "fix the labels," the actual request was "audit whether the premise is even true, and only then decide what to fix" — separating the diagnostic question from the repair, so that the fix that eventually shipped was scoped to exactly what the audit proved, no more.

## A visual complaint that was really two different bugs wearing one costume

A related user report — "the indigenous overlay and the map don't line up" — arrived in the same conversation and initially looked like it might be the *same* geometry problem again. It wasn't. Two genuinely separate things were happening under one symptom:

1. The overlay's solid, semi-transparent fill made the underlying general-district choropleth's own color show through so weakly that a real, correctly-positioned boundary read as "barely there" — a legibility problem, fixed by switching to a hatch/stripe pattern (deliberately reusing a technique V1 already had, for a *different* purpose — contested-area striping — rather than inventing a new visual language) that lets the base color stay fully visible between the stripes.
2. Committing an indigenous district, then navigating back into an ordinary one, left the old overlay rendered on the map indefinitely — a genuine stale-state bug, unrelated to color or pattern design, caused by `profileState.councilInd` (the state) and the overlay's own DOM element being cleaned up on two separate, out-of-sync schedules. Three of the four "return to ordinary district" functions cleared neither; the fourth cleared only the state, not the element it was supposed to be tracking.

Both were real. Neither was the same bug as the other, and neither was the 07/08 labeling issue from earlier in the same session, despite all three initially being described by the user in similar spatial language ("doesn't line up," "old outline stays"). Treating a cluster of superficially similar complaints as one problem would have produced one fix that solved none of the three; each got its own root-cause trace (a quantitative geometry check, a rendering-technique review, and a DOM/state lifecycle audit, respectively) before any code changed.

## Takeaways

- **An assumption that fits all your own data can still be wrong, if the data can't actually distinguish it from the truth.** Vote totals, seat counts, and candidate lists were completely consistent with "one township, one district" — none of them were capable of ruling it out, because the project had no source for the *district boundary's own legal definition*. When a codebase's internal data is structurally unable to answer a question, going outside it isn't a last resort — it's the only way to actually close the audit.
- **A wrong premise doesn't just produce one wrong output — it produces a self-consistent wrong story.** The labels, the code comments, the panel copy, and the "this must be a geometry bug" diagnosis all reinforced each other, because they were all downstream of the same original assumption. Fixing the premise fixed all of them at once; fixing any one of them alone (e.g. "just relabel it") would have left the geometry looking permanently suspicious for no reason.
- **When a real bug's evidence looks 50/50, that's often a sign you're checking the wrong thing, not that the bug is ambiguous.** ~20% of the boundary matching and ~80% not matching isn't an inconclusive geometry check — it's a strong, clean signal that the *scope of what's being compared* is wrong, not the data.
- **Retract in the same document, in the open, every time — this is now the project's default, not an exception.** Two retractions across this project so far (presidential data, indigenous-district scope) were both handled the same way: state what was believed, state what's now known, cite the evidence, keep the original entry visible rather than rewriting it away.
- **Similar-sounding complaints in the same conversation are not evidence of one shared cause.** "Doesn't line up" was used, in close succession, to describe a legibility problem, a genuine geometry non-issue, and an unrelated DOM-lifecycle bug. Each got independently verified before being fixed, rather than pattern-matched to whichever explanation was found first.
