import sys, re, math, json
sys.path.insert(0,'/private/tmp/claude-501/-Users-user/37a16a0f-1924-4555-9741-ade53f6a751a/scratchpad')
from loadjs import load
from datetime import datetime

PROJ = '.'
POLLS_2026 = load(f'{PROJ}/data_polls_2026.js', 'const POLLS_2026')
POLL_HOUSE_LEAN = load(f'{PROJ}/data_polls_2026.js', 'const POLL_HOUSE_LEAN')
MAYOR_2022_ACTUAL = load(f'{PROJ}/data_mayor_2022_actual.js', 'const MAYOR_2022_ACTUAL')
POLLSTER_METHOD = json.load(open('pollster_method.json', encoding='utf-8'))
COUNTY_AGE_DEMOGRAPHICS = json.load(open('county_age_demo.json', encoding='utf-8'))
FULL_ROSTER = json.load(open('full_roster.json', encoding='utf-8'))
# 政黨基本盤(鐵/中/淺)模型算出的22縣市陣營理論得票%(dpp/kmt/third)，來自test.html的
# 5屆(2008-2024)不分區政黨票floor/ceiling模型，只用來給「查無本人2022得票率」的候選人
# (has_anchor=False)在民調稀疏時當備援錨點——回測驗證過(21筆2018/2022真開放席次兩人對決)：
# 贏家猜對率76.2%、得票率誤差中位數4.5pt，比完全沒有歷史基礎好。另外測試過把base model的
# margin往50/50縮放(shrink факtor 0~2)看哪個縮放係數誤差最小，結果shrink=1.0(完全不縮放，
# 原始model)附近誤差最低(平均4.80pt)，shrink=0(完全不信model)反而最差(8.95pt)——證明不該
# 保守地壓低model的權重，原本設0.3是沒有回測根據的直覺，已經上修。0.6這個數字本身還是沒有
# 直接測試過(沒有2014/2018/2022的sparse poll歷史資料可以模擬「跟sparse poll混合」這個動作
# 本身)，只是根據「model自己的訊號經得起近乎滿權重使用」這個間接證據上調，不是精確校準值。
# 2018韓流那種全國單一浪潮年，不管權重多少都會失準，這點不因調高權重而改變。
BASE_MODEL_CAMP_PCT = json.load(open('base_model_camp_pct.json', encoding='utf-8'))
BASE_MODEL_FALLBACK_WEIGHT = 0.6  # 民調稀疏時，base model佔的權重(0~1)；民調充足時完全不介入
# 雲林縣：raw base model camp share(用政黨不分區票算，DPP還領先)跟本次報告已經新聞查證過的
# 「雲林張派」在地派系加成(連兩屆讓KMT差距衝到基本盤模型之上+56~58%)方向直接矛盾——張嘉郡
# 是張派欽點接班人，延續同一套地方動員網絡，套用未調整的raw camp share基本上是錯的。沒有
# 現成的方法把這種已知的單一縣市派系加成量化進camp share，與其套用一個已知會誤導的錨點，
# 不如排除，維持trust=1.0全信民調——2026-08-26使用者決定。
BASE_MODEL_FALLBACK_EXCLUDE = {'雲林縣'}
BASE_MODEL_SPARSE_THRESHOLD = 2   # 民調筆數<=這個數字才算「稀疏」，才觸發備援

REF_DATE = datetime(2026, 9, 2)
METHOD_K = 0.025

# 新竹縣2026-08-23移出排除名單：查證後發現徐欣瑩2022根本沒參選新竹縣長（2022贏家楊文科不在
# 2026名單裡），她唯一的歷史紀錄是2018的32.29%——但那是三足鼎立下的敗選第二名，鄭朝方2018
# 27.68%也是同樣問題，兩人的原始得票率沒辦法乾淨地當「這場2026兩人對決」的历史基本盤用，這才
# 是當初有人另外設計「政黨歷屆趨勢」錨點的真正原因，不是單純「公式沒被還原」。與其硬湊一個新的
# renormalize方案，改成full_roster.json把這兩人設為has_anchor=False（跟很多查無乾淨歷史對照的
# 候選人一樣）——trust永遠=100%，完全信任目前的民調，不試圖套用有問題的舊錨點。
# 南投縣/屏東縣完全查無2026民調，本來就不會被MethodWeight影響（沒有民調可重新加權），一樣跳過。
EXCLUDE_COUNTIES = {'南投縣', '屏東縣'}

