/* V2 mode-page shell (2026-10-22).
 *
 * Each V2 mode page (predict / live / pvi / scenario) shows ONE V1 mode on its
 * own: the unmodified V1 page loads in an iframe, V1's own mode switching
 * (#toolbar: page tabs, mode buttons, year selects, sim params, stronghold
 * search) is hidden, and the page's top bar carries only "← 首頁", the title,
 * the controls that belong to this mode, and zh/EN. Same approach as
 * history.html: V1 files are never edited, so V1 keeps working on its own.
 *
 *   V2Shell.boot({
 *     engine: '../test.html',            // V1 page to load
 *     needs: ['setMode', 'setCompYear'],  // V1 globals that must exist first
 *     title: { zh: '…', en: '…' },
 *     hide: ['#some-v1-element'],         // extra V1 elements to hide
 *     keep: ['#elig-correct-toggle'],     // ALWAYS_HIDE entries this page needs
 *     stripBase5: true,                   // drop 政黨基本盤 comparisons
 *     onReady: function (win, shell) {}   // enter the mode
 *   });
 *
 * Bar controls are plain elements in the page with data-zh / data-en labels;
 * the shell translates them along with the title.
 */
(function () {
  var BASE5_EMPTY_BUILDERS = ['_base5CandCampBarHtml', '_base5TailHtml', '_base5MayorCompareNoteHtml', '_legCandCampBarHtml'];
  var ALWAYS_HIDE = [
    '#toolbar',             // every V1 mode switch lives here
    '#lang-toggle',         // language is driven from the V2 bar
    '#elig-correct-toggle', // only changes 政黨基本盤 comparisons
    '#btn-pvi3',            // 三年總整理 (user: not in V2) — sits outside #toolbar
    '#btn-plcounty-jump-wrap', // 不分區地圖 jump — a mode switch outside #toolbar
    '#camp-toggle-btn',     // party-perspective lighting (legislative / PVI) — user: not in V2
    '#party-heatmap-row', '#party-heatmap-select-row', // 政黨熱力圖 switch + its party list (V1 shows them in 歷年分析 only) — user: not in V2
    '#roads-toggle-btn',    // 道路圖層 button by the zoom buttons — user 2026-10-28: removed on every page
    // 原住民 seat card's 「⊞ 山地原住民 / ⊞ 平地原住民」 (they open the engine's 2024-only map) and their row — user
    // 2026-10-28: 「原住民卡片上的兩顆按鈕 直接完全關掉（有這個按鈕的關掉）」
    '.ind-leg-btn', 'div:has(> .ind-leg-btn)',
    // the 2026 forecast page's layout on every page (user 2026-10-31: 「在2026做的版面更新都套用在其他模式中」): the
    // map's top-left corner is cleared — #left-rail (the emptied V1 sidebar), #map-title (the bar names the page),
    // #sidebar-toggle (☰) — and the map's ＋／− buttons go (.zbts; the mouse wheel still zooms). The crumb, the national
    // view buttons and the ⚠ disclaimer move into the bar (navbar.js / disclaimer.js, mounted below).
    '#left-rail', '#map-title', '#sidebar-toggle', '.zbts',
    // the 「｜」 divider in council.html's map-corner toolbar (user 2026-10-31: 「把｜這個刪掉（所有版本）」)
    '#council-ticker-toolbar > span'
  ];
  // Hover outline on every engine page = the 2027 補選預測 page's (user 2026-10-28: 「黃框…改成跟2027立委補選一樣」):
  // #f5c518, 2.2 px, no glow. The engines (V1, untouched) draw it as stroke="#ffcd78" + drop-shadow filters (counties
  // and layers), style.css's glowing .ft-ed / .ft-tc / .ft-vill :hover rules, and the #ffd900 .nat-tc-hover-ed /
  // .nat-vill-hover-ed district outlines of the 全台鄉鎮 / 村里 views; this per-iframe sheet outranks all of them.
  // history.html (its own two iframes, no shell) injects the same rule — keep both in step.
  var HOVER27_CSS = '[stroke="#ffcd78"], .ft-ed:hover, .ft-tc:hover, .ft-vill:hover, .nat-tc-hover-ed, .nat-vill-hover-ed { stroke: #f5c518 !important; stroke-width: 2.2px !important; filter: none !important; vector-effect: non-scaling-stroke; }';
  // Where drill-downs centre the map (user 2026-10-31: 「點進縣市再回台灣都會整個地圖偏左」「光是點進的縣市就會偏左了」).
  // The engines' mapVisibleCenterX centres between #left-rail and the info panel; with #left-rail hidden (ALWAYS_HIDE) its
  // width is 0 and every zoomTo / fitFeats landed half a panel left of the first view. Here: between a V2 left panel
  // (政黨基本盤's 全台總覽 #v2-bl-left, the forecast's #v2-r26-left) and the info panel when the page has one, otherwise
  // the middle of the map — where the first national view sits. Shared with history.html (V2Shell.centerFix).
  function centerFix(win) {
    if (typeof win.mapVisibleCenterX !== 'function' || win.mapVisibleCenterX.v2) return;
    var f = function (W) {
      var d = win.document, ip = d.getElementById('ip');
      var ipW = ip && win.getComputedStyle(ip).display !== 'none' ? ip.getBoundingClientRect().width : 0;
      var lp = d.getElementById('v2-bl-left') || d.getElementById('v2-r26-left');
      var lw = lp && win.getComputedStyle(lp).display !== 'none' ? lp.getBoundingClientRect().right : ipW;
      return W / 2 + (lw - ipW) / 2;
    };
    f.v2 = true;
    win.mapVisibleCenterX = f;
  }
  function injectHover27(win) {
    var doc = win.document;
    if (doc.getElementById('v2-hover27-style')) return;
    var st = doc.createElement('style');
    st.id = 'v2-hover27-style';
    st.textContent = HOVER27_CSS;
    doc.head.appendChild(st);
  }

  var lang = 'zh';
  try { var saved = localStorage.getItem('v2_lang'); if (saved === 'en' || saved === 'zh') lang = saved; } catch (e) {}

  var shell = {
    win: null,
    lang: function () { return lang; },
    t: function (zh, en) { return lang === 'en' ? en : zh; },
    status: function (text, warn) {
      var el = document.getElementById('v2-status');
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('warn', !!warn);
    },
    onLang: null
  };

  function applyLabels(cfg) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
    document.querySelectorAll('[data-zh]').forEach(function (el) { el.textContent = el.getAttribute('data-' + lang); });
    document.querySelectorAll('.v2-lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); });
    document.title = (lang === 'en' ? cfg.title.en : cfg.title.zh) + ' · V2';
  }

  // The 「第三勢力 未派人參選 0」 row V1 writes straight into the legislative
  // panel (no third-force candidate in the district) only exists to carry the
  // third-force base-model bar, so it goes with the other comparisons. V1
  // builds it inline, so the panel is watched and the row removed when it appears.
  function dropThirdPlaceholder(win) {
    var ic = win.document.getElementById('ic');
    if (!ic || ic.v2ThirdWatch || typeof win.MutationObserver !== 'function') return;
    var sweep = function () {
      ic.querySelectorAll('.bar-row').forEach(function (r) {
        var lbl = r.querySelector('.blb'), pct = r.querySelector('.bpct');
        if (lbl && pct && /^(第三勢力|Third Force)$/.test(lbl.textContent.trim()) && /^(未派人參選|No candidate)$/.test(pct.textContent.trim())) r.remove();
      });
    };
    ic.v2ThirdWatch = new win.MutationObserver(sweep);
    ic.v2ThirdWatch.observe(ic, { childList: true, subtree: true });
    sweep();
  }

  function stripBase5(win) {
    BASE5_EMPTY_BUILDERS.forEach(function (n) {
      if (typeof win[n] === 'function') win[n] = function () { return ''; };
    });
    dropThirdPlaceholder(win);
    var vill = win._mayorVillPanelHtml;
    if (typeof vill === 'function' && !vill.v2Stripped) {
      var wrapped = function () {
        return vill.apply(this, arguments).replace(/<div[^>]*>(?:政黨基本盤：無法估算|Party base model: cannot be estimated)[\s\S]*?<\/div>/, '');
      };
      wrapped.v2Stripped = true;
      win._mayorVillPanelHtml = wrapped;
    }
    if (win.eval('typeof showCouncilBase5 !== "undefined" && showCouncilBase5') && typeof win.toggleCouncilBase5 === 'function') {
      win.toggleCouncilBase5();
    }
  }

  // No forced pop-ups in V2 (user, 2026-10-22): V1's setMode() opens a guide /
  // research disclaimer the first time a mode is entered (and asks the party
  // question once per load). Every setMode() — V1's own internal calls too,
  // they reach the same global — now passes the gate; the guide is still one
  // click away on V1's "i" and red ⚠ buttons.
  function quietOnboarding(win) {
    if (typeof win.setMode !== 'function' || win.setMode.v2Quiet) return;
    var orig = win.setMode;
    var quiet = function () {
      try { win.eval('_skipOnboardGateOnce = true'); } catch (e) {}
      return orig.apply(this, arguments);
    };
    quiet.v2Quiet = true;
    win.setMode = quiet;
    try { win.eval('_winnerPartyAskedThisLoad = true'); } catch (e) {}
    // party perspective stays on 「總」 (its button is hidden): no party lit, no camp filter
    try { win.eval('if (typeof _histSeatParty !== "undefined") _histSeatParty = null; if (typeof campFilter !== "undefined") campFilter = null;'); } catch (e) {}
    // a guide V1 already opened while loading (before this ran) is closed the
    // way Escape closes it; the page's own setup picks the mode right after
    var modal = win.document.getElementById('comp-onboard-modal');
    if (modal && modal.style.display !== 'none' && typeof win.closeCompOnboarding === 'function') {
      try { win.closeCompOnboarding(false); } catch (e) {}
      modal.style.display = 'none';
    }
  }

  function injectHide(win, selectors) {
    var doc = win.document;
    if (doc.getElementById('v2-shell-hide')) return;
    var st = doc.createElement('style');
    st.id = 'v2-shell-hide';
    st.textContent = selectors.join(',\n') + ' { display: none !important; }';
    doc.head.appendChild(st);
  }

  function waitFor(win, needs, cb, tries) {
    tries = tries || 0;
    try {
      var ok = needs.every(function (n) { return typeof win[n] === 'function'; }) && win.eval('typeof CD') !== 'undefined';
      if (ok) { cb(); return; }
    } catch (e) {
      shell.status('⚠ 無法存取 V1 頁面（請用本機伺服器開啟，例如 python3 -m http.server 8777）', true);
      return;
    }
    if (tries > 200) { shell.status('⚠ 等待 V1 引擎逾時，請重新整理', true); return; }
    setTimeout(function () { waitFor(win, needs, cb, tries + 1); }, 200);
  }

  shell.boot = function (cfg) {
    var frame = document.getElementById('v2-engine');
    var veil = document.getElementById('v2-veil');
    applyLabels(cfg);
    document.querySelectorAll('.v2-lang button').forEach(function (b) {
      b.addEventListener('click', function () {
        lang = b.dataset.lang;
        try { localStorage.setItem('v2_lang', lang); } catch (e) {}
        applyLabels(cfg);
        if (shell.win && typeof shell.win.setLang === 'function') shell.win.setLang(lang);
        if (shell.onLang) shell.onLang(lang);
        if (shell.tools) shell.tools.refresh();
        if (shell.disc) shell.disc.refresh();
      });
    });
    frame.addEventListener('load', function () {
      var win = frame.contentWindow;
      waitFor(win, cfg.needs || [], function () {
        shell.win = win;
        try {
          // cfg.keep: V1 controls this page needs despite ALWAYS_HIDE (the
          // base-vote page keeps 選舉人數校正, which only matters there)
          injectHide(win, ALWAYS_HIDE.filter(function (sel) { return (cfg.keep || []).indexOf(sel) < 0; }).concat(cfg.hide || []));
          injectHover27(win);
          centerFix(win);
          // English safety net: pinyin for unknown names, county / party / fixed strings in the panels (v2/i18n.js)
          if (window.V2I18n) window.V2I18n.attach(win);
          // township layers in the shared 原住民 border style (v2/tcborder.js, loaded by each page)
          if (window.V2TcBorder) { window.V2TcBorder.attach(win); window.V2TcBorder.unifyBadges(win); window.V2TcBorder.fixEd2016(win); }   // + 區域立委-style result tags
          quietOnboarding(win);
          if (cfg.stripBase5) stripBase5(win);
          // legislative bars as long as the mayor / council ones (legbars.js; test.html engines only)
          if (window.V2LegBars && /test\.html/.test(cfg.engine)) window.V2LegBars.attach(win);
          if (typeof win.setLang === 'function') win.setLang(lang);
          if (cfg.onReady) cfg.onReady(win, shell);
          // the engine's 「i」 and 色盲友善 buttons, in the bar next to the language switch (v2/toolbtns.js)
          if (window.V2Tools && !shell.tools) {
            var bar = document.getElementById('v2-bar');
            shell.tools = window.V2Tools.mount(bar, bar.querySelector('.v2-lang'), function () { return shell.win; }, function () { return lang; }, cfg.infoNote);   // cfg.infoNote(win): the page's own 「i」 text
          }
          if (shell.tools) shell.tools.refresh();
          // crumb + 全台鄉鎮市區 / 全台村里, then ⚠, left of the 「i」 (v2/navbar.js, v2/disclaimer.js — loaded by each page).
          // cfg.disclaimerExtra(win): HTML shown above the disclaimer (the forecast page's research note)
          var bar2 = document.getElementById('v2-bar'), before = function () { return bar2.querySelector('.v2-tools') || bar2.querySelector('.v2-lang'); };
          if (window.V2NavBar && !shell.nav) shell.nav = window.V2NavBar.mount(bar2, before(), function () { return shell.win; });
          if (window.V2Disclaimer && !shell.disc) shell.disc = window.V2Disclaimer.mount(bar2, before(), function () { return shell.win; }, cfg.disclaimerExtra);
        } catch (e) {
          shell.status('⚠ ' + e.message, true);
        }
        veil.classList.add('hidden');
      });
    });
    frame.src = cfg.engine;
  };

  shell.centerFix = centerFix;
  window.V2Shell = shell;
})();
