/* The engine's navigation — the 「全台 › 縣市 › 鄉鎮」 crumb and the 「全台鄉鎮市區」「全台村里」 buttons — in the V2 top bar,
 * left of the 「i」 button (user 2026-10-30: 「在2026縣市長預測的左邊全台，全台鄉鎮市區，全台村里…改成移到上方常駐黑框的i的左邊」).
 *
 * The engine's own #nav-wrap (top of its left rail) is hidden; the bar shows a live copy of it. Its labels are the
 * engine's own (so 中文 / EN follows the engine's setLang), and a click runs the engine's own handler in the engine
 * window — the crumb's onclick strings (goED(), goTC(…)) and the buttons' goTCAllNational() / goVillAllNational().
 * Hidden only — V1 untouched; the copy follows every change of #nav-wrap (MutationObserver).
 *   V2NavBar.mount(barEl, beforeEl, getWin) → { refresh() }
 */
(function () {
  var HIDE = '#nav-wrap { display: none !important; }';
  var BTN = 'font:inherit;font-size:11.5px;font-weight:600;color:#e7eaf0;background:transparent;border:1px solid rgba(255,255,255,.09);' +
            'border-radius:8px;padding:5px 10px;cursor:pointer;white-space:nowrap;line-height:1.1';
  function mount(bar, before, getWin) {
    var box = document.createElement('div');
    box.className = 'v2-nav';
    box.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-right:8px;min-width:0';
    bar.insertBefore(box, before || null);
    var hooked = null;
    // __v2NavClick: a page layer that wraps goED / goTCAllNational / goVillAllNational (history-legind.js) tells a click
    // here from the engine's own redraws, which call the same functions
    function run(win, code) { win.__v2NavClick = true; try { win.eval(code); } catch (e) {} finally { win.__v2NavClick = false; } }
    function refresh() {
      var win = getWin(), doc = win && win.document, nw = doc && doc.getElementById('nav-wrap');
      if (!nw) { box.style.display = 'none'; return; }
      box.style.display = 'inline-flex';   // not '' — that dropped the inline-flex and the buttons wrapped (2026-11-01)
      if (!doc.getElementById('v2-navbar-hide')) { var st = doc.createElement('style'); st.id = 'v2-navbar-hide'; st.textContent = HIDE; doc.head.appendChild(st); }
      if (hooked !== nw && win.MutationObserver) {
        hooked = nw;
        new win.MutationObserver(function () { refresh(); }).observe(nw, { childList: true, subtree: true, characterData: true, attributes: true });
      }
      // built off-screen and swapped in at once (2026-10-31, user: 「2022市議員會一直閃然後地圖無法按照位置點亮」): emptying the bar
      // first let the getComputedStyle below lay the page out with a half-built bar — narrower, so the wrapped top bar
      // unwrapped and the engine's frame changed height for a moment, firing its resize handler (goED), whose crumb
      // update ran this again: an endless redraw loop whenever the bar wraps (縣市議員's extra buttons)
      var frag = document.createDocumentFragment();
      // crumb: 全台 › 縣市 › … — clickable parts keep their engine handler
      var crumb = doc.getElementById('crumb'), cbox = document.createElement('span');
      cbox.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#e7eaf0;padding:0 4px;white-space:nowrap';
      if (crumb) [].forEach.call(crumb.childNodes, function (n) {
        var t = (n.textContent || '').replace(/\s+/g, ' ');
        if (!t.trim()) return;
        var oc = n.getAttribute && n.getAttribute('onclick');
        // V2 page layers (history-legind.js, history-plnat.js) set the crumb's handler in script, not as an attribute
        var fn = !oc && n.nodeType === 1 && typeof n.onclick === 'function';
        var el = document.createElement(oc || fn ? 'button' : 'span');
        el.textContent = t.trim();
        if (oc || fn) {
          el.type = 'button';
          el.style.cssText = 'font:inherit;color:#7dd3fc;background:none;border:0;padding:0;cursor:pointer';
          el.addEventListener('click', function () {
            if (oc) { run(getWin(), oc); return; }
            var w = getWin(); w.__v2NavClick = true; try { n.click(); } finally { w.__v2NavClick = false; }
          });
        } else el.style.color = 'rgba(231,234,240,.55)';
        cbox.appendChild(el);
      });
      frag.appendChild(cbox);
      // 全台鄉鎮市區 / 全台村里 only at the top: hidden once inside a county / township / village layer (user 2026-10-31:
      // 「全台鄉鎮市區跟全台村里按鈕在鄉鎮市區跟村里層按鈕就隱藏」) — shown on 全台 itself and in those two views
      var parts = [].map.call(cbox.childNodes, function (n) { return n.textContent; }).join(' ').split('›')
        .map(function (t) { return t.trim(); }).filter(Boolean);
      var last = parts.length ? parts[parts.length - 1] : '';
      // a 2-part crumb whose second part names the whole map (「2022 縣市長選舉」「全台鄉鎮市區總覽」「22 縣市」「不分區（縣市）」「2026 縣市長預測」…) is
      // still the top; a county / district / township name (「新北市」「臺北市第1選舉區」「新店區」) is not
      var TOP = /(選舉|Election|總覽|Overview|View|全台鄉鎮市區|全台村里|All Townships|All Villages|22 縣市|22 counties|（縣市）|\(by county\)|總統|Presidential|立委|Legislator|預測|Forecast|Prediction)$/i;
      var top = parts.length <= 1 || (parts.length === 2 && TOP.test(last));
      if (!top) { box.replaceChildren(frag); return; }
      // the national-view buttons (hidden ones stay hidden)
      [].forEach.call(nw.querySelectorAll('button[onclick]'), function (b) {
        var cs = win.getComputedStyle(b);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        var nb = document.createElement('button');
        // English: 「All Townships」「All Villages」 → 「Townships」「Villages」 (the crumb before them already says 「All」; the bar
        // stays one row — user 2026-11-01: 「英文的按鈕都還是有擠在一起的問題」)
        var lbl = (b.textContent || '').trim();
        nb.type = 'button'; nb.textContent = lbl.replace(/^All (Townships|Villages)$/, '$1'); nb.title = b.title || lbl;
        nb.style.cssText = BTN;
        var on = b.classList.contains('active');
        if (on) nb.style.background = 'rgba(40,200,200,.22)';
        if (b.disabled) { nb.disabled = true; nb.style.opacity = '.35'; nb.style.cursor = 'default'; }
        var oc = b.getAttribute('onclick');
        nb.addEventListener('click', function () { run(getWin(), oc); });
        frag.appendChild(nb);
      });
      box.replaceChildren(frag);
    }
    refresh();
    return { refresh: refresh };
  }
  window.V2NavBar = { mount: mount };
})();