_NAT_AVG_65PLUS = sum(d['pct_65_plus'] for d in COUNTY_AGE_DEMOGRAPHICS.values()) / len(COUNTY_AGE_DEMOGRAPHICS)
_CONF_MULT = {'high': 1.0, 'medium': 0.6, 'low': 0.3, 'unknown': 0}

def method_weight_factor(pollster, county, k=METHOD_K):
    info = POLLSTER_METHOD.get(pollster)
    if not info:
        return 1.0
    conf_mult = _CONF_MULT.get(info.get('confidence'), 0)
    if conf_mult == 0:
        return 1.0
    demo = COUNTY_AGE_DEMOGRAPHICS.get(county)
    if not demo:
        return 1.0
    dev = demo['pct_65_plus'] - _NAT_AVG_65PLUS
    adj = 0
    if info['mode'] == 'online':
        adj = -k * dev
    elif info['mode'] == 'phone':
        adj = k * min(0, dev)
    factor = 1 + adj * conf_mult
    return max(0.6, min(1.2, factor))

def parse_end_date(date_str):
    dates = re.findall(r'\d{4}-\d{2}-\d{2}', date_str or '')
    if not dates:
        return None
    return datetime.strptime(dates[-1], '%Y-%m-%d')

def is_self_commissioned(sponsor):
    # 候選人自己的競選總部/團隊委託的宣傳型民調——跟政黨委託(舊有'黨' in sponsor判斷)同樣
    # 屬於利害關係人自己出錢做的民調，天然有「挑好看的一份出來發」的誘因，理應同等重摔權重，
    # 不該因為sponsor字串裡沒有「黨」字就漏網。2026-09-01發現：宜蘭縣林國漳競選總部委託的
    # 山水民調(37.8% vs 28%，領先9.8pt)只因為sponsor沒有'黨'字，原本只吃山水民調本身的
    # green house lean折扣(0.7x)，沒吃到自己委託的額外折扣——這裡補上。
    return bool(sponsor) and sponsor != 'unknown' and ('競選總部' in sponsor or '團隊' in sponsor or '後援會' in sponsor)

def house_weight(pollster, sponsor):
    if sponsor and sponsor != 'unknown' and '黨' in sponsor:
        return 0.4
    if is_self_commissioned(sponsor):
        return 0.4
    lean_info = POLL_HOUSE_LEAN.get(pollster)
    lean = lean_info['lean'] if lean_info else 'unknown'
    if lean in ('blue', 'green'):
        return 0.7
    return 1.0

def recency_weight(d):
    if d is None:
        return 0.5
    days = max(0, (REF_DATE - d).days)
    return math.exp(-days / 120)

def is_neutral(pollster, sponsor):
    if sponsor and sponsor != 'unknown' and '黨' in sponsor:
        return False
    if is_self_commissioned(sponsor):
        return False
    lean_info = POLL_HOUSE_LEAN.get(pollster)
    lean = lean_info['lean'] if lean_info else 'unknown'
    return lean in ('neutral', 'unknown')

def get_anchor(county, name):
    entry = MAYOR_2022_ACTUAL.get(county)
    if not entry:
        return None
    for c in entry['cands']:
        if c['n'] == name:
            return c['v'] / entry['tot'] * 100
    return None

# party -> base model陣營key的對應；'ind'沒有對應(獨立候選人在base model裡本來就沒有
# 乾淨的陣營歸屬，見報告裡台北市third陣營、苗栗鍾東錦的討論——強行歸類會製造假訊號，
# 寧可讓這種候選人維持trust=1.0全信民調，不套用備援)
BASE_MODEL_PARTY_MAP = {'dpp': 'dpp', 'kmt': 'kmt', 'tpp': 'third', 'npp': 'third', 'tsr': 'third'}

