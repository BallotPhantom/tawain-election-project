/* The engine's research disclaimer (the red ⚠ under the map's top-left corner) in the V2 top bar
 * (user 2026-10-31: 「左邊的三角警示燈也可以移上去」).
 *
 * The bar gets a ⚠ button; a click drops the same red note under it. The note's text is read from the engine's own
 * #disclaimer-note at each opening, so 中文 / EN follows the engine's setLang. The button shows only while the engine
 * itself would show its ⚠ — changed 2026-10-31: the ⚠ shows on every page and mode. The engine's own is hidden — V1 untouched.
 * extra(win) (optional): HTML shown above the disclaimer, in orange — the 2026 預測 page's research note (user 2026-10-31).
 *   V2Disclaimer.mount(barEl, beforeEl, getWin, extra) → { refresh() }
 */
(function () {
  var HIDE = '#disclaimer-wrap { display: none !important; }';
  function mount(bar, before, getWin, extra) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'v2-disc'; btn.textContent = '⚠';
    btn.setAttribute('aria-expanded', 'false');
    btn.style.cssText = 'width:28px;height:28px;margin-right:8px;border-radius:50%;background:rgba(255,82,82,.18);border:1.5px solid rgba(255,82,82,.55);' +
                        'color:#ff5252;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0';
    bar.insertBefore(btn, before || null);
    var note = document.createElement('div');
    note.setAttribute('role', 'note');
    note.style.cssText = 'display:none;position:fixed;z-index:50;width:340px;box-sizing:border-box;padding:10px 12px;font-size:11.5px;line-height:1.6;' +
                         'color:#ff8a8a;background:rgba(40,12,14,.94);border:1px solid rgba(255,82,82,.45);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.4)';
    document.body.appendChild(note);
    function src() { var w = getWin(), d = w && w.document; return d && d.getElementById('disclaimer-note'); }
    function close() { note.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (note.style.display !== 'none') return close();
      var s = src(), x = '';
      try { x = extra ? extra(getWin()) || '' : ''; } catch (err) {}
      note.innerHTML = (x ? '<div style="color:rgba(255,180,80,.95);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,82,82,.3)">' + x + '</div>' : '') + '<div></div>';
      note.lastChild.textContent = s ? s.textContent.replace(/\s+/g, ' ').trim() : '';
      var r = btn.getBoundingClientRect();
      note.style.top = (r.bottom + 8) + 'px';
      note.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 348)) + 'px';
      note.style.display = ''; btn.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('click', function (e) { if (!note.contains(e.target)) close(); });
    var hooked = null;
    function refresh() {
      var w = getWin(), d = w && w.document, wrap = d && d.getElementById('disclaimer-wrap');
      if (!wrap) { btn.style.display = 'none'; close(); return; }
      if (!d.getElementById('v2-disc-hide')) { var st = d.createElement('style'); st.id = 'v2-disc-hide'; st.textContent = HIDE; d.head.appendChild(st); }
      // the engine opens/closes its ⚠ per mode by #disclaimer-wrap's inline display — follow it
      if (hooked !== wrap && w.MutationObserver) {
        hooked = wrap; new w.MutationObserver(refresh).observe(wrap, { attributes: true, attributeFilter: ['style'] });
        d.addEventListener('mousedown', close, true);   // a click on the map (the engine's own document) closes the note too
      }
      // always shown (user 2026-10-31: 「警示三角形要常駐顯示」) — the engine turns its own ⚠ off in some modes (e.g. 政黨基本盤);
      // the note text is the same in every mode
      var on = true;
      btn.style.display = on ? 'inline-flex' : 'none';
      if (!on) close();
      var lb = document.querySelector('.v2-lang button[data-lang="en"]'), en = !!lb && lb.getAttribute('aria-pressed') === 'true';
      btn.title = en ? 'Research disclaimer' : '研究性質聲明';
    }
    refresh();
    return { refresh: refresh };
  }
  window.V2Disclaimer = { mount: mount };
})();
