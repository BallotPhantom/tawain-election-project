/* History: 跳槽 tags (user 2026-10-28: 「如果選過立委or市議員or別的跳槽到立委or市長之類的加一個tag...但可能字要少要簡單明瞭」).
 * A candidate who earlier WON a different office (立委 / 縣市長 / 議員 / 鄉鎮市長) gets the most recent one as a short
 * tag — 「前議員」「前立委」「前縣長」「前鎮長」… — with every earlier office in its tooltip. Data: CAREER (v2/data_career.js,
 * build_v2_career.py, CEC files 1995–2024; identity = name + county).
 *
 * V2Career.attach(win) watches the iframe's 資訊面板 (#ic); History sets win.__v2CareerCtx = {race, year} for the mode on
 * screen (race L 立委 · M 縣市長 · C 議員 · T 鄉鎮市長 · R 代表 · V 村里長; null = no tags). Every candidate row
 * (.bar-row / .bar-row-detail, name in .blb) is looked up; the tag goes in the name cell, left of the ✔ / name (where the
 * engine's 2024 rows put ×2), so no column is added and the bars keep their width. A name used by two
 * tagged candidates of the same race in different counties is resolved by the county named in the panel / crumb, else
 * left untagged.
 */
(function () {
  // 7 px (user: 「字體可以再小一些」), the 連任 badges' look in a sky blue
  var STYLE = 'display:inline-block;white-space:nowrap;font-size:7px;font-weight:700;line-height:10px;color:#38bdf8;vertical-align:middle;' +
    'background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.4);border-radius:3px;padding:0 1px;margin-right:2px;cursor:help';

  // English (i18n audit 2026-10-29): short tags (the name cell is 86 px), the full offices in the tooltip
  var TAG_EN = { '前議員': 'Ex-Cllr', '前立委': 'Ex-LY', '前不分區': 'Ex-PR LY', '前市長': 'Ex-Mayor', '前縣長': 'Ex-Magis.',
                 '前鄉長': 'Ex-Twp Head', '前鎮長': 'Ex-Twp Head', '前區長': 'Ex-Twp Head', '前鄉鎮長': 'Ex-Twp Head' };
  function officeEn(win, o) {   // 「2018 臺北縣議員」 → 「2018 Taipei County councilor」
    var m = o.match(/^(\d{4}) (.+)$/); if (!m) return o;
    var y = m[1], t = m[2], I = window.V2I18n, C = function (x) { return I ? I.county(x) : x; };
    var tw = function (x) { var r = typeof win.translateTownship === 'function' ? win.translateTownship(x) : null; return r && r !== x ? r : (I ? I.romanize(win, x) : x); };
    var r;
    if (t === '不分區立委') r = 'at-large legislator';
    else if (t === '立委') r = 'legislator';
    else if ((r = t.match(/^(.+[縣市])議員$/))) r = C(r[1]) + ' councilor';
    else if ((r = t.match(/^(.+市)長$/)) && C(r[1]) !== r[1]) r = C(r[1]) + ' mayor';
    else if ((r = t.match(/^(.+縣)長$/)) && C(r[1]) !== r[1]) r = C(r[1]) + ' magistrate';
    else if ((r = t.match(/^(.+[鄉鎮市區])長$/))) r = tw(r[1]) + ' head';
    else r = t;
    return y + ' ' + r;
  }
  function entryFor(win, name, ctxText) {
    var c = win.__v2CareerCtx, D = typeof CAREER !== 'undefined' ? CAREER : null;
    if (!c || !D || !D[c.race] || !D[c.race][c.year]) return null;
    var list = D[c.race][c.year][name];
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var hit = list.filter(function (e) { return e[0] && ctxText.indexOf(e[0]) >= 0; });
    if (hit.length === 1) return hit[0];
    var tags = {}; list.forEach(function (e) { tags[e[1]] = 1; });
    return Object.keys(tags).length === 1 ? list[0] : null;   // ambiguous namesakes: no tag
  }
  function rowName(row) {
    var b = row.querySelector('.blb'); if (!b) return null;
    var t = (b.getAttribute('title') || '').split('（')[0].trim();
    var own = [].filter.call(b.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('').trim();
    return { blb: b, names: [own, t].filter(Boolean) };
  }
  function decorate(win) {
    var doc = win.document, ic = doc.getElementById('ic');
    if (!ic) return;
    [].forEach.call(ic.querySelectorAll('.v2-career'), function (x) { x.remove(); });
    if (!win.__v2CareerCtx) return;
    var crumb = doc.getElementById('crumb'), ctxText = (ic.textContent || '') + ' ' + (crumb ? crumb.textContent : '');
    var en = typeof win.translateCandidate === 'function' ? win.translateCandidate : null;
    [].forEach.call(ic.querySelectorAll('.bar-row, .bar-row-detail'), function (row) {
      var rn = rowName(row); if (!rn) return;
      var e = null;
      rn.names.some(function (n) { e = entryFor(win, n.replace(/^✔/, '').trim(), ctxText); return !!e; });
      if (!e && en) {   // English mode: the row shows a translated name
        var D = CAREER[win.__v2CareerCtx.race] || {}, Y = D[win.__v2CareerCtx.year] || {};
        Object.keys(Y).some(function (k) { if (rn.names.indexOf(en(k)) >= 0) { e = entryFor(win, k, ctxText); return true; } return false; });
      }
      if (!e) return;
      var tag = doc.createElement('span');
      tag.className = 'v2-career';
      tag.setAttribute('style', STYLE);
      var en = win.T && win.T('z', 'e') === 'e';
      tag.textContent = en ? (TAG_EN[e[1]] || e[1]) : e[1];
      tag.title = en ? 'Earlier: ' + e[2].split('、').map(function (o) { return officeEn(win, o); }).join(', ') : '曾任：' + e[2];
      // left of the ✔ / name, inside the name cell — where the engine's 2024 rows put their ×2 (user 2026-10-28:
      // 「前立委的tag還是改放勾勾左邊空白處吧」): no extra column, so the bars keep their width
      var at = [].find.call(rn.blb.childNodes, function (n) { return (n.nodeType === 1 && /✔/.test(n.textContent)) || (n.nodeType === 3 && n.textContent.trim()); });
      rn.blb.insertBefore(tag, at || rn.blb.firstChild);
      // the name cell is 70 px: with the tag a 3-character name would be cut, so every row of this list gets 86 px (still
      // aligned; the bar gives up 16 px instead of a whole 36 px column)
      [].forEach.call(row.parentNode.querySelectorAll(':scope > .bar-row > .blb, :scope > .bar-row-detail > .blb'), function (b) { b.style.width = '86px'; b.style.flexShrink = '0'; });
    });
  }
  function attach(win) {
    if (win.__v2Career) return;
    var ic = win.document.getElementById('ic'); if (!ic) return;
    var busy = false;
    var run = function () { if (busy) return; busy = true; try { decorate(win); } finally { busy = false; } };
    win.__v2Career = new win.MutationObserver(function (muts) {
      var ours = muts.every(function (m) {
        return [].every.call(m.addedNodes, function (n) { return n.classList && (n.classList.contains('v2-career') || n.classList.contains('v2-career-slot')); }) &&
               [].every.call(m.removedNodes, function (n) { return n.classList && (n.classList.contains('v2-career') || n.classList.contains('v2-career-slot')); });
      });
      if (!ours) run();
    });
    win.__v2Career.observe(ic, { childList: true, subtree: true });
    run();
  }
  window.V2Career = { attach: attach, decorate: decorate };
})();
