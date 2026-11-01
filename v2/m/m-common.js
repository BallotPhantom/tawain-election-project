/* Shared helpers of the mobile pages (v2/m/history.html, v2/m/profile.html; user 2026-10-31: 「都做」).
 * Language (localStorage v2_lang, the other V2 pages' key), party colours / names (profile.html's COUNCIL_PARTY_COLOR and
 * partyLabel, copied), county names, the township / county SVG map, and result rows. Data: m/data_hist_m.js,
 * m/data_place_m.js, m/data_geo_m.js, m/data_counties_m.js (build_v2_mobile.py).
 */
(function () {
  var M = {};
  M.lang = 'zh';
  try { var sv = localStorage.getItem('v2_lang'); if (sv === 'en' || sv === 'zh') M.lang = sv; } catch (e) {}
  M.T = function (zh, en) { return M.lang === 'en' ? en : zh; };
  M.setLang = function (l) { M.lang = l; try { localStorage.setItem('v2_lang', l); } catch (e) {} document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant'; };
  document.documentElement.lang = M.lang === 'en' ? 'en' : 'zh-Hant';

  var COLOR = {
        dpp: '#1b9e4b', kmt: '#3b82f6', tpp: '#26b5c4', ind: '#888', other: '#aaa', pfp: '#FF6310',
        tgg: '#7C3AED', np: '#FFDA00', tsu: '#C69E6A', npp: '#FBBE01', tsr: '#B33A1E', sdp: '#FF0088',
        gp: '#73BE00', gsdp: '#73BE00', chl: '#3A88C8', gpt: '#73BE00', spgp: '#f48fb1', npsu: '#C20F51',
        cpap: '#003399', cup2: '#6633CC', cwp: '#FF00CC', fbi: '#CC7700', isw: '#886600', jrp: '#2244AA',
        lp: '#CC4400', pdp: '#CC0000', tbip: '#445577', tmgp: '#8B4513', trl: '#559933', twr: '#0088AA',
        pup: '#CC6600', ecop: '#666600', jjp: '#1A237E', cupp: '#FF5252', mkt: '#FCC800', tip: '#01814A',
        hif: '#8B00FF', ftp: '#DF4356', hpg: '#888888', mce: '#5C7CFA', daai: '#BA0C0F', trp: '#B4D100',
        twlp: '#1A4D25', mkp: '#4B0082', swp: '#888888', pdmp: '#888888', uaa: '#888888', fa: '#047857',
        gsp: '#73BE00', stab: '#B22222', osoc: '#00695C', rel: '#9C27B0', tpa: '#00838F', cpa: '#616161',
        tnc: '#8D6E63', tbl: '#455A64', tza: '#EF6C00', cvp: '#00A99D', cca: '#6A4C93', tsp: '#D4A017',
        tfp: '#4E7B2E', rdp: '#C0392B', hkp: '#E67E22'
      };
  var LABEL = {
          dpp: '民進黨', kmt: '國民黨', tpp: '民眾黨', ind: '無黨籍', other: '其他', pfp: '親民黨',
          npp: '時代力量', tsu: '台灣團結聯盟', np: '新黨', gp: '綠黨', jrp: '司法改革黨', cupp: '中華統一促進黨', chl: '信心希望聯盟',
          mkt: '民國黨', hif: '健保免費連線', spgp: '小民參政歐巴桑聯盟', mce: '軍公教聯盟黨',
          // Added per AUDIT_HSINCHU_FULL_MIGRATION.md §6/P2 — every code below was
          // resolved against the CEC's own official party registry for the exact
          // election year it appears in (elpaty.csv/elcand.csv under votedata/),
          // not guessed: 2008 (cca/cvp/gpt/hkp/rdp/tfp/tsp), 2012
          // (hif/pup/tbl/tnc/tza — hif already present above, carried from a
          // later year's code reuse), 2016 (daai/ftp/gsp/hpg/tip/trp), 2020
          // (cpa/fa/lp/osoc/rel/stab/tpa/tsr/twr — stab/tsr/twr already covered
          // by other entries), 2024 (confirms gp/tsr/twr/pup continuity). gpt is
          // 2008/2012's own code for 綠黨 — same real party as 'gp', just a
          // different code used by that year's source extraction; not a second
          // distinct party. 'o' is the same generic small-vote-remainder bucket
          // as 'other' (see OTHER_KEYS), not a distinct party. 'isw'/'tbip' are
          // NOT added here — confirmed NOT to match any of the 16 parties on the
          // real 2024 不分區 ballot (elcand.csv, 16 rows, verified), so no
          // trustworthy source party name exists for them yet; see audit report.
          cca: '制憲聯盟', cvp: '公民黨', gpt: '綠黨', hkp: '客家黨', rdp: '紅黨', tfp: '台灣農民黨', tsp: '第三社會黨',
          pup: '人民最大黨', tbl: '中華民國臺灣基本法連線', tnc: '台灣國民會議', tza: '台灣主義黨',
          daai: '大愛憲改聯盟', ftp: '自由台灣黨', gsp: '綠黨社會民主黨聯盟', hpg: '和平鴿聯盟黨', tip: '台灣獨立黨', trp: '樹黨',
          cpa: '國會政黨聯盟', fa: '喜樂島聯盟', lp: '勞動黨', osoc: '一邊一國行動黨', rel: '宗教聯盟', stab: '安定力量', tpa: '台澎黨', tsr: '台灣基進', twr: '台灣維新',
          npsu: '無黨團結聯盟', o: '其他',
          sdp: '社民黨',   // 社會民主黨 — 臺北市 2024 第6選舉區 苗博雅 (CEC elpaty); V1's own code/label/colour
          // uaa (合一行動聯盟) was resolved during the Hsinchu round's own 2020
          // ballot cross-reference (same elcand.csv/elpaty.csv method as every
          // other code above) but omitted from this dict by a copy/paste
          // mistake — caught now during Pingtung's independent party-code audit
          // (County #3, item 7), re-confirmed present in BOTH Nantou's and
          // Hsinchu's real 2020 partyListRawByYear data, meaning this was a
          // live, user-facing gap for both counties already, not something new
          // Pingtung introduced.
          uaa: '合一行動聯盟'
        };
  var LABEL_EN = { dpp: 'DPP', kmt: 'KMT', tpp: 'TPP', ind: 'Independent', other: 'Other', pfp: 'PFP', npp: 'NPP', tsu: 'TSU', np: 'New Party', gp: 'Green Party',
    npsu: 'NPSU', sdp: 'SDP', tsr: 'TSR', mkt: 'MKT', chl: 'Confidence Hope', gsdp: 'Green-SDP Alliance', tbip: 'TBIP' };
  M.color = function (p) { return COLOR[p] || '#888'; };
  M.party = function (p) { return M.lang === 'en' ? (LABEL_EN[p] || (LABEL[p] ? p.toUpperCase() : 'Other')) : (LABEL[p] || '其他'); };
  // a party-list record names the party itself (中國國民黨 …): English through its code
  M.listName = function (name, p) { return M.lang === 'en' ? (p && p !== 'other' ? M.party(p) : (name === '其他' ? 'Others' : name)) : name; };

  var CN_EN = { '臺北市': 'Taipei City', '新北市': 'New Taipei City', '桃園市': 'Taoyuan City', '臺中市': 'Taichung City', '臺南市': 'Tainan City', '高雄市': 'Kaohsiung City',
    '基隆市': 'Keelung City', '新竹市': 'Hsinchu City', '嘉義市': 'Chiayi City', '新竹縣': 'Hsinchu County', '苗栗縣': 'Miaoli County', '彰化縣': 'Changhua County',
    '南投縣': 'Nantou County', '雲林縣': 'Yunlin County', '嘉義縣': 'Chiayi County', '屏東縣': 'Pingtung County', '宜蘭縣': 'Yilan County', '花蓮縣': 'Hualien County',
    '臺東縣': 'Taitung County', '澎湖縣': 'Penghu County', '金門縣': 'Kinmen County', '連江縣': 'Lienchiang County',
    '臺北縣': 'Taipei County', '臺中縣': 'Taichung County', '臺南縣': 'Tainan County', '高雄縣': 'Kaohsiung County', '桃園縣': 'Taoyuan County' };
  // north → south, then the east and the islands (the usual order of a county list)
  M.ccs = ['63000', '65000', '10017', '68000', '10018', '10004', '10005', '66000', '10007', '10008', '10009', '10020', '10010', '67000', '64000', '10013',
           '10002', '10015', '10014', '10016', '09020', '09007'].filter(function (cc) { return M_COUNTIES.c[cc]; });
  var en = function (n) { return CN_EN[n] || CN_EN[String(n).replace('台', '臺')] || n; };   // the map file writes 台, the CEC files 臺
  M.county = function (cc) { var n = (M_COUNTIES.c[cc] || {}).n || cc; return M.lang === 'en' ? en(n) : n; };
  M.countyEn = en;
  M.town = function (tc) { return M.lang === 'en' ? (M_PLACE.tnEn[tc] || tc) : (M_PLACE.tn[tc] || tc); };
  // a district name 「臺中縣第1選舉區」 / 「新竹縣選舉區」
  M.district = function (n) {
    if (M.lang !== 'en') return n;
    var m = String(n).match(/^(.+?[縣市])(?:第(\d+))?選舉區$/);
    return m ? M.countyEn(m[1]).replace(/ (County|City)$/, '') + ' ' + (m[2] ? 'District ' + m[2] : 'District') : n;
  };
  // a person in English: the 2026 names list (m/data_names_m.js) if loaded, else pinyin by the engine's rule (surname, then
  // the given name hyphenated: 「Huo-mu」) — pinyin-pro (the library profile_en.js uses) is fetched only in English
  var PY = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js', pyLoading = false;
  M.needPinyin = function (done) {
    if (M.lang !== 'en' || window.pinyinPro || pyLoading) return;
    pyLoading = true; var sc = document.createElement('script'); sc.src = PY; sc.onload = function () { done && done(); }; document.head.appendChild(sc);
  };
  M.person = function (n) {
    n = String(n).split(/[（(]/)[0].trim();
    if (M.lang !== 'en') return n;
    if (typeof M_NAMES_EN !== 'undefined' && M_NAMES_EN[n]) return M_NAMES_EN[n];
    if (!window.pinyinPro) return n;
    try {
      var y = window.pinyinPro.pinyin(n, { toneType: 'none', type: 'array' }), cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
      return y.length < 2 ? cap(y[0] || n) : cap(y[0]) + ' ' + cap(y[1]) + y.slice(2).map(function (x) { return '-' + x; }).join('');
    } catch (e) { return n; }
  };
  M.fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  M.pct = function (x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; };

  // the leader of a record [elig, cast, valid, v0, v1, …] over cands [[name, party, elected], …]
  M.lead = function (cands, v) {
    var best = -1, second = -1, bi = -1;
    for (var i = 0; i < cands.length; i++) { var x = v[3 + i]; if (x > best) { second = best; best = x; bi = i; } else if (x > second) second = x; }
    return bi < 0 || !v[2] ? null : { i: bi, c: cands[bi], share: best / v[2], margin: (best - Math.max(0, second)) / v[2] };
  };
  // fill by party, deeper = bigger margin (the maps' winner-margin idea, simplified)
  function mix(hex, k) {
    var h = (hex || '#888888').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var bg = [24, 28, 38], m = function (i) { var c = parseInt(h.substring(i, i + 2), 16) || 0; return Math.round(bg[i / 2] + (c - bg[i / 2]) * k); };
    return 'rgb(' + m(0) + ',' + m(2) + ',' + m(4) + ')';
  }
  M.fill = function (p, margin) { return mix(M.color(p), Math.max(0.35, Math.min(1, 0.35 + margin / 0.3 * 0.65))); };

  // ---- SVG map: path strings in one frame; viewBox fitted to the shapes drawn ----
  function bbox(ds) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, re = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, m;
    ds.forEach(function (d) { re.lastIndex = 0; while ((m = re.exec(d))) { var x = +m[1], y = +m[2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
    return [x0, y0, x1, y1];
  }
  // items: [{key, d, fill, title}], fit: true → viewBox around them; stroke width scales with the box
  M.map = function (svg, items, opts) {
    opts = opts || {};
    var b = opts.fit ? bbox(items.map(function (x) { return x.d; })) : [0, 0, M_COUNTIES.w, M_COUNTIES.h];
    var pad = (b[2] - b[0]) * 0.03, w = b[2] - b[0] + 2 * pad, h = b[3] - b[1] + 2 * pad;
    svg.setAttribute('viewBox', [b[0] - pad, b[1] - pad, w, h].map(function (x) { return x.toFixed(1); }).join(' '));
    var sw = Math.max(w, h) / 600;
    svg.innerHTML = items.map(function (x) {
      return '<path class="mp" data-k="' + x.key + '" d="' + x.d + '" fill="' + x.fill + '" stroke="rgba(8,10,16,.9)" stroke-width="' + sw.toFixed(2) + '"><title>' + (x.title || '') + '</title></path>';
    }).join('') + (opts.outline ? '<path d="' + opts.outline + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="' + (sw * 1.6).toFixed(2) + '" pointer-events="none"/>' : '');
  };
  M.townsOf = function (cc) { return Object.keys(M_TOWNS.t).filter(function (tc) { return tc.indexOf(cc) === 0 && M_TOWNS.t[tc]; }).sort(); };

  // ---- result rows: name, party bar (% of valid), %, votes; ✓ elected ----
  M.rows = function (cands, v, opts) {
    opts = opts || {};
    var idx = cands.map(function (c, i) { return i; }).sort(function (a, b) { return v[3 + b] - v[3 + a]; });
    if (opts.top) idx = idx.slice(0, opts.top);
    return '<div class="rows">' + idx.map(function (i) {
      var c = cands[i], s = v[2] ? v[3 + i] / v[2] : 0, nm = opts.list ? M.listName(c[0], c[1]) : M.person(c[0]);
      return '<div class="r' + (c[2] ? ' won' : '') + '"><span class="who"><i style="background:' + M.color(c[1]) + '"></i>' + (c[2] && !opts.noTick ? '✓ ' : '') + nm + '</span>' +
        '<span class="bg"><span style="width:' + (s * 100).toFixed(1) + '%;background:' + M.color(c[1]) + '"></span></span>' +
        '<span class="v">' + M.pct(s) + '<small>' + M.fmt(v[3 + i]) + '</small></span></div>';
    }).join('') + '</div>';
  };
  M.turnout = function (v) { return v[0] ? M.T('投票率 ', 'Turnout ') + M.pct(v[1] / v[0]) + M.T('・有效票 ', ' · valid ') + M.fmt(v[2]) : ''; };

  // ---- bar: home, title, ⚠, 中文 / EN ----
  M.bar = function (titleZh, titleEn, onLang) {
    var el = document.getElementById('mbar');
    el.innerHTML = '<a class="home" href="../index.html"></a><span class="ttl"></span><span class="sp"></span>' +
      '<button class="disc" type="button" aria-expanded="false">⚠</button>' +
      '<div class="lang" role="group" aria-label="Language"><button type="button" data-lang="zh">中文</button><button type="button" data-lang="en">EN</button></div>';
    var note = document.getElementById('mnote');
    var paint = function () {
      el.querySelector('.home').textContent = M.T('← 首頁', '← Home');
      el.querySelector('.ttl').innerHTML = M.T(titleZh, titleEn) + '<span class="badge">V2</span>';
      el.querySelector('.disc').title = M.T('研究性質聲明', 'Research disclaimer');
      [].forEach.call(el.querySelectorAll('.lang button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === M.lang)); });
      note.textContent = M.T('※本頁面純屬學術性空間資料視覺化與科學模型研究，不代表任何政黨立場，亦不為特定候選人或政黨拉票。資料來源：中央選舉委員會、政府資料開放平台 (data.gov.tw)。實際票數與開票結果請一律以中選會官方公告為準。',
        "※This page is purely an academic exercise in spatial data visualization and scientific modeling. It does not represent any party's position or campaign for any candidate or party. Data sources: Central Election Commission, data.gov.tw. For actual vote counts and results, please refer to official CEC announcements.");
    };
    el.querySelector('.disc').addEventListener('click', function () { var on = note.classList.toggle('on'); this.setAttribute('aria-expanded', String(on)); });
    el.querySelector('.lang').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]'); if (!b || b.dataset.lang === M.lang) return;
      M.setLang(b.dataset.lang); paint(); onLang();
    });
    paint();
  };
  window.M = M;
})();
