/* V2: legislative bars as long as the 縣市長 / 縣市議員 ones (user 2026-10-27: 「把區域立委不分區立委的長條圖改成跟縣市長
 * 市議員等一樣長」, V2 only — 「我只打算改v2到時候直接上線」, so test.html is not edited).
 *
 * The engine's mayor / council candidate rows (renderCouncilCandRow) draw each bar as votes ÷ the FIRST candidate's
 * votes, so the leader always fills the track; test.html's legislative rows draw votes ÷ ALL votes, so a 52% winner
 * fills half of it. Same track (.bbg, flex:1) on both — only the fill rule differs. Inside the V2 pages' iframe
 * copies of test.html (history 全國, pvi, scenario, baselean), this rescales each rendered list the engine's way:
 *  - a list = the rows (.bar-row / .bar-row-collapsible / .cand-row) that are direct children of one container; rows
 *    folded under a collapsible header (.bar-row-detail, the 「其他 N 位候選人」 members, the 台灣前進 member parties)
 *    belong to the list of the container that holds the header;
 *  - the 100% mark = the largest ordinary row of the list (district candidates, party-list parties, simulated
 *    candidates); summary rows that fold others (「其他 N 位」, 台灣前進) and folded members scale with it, capped at
 *    the track — as the engine's own 「其他」 merged row;
 *  - the printed percentages are untouched (still share of all votes); only the bar lengths change;
 *  - 催票率 (votes ÷ electors) is NOT rescaled: its bar length is the rate itself. Its rows sit in the body of a fold
 *    whose header reads 「催票率 / Mob. Rate」, or right after a .sec-title saying so.
 * The engine rewrites the panel on every hover, so a MutationObserver on the right-hand panel re-applies it; each
 * fill keeps its engine width in data-v2-pct, so re-running never compounds.
 * V2LegBars.attach(win).
 */
