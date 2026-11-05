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

REF_DATE = datetime(2026, 11, 5)
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
    # 2026-10-26補：「競選辦公室」（基隆謝國樑競選辦公室公布的雨晴民調）、「之友會」（台中市信賴台灣之友會，
    # 賴清德支持者團體委託的循證民調——使用者決定視為綠營陣營委託）同屬利害關係人出資，比照降權。
    return bool(sponsor) and sponsor != 'unknown' and ('競選總部' in sponsor or '競選辦公室' in sponsor or '團隊' in sponsor or '後援會' in sponsor or '之友會' in sponsor)

# 委託方本身抽樣結構明顯失衡、不能當中立看的民調，比照陣營委託0.4降權、不計入neutral_frac。
# 信民協會（台北市信民兩岸研究協會）：2026-10-26查證10/14~16台北民調報告自己的交叉表，樣本
# 政黨傾向泛綠42.2%/泛藍26.6%/民眾黨4.0%，同報告引用的TVBS台北10/3~7為綠28%/藍32%/白7%，
# 綠減藍差距差了近20pt。使用者決定：戴立安（問卷設計）本人沒問題，不等於委託方信民沒問題，
# 信民委託的台北/新北4份民調全部改0.4（原本當中立1.0，曾因此讓台北縣市層翻盤成沈伯洋領先）。
# 背景查證（2026-10-26，只採新聞報導）：理事長黃清龍上周玉蔻節目公開稱讚沈伯洋（放言10/16、10/23），
# 2022、2026兩度出書質疑蔣萬安家族血緣；自承與曹興誠私交密切、幫曹辦過記者會，但否認曹與協會有關，
# 被問經費來源答「我沒有必要去講」（風傳媒10/21）。「曹興誠金援」只有藍營評論（陳朝平專欄）的指控、
# 無證據；「曹的秘書擔任發布窗口」「震央與震源」說法查無新聞出處。降權的主要依據仍是樣本結構。
# 鋒燦傳媒（2026-11-02，使用者：「要不要比照信民協會…再降到0.4？ ok」）：10/16～21 高雄民調樣本民進黨46.6%、國民黨16.7%、
# 民眾黨6.2%，未依政黨傾向加權；三立舊部 2023 年成立（中天 2023/3/1）。之後的鋒燦自辦民調要逐筆確認樣本結構再決定是否沿用。
# 鏡新聞 2026-11-01～02 新北民調（2026-11-05，使用者選「這一筆降到 0.4」）：樣本民進黨40.7%、國民黨23.0%、民眾黨9.0%。
# 只針對這一筆：data_polls_2026.js 的 sponsor 標成下面這個標籤；鏡新聞其他委託案（例如基隆 10/18～21）照舊 1.0。
SKEWED_SAMPLE_SPONSORS = {'信民協會', '鋒燦傳媒', '鏡新聞（新北 11/1–2 樣本偏綠）'}

def house_weight(pollster, sponsor):
    if sponsor and sponsor != 'unknown' and '黨' in sponsor:
        return 0.4
    if sponsor in SKEWED_SAMPLE_SPONSORS:
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
    if sponsor in SKEWED_SAMPLE_SPONSORS:
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

