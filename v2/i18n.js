/* V2 English safety net for the V1 engines (user 2026-10-29: 「v2都要翻英文」).
 *
 * Audit 2026-10-29 (EN mode, every page): the engines translate their own UI, but some text reaches the panels in
 * Chinese only —
 *  - names the engine has no entry for: test.html's translateCandidate() returns the Chinese name (2008 / 2012
 *    candidates, 陳冠廷, 謝長廷 …); council.html's falls back to pinyin through pinyin-pro;
 *  - county names council.html's translateCounty() does not know (「嘉義縣」 as a live-tracking panel title);
 *  - a few fixed strings written in Chinese only (「移到地圖選區查看縣市議會席次」, 「推演參數」, 「萬」, a party name in
 *    「民進黨 57.1% won」).
 * V2I18n.attach(win), once per engine frame:
 *  - loads pinyin-pro (pinned) into the frame when the engine has none, and wraps translateCandidate() so an unknown
 *    name falls back to pinyin — council.html's own rule (surname, then given name hyphenated: 「Zhang Hua-guan」);
 *  - watches the info panel (#ip) and the map legend: in English, a text node that is exactly a known county, party or
 *    fixed string is replaced, and a Chinese name inside a candidate-name cell is romanized; the Chinese text is kept on
 *    the node and comes back on a switch to 中文.
 * V2I18n.name(win, n) / V2I18n.county(n) / V2I18n.party(n) are used by V2's own layers.
 */
