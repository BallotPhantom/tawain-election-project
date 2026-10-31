// Browser audit harness for v2/profile.html ball charts (county / township / village).
// Load in the page console:  (0,eval)(await (await fetch('/tests/browser_ball_harness.js?'+Math.random())).text()); await _init();
// Forces the reduced-motion path (final layout drawn synchronously) — the automation window reports
// visibilityState 'hidden', which freezes rAF/d3 timers, so the 750ms animation itself is not exercised.
(function () {
  var om = window.matchMedia.bind(window);
  window.matchMedia = function (q) { return /reduce/.test(q) ? { matches: true, media: q, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} } : om(q); };
  window.requestAnimationFrame = function (f) { Promise.resolve().then(function () { f(performance.now()); }); return 0; };
})();
window._errs = []; window.addEventListener('error', function (e) { window._errs.push(String(e.message)); });
window._K = {}; window._SIG = {}; window._cur = { ny: null, ly: null };
window._init = async function () {
  const txt = await (await fetch('/v2/profile.html?x=' + Math.random())).text();
  const grab = (name) => { const i = txt.indexOf('var ' + name + ' = ') + ('var ' + name + ' = ').length; let d = 0, j = i; for (; j < txt.length; j++) { const c = txt[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } } return JSON.parse(txt.slice(i, j + 1)); };
  window._D = { pres: grab('PRES_VC_LINEAGE'), legis: grab('LEGIS_VC_LINEAGE'), pl: grab('PL_VC_LINEAGE'), mayor: grab('MAYOR_VC_LINEAGE'), tc: grab('BALL_CHART_TC_CEC'), cc: grab('BALL_CHART_CEC'), presCC: grab('PRES_TURNOUT_CEC') };
  return Object.keys(_D.legis).length;
};
// expected balls: top 4 (per-candidate key for other/ind and same-party duplicates) + 其他 + 廢票 + 未投票
window._expect = function (d) { const s = d.cands.slice().sort((a, b) => b.votes - a.votes); const cnt = {}, dup = {}; s.forEach(c => { cnt[c.party] = (cnt[c.party] || 0) + 1; if (cnt[c.party] > 1) dup[c.party] = true; }); const key = c => (c.party === 'other' || c.party === 'ind' || dup[c.party]) ? 'cand:' + c.name : c.party; const top = s.slice(0, 4).map(key); const m = {}; let rest = 0; s.forEach(c => { if (top.includes(key(c))) m[key(c)] = c.votes; else rest += c.votes; }); if (rest > 0) m.rest = rest; m.invalid = d.invalid; m.nonvote = d.elig - d.cast; return m; };
window._conv = (l) => l ? { elig: l.elig, cast: l.cast, invalid: l.invalid, cands: (l.candidates || l.parties).map(c => ({ name: c.candidate || c.name || c.party, party: c.party, votes: c.votes })) } : null;
window._checkSvg = function (svg, d, scope, sigKey) {
  const issues = []; const exp = _expect(d); const sb = svg.getBoundingClientRect(); const balls = [...svg.querySelectorAll('g.ph-ball')]; const ks = [], cs = [];
  if (balls.length !== Object.keys(exp).length) issues.push('ballcount ' + balls.length + '!=' + Object.keys(exp).length);
  if (new Set(balls.map(g => g.getAttribute('data-k'))).size !== balls.length) issues.push('duplicate ball keys');
  balls.forEach(g => { const k = g.getAttribute('data-k'); const r = +g.querySelector('circle').getAttribute('r'); if (!(k in exp)) issues.push('unexpected ' + k); else if (exp[k] > 0) ks.push(r / Math.sqrt(exp[k])); cs.push(g.querySelector('circle').getBoundingClientRect()); });
  const kmin = Math.min(...ks), kmax = Math.max(...ks); if (kmax / kmin > 1.005) issues.push('k spread ' + (kmax / kmin).toFixed(4));
  const kk = (kmin + kmax) / 2; if (_K[scope] && Math.abs(_K[scope] / kk - 1) > 0.005) issues.push('k differs across years'); _K[scope] = _K[scope] || kk;
  let out_ = 0, minGap = 1e9; cs.forEach(b => { if (b.width > 0 && (b.left < sb.left - 0.5 || b.right > sb.right + 0.5 || b.top < sb.top - 0.5 || b.bottom > sb.bottom + 0.5)) out_++; });
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], b = cs[j]; if (!a.width || !b.width) continue; minGap = Math.min(minGap, Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2) - a.width / 2 - b.width / 2); }
  if (out_) issues.push(out_ + ' balls outside'); if (minGap < 1) issues.push('overlap ' + minGap.toFixed(2));
  const labs = balls.map(g => ({ k: g.getAttribute('data-k'), t: g.querySelector('text') })).filter(o => getComputedStyle(o.t).opacity !== '0').map(o => ({ k: o.k, b: o.t.getBoundingClientRect() })).filter(o => o.b.width > 0);
  const lo = [], lov = [], lcov = []; labs.forEach(o => { const b = o.b; if (b.left < sb.left - 2 || b.right > sb.right + 2 || b.top < sb.top - 2 || b.bottom > sb.bottom + 2) lo.push(o.k); });
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) { const a = labs[i].b, b = labs[j].b; const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 1 && oy > 1) lov.push(labs[i].k + 'x' + labs[j].k); }
  labs.forEach(o => { cs.forEach((c, ci) => { const bk = balls[ci].getAttribute('data-k'); if (bk === o.k || !c.width) return; const cx = Math.max(o.b.left, Math.min(c.x + c.width / 2, o.b.right)), cy = Math.max(o.b.top, Math.min(c.y + c.height / 2, o.b.bottom)); if (Math.hypot(c.x + c.width / 2 - cx, c.y + c.height / 2 - cy) < c.width / 2 - 1 && c.width / 2 < 14) lcov.push(o.k + '>' + bk); }); });
  if (lo.length) issues.push('labels outside ' + lo); if (lov.length) issues.push('label overlaps ' + lov); if (lcov.length) issues.push('label covers small ball ' + lcov);
  if (balls.some(g => +g.querySelector('circle').getAttribute('r') === 0 && exp[g.getAttribute('data-k')] > 0)) issues.push('r0 ball');
  // legend numbers: 選舉人數 / 投票數 / 未投票 / 廢票 rows must equal the record
  const legend = svg.nextElementSibling && svg.nextElementSibling.innerText.replace(/,/g, '');
  if (legend) [d.elig, d.cast, d.elig - d.cast, d.invalid].forEach(n => { if (legend.indexOf(String(n)) === -1) issues.push('legend lacks ' + n); });
  const sig = svg.querySelector('g.ph-root').getAttribute('transform') + ';' + balls.map(g => g.getAttribute('transform') + '/' + (+g.querySelector('circle').getAttribute('r')).toFixed(2) + '/' + g.querySelector('text').getAttribute('y')).join(';');
  if (_SIG[sigKey] && _SIG[sigKey] !== sig) issues.push('NONDETERMINISTIC'); _SIG[sigKey] = _SIG[sigKey] || sig;
  return issues;
};
window._epochOf = (cc, y) => ((cc === '10013' || cc === '10004' || cc === '64000' || cc === '66000' || cc === '67000') && y === '2016') ? 'e1' : 'e2';   // seeds with a 2016-only legislative epoch
window._auditVc = function (vc, ny, ly) {
  const out = []; const tc = vc.slice(0, 8); const exp = {};
  const p = _D.pres[vc] && _D.pres[vc][ny]; if (p) exp['bc-v-pres'] = [_conv(p), 'pres'];
  const l = _D.legis[vc] && _D.legis[vc][ny]; if (l) exp['bc-v-legis'] = [_conv(l), 'legis|' + l.ed + '|' + _epochOf(vc.slice(0, 5), ny)];
  const q = _D.pl[vc] && _D.pl[vc][ny]; if (q) exp['bc-v-pl'] = [_conv(q), 'pl'];
  const m = _D.mayor[vc] && _D.mayor[vc][ly]; if (m) exp['bc-v-mayor'] = [_conv(m), 'mayor'];
  const t = _D.tc[tc] && _D.tc[tc].townshipMayor[ly]; if (t) exp['bc-v-tmayor'] = [t, 'tmayor'];
  const svgs = [...document.querySelectorAll('#ic svg[id^="bc-"]')]; const have = svgs.map(s => s.id);
  Object.keys(exp).forEach(id => { if (!have.includes(id)) out.push(id + ':MISSING'); }); have.forEach(id => { if (!exp[id]) out.push(id + ':UNEXPECTED'); });
  for (const svg of svgs) { const e = exp[svg.id]; if (!e) continue; const yr = /mayor/.test(svg.id) ? ly : ny; const sc = (svg.id === 'bc-v-tmayor' ? tc : vc) + '|' + e[1];
    const iss = _checkSvg(svg, e[0], sc, vc + '|' + svg.id + '|' + e[1] + '|' + yr); out.push(svg.id + ':' + (iss.length ? iss.join('; ') : 'ok')); }
  return out;
};
window._auditTc = function (tc, ny, ly) {
  const out = []; const v = _D.tc[tc]; const eds = Object.keys(v.legislative[ny] || {}).sort();
  // 直轄市 / 省轄市 區 (63000-68000, 10017/10018/10020) have no 鄉鎮市長 race, so no bc-t-tmayor (page vars are not global) —
  // except the 直轄市山地原住民區 (elected 區長, cec_lib.INDIGENOUS_DISTRICTS)
  const indigenous = ['64000360', '64000370', '64000380', '65000290', '66000290', '68000130'].includes(tc);
  const expected = ['bc-t-pres', 'bc-t-pl', 'bc-t-mayor'].concat(/^(6[3-8]000|1001[78]|10020)/.test(tc) && !indigenous ? [] : ['bc-t-tmayor']).concat(eds.map((e, i) => 'bc-t-legis-' + i));
  const svgs = [...document.querySelectorAll('#ic svg[id^="bc-"]')]; const have = svgs.map(s => s.id);
  expected.forEach(id => { if (!have.includes(id)) out.push(id + ':MISSING'); }); if (have.length !== expected.length) out.push('svg ids ' + have.join(','));
  for (const svg of svgs) { const id = svg.id; let d, scope, yr = ny;
    if (id === 'bc-t-pres') { d = v.presidential[ny]; scope = 'pres'; } else if (id === 'bc-t-pl') { d = v.partylist[ny]; scope = 'pl'; } else if (id === 'bc-t-mayor') { d = v.mayor[ly]; scope = 'mayor'; yr = ly; } else if (id === 'bc-t-tmayor') { d = v.townshipMayor[ly]; scope = 'tmayor'; yr = ly; } else { const ed = eds[+id.split('-')[3]]; d = v.legislative[ny][ed]; scope = 'legis|' + ed + '|' + _epochOf(tc.slice(0, 5), ny); }
    if (!d) { out.push(id + ':no data'); continue; }
    const iss = _checkSvg(svg, d, tc + '|' + scope, tc + '|' + id + '|' + scope + '|' + yr); out.push(id + ':' + (iss.length ? iss.join('; ') : 'ok')); }
  return out;
};
window._set = async function (ny, ly) { if (ny) { window._setNationalYear(ny); _cur.ny = ny; } if (ly) { window._setLocalYear(ly); _cur.ly = ly; } for (let i = 0; i < 5; i++) await Promise.resolve(); };
window._yieldUI = () => Promise.resolve();   // setTimeout is throttled to 1s in the hidden automation window
window._goCounty = async function (cc, name) { _profileBackToTaiwan(); await new Promise(r => setTimeout(r, 500)); const h = [...document.querySelectorAll('.county-hit')].find(e => d3.select(e).datum().properties.cc === cc); h.dispatchEvent(new MouseEvent('click', { bubbles: true })); for (let i = 0; i < 35 && !document.getElementById('ic').innerText.startsWith(name); i++) await new Promise(r => setTimeout(r, 1000)); return document.getElementById('ic').innerText.slice(0, 3); };
window._goTc = async function (tc) { window._profileSelectTownship(tc); for (let i = 0; i < 80; i++) { if (document.querySelector('path.village-path') && document.querySelector('#ic svg#bc-t-pres') && document.getElementById('ih-label').textContent.indexOf(NM.t[tc]) !== -1) return true; await new Promise(r => setTimeout(r, 250)); } return false; };
window._goVc = async function (vc) { window._profileSelectVillage(vc); for (let i = 0; i < 5; i++) await Promise.resolve(); };
// every village of every township of the given counties × 9 year combos × rounds; also audits the township panel
window._runVc = async function (ccs, rounds) {
  const R = window._RV = { n: 0, checks: 0, tchecks: 0 };
  try {
    for (const [cc, name] of ccs) {
      await _goCounty(cc, name); const tcs = Object.keys(_D.tc).filter(k => k.startsWith(cc)).sort();
      for (const tc of tcs) {
        const ok = await _goTc(tc); if (!ok) { R[tc] = ['NAV FAIL']; continue; }
        const tbad = []; for (const ny of ['2016', '2020', '2024']) for (const ly of ['2014', '2018', '2022']) { await _set(ny, ly); _auditTc(tc, ny, ly).filter(x => !x.endsWith(':ok')).forEach(x => tbad.push(ny + '/' + ly + ' ' + x)); R.tchecks++; }
        if (tbad.length) R[tc] = tbad;
        const vcs = [...new Set([...document.querySelectorAll('path.village-path')].map(p => d3.select(p).datum().properties.vc))].sort();
        R.mapVillages = (R.mapVillages || 0) + vcs.length;
        for (const vc of vcs) {
          await _goVc(vc); const bad = [];
          for (let r = 0; r < rounds; r++) for (const ny of ['2016', '2020', '2024']) for (const ly of ['2014', '2018', '2022']) { await _set(ny, ly); _auditVc(vc, ny, ly).filter(x => !x.endsWith(':ok')).forEach(x => bad.push(ny + '/' + ly + ' ' + x)); R.checks++; }
          if (bad.length) R[vc] = bad; R.n++;
          await _yieldUI();
        }
        window._profileBackToTownship();
      }
    }
  } catch (e) { R.err = String(e) + e.stack; }
  R.done = true;
};
// random year switching + village hopping inside one township
window._randomVc = async function (tc, steps, seed) {
  const bad = []; const Y = ['2016', '2020', '2024'], L = ['2014', '2018', '2022']; seed = seed || 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const vcs = [...new Set([...document.querySelectorAll('path.village-path')].map(p => d3.select(p).datum().properties.vc))].sort();
  let vc = vcs[0]; await _goVc(vc);
  for (let i = 0; i < steps; i++) {
    const w = rnd();
    if (w < 0.3) { vc = vcs[Math.floor(rnd() * vcs.length)]; await _goVc(vc); }
    else await _set(w < 0.65 ? Y[Math.floor(rnd() * 3)] : null, w >= 0.65 ? L[Math.floor(rnd() * 3)] : null);
    _auditVc(vc, _cur.ny || '2024', _cur.ly || '2022').filter(x => !x.endsWith(':ok')).forEach(x => bad.push(i + ':' + vc + ' ' + x));
  }
  return { steps, bad };
};
window._summ = function (R) { const b = Object.entries(R).filter(([k, v]) => Array.isArray(v)); return JSON.stringify({ n: R.n, checks: R.checks, tchecks: R.tchecks, mapVillages: R.mapVillages, done: !!R.done, err: R.err || '', badKeys: b.length, sample: b.slice(0, 5), errs: _errs.slice(0, 5) }).slice(0, 4000); };
'harness loaded';
// Map-mode sanity (added 2026-10-16 after the 臺北市 縣市議員 blank map): for every county-grain map mode, the zoom
// transform must stay finite and the map must actually draw paths. council additionally needs its district shapes.
window._auditModes = async function () {
  const out = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const m of ['presidential', 'legislative', 'partylist', 'mayor', 'council']) {
    window._setMapMode(m); await wait(900);
    const tr = [...document.querySelectorAll('#mp svg g[transform]')].map(g => g.getAttribute('transform')).filter(t => /translate/.test(t));
    const bad = tr.filter(t => /NaN|Infinity|scale\(0\)/.test(t));
    const paths = [...document.querySelectorAll('#g-profile-map path')].filter(p => (p.getAttribute('d') || '').length > 2 && getComputedStyle(p).display !== 'none').length;
    const r = { paths, badTransform: bad.length };
    if (m === 'council') {
      r.distPaths = document.querySelectorAll('path.council-dist-path').length;
      // outlines are township unions (not V1's simplified shapes): signed area of all district loops == the county's townships
      const sa = g => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]).reduce((t, poly) => t + poly.reduce((u, ring) => u + ring.reduce((v, q, i) => i ? v + (ring[i - 1][0] * q[1] - q[0] * ring[i - 1][1]) / 2 : v, 0), 0), 0);
      const ds = d3.selectAll('path.council-dist-path').data(); const cc = (ds[0] && ds[0].properties.ed.split('_')[0]) || '';
      r.union = ds.filter(d => d.properties.geomSrc === 'township-union').length;
      const ua = ds.reduce((t, d) => t + sa(d.geometry), 0), ta = TC_GJ.features.filter(f => (f.properties.tc || '').startsWith(cc)).reduce((t, f) => t + sa(f.geometry), 0);
      r.areaErr = +(Math.abs(ua - ta) / Math.abs(ta)).toExponential(2);
      // no sliver loops (each one shows as a glowing dot on hover): every loop of a union outline ≥ 0.01 unit²
      r.slivers = ds.reduce((t, d) => t + (d.properties.geomSrc === 'township-union' ? d.geometry.coordinates.filter(poly => Math.abs(sa({ type: 'Polygon', coordinates: poly })) < 0.01).length : 0), 0);
    }
    r.ok = !bad.length && paths > 0 && (m !== 'council' || (r.distPaths > 0 && r.union === r.distPaths && r.areaErr < 1e-5 && r.slivers === 0));
    out[m] = r;
  }
  window._clearMapMode(); await wait(500);
  return out;
};
