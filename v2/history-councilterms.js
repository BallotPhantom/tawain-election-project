/* 縣市議員 term tags from 1998 (user 2026-11-01: 「x2 新等tag也沒有更新到新的98開始的」).
 *
 * The engine's candidate-row tags — ×N consecutive terms, 新, 回鍋, 連任失敗 (renderCouncilCandRow via _councilTermCount,
 * _councilWonAnyEarlierCycle, _councilWasIncumbentLastCycle, _councilPriorTermCount and their 原住民 twins) — and the
 * county hemicycle's ▲/▼ seat change (_countyPartySeatChangeArrow) look back over 2022 / 2018 / 2014 only, so every
 * 2014 councillor counts from one and the tooltips say 「此資料集(2014年起)」. Inside History's own iframe copy of
 * council.html (V1 untouched) these are redefined with the cycles before (2009／10, 2005／06, 2002, 1998 from
 * OLD_COUNCIL, v2/data_oldcouncil.js), the same rules otherwise:
 *  - a councillor is matched by name within today's county (the engine's cc key: 63…68 / 5-digit), so 臺北縣 2009 →
 *    新北市 2010 → 2014 is one run; 原住民 plains and mountain stay separate (1998–2006 臺北／高雄 combined seats count
 *    for both);
 *  - 1998 is the first cycle, as 2014 was: no 新 / 連任失敗 there (renderCouncilCandRow's own start-year rule);
 *  - V2's old-cycle panels (history-oldcouncil.js) set win.__v2TermYear while they render rows.
 * V2CouncilTerms.attach(win) once per local engine.
 */
