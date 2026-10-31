/* Profile in English (user 2026-10-29: 「profile等都要英文」 + 「中英文切換應該要放在上方的常駐列跟index or v2一樣」).
 *
 * Profile builds its panels from ~35 000 code lines of Chinese strings and data, so English is a layer over the
 * rendered page rather than a rewrite: a zh / EN switch (the other V2 pages' look, localStorage v2_lang) in the
 * top-right controls, and in English every text node and title is passed through
 *   1. a dictionary of the page's own UI words and notes (collected from the rendered page, 2026-10-29);
 *   2. sentence patterns — offices with a year (「2014 南投縣議員」), seat summaries, counts, constituency labels,
 *      「只看 X（再點一次取消）」, family / relation labels, place headers …;
 *   3. names: counties (official), townships (pinyin + Town / Township / District / City — the engines' own rule),
 *      villages (the engines' village map by code where the row carries one, else pinyin + Village), people (the
 *      engines' candidate map, established English names, else pinyin), the 16 recognised indigenous peoples and
 *      the Pingpu groups by their own names, parties, news outlets (article titles stay in the original Chinese).
 * Text the layer cannot read (longer prose) stays Chinese until it gets its own English (family summaries: family_src
 * *_en fields). The Chinese is kept on each node and restored on 中文.
 */