# 未表態平分給主要候選人（2026-10-31，使用者決定「先採用『未表態平分給主要候選人』」）。原本每份民調只在名冊候選人之間按比例正規化，等於把未表態
# 按目前支持比例分掉（60對15→80對20）。backtest_undecided_south.py用2018（231筆）/2022（213筆）選前180天民調對照
# 開票盲測：民調高估綠營的幅度在高雄/台南/屏東跟未表態比例正相關（相關係數+0.36/+0.46，其他縣市約0），改成未表態
# 平分給主要候選人後，縣市兩黨得票比平均誤差2018 7.16→5.10、2022 6.25→5.22（兩屆都改善、沒有用到另一屆答案）。
# 主要候選人＝該份民調的前兩名。backtest_undecided_multi.py比較多人選舉的分法（所有列名候選人得票率的平均絕對誤差）：
# 按比例（原做法）2018 6.75／2022 6.10、平分給前兩名 5.46／4.81、平分給≥10%者 5.34／5.02、≥20%者 5.47／4.82——
# 前兩名兩屆都穩定，三強縣市（台北/新竹市/台南/苗栗等）也最好或接近最好。未表態用undecided_pct，沒有就用100－各候選人合計。
SUBMATCHUP_MIN_PCT = 10
# 三強縣市（名冊上有3位以上候選人在任一份民調達到10%）改成平分給這幾位（2026-10-31使用者決定：「三強縣市改成平分給
# 所有10%」）——花蓮的第二、三名在各份民調輪流，只給前兩名會讓每份都第一的游淑貞固定多拿一半。回測上兩種分法在真正
# 三強的選舉打平（2018新竹縣/新竹市、2022台北/苗栗/新竹市/澎湖：前兩名2.57、≥10%者2.73，按比例3.07）。
def poll_shares(p, valid_names, three_way=None):
    c = {x['name']: x['pct'] for x in p['candidates'] if x['name'] in valid_names and x['pct'] is not None}
    sum_pct = sum(c.values())
    if sum_pct <= 0:
        return {}
    U = p.get('undecided_pct')
    if U is None:
        U = max(0.0, 100 - sum(x['pct'] for x in p['candidates'] if x['pct'] is not None))
    majors = [n for n in three_way if n in c] if three_way else []
    if len(majors) < 2:
        majors = sorted(c, key=lambda n: -c[n])[:2]
    return {n: (v + (U / len(majors) if n in majors else 0)) / (sum_pct + U) * 100 for n, v in c.items()}

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

    # 少了主要候選人的民調不算（2026-10-31使用者決定：「民調裡少了一位支持度曾達10%以上的名冊候選人，就不算進平均」）。
    # 起因：花蓮包打聽9/1~3同波的兩組一對一假想對決（游vs魏、游vs張）被當成獨立民調混進三強選舉的平均。同規則也排除
    # 新竹市鉅聞天下1月（莊競程尚未提名）、彰化鉅聞天下4~5月與匯流5月（邱建富尚未投入）。
    top_pct = {n: max([c['pct'] for p, _, _ in per_poll for c in p['candidates'] if c['name'] == n and c['pct'] is not None] or [0]) for n in valid_names}
    per_poll = [(p, w, d) for p, w, d in per_poll
                if not any(top_pct[n] >= SUBMATCHUP_MIN_PCT and n not in {c['name'] for c in p['candidates']} for n in valid_names)]
    three_way = [n for n in valid_names if top_pct[n] >= SUBMATCHUP_MIN_PCT]
    three_way = three_way if len(three_way) >= 3 else None

    if not per_poll:
        return None  # no usable polls -- caller preserves old value (covers 南投縣/屏東縣 automatically)

    mass = sum(w for _, w, _ in per_poll)
    neutral_mass = sum(w for p, w, _ in per_poll if is_neutral(p['pollster'], p.get('sponsor')))
    neutral_frac = neutral_mass / mass if mass else 0

    cand_stats = {}
    for name, party, has_anchor in roster:
        wsum, wvalsum, n_polls = 0, 0, 0
        for p, w, d in per_poll:
            sh = poll_shares(p, valid_names, three_way)
            if name in sh:
                wsum += w; wvalsum += w * sh[name]; n_polls += 1
        poll_avg = wvalsum / wsum if wsum > 0 else None
        cand_stats[name] = {'party': party, 'has_anchor': has_anchor, 'poll_avg': poll_avg, 'n_polls': n_polls}

    leading_name = max(cand_stats, key=lambda n: (cand_stats[n]['poll_avg'] if cand_stats[n]['poll_avg'] is not None else -1))
    wsum, wvalsum, vals = 0, 0, []
    for p, w, d in per_poll:
        sh = poll_shares(p, valid_names, three_way)
        if leading_name in sh:
            wsum += w; wvalsum += w*sh[leading_name]; vals.append((sh[leading_name], w))
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