def get_base_model_anchor(county, party):
    if county in BASE_MODEL_FALLBACK_EXCLUDE:
        return None
    camp_key = BASE_MODEL_PARTY_MAP.get(party)
    if not camp_key:
        return None
    shares = BASE_MODEL_CAMP_PCT.get(county)
    if not shares:
        return None
    return shares.get(camp_key)

CC_MAP = {
    '南投縣':'10008','嘉義市':'10020','嘉義縣':'10010','基隆市':'10017','宜蘭縣':'10002',
    '屏東縣':'10013','彰化縣':'10007','新北市':'65','新竹市':'10018','新竹縣':'10004',
    '桃園市':'68','澎湖縣':'10016','台中市':'66','台北市':'63','台南市':'67','台東縣':'10014',
    '花蓮縣':'10015','苗栗縣':'10005','金門縣':'09020','連江縣':'09007','雲林縣':'10009','高雄市':'64',
}

def compute_county(county, use_method_weight=True):
    roster = FULL_ROSTER[county]
    polls = POLLS_2026.get(county, [])
    valid_names = set(n for n, p, a in roster)
    per_poll = []
    for p in polls:
        d = parse_end_date(p['date'])
        hw = house_weight(p['pollster'], p.get('sponsor'))
        rw = recency_weight(d)
        w = hw * rw
        if use_method_weight:
            w *= method_weight_factor(p['pollster'], county)
        note = p.get('note') or ''
        if '初選期間' in note or p['pollster'] == '民進黨初選':
            continue
        # 非正式街頭民調（YouTube直播訪問等）不列入trust/blend計算，只在county的info panel/
        # 民調追蹤清單裡列出供參考（使用者2026-08-16要求）——過去苗栗縣/連江縣曾經只查得到
        # 這種非正式民調時，還是拿它去算了一個「trust=8%」的偽預測，會誤導使用者以為有實質
        # 根據；改成直接排除，讓這類縣市退回南投縣/屏東縣那種純歷史推估、地圖上顯示灰色。
        if '非正式' in note or p['pollster'] == '街頭有派對(YouTube街頭民調)':
            continue
        n_valid_present = sum(1 for c in p['candidates'] if c['name'] in valid_names)
        if n_valid_present >= 2:
            per_poll.append((p, w, d))

    if not per_poll:
        return None  # no usable polls -- caller preserves old value (covers 南投縣/屏東縣 automatically)

    mass = sum(w for _, w, _ in per_poll)
    neutral_mass = sum(w for p, w, _ in per_poll if is_neutral(p['pollster'], p.get('sponsor')))
    neutral_frac = neutral_mass / mass if mass else 0

    cand_stats = {}
    for name, party, has_anchor in roster:
        wsum, wvalsum, n_polls = 0, 0, 0
        for p, w, d in per_poll:
            sum_pct = sum(c['pct'] for c in p['candidates'] if c['name'] in valid_names and c['pct'] is not None)
            for c in p['candidates']:
                if c['name'] == name and sum_pct > 0:
                    normpct = c['pct'] / sum_pct * 100
                    wsum += w; wvalsum += w * normpct; n_polls += 1
        poll_avg = wvalsum / wsum if wsum > 0 else None
        cand_stats[name] = {'party': party, 'has_anchor': has_anchor, 'poll_avg': poll_avg, 'n_polls': n_polls}

    leading_name = max(cand_stats, key=lambda n: (cand_stats[n]['poll_avg'] if cand_stats[n]['poll_avg'] is not None else -1))
    wsum, wvalsum, vals = 0, 0, []
    for p, w, d in per_poll:
        sum_pct = sum(c['pct'] for c in p['candidates'] if c['name'] in valid_names and c['pct'] is not None)
        for c in p['candidates']:
            if c['name'] == leading_name and sum_pct > 0:
                normpct = c['pct'] / sum_pct * 100
                wsum += w; wvalsum += w*normpct; vals.append((normpct, w))
    avg_stdev = 0
    if wsum > 0:
        avg = wvalsum / wsum
        wvar = sum(w*(v-avg)**2 for v, w in vals) / wsum
        avg_stdev = math.sqrt(wvar)
    dispersion_penalty = 1 / (1 + avg_stdev / 10)  # kept as diagnostic only, mechanism C removed
    county_trust = (mass / (mass + 2.5)) * (0.5 + 0.5 * neutral_frac)

    is_sparse = len(per_poll) <= BASE_MODEL_SPARSE_THRESHOLD

    blended = {}
    for name, s in cand_stats.items():
        if s['poll_avg'] is None:
            return None  # some candidate has zero usable polls -- bail, caller preserves old
        if not s['has_anchor']:
            base_anchor = get_base_model_anchor(county, s['party']) if is_sparse else None
            if base_anchor is not None:
                trust = 1.0 - BASE_MODEL_FALLBACK_WEIGHT
                blended[name] = trust * s['poll_avg'] + BASE_MODEL_FALLBACK_WEIGHT * base_anchor
            else:
                trust = 1.0
                blended[name] = s['poll_avg']
            s['used_base_model'] = base_anchor is not None
        else:
            trust = county_trust
            anchor = get_anchor(county, name)
            blended[name] = trust * s['poll_avg'] + (1 - trust) * anchor if anchor is not None else s['poll_avg']
            s['used_base_model'] = False
        s['trust'] = trust

    total = sum(blended.values())
    final_pct = {n: v / total * 100 for n, v in blended.items()}

    total_polls_for_label = len(per_poll)
    label_style = 'sparse' if total_polls_for_label <= 2 else 'normal'
    informal = any('非正式' in (p.get('note') or '') or p['pollster'] == '街頭有派對(YouTube街頭民調)' for p, w, d in per_poll)

    cands_out = []
    for name in [n for n, p, a in roster]:
        s = cand_stats[name]
        trust_pct = round(s['trust'] * 100)
        if not s['has_anchor']:
            anchor_desc = '無本人紀錄，政黨基本盤備援錨點(回測誤差中位數4.5pt，浪潮年可能失準)' if s.get('used_base_model') else '無歷史紀錄，全信民調'
        else:
            anchor_desc = '本人2022實際得票率'
        prefix = '⚠非正式街頭民調，僅供參考' if informal else (f"{total_polls_for_label}筆民調加權平均" if label_style=='normal' else '民調樣本少，僅供參考')
        label = f"{name}（{prefix}；{s['n_polls']}筆；trust={trust_pct}%，歷史錨點={anchor_desc}）"
        cands_out.append({'n': label, 'p': s['party'], 'pct': final_pct[name]})

    raw_v = [round(c['pct']*100) for c in cands_out]
    diff = 10000 - sum(raw_v)
    if diff != 0:
        idx_max = max(range(len(cands_out)), key=lambda i: cands_out[i]['pct'])
        raw_v[idx_max] += diff
    for c, v in zip(cands_out, raw_v):
        c['v'] = v
    winner_idx = max(range(len(cands_out)), key=lambda i: cands_out[i]['v'])
    for i, c in enumerate(cands_out):
        c['e'] = 1 if i == winner_idx else 0

    return {
        'cands': cands_out,
        'poll_count': total_polls_for_label,
        'used_informal_fallback': informal,
        'total_weight_mass': round(mass, 2),
        'neutral_frac': round(neutral_frac, 2),
        'dispersion_penalty': round(dispersion_penalty, 3),
        'trust': round(county_trust, 3),
        'cc': CC_MAP[county],
        'county': county,
    }

if __name__ == '__main__':
    for county in FULL_ROSTER:
        if county in EXCLUDE_COUNTIES:
            print(f'{county}: EXCLUDED from this pass (see script header)')
            continue
        r = compute_county(county)
        if r is None:
            print(f'{county}: SKIP (no usable data / bail)')
            continue
        print(f"{county} ({r['cc']}): poll_count={r['poll_count']} mass={r['total_weight_mass']} trust={r['trust']}")
        for c in r['cands']:
            print(f"   v={c['v']} e={c['e']} {c['n']}")