(function () {
  var PINYIN_SRC = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js';
  var CJK = /[㐀-鿿]/;
  var COUNTY = {
    '臺北市': 'Taipei City', '台北市': 'Taipei City', '新北市': 'New Taipei City', '桃園市': 'Taoyuan City', '臺中市': 'Taichung City',
    '台中市': 'Taichung City', '臺南市': 'Tainan City', '台南市': 'Tainan City', '高雄市': 'Kaohsiung City', '基隆市': 'Keelung City',
    '新竹市': 'Hsinchu City', '嘉義市': 'Chiayi City', '新竹縣': 'Hsinchu County', '苗栗縣': 'Miaoli County', '彰化縣': 'Changhua County',
    '南投縣': 'Nantou County', '雲林縣': 'Yunlin County', '嘉義縣': 'Chiayi County', '屏東縣': 'Pingtung County', '宜蘭縣': 'Yilan County',
    '花蓮縣': 'Hualien County', '臺東縣': 'Taitung County', '台東縣': 'Taitung County', '澎湖縣': 'Penghu County', '金門縣': 'Kinmen County',
    '連江縣': 'Lienchiang County', '臺北縣': 'Taipei County', '台北縣': 'Taipei County', '桃園縣': 'Taoyuan County',
    '臺中縣': 'Taichung County', '台中縣': 'Taichung County', '臺南縣': 'Tainan County', '台南縣': 'Tainan County', '高雄縣': 'Kaohsiung County'
  };
  var PARTY = {
    '民主進步黨': 'DPP', '民進黨': 'DPP', '中國國民黨': 'KMT', '國民黨': 'KMT', '台灣民眾黨': 'TPP', '民眾黨': 'TPP', '時代力量': 'NPP',
    '親民黨': 'PFP', '新黨': 'New Party', '台灣團結聯盟': 'TSU', '台聯': 'TSU', '無黨團結聯盟': 'NPSU', '無黨籍': 'Independent',
    '台灣綠黨': 'Green Party', '綠黨': 'Green Party', '社會民主黨': 'SDP', '台灣基進': 'TSR', '台灣前進': 'Taiwan Forward'
  };
  var TEXT = {
    '移到地圖選區查看縣市議會席次': 'Hover a district to see council seats', '推演參數': 'Scenario parameters', '空軍基地': 'Air base',
    '其他': 'Others', '綠營': 'Green camp', '藍營': 'Blue camp', '未載': 'n/a'
  };
  // people known by an established English name (presidential tickets 2008–2024): used before the engine's map / pinyin
  var PERSON = {
    '謝長廷': 'Frank Hsieh', '馬英九': 'Ma Ying-jeou', '蔡英文': 'Tsai Ing-wen', '宋楚瑜': 'James Soong', '朱立倫': 'Eric Chu',
    '韓國瑜': 'Han Kuo-yu', '賴清德': 'Lai Ching-te', '侯友宜': 'Hou Yu-ih', '柯文哲': 'Ko Wen-je', '蕭美琴': 'Hsiao Bi-khim',
    '趙少康': 'Jaw Shaw-kong', '吳欣盈': 'Cynthia Wu', '蕭萬長': 'Vincent Siew', '吳敦義': 'Wu Den-yih', '蘇嘉全': 'Su Jia-chyuan',
    '陳建仁': 'Chen Chien-jen', '王如玄': 'Wang Ju-hsuan', '徐欣瑩': 'Hsu Hsin-ying', '張善政': 'Simon Chang', '余湘': 'Yu Hsiang', '林瑞雄': 'Lin Ruey-shiung'
  };
  var NAME_CELLS = '.blb, .cand-name, .b5-tip-name, .v2-name';

  function lang(win) { try { return win.eval("typeof currentLang !== 'undefined' ? currentLang : 'zh'"); } catch (e) { return 'zh'; } }
  function pinyinOf(win) { return win.pinyinPro || window.pinyinPro || null; }
  // a person's name in pinyin, council.html's style: 「Zhang Hua-guan」
  function romanize(win, n) {
    var P = pinyinOf(win); if (!P || !P.pinyin || !CJK.test(n)) return n;
    try {
      var s = P.pinyin(n, { toneType: 'none', type: 'array' }); if (!s || !s.length) return n;
      var cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
      return s.length === 1 ? cap(s[0]) : cap(s[0]) + ' ' + cap(s[1]) + s.slice(2).map(function (x) { return '-' + x; }).join('');
    } catch (e) { return n; }
  }
  function name(win, n) {
    if (!n || lang(win) !== 'en') return n;
    if (PERSON[n]) return PERSON[n];
    var t = typeof win.translateCandidate === 'function' ? win.translateCandidate(n) : n;
    return CJK.test(t) ? romanize(win, n) : t;
  }
  function county(n) { return COUNTY[n] || n; }
  function party(n) { return PARTY[n] || n; }

  // one text node, English
  function en(win, node) {
    var t = node.nodeValue, s = t.trim();
    if (!s || !CJK.test(s)) return null;
    var pad = function (x) { return t.replace(s, x); };
    if (TEXT[s]) return pad(TEXT[s]);
    if (PERSON[s]) return pad(PERSON[s]);
    if (COUNTY[s]) return pad(COUNTY[s]);
    if (PARTY[s]) return pad(PARTY[s]);
    var m = s.match(/^(\S+) ([\d.]+%) (won|elected)$/);
    if (m && PARTY[m[1]]) return pad(PARTY[m[1]] + ' ' + m[2] + ' ' + m[3]);
    m = s.match(/^([\d.]+)萬$/); if (m) return pad(Math.round(parseFloat(m[1]) * 10000).toLocaleString('en-US'));
    var cell = node.parentElement && node.parentElement.closest(NAME_CELLS);
    if (cell && /^[✔\s]*[㐀-鿿·．]{2,6}$/.test(s)) { var r = romanize(win, s.replace(/[✔\s]/g, '')); if (r !== s) return pad((s.indexOf('✔') >= 0 ? '✔' : '') + r); }
    return null;
  }
  // vote counts written 「8萬5159」 (<span>8</span>萬<span>5159</span>) = 85,159: the whole cell becomes one number
  // (a first version turned 「萬」 into 「×10k」 alone and read 「8×10k5159」 — fixed 2026-10-29)
  function votes(win, root, on) {
    [].forEach.call(root.querySelectorAll('.cand-votes'), function (el) {
      if (on) {
        if (el.__v2en && el.textContent === el.__v2en) return;
        var m = el.textContent.replace(/[,\s]/g, '').match(/^(\d+)萬(\d{0,4})$/); if (!m) return;
        var v = parseInt(m[1], 10) * 10000 + (m[2] ? parseInt(m[2], 10) : 0);
        el.__v2zhHtml = el.innerHTML; el.__v2en = v.toLocaleString('en-US'); el.textContent = el.__v2en;
      } else if (el.__v2zhHtml && el.textContent === el.__v2en) {
        el.innerHTML = el.__v2zhHtml; el.__v2en = null;
      }
    });
  }
  function sweep(win, root) {
    if (!root) return;
    var on = lang(win) === 'en', tw = win.document.createTreeWalker(root, 4), n;   // 4 = SHOW_TEXT
    votes(win, root, on);
    while ((n = tw.nextNode())) {
      if (on) {
        if (n.__v2en && n.nodeValue === n.__v2en) continue;
        var r = en(win, n);
        if (r != null && r !== n.nodeValue) { n.__v2zh = n.nodeValue; n.__v2en = r; n.nodeValue = r; }
      } else if (n.__v2zh && n.nodeValue === n.__v2en) {
        n.nodeValue = n.__v2zh; n.__v2en = null;
      }
    }
  }
  function attach(win) {
    var doc = win.document;
    if (!doc || win.__v2I18n) return;
    win.__v2I18n = true;
    // pinyin for names the engine cannot translate (test.html has no pinyin-pro)
    if (!win.pinyinPro && !doc.getElementById('v2-pinyin')) {
      var sc = doc.createElement('script'); sc.id = 'v2-pinyin'; sc.src = PINYIN_SRC; doc.head.appendChild(sc);
    }
    var tc = win.translateCandidate;
    if (typeof tc === 'function' && !tc.v2I18n) {
      win.translateCandidate = function (n) {
        var r = tc.apply(this, arguments);
        return (typeof r === 'string' && CJK.test(r) && lang(win) === 'en') ? romanize(win, r.replace(/\s+/g, '')) : r;
      };
      win.translateCandidate.v2I18n = true;
    }
    var tcy = win.translateCounty;
    if (typeof tcy === 'function' && !tcy.v2I18n) {
      win.translateCounty = function (n) {
        var r = tcy.apply(this, arguments);
        return (r == null || (typeof r === 'string' && CJK.test(r))) && lang(win) === 'en' && COUNTY[n] ? COUNTY[n] : r;
      };
      win.translateCounty.v2I18n = true;
    }
    var busy = false;
    var run = function () {
      if (busy) return; busy = true;
      try { ['ip', 'map-legend', 'legend'].forEach(function (id) { sweep(win, doc.getElementById(id)); }); } finally { busy = false; }
    };
    var queued = false;
    var schedule = function () { if (!queued) { queued = true; win.requestAnimationFrame(function () { queued = false; run(); }); } };
    ['ip', 'map-legend', 'legend'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) new win.MutationObserver(schedule).observe(el, { childList: true, subtree: true, characterData: true });
    });
    var sl = win.setLang;
    if (typeof sl === 'function' && !sl.v2I18n) {
      win.setLang = function () { var r = sl.apply(this, arguments); schedule(); return r; };
      win.setLang.v2I18n = true;
    }
    run();
  }
  window.V2I18n = { attach: attach, name: name, county: county, party: party, romanize: romanize };
})();