(function () {
  var PINYIN_SRC = 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js';
  var CJK = /[㐀-鿿]/;
  var lang = 'zh';
  try { var sv = localStorage.getItem('v2_lang'); if (sv === 'en' || sv === 'zh') lang = sv; } catch (e) {}

  var COUNTY = {
    '臺北市': 'Taipei City', '台北市': 'Taipei City', '新北市': 'New Taipei City', '桃園市': 'Taoyuan City', '臺中市': 'Taichung City', '台中市': 'Taichung City',
    '臺南市': 'Tainan City', '台南市': 'Tainan City', '高雄市': 'Kaohsiung City', '基隆市': 'Keelung City', '新竹市': 'Hsinchu City', '嘉義市': 'Chiayi City',
    '新竹縣': 'Hsinchu County', '苗栗縣': 'Miaoli County', '彰化縣': 'Changhua County', '南投縣': 'Nantou County', '雲林縣': 'Yunlin County', '嘉義縣': 'Chiayi County',
    '屏東縣': 'Pingtung County', '宜蘭縣': 'Yilan County', '花蓮縣': 'Hualien County', '臺東縣': 'Taitung County', '台東縣': 'Taitung County', '澎湖縣': 'Penghu County',
    '金門縣': 'Kinmen County', '連江縣': 'Lienchiang County', '臺北縣': 'Taipei County', '台北縣': 'Taipei County', '臺灣省': 'Taiwan Province', '台灣': 'Taiwan', '臺灣': 'Taiwan'
  };
  var PARTY = {
    '民主進步黨': 'DPP', '民進黨': 'DPP', '中國國民黨': 'KMT', '國民黨': 'KMT', '台灣民眾黨': 'TPP', '民眾黨': 'TPP', '時代力量': 'NPP', '親民黨': 'PFP',
    '新黨': 'New Party', '台灣團結聯盟': 'TSU', '台聯': 'TSU', '無黨團結聯盟': 'NPSU', '無盟': 'NPSU', '時力': 'NPP', '基進': 'TSR', '無黨籍': 'Independent', '綠黨': 'Green Party', '社會民主黨': 'SDP',
    '台灣基進': 'TSR', '民主聯盟': 'Democratic Alliance', '（未載）': '(not recorded)'
  };
  // the 16 recognised peoples and the Pingpu groups, by their own names (CIP usage)
  var TRIBE = {
    '阿美': 'Amis', '泰雅': 'Atayal', '排灣': 'Paiwan', '布農': 'Bunun', '卑南': 'Puyuma', '魯凱': 'Rukai', '鄒': 'Tsou', '賽夏': 'Saisiyat', '達悟': 'Tao',
    '邵': 'Thao', '噶瑪蘭': 'Kavalan', '太魯閣': 'Truku', '撒奇萊雅': 'Sakizaya', '賽德克': 'Seediq', '拉阿魯哇': "Hla'alua", '卡那卡那富': 'Kanakanavu',
    '巴宰': 'Pazeh', '巴賽': 'Basay', '羅亞': 'Lloa', '雷朗': 'Luilang', '噶哈巫': 'Kaxabu', '大武壠': 'Taivoan', '巴布薩': 'Babuza', '拍瀑拉': 'Papora',
    '西拉雅': 'Siraya', '道卡斯': 'Taokas', '阿立昆': 'Arikun', '馬卡道': 'Makatao', '跨族混居': 'Mixed'
  };
  var OUTLET = {
    '自由時報': 'Liberty Times', '中央社': 'CNA', '聯合報': 'United Daily News', '中時': 'China Times', '中國時報': 'China Times', '公視': 'PTS',
    '風傳媒': 'Storm Media', '新頭殼': 'Newtalk', '報導者': 'The Reporter', '關鍵評論網': 'The News Lens', '遠見': 'Global Views', '更生新聞網': 'Keng Sheng Daily News',
    '花蓮新聞雲': 'Hualien News Cloud', '太報': 'Taisounds', '維基百科': 'Wikipedia', '上報': 'Up Media', '鏡週刊': 'Mirror Media', '民視': 'FTV', '信傳媒': 'CM Media'
  };
  var PERSON = {
    '謝長廷': 'Frank Hsieh', '馬英九': 'Ma Ying-jeou', '蔡英文': 'Tsai Ing-wen', '宋楚瑜': 'James Soong', '朱立倫': 'Eric Chu', '韓國瑜': 'Han Kuo-yu',
    '賴清德': 'Lai Ching-te', '侯友宜': 'Hou Yu-ih', '柯文哲': 'Ko Wen-je', '蕭美琴': 'Hsiao Bi-khim', '趙少康': 'Jaw Shaw-kong', '吳欣盈': 'Cynthia Wu',
    '蕭萬長': 'Vincent Siew', '吳敦義': 'Wu Den-yih', '蘇嘉全': 'Su Jia-chyuan', '陳建仁': 'Chen Chien-jen', '王如玄': 'Wang Ju-hsuan', '林洋港': 'Lin Yang-kang',
    '傅崐萁': 'Fu Kun-chi', '徐榛蔚': 'Hsu Chen-wei', '饒穎奇': 'Rao Ying-chi', '饒慶鈴': 'Rao Ching-ling', '黃健庭': 'Justin Huang', '陳瑩': 'Chen Ying',
    '谷辣斯．尤達卡': 'Kolas Yotaka', '馬文君': 'Ma Wen-chun', '林明溱': 'Lin Ming-chen', '許淑華': 'Hsu Shu-hua'
  };
  var UI = {
    '人': ' people', '人口': 'Pop.', '市議員選舉': 'City council election', '縣議員選舉': 'County council election', '市議員': 'city councilor',
    '前屆無此候選人': 'No such candidate last time', '直轄市山地原住民區長': 'Indigenous district head', '直轄市山地原住民區長選舉': 'Indigenous district head election',
    '直轄市山地原住民區': 'indigenous districts', '區民代表會': 'District council', '區民代表會主席': 'District council chair', '區民代表會副主席': 'District council vice-chair', '鄉鎮底色＝核定部落族別（多族斜紋）': 'Township fill = people of its recognised communities (stripes: several)',
    '村里底色＝核定部落族別（多族斜紋）': 'Village fill = people of its recognised communities (stripes: several)', '核定部落（顏色＝族別）': 'Recognised community (colour = people)',
    '西拉雅族已核定、尚無核定部落：依聚落所在鄉鎮上色': 'Siraya: recognised, no recognised community yet — townships with its settlements filled',
    '西拉雅族已核定、尚無核定部落：依聚落所在村里上色': 'Siraya: recognised, no recognised community yet — villages with its settlements filled',
    '族人聚落（不在核定名單）': 'Settlement (not on the recognised list)', '平埔族群（': 'Pingpu groups (', '位置不準確': 'location approximate', '）': ')',
    '今日聚落・有祭儀': 'Settlement today, with rites', '今日後裔聚落': 'Descendant settlement today', '祭祀地': 'Place of worship',
    '淡色／細斜線＝今日聚落所在鄉鎮': 'Light fill / thin stripes = township with a settlement today', '淡色／細斜線＝今日聚落所在村里': 'Light fill / thin stripes = village with a settlement today',
    '虛線圈＝位置示意（村里不在官方界圖上）': 'Dashed ring = approximate (village not on the official boundary map)', '部落數': 'Comm.', '鄉鎮數': 'Twps', '只看': 'Show', '族人聚落': 'Settlements',
    '部落＝原民會核定部落（原民會「原住民族部落位置GIS點位表」，data.gov.tw，2022-07 版）；族人聚落＝原民會族群介紹列出、但不在核定部落名單；平埔族群的狀態依原民會 2026-10，位置只到鄉鎮或里（新聞、維基百科、論文整理）。點一列只看該族，再點一次取消。': "Communities = the CIP's recognised communities (CIP 'Indigenous community GIS points', data.gov.tw, 2022-07); Settlements = listed in the CIP's peoples pages but not among the recognised communities; Pingpu status as of CIP 2026-10, located to township or village only (news, Wikipedia, papers). Click a row to show only that people; click again to clear.", '兄': 'elder brother', '夫': 'husband', '妻': 'wife', '弟': 'younger brother', '無': 'none', '父': 'father', '代表': 'representative',
    '兒子': 'son', '全部': 'All', '國代': 'National Assembly', '女兒': 'daughter', '姊夫': 'brother-in-law', '姪孫': 'grandnephew', '展開': 'Expand',
    '市長': 'mayor', '族別': 'People', '概況': 'Overview', '狀態': 'Status', '立委': 'legislator', '翻盤': 'Flip', '補選': 'By-election', '議員': 'councilor',
    '議長': 'Speaker', '遺孀': 'widow', '部落': 'Community', '鄉鎮': 'Township', '長子': 'eldest son', '來源：': 'Sources: ', '副議長': 'Deputy Speaker',
    '小舅子': "wife's younger brother", '審議中': 'Under review', '已核定': 'Recognised', '已申請': 'Applied', '未申請': 'Not applied', '村里長': 'Village chiefs',
    '無資料': 'No data', '省議員': 'Provincial councilor', '縣市長': 'Mayor / magistrate', '選舉區': 'Constituency', '黨籍：': 'Party: ', '一般地圖': 'Standard map',
    '一般地圖 ▾': 'Standard map ▾', '一般地圖 ▴': 'Standard map ▴', '中央選舉': 'National elections', '其他來源': 'Other sources', '勢力範圍': 'Sphere of influence',
    '區域立委': 'District legislators', '原住民族': 'Indigenous peoples', '地方選舉': 'Local elections', '市長選舉': 'Mayoral election', '政治家族': 'Political families',
    '效能計時': 'Timing', '▸ 計時': '▸ Timing', '族別未載': 'People not recorded', '縣市議員': 'Councilors', '縣長選舉': 'Magistrate election', '總統選舉': 'Presidential election',
    '選舉人數': 'Electorate', '鄉鎮市區': 'Townships', '鄉鎮市長': 'Township mayors', '原住民立委': 'Indigenous legislators', '原住民議員': 'Indigenous councilors',
    '市議會組成': 'City council', '縣議會組成': 'County council', '草稿・待審': 'Draft · pending review', '鄉鎮市區長': 'Township heads', '不分區政黨票': 'Party-list vote',
    '不分區': 'Party list', '中央選舉簡史': 'National elections: history', '地方選舉簡史': 'Local elections: history', '原住民族部落': 'Indigenous communities',
    '議長・副議長': 'Speaker · Deputy', '鄉鎮市民代表': 'Township representatives', '鄉鎮市長選舉': 'Township mayor election', '鄉鎮市民代表會': 'Township council',
    '來源（點開查看）': 'Sources (click to open)', '廢票（佔投票數）': 'Invalid (share of ballots)', '投票數（投票率）': 'Ballots cast (turnout)',
    '前屆無此政黨候選人': 'No candidate from this party last time', '前屆無此政黨／候選人': 'No such party / candidate last time', '本專案尚無驗證資料': 'No verified data yet',
    '村里長（尚未實作）': 'Village chiefs (not built yet)', '鄉鎮市民代表（尚未實作）': 'Township representatives (not built yet)', '縣級（縣長・立委）': 'County level (magistrate · legislators)',
    '鄉鎮市民代表會主席': 'Township council chair', '鄉鎮市民代表會副主席': 'Township council vice-chair', '消長（各屆當選席次）': 'Seats won, by election',
    '跨族混居（族別未載）': 'Mixed (people not recorded)', '地圖（累計至）': 'Map (up to)', '1994 年後無當選紀錄': 'No win since 1994', '據報導：': 'Reportedly: ',
    '本專案目前無村里長權威資料來源': 'No authoritative village-chief source yet', '圓點＝原民會核定部落（旁為部落名）': 'Dots = CIP-recognised communities (name beside)',
    '議員席次算進選區涵蓋的每個鄉鎮': "A council seat counts for every township in the member's district",
    '光點依人口分布呈現（非政黨配色）': 'Light points show where people live (not party colours)',
    '這段期間沒有鄉鎮層級的席次（縣長、立委不分鄉鎮）': 'No township-level seats in this period (magistrate and legislators are county-wide)',
    '本區為直轄市轄區，區長為官派，無區長／區民代表選舉': 'A special-municipality district: its head is appointed — no district head or council elections',
    '本鄉鎮市區沒有核定部落，也沒有列入的平埔族群資料。': 'No recognised communities and no listed Pingpu groups here.',
    '族人聚落（原民會族群介紹列出，不在核定部落名單）': "Settlements (in the CIP's peoples pages, not on the recognised list)",
    '×數 = 在該鄉鎮當選的席次（議員算進選區涵蓋的每個鄉鎮）': "×n = seats won in that township (a council seat counts for every township in the district)",
    '顏色＝族別（多族部落的圓點依族別分色）': 'Colour = people (communities of several peoples split by colour)',
    '左：議會最大黨／群體 右：選區最高票政黨': 'Left: largest party / group in the council · Right: top party in the district',
    '平埔族群（原民會 2026-10 狀態）': 'Pingpu groups (CIP status, 2026-10)', '（保留區：模式專屬控制項，Profile 目前無需使用）': '(reserved for mode controls — none needed in Profile)',
    '成員、當選紀錄與黨籍（藍：中選會 1994 起；灰：據報導，可點開來源；黨籍：歷次參選登記）': 'Members, wins and party (blue: CEC records from 1994; grey: reported — click for the source; party: as registered at each run)',
    '核定部落：原民會「原住民族部落位置GIS點位表」（data.gov.tw，2022-07 版）': "Recognised communities: CIP 'Indigenous community GIS points' (data.gov.tw, 2022-07)",
    '光點 = 人口（內政部村里戶籍人口 115年9月，依 WorldPop 100m 網格分布，位置為推估示意）': 'Light points = population (MOI village household registration, Sep 2026, spread on the WorldPop 100 m grid; positions are estimates)',
    '平埔族群（原民會 2026-10 狀態；位置只到鄉鎮或里；括號＝列出的社址／聚落數）': 'Pingpu groups (CIP status 2026-10; located to township or village only; brackets = listed sites / settlements)',
    '實心球面積＝人數（同一比例尺，各屆可直接比較）；虛線外框只表示「已投票」與「選舉人數」分組，大小不代表人數；增減為對比 2018 年': 'Solid ball area = people (one scale, comparable across elections); dashed outlines only group "voted" and "electorate" — their size is not a count; changes vs 2018',
    '實心球面積＝人數（同一比例尺，各屆可直接比較）；虛線外框只表示「已投票」與「選舉人數」分組，大小不代表人數；增減為對比 2020 年': 'Solid ball area = people (one scale, comparable across elections); dashed outlines only group "voted" and "electorate" — their size is not a count; changes vs 2020',
    '灰階 = 人口（LEGIS_CC_ELIG，2024選務登記人口，非戶政普查）': 'Grey scale = population (LEGIS_CC_ELIG, 2024 electoral register, not the household census)',
    '移到地圖查看資料': 'Hover the map for details', 'PROFILE': 'PROFILE',
    '族': '', '其他': 'Others', '廢票': 'Invalid', '未投票': 'Did not vote', '縣長': 'Magistrate', '議會': 'Council', '總統': 'President',
    '個，分布在': ' communities, in ', '個鄉鎮市區': ' townships', '・17–18 世紀社址': ' · 17th–18th-century site',
    '代夫出征（2009 縣議員）': 'Wives standing in (2009 county council)', '曾任臺東縣長（第六、七任）・據報導': 'Former Taitung County magistrate (6th and 7th terms) · reportedly',
    '本專案目前無該年度資料（2022年鄉鎮市民代表資料尚未取得，非2018年資料内插）': 'No data for this year yet (2022 township-representative data not obtained; not interpolated from 2018)',
    '移到／點擊新竹縣、彰化縣、南投縣、雲林縣、屏東縣、臺東縣、花蓮縣、基隆市、臺北市、高雄市、新北市、臺中市、臺南市、桃園市查看縣市概覽': 'Hover / click Hsinchu County, Changhua, Nantou, Yunlin, Pingtung, Taitung, Hualien, Keelung, Taipei, Kaohsiung, New Taipei, Taichung, Tainan or Taoyuan for a profile'
  };
  // 「所有實心球加起來的面積＝選舉人數。只比較本X各屆…」 legend notes
  var BALL = { '縣': 'county', '村里': 'village', '選區': 'district', '鄉鎮市': 'township' };
  var KIND = { '立委': 'legislators', '議員': 'councilors', '代表': 'representatives', '縣市長': 'mayor / magistrate', '鄉鎮市長': 'township mayor', '國代': 'National Assembly', '省議員': 'provincial councilor', '其他來源': 'other sources', '村里長': 'village chief' };
  var REL = { '之子': "'s son", '之妻': "'s wife", '之弟': "'s brother", '叔公': "'s great-uncle", '伯父': "'s uncle", '姊姊': "'s elder sister", '小弟': "'s youngest brother",
              '母親': "'s mother", '父親': "'s father", '胞妹': "'s younger sister", '胞弟': "'s younger brother", '大兒子': "'s eldest son", '小兒子': "'s youngest son" };
  var SURNAME = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董温溫唐藍石蔣古紀姚連馮歐程湯黃田康姜白汪鄒尤巫鐘黎涂龔嚴韓袁金童陸夏柳凃邵錢伍倪溫于史饒鄺黄孟崔熊湛苗谷雷鄔';

  function P() { return window.pinyinPro && window.pinyinPro.pinyin ? window.pinyinPro : null; }
  function syl(s) { var p = P(); if (!p) return null; try { return p.pinyin(s, { toneType: 'none', type: 'array' }); } catch (e) { return null; } }
  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function person(n) {
    if (PERSON[n]) return PERSON[n];
    var C = typeof PLACE_EN !== 'undefined' ? PLACE_EN.cand : {};
    if (C[n]) return C[n];
    var s = syl(n); if (!s || !s.length) return n;
    return s.length === 1 ? cap(s[0]) : cap(s[0]) + ' ' + cap(s[1]) + s.slice(2).map(function (x) { return '-' + x; }).join('');
  }
  // a surname alone (傅 → Fu)
  function surname(c) { var y = syl(c); return y && y[0] ? cap(y[0]) : c; }
  function isPerson(s) { return /^[㐀-鿿]{2,4}$/.test(s) && SURNAME.indexOf(s.charAt(0)) >= 0 && !/[鄉鎮市區村里縣族家黨會]$/.test(s); }
  var SUF = { '市': 'City', '鎮': 'Town', '鄉': 'Township', '區': 'District', '村': 'Village', '里': 'Village' };
  // official forms that are not plain pinyin: a township sharing its county's name keeps the county's spelling
  // (花蓮市 → Hualien City, not 「Hualian」), plus the long-established Lukang / Tamsui
  var TOWN_OFFICIAL = { '鹿港鎮': 'Lukang Township', '淡水區': 'Tamsui' };
  function place(s, vc) {
    if (COUNTY[s]) return COUNTY[s];
    if (TOWN_OFFICIAL[s]) return TOWN_OFFICIAL[s];
    var cm = s.match(/^([㐀-鿿]{2})([市鎮鄉區])$/);
    if (cm) { var cy = COUNTY[cm[1] + '縣'] || COUNTY[cm[1] + '市']; if (cy) return cy.replace(/ (County|City)$/, '') + (cm[2] === '區' ? '' : ' ' + SUF[cm[2]]); }
    if (vc && typeof PLACE_EN !== 'undefined' && PLACE_EN.village[vc]) return PLACE_EN.village[vc];
    var m = s.match(/^([㐀-鿿]{1,5})([鄉鎮市區村里])$/); if (!m) return null;
    var y = syl(m[1]); if (!y) return null;
    // pinyin spelling rule: an a / e / o syllable after another takes an apostrophe (吉安 → Ji'an, not 「Jian」)
    // a 區 is the name alone — no 「District」 (user 2026-10-31: 「英文的區的district應該要刪掉」)
    var nm = cap(y.map(function (x, i) { return i && /^[aeo]/.test(x) ? "'" + x : x; }).join(''));
    return m[2] === '區' ? nm : nm + ' ' + SUF[m[2]];
  }
  // an office, with or without its place: 「南投縣議員」「信義鄉長」「立委」「花蓮市民代表」
  function office(t) {
    var r;
    if (t === '立委' || t === '區域立委') return 'legislator';
    if (t === '不分區立委') return 'at-large legislator';
    if (t === '國大代表') return 'National Assembly delegate';
    if (t === '臺灣省議員') return 'Taiwan provincial councilor';
    if ((r = t.match(/^(.+[縣市])議員$/))) return (place(r[1]) || r[1]) + ' councilor';
    if ((r = t.match(/^(.+縣)長$/)) && COUNTY[r[1]]) return COUNTY[r[1]] + ' magistrate';
    if ((r = t.match(/^(.+市)長(（補選）)?$/)) && COUNTY[r[1]]) return COUNTY[r[1]] + ' mayor' + (r[2] ? ' (by-election)' : '');
    if ((r = t.match(/^(.+[鄉鎮市區])長(（補選）)?$/))) return (place(r[1]) || r[1]) + ' mayor' + (r[2] ? ' (by-election)' : '');
    if ((r = t.match(/^(.+[鄉鎮市區])民代表$/))) return (place(r[1]) || r[1]) + ' representative';
    if ((r = t.match(/^(.+[鄉鎮市區])(村|里)長$/))) return (place(r[1]) || r[1]) + ' village chief';
    return null;
  }
  function tribe(s) { var m = s.match(/^(.+?)族?$/); return m && TRIBE[m[1]] ? TRIBE[m[1]] : null; }
  function joinMap(s, sep, outSep, f) {   // every piece known, else null
    var parts = s.split(sep), out = [];
    for (var i = 0; i < parts.length; i++) { var t = f(parts[i].trim()); if (t == null) return null; out.push(t); }
    return out.join(outSep);
  }
  function word(x) { return /^[A-Za-z0-9 .,'’()\-–]+$/.test(x) ? x : (x.indexOf('・') < 0 ? tr(x, null) : null); }

  // one string (a whole text node or title), English; null = leave it
  // family texts with their own English (data_families.js FAMILIES_EN; {人名} / {@地名} filled here)
  function fill(x) { return x.replace(/\{(@?)([^}]+)\}/g, function (_, at, n) { return at ? (place(n) || COUNTY[n] || n) : person(n); }); }
  function tr(s, el) {
    var m, r, t;
    if (typeof FAMILIES_EN !== 'undefined' && FAMILIES_EN[s]) return fill(FAMILIES_EN[s]);
    if (UI[s] != null) return UI[s];
    if (PARTY[s]) return PARTY[s];
    if (COUNTY[s]) return COUNTY[s];
    if (PERSON[s]) return PERSON[s];
    if ((t = tribe(s))) return t;
    var vc = el && el.closest && el.closest('[data-vc]'); vc = vc && vc.getAttribute('data-vc');
    if ((t = place(s, vc))) return t;
    // 縣市議員 sheet note: 「第3選區・應選 6 席・仁武區自己的得票（✓＝當選）」
    if ((m = s.match(/^第(\d+)選區・應選 (\d+) 席・(.+)自己的得票（✓＝當選）$/))) return 'District ' + m[1] + ' · ' + m[2] + ' seats · votes in ' + (place(m[3], null) || m[3]) + ' (✓ = elected)';
    if ((m = s.match(/^(\d{4}) (.+)$/)) && (t = office(m[2]) || (m[2] === '立委' ? 'legislator' : null) || (m[2] === '補選' ? 'by-election' : null))) return m[1] + ' ' + t;
    if ((m = s.match(/^(\d{4}) 年：(.+)$/)) && (t = joinMap(m[2], '、', ', ', function (x) { var q = x.match(/^(.+?) (\d+) 席$/); return q && KIND[q[1]] ? KIND[q[1]] + ' ' + q[2] : null; }))) return m[1] + ': ' + t;
    if ((m = s.match(/^、(.+)$/)) && (t = tr(m[1], el))) return ', ' + t;
    if ((m = s.match(/^(.+?)部落（(.+?)） (.+)$/)) && (t = tr(m[3], el))) return m[2] + ' (' + t + ')';
    if ((m = s.match(/^(.+?)部落（(.+?)）$/))) return m[2];
    if ((m = s.match(/^([㐀-鿿]{1,6})部落$/)) && syl(m[1])) return cap(syl(m[1]).join('')) + ' community';
    if ((m = s.match(/^([㐀-鿿]{1,4})社$/)) && syl(m[1])) return cap(syl(m[1]).join('')) + ' (old site)';
    if ((m = s.match(/^([㐀-鿿])([㐀-鿿])(夫妻|姻親)$/))) return surname(m[1]) + '–' + surname(m[2]) + (m[3] === '夫妻' ? ' couple' : ' in-laws');
    if ((m = s.match(/^[㐀-鿿．·]+ ([A-Za-z].*)$/))) return m[1];
    if (typeof PLACE_EN !== 'undefined' && PLACE_EN.cand[s]) return PLACE_EN.cand[s];
    if ((m = s.match(/^上屆(\d+)席$/))) return m[1] + ' last term';
    if ((m = s.match(/^(\d+) 人$/))) return m[1] + (m[1] === '1' ? ' member' : ' members');
    if ((m = s.match(/^(.+) ×(\d+)$/)) && (t = place(m[1]))) return t + ' ×' + m[2];
    if ((m = s.match(/^第(\d+)選舉區$/))) return 'Constituency ' + m[1];
    if ((m = s.match(/^第(\d+)選舉區｜(平地|山地)原住民・(.+)$/))) {
      var where = m[3].replace(/^全(縣|市)$/, 'whole ' + (m[3] === '全縣' ? 'county' : 'city'));
      var q = m[3].match(/^(.+?)等(\d+)(鄉鎮市|區)$/);
      if (q) where = (place(q[1]) || q[1]) + ' and ' + (q[2] - 1) + ' more';
      else if (!/^whole/.test(where)) where = place(m[3]) || (m[3].replace(/線$/, '') !== m[3] ? (syl(m[3].replace(/線$/, '')) ? cap(syl(m[3].replace(/線$/, '')).join('')) + ' line' : m[3]) : m[3]);
      return 'Constituency ' + m[1] + ' | ' + (m[2] === '平地' ? 'lowland' : 'highland') + ' indigenous · ' + where;
    }
    if ((m = s.match(/^(第\d+選舉區|選舉區|縣長選舉|市長選舉)（(.+)自己的得票）$/))) return (tr(m[1]) || m[1]) + ' (' + (place(m[2]) || m[2]) + "'s own vote)";
    if ((m = s.match(/^鄉鎮市長選舉（(.+)全鎮\/鄉得票，非本村里獨立選舉）$/))) return 'Township mayor election (' + (place(m[1]) || m[1]) + "'s whole vote — not a village race)";
    if ((m = s.match(/^(\d+) 個村里（點擊選取）$/))) return m[1] + ' villages (click to select)';
    if ((m = s.match(/^(\d+) 個鄉鎮市（點擊進入鄉鎮）$/))) return m[1] + ' townships (click to open)';
    if ((m = s.match(/^(\d+) 個行政區（點擊進入行政區）$/))) return m[1] + ' districts (click to open)';
    if ((m = s.match(/^PROFILE · (.+)$/)) && (t = place(m[1]) || COUNTY[m[1]])) return 'PROFILE · ' + t;
    if ((m = s.match(/^台灣 · (\d+) 縣市$/))) return 'Taiwan · ' + m[1] + ' counties';
    if (/ · /.test(s) && (t = joinMap(s, ' · ', ' · ', function (x) { return /^[A-Za-z ]+$/.test(x) ? x : (place(x) || COUNTY[x]); }))) {
      return t.split(' · ').filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' · ');   // 「Nantou County · Nantou County」 once
    }
    if ((m = s.match(/^只看(.+)（再點一次取消）$/))) return 'Only ' + (TRIBE[m[1]] || m[1]) + ' (click again to clear)';
    if ((m = s.match(/^(.+?)族?・(.+[村里])$/)) && TRIBE[m[1]]) return TRIBE[m[1]] + ' · ' + (place(m[2], vc) || m[2]);
    if ((m = s.match(/^(.+?)族? (\d+)$/)) && TRIBE[m[1]]) return TRIBE[m[1]] + ' ' + m[2];
    if ((m = s.match(/^(.+)：核定部落$/)) && COUNTY[m[1]]) return COUNTY[m[1]] + ': recognised communities';
    if ((m = s.match(/^核定部落 (\d+) 個（原住民族委員會）$/))) return m[1] + ' recognised communities (Council of Indigenous Peoples)';
    if ((m = s.match(/^([㐀-鿿])家$/))) return surname(m[1]) + ' family';
    if ((m = s.match(/^([㐀-鿿])家（(.+)）$/))) return surname(m[1]) + ' family (' + person(m[2]) + ')';
    if ((m = s.match(/^(.+)・勢力範圍（全部年份）$/))) return (tr(m[1]) || m[1]) + ' · sphere of influence (all years)';
    if ((m = s.match(/^([㐀-鿿]{2,4})(之子|之妻|之弟|叔公|伯父|姊姊|小弟|母親|父親|胞妹|胞弟|大兒子|小兒子)$/)) && isPerson(m[1])) return person(m[1]) + REL[m[2]];
    if ((m = s.match(/^(；?)([㐀-鿿]{2,4}) (.+)$/)) && isPerson(m[2]) && (t = office(m[3]))) return (m[1] ? '; ' : '') + person(m[2]) + ' ' + t;
    if (/／/.test(s) && (t = joinMap(s, '／', ' / ', function (x) { return PARTY[x] || (isPerson(x) || PERSON[x] ? person(x) : null); }))) return t;
    if ((m = s.match(/^據報導：(.+)$/))) { t = tr(m[1]) || reported(m[1]); return t ? 'Reportedly: ' + t : null; }
    if ((m = s.match(/^曾任(.+)・據報導$/)) && (t = office(m[1]))) return 'Former ' + t + ' · reportedly';
    if ((m = s.match(/^(\d{4}) (.+)（補選）・據報導$/)) && (t = office(m[2]))) return m[1] + ' ' + t + ' (by-election) · reportedly';
    if ((m = s.match(/^(.+)（(尚未實作)）$/)) && UI[m[1]]) return UI[m[1]] + ' (not built yet)';
    if ((m = s.match(/^所有實心球加起來的面積＝選舉人數。只比較本(縣|村里|選區|鄉鎮市)各屆，不可與其他.+比大小。(前 4 名以外併入「其他」。)?得票率以有效票為分母；資料：中選會原始選舉資料$/)))
      return 'All solid balls together = the electorate. Compare this ' + BALL[m[1]] + "'s elections only, not other " + BALL[m[1]] + 's. ' + (m[2] ? 'Beyond the top 4: "Others". ' : '') + 'Shares of valid votes; data: CEC raw files';
    if (el && el.closest && el.closest('a') && (m = s.match(/^([^\s〈（]+)(.*)$/)) && OUTLET[m[1]]) return OUTLET[m[1]] + m[2];
    if (s.indexOf('・') >= 0 && (t = joinMap(s, '・', ' · ', word))) return t;   // only with a 「・」 (else word → tr loops on the same string)
    if (isPerson(s.replace(/^✔/, ''))) return (s.charAt(0) === '✔' ? '✔' : '') + person(s.replace(/^✔/, ''));
    return null;
  }
  function reported(x) {   // 「曾任縣議員」「縣議會議長」「前縣議會議長」「曾任省議員、國大代表」 …
    var m, t;
    if ((m = x.match(/^曾任(.+)$/)) && (t = joinMap(m[1], '、', ', ', function (o) { return office(o) || ({ '縣議員': 'county councilor', '省議員': 'provincial councilor', '國大代表': 'National Assembly delegate', '花蓮市民代表': 'Hualien City representative' })[o] || null; }))) return 'formerly ' + t;
    var X = { '縣議會議長': 'county council speaker', '前縣議會議長': 'former county council speaker', '前立法院副院長': 'former Deputy Speaker of the Legislative Yuan',
              '前南投市民代表會主席': 'former chair of the Nantou City council', '前南投市民代表會副主席': 'former vice-chair of the Nantou City council',
              '前臺東縣長、原民會主委': 'former Taitung County magistrate, CIP minister', '花蓮市民代表會主席（2025）': 'chair of the Hualien City council (2025)' };
    return X[x] || null;
  }

  // ── apply / restore ──
  function enNode(n) {
    var raw = n.nodeValue, s = raw.replace(/\s+/g, ' ').trim();
    if (!s || !CJK.test(s)) return;
    if (n.__v2en != null && raw === n.__v2en) return;
    var t = tr(s, n.parentElement); if (t == null || t === s) return;
    n.__v2zh = raw; n.__v2en = raw.replace(raw.trim(), t); n.nodeValue = n.__v2en;
  }
  function enAttr(el) {
    var s = el.getAttribute('title'); if (!s || !CJK.test(s) || (el.__v2tEn && s === el.__v2tEn)) return;
    var t = tr(s.replace(/\s+/g, ' ').trim(), el); if (t == null) return;
    el.__v2tZh = s; el.__v2tEn = t; el.setAttribute('title', t);
  }
  function walk(root, fn) {
    if (!root) return;
    if (root.nodeType === 3) { fn(root); return; }
    if (root.nodeType !== 1 || root.closest && root.closest('script,style')) return;
    var tw = document.createTreeWalker(root, 4), n; while ((n = tw.nextNode())) { if (!n.parentElement.closest('script,style')) fn(n); }
  }
  function applyAll() {
    if (lang === 'en') {
      walk(document.body, enNode);
      document.querySelectorAll('[title]').forEach(enAttr);
    } else {
      walk(document.body, function (n) { if (n.__v2zh != null && n.nodeValue === n.__v2en) { n.nodeValue = n.__v2zh; n.__v2en = null; } });
      document.querySelectorAll('[title]').forEach(function (el) { if (el.__v2tZh && el.getAttribute('title') === el.__v2tEn) { el.setAttribute('title', el.__v2tZh); el.__v2tEn = null; } });
    }
    document.querySelectorAll('[data-zh][data-en]').forEach(function (el) { el.textContent = el.getAttribute('data-' + lang); });
    dedupe();
  }
  // a header's English subtitle (.t2) that now repeats the translated title (.t1): hidden in English
  function dedupe() {
    document.querySelectorAll('.t2').forEach(function (t2) {
      var t1 = t2.previousElementSibling && t2.previousElementSibling.classList.contains('t1') ? t2.previousElementSibling : null;
      var same = lang === 'en' && t1 && t1.textContent.trim() === t2.textContent.trim();
      if (same && !t2.__v2hid) { t2.__v2hid = t2.style.display || '-'; t2.style.display = 'none'; }
      else if (!same && t2.__v2hid) { t2.style.display = t2.__v2hid === '-' ? '' : t2.__v2hid; t2.__v2hid = null; }
    });
  }
  // only what changed, batched per frame
  var pending = [], queued = false;
  function onMut(muts) {
    if (lang !== 'en') return;
    muts.forEach(function (m) {
      if (m.type === 'characterData') pending.push(m.target);
      else if (m.type === 'attributes') { if (m.target.nodeType === 1) pending.push({ attr: m.target }); }
      else [].forEach.call(m.addedNodes, function (n) { pending.push(n); });
    });
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }
  function flush() {
    queued = false;
    var list = pending; pending = [];
    list.forEach(function (n) {
      if (n.attr) { enAttr(n.attr); return; }
      walk(n, enNode);
      if (n.nodeType === 1) { if (n.hasAttribute('title')) enAttr(n); n.querySelectorAll && n.querySelectorAll('[title]').forEach(enAttr); }
    });
    dedupe();
  }
  function toggle() {
    var box = document.createElement('div');
    box.id = 'v2-lang'; box.className = 'v2-lang';   // .v2-lang: disclaimer.js reads the language from it
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Language');
    box.style.cssText = 'display:inline-flex;border:1px solid rgba(255,255,255,.09);border-radius:8px;overflow:hidden;margin-right:8px;background:rgba(5,5,10,.6)';
    box.innerHTML = ['zh', 'en'].map(function (l) {
      return '<button type="button" data-lang="' + l + '" aria-pressed="' + (lang === l) + '" style="font:inherit;font-size:11.5px;font-weight:600;color:#e7eaf0;border:0;padding:5px 10px;cursor:pointer;background:' + (lang === l ? 'rgba(40,200,200,.22)' : 'transparent') + '">' + (l === 'zh' ? '中文' : 'EN') + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]'); if (!b || b.getAttribute('data-lang') === lang) return;
      lang = b.getAttribute('data-lang');
      try { localStorage.setItem('v2_lang', lang); } catch (er) {}
      [].forEach.call(box.querySelectorAll('button'), function (x) { var on = x.getAttribute('data-lang') === lang; x.setAttribute('aria-pressed', String(on)); x.style.background = on ? 'rgba(40,200,200,.22)' : 'transparent'; });
      document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
      applyAll();
    });
    var host = document.getElementById('top-right-controls');
    if (host) { host.style.display = 'flex'; host.style.alignItems = 'center'; host.appendChild(box); }   // last: 色盲友善 (profile.html) sits left of it
    else document.body.appendChild(box);
  }
  function boot() {
    if (!window.pinyinPro) { var sc = document.createElement('script'); sc.src = PINYIN_SRC; sc.onload = function () { if (lang === 'en') applyAll(); }; document.head.appendChild(sc); }
    toggle();
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
    new MutationObserver(onMut).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] });
    applyAll();
  }
  window.V2ProfileEn = { tr: tr, apply: applyAll, lang: function () { return lang; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