(function () {
  var MOB = /催票率|Mob\. Rate/;
  var ROW = 'bar-row', DETAIL = 'bar-row-detail', FOLD = 'bar-row-collapsible', CAND = 'cand-row';

  function isRow(el) { return el.classList && (el.classList.contains(ROW) || el.classList.contains(CAND)); }
  // a folded-member wrapper: the element right after a collapsible header (bar-row-collapsible, or a .cand-row group
  // header with a fold arrow such as 台灣前進)
  function isFoldHeader(el) {
    return !!el && el.classList && (el.classList.contains(FOLD) || (el.classList.contains(CAND) && !!el.querySelector('.fa-arrow')));
  }
  function listOf(row) {
    var p = row.parentElement;
    if (!p) return null;
    if (row.classList.contains(DETAIL) || (!isRow(p) && isFoldHeader(p.previousElementSibling))) return p.parentElement;
    return p;
  }
  function isMobList(list) {
    var head = list.previousElementSibling;
    if (head && head.hasAttribute('onclick') && MOB.test(head.textContent || '')) return true;   // boxedCollapseSection body
    var first = list.firstElementChild;
    return !!(first && first.classList.contains('sec-title') && MOB.test(first.textContent || ''));
  }
  function enginePct(fill) {
    if (fill.dataset.v2Pct == null) fill.dataset.v2Pct = String(parseFloat(fill.style.width) || 0);
    return parseFloat(fill.dataset.v2Pct) || 0;
  }

  // The legislative rows also carry a fixed 36px column for the term badge (新 / ×2 / 回鍋 / 落N, _legTermBadgeSlot)
  // that the 縣市長 rows do not have, which squeezes the bar track from the mayor rows' 63px to 25px (user: 「還是太短」
  // 「跟縣市長等地方模式有明顯差距」). The badge moves into the name column, in front of the name — where the engine
  // itself puts the council rows' ♀ women's-seat mark — and the empty column goes, so the track matches the mayor rows.
  function foldBadgeSlot(row) {
    if (row.dataset.v2Slot) return;
    row.dataset.v2Slot = '1';
    var blb = row.querySelector(':scope > .blb');
    var slot = blb && blb.nextElementSibling;
    if (!slot || slot.tagName !== 'DIV' || slot.classList.length || slot.style.width !== '36px') return;
    var badge = slot.firstElementChild;
    if (badge) {
      badge.style.marginRight = '2px';
      blb.insertBefore(badge, blb.firstChild);
    }
    slot.remove();
  }

  function apply(root) {
    root.querySelectorAll('.' + ROW + ', .' + DETAIL).forEach(foldBadgeSlot);
    var lists = new Map();
    root.querySelectorAll('.bfill').forEach(function (fill) {
      var row = fill.closest('.' + ROW + ', .' + DETAIL + ', .' + CAND);
      if (!row) return;
      var list = listOf(row);
      if (!list) return;
      if (!lists.has(list)) lists.set(list, []);
      lists.get(list).push({ fill: fill, row: row });
    });
    lists.forEach(function (items, list) {
      if (isMobList(list)) return;
      var max = 0;
      items.forEach(function (it) {
        var r = it.row, summary = r.classList.contains(FOLD) || isFoldHeader(r), member = r.classList.contains(DETAIL) || r.parentElement !== list;
        if (!summary && !member) max = Math.max(max, enginePct(it.fill));
      });
      if (!max) items.forEach(function (it) { max = Math.max(max, enginePct(it.fill)); });   // only folded rows
      if (!max) return;
      items.forEach(function (it) {
        var w = Math.min(100, enginePct(it.fill) / max * 100).toFixed(1) + '%';
        if (it.fill.style.width !== w) it.fill.style.width = w;
      });
    });
  }

  // The party-list / simulation rows (.cand-row: name 90px, votes 80px, bar, pct) leave the bar a 15px track. Laid
  // out like the 縣市長 rows instead (renderCouncilCandRow: name 70px → bar → pct → votes 60px), via CSS on the rows
  // that carry a bar only; the 情境推演 合作對象 dropdown row stays last, on its own line.
  var ROW_CSS = [
    '#ip .cand-row:has(> .bbg) { gap: 4px; }',   // .bar-row's gap
    '#ip .cand-row:has(> .bbg) > .cand-name { width: 70px !important; flex: 0 0 70px !important; min-width: 0; overflow: hidden; }',
    '#ip .cand-row:has(> .bbg) > .cand-name > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }',
    '#ip .cand-row:has(> .bbg) > .bbg { order: 1; }',
    '#ip .cand-row:has(> .bbg) > .cand-pct { order: 2; }',
    '#ip .cand-row:has(> .bbg) > .cand-votes { order: 3; width: 60px !important; flex: 0 0 60px !important; text-align: right; }',
    // 情境推演 rows print votes as 「10萬0697」, which needs the engine's own 80px (a 63px track, as the mayor rows)
    '#ip .cand-row:has(> .bbg):has(> .cand-votes .man) > .cand-votes { width: 80px !important; flex: 0 0 80px !important; }',
    '#ip .cand-row:has(> .bbg) > :not(.cand-name):not(.bbg):not(.cand-pct):not(.cand-votes) { order: 4; }'
  ].join('\n');

  function attach(win) {
    var doc = win.document;
    var root = doc.getElementById('ip') || doc.getElementById('ic') || doc.body;
    if (!root || root.v2LegBars || typeof win.MutationObserver !== 'function') return;
    if (!doc.getElementById('v2-legbars-style')) {
      var st = doc.createElement('style');
      st.id = 'v2-legbars-style';
      st.textContent = ROW_CSS;
      doc.head.appendChild(st);
    }
    var queued = false;
    var run = function () { queued = false; apply(root); };
    root.v2LegBars = new win.MutationObserver(function () {
      if (queued) return;
      queued = true;
      win.requestAnimationFrame(run);
    });
    // childList only: our own width writes are attribute changes and do not re-trigger it
    root.v2LegBars.observe(root, { childList: true, subtree: true });
    apply(root);
  }

  window.V2LegBars = { attach: attach, apply: apply };
})();
