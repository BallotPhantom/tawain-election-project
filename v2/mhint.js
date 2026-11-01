/* Phone hint for the heavy desktop pages (user 2026-10-31): on a narrow screen, a dismissible bar at the bottom offers the
 * light phone page — never a forced redirect. <script src="mhint.js" data-m="m/history.html"></script>; dismissed for the
 * tab's session (sessionStorage v2_mhint_off). Wording follows localStorage v2_lang.
 */
(function () {
  var me = document.currentScript, url = me && me.getAttribute('data-m');
  if (!url || !window.matchMedia || !matchMedia('(max-width: 760px)').matches) return;
  try { if (sessionStorage.getItem('v2_mhint_off') === '1') return; } catch (e) {}
  var en = false; try { en = localStorage.getItem('v2_lang') === 'en'; } catch (e) {}
  var show = function () {
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:99999;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;' +
      'background:rgba(10,30,34,.96);border:1px solid rgba(40,200,200,.5);color:#e7eaf0;font:600 13px/1.4 -apple-system,"PingFang TC","Noto Sans TC",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    b.innerHTML = '<a href="' + url + '" style="flex:1;color:#7de3e3;text-decoration:none">' + (en ? 'This page is heavy on a phone — open the light version →' : '這頁在手機上很重，改用輕量手機版 →') + '</a>' +
      '<button type="button" aria-label="close" style="flex:none;background:none;border:0;color:#aab;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px">×</button>';
    b.querySelector('button').onclick = function () { b.remove(); try { sessionStorage.setItem('v2_mhint_off', '1'); } catch (e) {} };
    document.body.appendChild(b);
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
