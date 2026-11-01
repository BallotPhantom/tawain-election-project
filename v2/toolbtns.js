/* The engine's 「i」 (about / guide / sources) and 「色盲友善」 (colour-blind palette) buttons in the V2 top bar
 * (user 2026-10-29: 「把i 色盲友善按鈕都放到上方的常駐欄位」).
 *
 * They sat inside the map (top right of the V1 engine). Now the bar carries both, next to the language switch, and the
 * engine's own two are hidden. Each acts on the engine on screen (getWin): 「i」 → startInfoOnboarding(), 色盲友善 →
 * setColorblindMode(!colorblindMode) (council.html only — test.html engines have no colour-blind mode, so the button
 * hides while such an engine is on screen). The 色盲友善 button shows its state.
 *   V2Tools.mount(barEl, beforeEl, getWin, getLang) → { refresh() }
 */
(function () {
  var HIDE = '#comp-info-btn, #cb-toggle { display: none !important; }';
  var BTN = 'font:inherit;font-size:11.5px;font-weight:600;color:#e7eaf0;background:transparent;border:1px solid rgba(255,255,255,.09);' +
            'border-radius:8px;padding:5px 10px;cursor:pointer;white-space:nowrap;line-height:1.1';
  function G(win, n) { try { return win.eval(n); } catch (e) { return undefined; } }
  function hideIn(win) {
    var doc = win && win.document;
    if (!doc || !doc.head || doc.getElementById('v2-tools-hide')) return;
    var st = doc.createElement('style'); st.id = 'v2-tools-hide'; st.textContent = HIDE; doc.head.appendChild(st);
  }
  // note(win) (optional): the page's own 「i」 text — the 「i」 shows and opens it in a box under the bar instead of the
  // engine's onboarding (政黨基本盤's 深／中／淺 note, user 2026-10-31: 「i按鈕要用上方欄位的i要重新顯示且改字」)
  function mount(bar, before, getWin, getLang, note) {
    var box = document.createElement('div');
    box.className = 'v2-tools';
    box.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-right:8px';
    box.innerHTML = '<button type="button" class="v2-tool-info" style="' + BTN + ';width:28px;padding:5px 0;border-radius:50%;font-style:italic;font-family:Georgia,serif"></button>' +
                    '<button type="button" class="v2-tool-cb" style="' + BTN + '"></button>';
    var info = box.querySelector('.v2-tool-info'), cb = box.querySelector('.v2-tool-cb');
    info.textContent = 'i';
    bar.insertBefore(box, before || null);
    var pop = null;
    info.addEventListener('click', function (e) {
      var w = getWin();
      if (note) {
        e.stopPropagation();
        if (!pop) {
          pop = document.createElement('div');
          pop.style.cssText = 'display:none;position:fixed;z-index:50;width:340px;box-sizing:border-box;padding:10px 12px;font-size:11.5px;line-height:1.7;' +
            'color:rgba(255,255,255,.85);background:rgba(18,24,38,.97);border:1px solid rgba(255,255,255,.18);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.4)';
          document.body.appendChild(pop);
          document.addEventListener('click', function (ev) { if (!pop.contains(ev.target)) pop.style.display = 'none'; });
          if (w) w.document.addEventListener('mousedown', function () { pop.style.display = 'none'; }, true);
        }
        if (pop.style.display !== 'none') { pop.style.display = 'none'; return; }
        var html = ''; try { html = note(w) || ''; } catch (err) {}
        if (!html) return;
        pop.innerHTML = html;
        var r = info.getBoundingClientRect();
        pop.style.top = (r.bottom + 8) + 'px';
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 348)) + 'px';
        pop.style.display = '';
        return;
      }
      if (w && typeof w.startInfoOnboarding === 'function') w.startInfoOnboarding();
    });
    cb.addEventListener('click', function () {
      var w = getWin(); if (!w || typeof w.setColorblindMode !== 'function') return;
      w.setColorblindMode(!G(w, 'colorblindMode'));
      api.refresh();
    });
    var api = {
      refresh: function () {
        var w = getWin(), en = getLang() === 'en';
        hideIn(w);
        info.title = note ? (en ? 'About these numbers' : '說明') : (en ? 'About this page / how to use it / data sources' : '關於本頁面／操作指引／資料來源');
        // the 「i」 is hidden on every page (user 2026-10-31: 「把i按鈕在所有mode都隱藏」); the engine's own one stays hidden too
        info.style.display = note ? '' : 'none';
        var can = !!(w && typeof w.setColorblindMode === 'function'), on = can && !!G(w, 'colorblindMode');
        cb.style.display = can ? '' : 'none';
        cb.textContent = en ? 'Colorblind' : '色盲友善';   // short: the bar stays one row in English (user 2026-11-01)
        cb.title = en ? 'Colour-blind palette: swaps the red / orange / green turnout lights and some chart colours for blue / orange'
                      : '色盲友善模式：把紅／橘／綠的投票率燈號跟部分圖表配色，換成藍／橘的色盲安全配色';
        cb.setAttribute('aria-pressed', String(on));
        cb.style.background = on ? 'rgba(40,200,200,.22)' : 'transparent';
      }
    };
    api.refresh();   // hidden until an engine is ready (no empty button while History loads)
    return api;
  }
  window.V2Tools = { mount: mount, hideIn: hideIn };
})();