(function () {
  var Y = ['2022', '2018', '2014', '2009', '2005', '2002', '1998'];
  var OLD = { '2009': 1, '2005': 1, '2002': 1, '1998': 1 };
  function G(win, name) { try { return win.eval(name); } catch (e) { return undefined; } }
  function key(cc) { return /^6[3-8]000$/.test(cc) ? cc.slice(0, 2) : cc; }
  var cache = {};
  function oldSets(cyc, cc, kind) {   // kind r | p | m
    var k = cyc + '|' + cc + '|' + kind;
    if (cache[k]) return cache[k];
    var set = new Set(), d = (typeof OLD_COUNCIL !== 'undefined' ? OLD_COUNCIL : {})[cyc];
    (d ? d.councils : []).forEach(function (c) {
      if (key(c.cc) !== cc) return;
      var ds = kind === 'r' ? (c.d.r || []) : kind === 'p' ? (c.d.p || []) : (c.d.m || []).concat((c.d.p || []).filter(function (x) { return x.i; }));
      ds.forEach(function (x) { x.cands.forEach(function (y) { if (y[2]) set.add(y[0]); }); });
    });
    return (cache[k] = set);
  }
  function oldSeats(cyc, cc) {
    var d = (typeof OLD_COUNCIL !== 'undefined' ? OLD_COUNCIL : {})[cyc], bp = {}, tot = 0, any = false;
    (d ? d.councils : []).forEach(function (c) {
      if (key(c.cc) !== cc) return;
      any = true;
      Object.keys(c.seats).forEach(function (p) { bp[p] = (bp[p] || 0) + c.seats[p]; tot += c.seats[p]; });
    });
    return any ? { tot: tot, bp: bp } : null;
  }

  function attach(win) {
    if (win.__v2TermsAttached || typeof win._councilTermCount !== 'function') return;
    win.__v2TermsAttached = true;
    var T = function (zh, en) { return win.T(zh, en); };
    var cur = function () { return String(win.__v2TermYear || G(win, 'councilDisplayYear') || '2022').trim(); };

    var w0 = win._councilWinnersInCounty;
    win._councilWinnersInCounty = function (cc, y) { return OLD[y] ? oldSets(y, cc, 'r') : w0.apply(this, arguments); };
    var iw0 = win._councilIndWinnersInCounty;
    win._councilIndWinnersInCounty = function (cc, isP, y) { return OLD[y] ? oldSets(y, cc, isP ? 'p' : 'm') : iw0.apply(this, arguments); };

    // the four look-backs, as the engine's, over Y; won(cc, year, name)
    function suite(won) {
      return {
        term: function (name) { var i = Y.indexOf(cur()); if (i < 0) return 1; var t = 1; for (var k = i + 1; k < Y.length; k++) { if (won(Y[k], name)) t++; else break; } return t; },
        wasInc: function (name) { var i = Y.indexOf(cur()); return i >= 0 && i + 1 < Y.length && won(Y[i + 1], name); },
        prior: function (name) { var i = Y.indexOf(cur()); if (i < 0) return 0; var t = 0; for (var k = i + 1; k < Y.length; k++) { if (won(Y[k], name)) t++; else break; } return t; },
        earlier: function (name) { var i = Y.indexOf(cur()); if (i < 0) return false; for (var k = i + 1; k < Y.length; k++) if (won(Y[k], name)) return true; return false; }
      };
    }
    win._councilTermCount = function (cc, n) { return suite(function (y, m) { return win._councilWinnersInCounty(cc, y).has(m); }).term(n); };
    win._councilWasIncumbentLastCycle = function (cc, n) { return suite(function (y, m) { return win._councilWinnersInCounty(cc, y).has(m); }).wasInc(n); };
    win._councilPriorTermCount = function (cc, n) { return suite(function (y, m) { return win._councilWinnersInCounty(cc, y).has(m); }).prior(n); };
    win._councilWonAnyEarlierCycle = function (cc, n) { return suite(function (y, m) { return win._councilWinnersInCounty(cc, y).has(m); }).earlier(n); };
    win._councilIndTermCount = function (cc, p, n) { return suite(function (y, m) { return win._councilIndWinnersInCounty(cc, p, y).has(m); }).term(n); };
    win._councilIndWasIncumbentLastCycle = function (cc, p, n) { return suite(function (y, m) { return win._councilIndWinnersInCounty(cc, p, y).has(m); }).wasInc(n); };
    win._councilIndPriorTermCount = function (cc, p, n) { return suite(function (y, m) { return win._councilIndWinnersInCounty(cc, p, y).has(m); }).prior(n); };
    win._councilIndWonAnyEarlierCycle = function (cc, p, n) { return suite(function (y, m) { return win._councilIndWinnersInCounty(cc, p, y).has(m); }).earlier(n); };

    // the hemicycle's ▲/▼: 2014 now compares with 2009／10
    var s0 = win._countyPartySeatsForYear;
    win._countyPartySeatsForYear = function (cc, y) { return OLD[y] ? oldSeats(y, cc) : s0.apply(this, arguments); };
    win._countyPartySeatChangeArrow = function (cc, p, n) {
      var i = Y.indexOf(cur());
      if (i < 0 || i + 1 >= Y.length) return '';
      var prior = win._countyPartySeatsForYear(cc, Y[i + 1]);
      if (!prior) return '';
      var was = prior.bp[p] || 0;
      if (was === n) return '';
      var diff = n - was;
      return '<span title="' + T('上屆' + was + '席', 'Was ' + was + ' seats last cycle') + '" style="margin-left:2px;font-weight:700;font-size:11px;color:' + (diff > 0 ? '#22c55e' : '#ef4444') + '">' + (diff > 0 ? '▲+' : '▼') + diff + '</span>';
    };
    // women-quota lookups by year: the year may carry the marker below
    var q0 = win._councilIsWomenQuotaWinner;
    if (typeof q0 === 'function') win._councilIsWomenQuotaWinner = function (cc, dist, name) {
      var L = G(win, 'COUNCIL_WOMEN_QUOTA') || {}, list = L[cur()];
      return !!list && list.some(function (x) { return x[0] === cc && x[1] === dist && x[2] === name; });
    };
    // renderCouncilCandRow hides 新 / 連任失敗 in its first year ('2014'); the first year is 1998 now. While a row renders,
    // councilDisplayYear '2014' is written '2014 ' (the look-backs above trim it) — and set back right after
    var r0 = win.renderCouncilCandRow;
    win.renderCouncilCandRow = function () {
      var y = cur(), was = G(win, 'councilDisplayYear'), mark = y === '1998' ? '2014' : (was === '2014' ? '2014 ' : was);
      if (mark !== was) win.eval('councilDisplayYear = ' + JSON.stringify(mark));
      try { var out = r0.apply(this, arguments); }
      finally { if (mark !== was) win.eval('councilDisplayYear = ' + JSON.stringify(was)); }
      return String(out).replace(/此資料集\(2014年起\)/g, '此資料集(1998年起)').replace(/tracked from 2014/g, 'tracked from 1998');
    };
  }
  window.V2CouncilTerms = { attach: attach, key: key };
})();
