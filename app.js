/* ============================================================
 * 鐵材裁切配料優化程式 (PWA 手機版)
 * 演算法: 混切優化 (分支限界 + 回溯 全域搜尋)
 * 目標優先順序: 使用總長度 → 刀數 → 切法設定數(組數) → 根數
 * 庫存長度完全由使用者自行輸入 (無內建)
 * ============================================================ */

/* ---------- 切痕 (鋸縫) 設定 ----------
 * 每切一刀損耗 KERF_MM mm。
 * 實務上「低於 6 段 (≤5 刀)」的支料不計切痕 (短切時實料長度通常還有餘裕),
 * 達 6 段以上才把切痕算進去, 避免切滿的支料被算成不足長度。
 * 切 n 段需 n-1 刀, 故切痕 = (段數 - 1) × KERF_MM
 */
const KERF_MM = 20;
const KERF_MIN_SEG = 6;          // 達此段數才計切痕
const TIME_LIMIT_MS = 3000;      // 搜尋時間預算 (手機保護)

function kerfOf(pieces) {
  return pieces >= KERF_MIN_SEG ? (pieces - 1) * KERF_MM : 0;
}

/* 解析長度字串: 支援 "2250"(mm), "225cm", "2.25m" */
function parseLength(str) {
  if (!str) return NaN;
  const s = String(str).trim().toUpperCase();
  if (s.endsWith('CM')) {
    return Math.round(parseFloat(s.slice(0, -2)) * 10);
  }
  if (s.endsWith('M')) {
    return Math.round(parseFloat(s.slice(0, -1)) * 1000);
  }
  return Math.round(parseFloat(s));
}

/**
 * 混切優化 (全域最小總餘料法)
 * 目標優先順序:
 *   1) 總餘料最少 (= 用掉的原料總長度最少, 因需求總長度固定)
 *   2) 切法設定數最少 (相同切法的料併組, 減少束切上下料)
 *   3) 總刀數最少
 *   4) 使用根數(支數)最少
 * 做法: 以分支限界 + 回溯窮舉原料組合, 用總長度下界剪枝 + 節點上限保護手機效能。
 * @param {Array} orders        [[length, quantity], ...] 成品需求
 * @param {Array} stock         [[length, quantity], ...] 庫存長度與根數 (全部自訂)
 * @returns {Object|null}
 *   {
 *     plan: [ { raw, counts: {idx:count}, leftover } ... ],
 *     lengths: [成品長度...],
 *     totalRaw, totalLeftover, totalCuts, totalUniquePat
 *   }
 */
function optimizeOrder(orders, stock) {
  // 成品排序由大到小
  const pieceTypes = orders.map(o => [o[0], o[1]]).sort((a, b) => b[0] - a[0]);
  const lengths = pieceTypes.map(p => p[0]);
  const demand = pieceTypes.map(p => p[1]);
  const totalCol = pieceTypes.reduce((s, p) => s + p[0] * p[1], 0);

  if (orders.length === 0 || totalCol <= 0) return null; // 無需求

  // 組原料清單 (純自訂庫存, 全部有限數量), 短料在前
  const stockMap = new Map(); // raw -> qty
  for (const [lr, qr] of (stock || [])) {
    if (qr <= 0) continue;
    stockMap.set(lr, (stockMap.get(lr) || 0) + qr);
  }
  if (stockMap.size === 0) return null;
  const rawItems = Array.from(stockMap.entries())
    .map(([raw, qty]) => ({ raw, qty }))
    .sort((a, b) => a.raw - b.raw); // 短料在前
  const raws = rawItems.map(r => r.raw);
  const M = raws.length;
  const N = lengths.length;

  // 檢查可行性: 若需求有某長度超過所有庫存則不可行
  const maxRaw = raws[M - 1];
  for (let i = 0; i < N; i++) {
    if (lengths[i] > maxRaw && demand[i] > 0) return null;
  }

  // ---------- 預產生所有可行的切割方式 (每種原料料型) ----------
  const rawPatterns = [];
  for (let ri = 0; ri < M; ri++) {
    const raw = raws[ri];
    const pats = [];
    const counts = {};
    (function recp(start, used, pieces) {
      let has = false;
      for (const k in counts) { if (counts[k] > 0) { has = true; break; } }
      if (has && used > 0 && used + kerfOf(pieces) <= raw) {
        pats.push({ counts: Object.assign({}, counts), used, pieces, kerf: kerfOf(pieces) });
      }
      for (let j = start; j < N; j++) {
        if (lengths[j] > raw) continue;
        if (used + lengths[j] + kerfOf(pieces + 1) > raw) continue;
        counts[j] = (counts[j] || 0) + 1;
        recp(j, used + lengths[j], pieces + 1);
        counts[j]--;
        if (counts[j] === 0) delete counts[j];
      }
    })(0, 0, 0);
    pats.sort((a, b) => {
      const ua = a.used / raw, ub = b.used / raw;
      if (ub !== ua) return ub - ua;
      const ca = a.pieces, cb = b.pieces;
      return cb - ca;
    });
    rawPatterns.push(pats);
  }

  // ---------- 分支限界回溯 ----------
  let best = null;
  let bestCost = Infinity;      // 最佳總原料長度
  let bestRawCount = Infinity;  // 最佳根數
  let bestCuts = Infinity;      // 最佳刀數
  let bestUniquePat = Infinity; // 最佳切法設定數

  // 計算切法設定數 (相同 raw+counts 算同一種)
  function countUniquePat(planArr) {
    const s = new Set();
    for (const p of planArr) {
      const key = p.raw + ':' + Object.keys(p.counts).sort((a, b) => a - b).map(k => k + ':' + p.counts[k]).join(',');
      s.add(key);
    }
    return s.size;
  }

  const plan = [];
  const rem = demand.slice();
  const stockLeft = rawItems.map(r => r.qty);

  function needLen(left) {
    let s = 0;
    for (let i = 0; i < N; i++) s += left[i] * lengths[i];
    return s;
  }

  // 每種原料一支最多能產出的產品長度 (用於估算剩餘所需原料長度的下界)
  const cap = rawPatterns.map(pats => pats.reduce((m, p) => Math.max(m, p.used), 0));
  // 依「每 mm 原料能產出的產品長度」由高到低, 供下界以最省的組合估算
  const utilOrder = rawItems.map((r, ri) => ri).sort((a, b) => cap[b] / raws[b] - cap[a] / raws[a]);

  // 剩餘需求至少需要多少原料長度 (放鬆估計的下界, 用於剪枝)
  function lowerBound(left) {
    let need = needLen(left);
    if (need <= 0) return 0;
    let lb = 0;
    for (const ri of utilOrder) {
      if (stockLeft[ri] <= 0) continue;
      const canUse = cap[ri] * stockLeft[ri];
      if (canUse >= need) { lb += need * raws[ri] / cap[ri]; need = 0; break; }
      lb += raws[ri] * stockLeft[ri];
      need -= canUse;
    }
    return need > 0 ? lb + need : lb; // 庫存不夠時退回需求長度當寬鬆值
  }

  let nodes = 0;
  const NODE_LIMIT = 6000000;      // 節點保護上限 (較大以便深入找到最省總長)
  let deadline = Date.now() + TIME_LIMIT_MS; // 時間預算 (手機保護)
  const MEMO_LIMIT = 1200000;      // 狀態記憶化上限 (控制記憶體用量)
  let truncated = false;           // 是否因節點/時間上限提早結束
  let exhaustive = false;          // 是否有某一輪完整搜尋完畢 (=> 結果保證最優)
  let rawDesc = true;              // 原料嘗試順序: true = 長料優先
  const memo = new Map();         // (剩餘需求|剩餘庫存) -> 最優的 (usedLen, cuts)

  function dfs(usedLen, rawCount, cuts) {
    if (truncated) return; // 已達節點/時間上限 → 立即中止, 避免回溯階段仍做白工
    if (++nodes > NODE_LIMIT) { truncated = true; return; }
    if ((nodes & 2047) === 0 && Date.now() > deadline) { truncated = true; return; }

    if (!rem.some(d => d > 0)) {
      const patCount = countUniquePat(plan);
      if (usedLen < bestCost ||
          (usedLen === bestCost && cuts < bestCuts) ||
          (usedLen === bestCost && cuts === bestCuts && patCount < bestUniquePat) ||
          (usedLen === bestCost && cuts === bestCuts && patCount === bestUniquePat && rawCount < bestRawCount)) {
        bestCost = usedLen; bestRawCount = rawCount; bestCuts = cuts; bestUniquePat = patCount;
        best = plan.map(p => ({ raw: raws[p.ri], counts: Object.assign({}, p.counts), used: p.used, kerf: p.kerf, pieces: p.pieces, leftover: raws[p.ri] - p.used - p.kerf }));
      }
      return;
    }

    // 下界剪枝 (先用便宜的需求長度, 再用較強的原料產出下界)
    if (usedLen + needLen(rem) > bestCost) return;
    if (usedLen + lowerBound(rem) > bestCost) return;

    // 狀態支配剪枝: 同一個 (剩餘需求, 剩餘庫存) 若曾以更省的 (已用長度, 刀數) 到達,
    // 此次的後續選擇完全相同 → 必定更差, 直接剪掉
    const mkey = rem.join(',') + '|' + stockLeft.join(',');
    const prev = memo.get(mkey);
    if (prev !== undefined && (prev[0] < usedLen || (prev[0] === usedLen && prev[1] < cuts))) return;
    if (prev !== undefined || memo.size < MEMO_LIMIT) memo.set(mkey, [usedLen, cuts]);

    // 最長剩餘需求
    let longest = 0;
    for (let i = 0; i < N; i++) if (rem[i] > 0 && lengths[i] > longest) longest = lengths[i];

    // 依設定的原料順序嘗試 (長料優先或短料優先, 由外層多策略搜尋切換)
    for (let k = 0; k < M; k++) {
      const ri = rawDesc ? (M - 1 - k) : k;
      if (stockLeft[ri] <= 0) continue;
      if (raws[ri] < longest) continue;
      const raw = raws[ri];
      for (const pat of rawPatterns[ri]) {
        let over = false;
        for (let i = 0; i < N; i++) { if ((pat.counts[i] || 0) > rem[i]) { over = true; break; } }
        if (over) continue;
        let hits = false;
        for (let i = 0; i < N; i++) if ((pat.counts[i] || 0) > 0 && rem[i] > 0) hits = true;
        if (!hits) continue;
        stockLeft[ri]--;
        plan.push({ ri, counts: pat.counts, used: pat.used, kerf: pat.kerf, pieces: pat.pieces });
        for (let i = 0; i < N; i++) rem[i] -= (pat.counts[i] || 0);
        dfs(usedLen + raw, rawCount + 1, cuts + pat.pieces);
        for (let i = 0; i < N; i++) rem[i] += (pat.counts[i] || 0);
        plan.pop();
        stockLeft[ri]++;
      }
    }
  }

  // 先以貪婪求得良好上界 (兩種策略各跑一次取較短者, 讓後續剪枝更有效)
  function greedy(mode) {
    const rem0 = demand.slice();
    const st0 = stockLeft.slice();
    const plan0 = [];
    while (rem0.some(d => d > 0)) {
      let chosen = null;
      for (let ri = 0; ri < M; ri++) {
        if (st0[ri] <= 0) continue;
        let cand = null;
        for (const pat of rawPatterns[ri]) {
          let over = false;
          for (let i = 0; i < N; i++) if ((pat.counts[i] || 0) > rem0[i]) { over = true; break; }
          if (over) continue;
          let hits = false;
          for (let i = 0; i < N; i++) if ((pat.counts[i] || 0) > 0 && rem0[i] > 0) hits = true;
          if (!hits) continue;
          const eff = pat.used / raws[ri];
          const score = mode === 0 ? eff : pat.used / 1000 + eff * 0.001;
          if (!cand || score > cand.score) cand = { pat, eff, score };
        }
        if (cand && (!chosen || cand.score > chosen.score)) chosen = { ri, ...cand };
      }
      if (!chosen) return null;
      st0[chosen.ri]--;
      plan0.push({ ri: chosen.ri, counts: Object.assign({}, chosen.pat.counts), used: chosen.pat.used, kerf: chosen.pat.kerf, pieces: chosen.pat.pieces });
      for (const i in chosen.pat.counts) rem0[i] -= chosen.pat.counts[i];
    }
    return plan0;
  }

  {
    let plan0 = greedy(0);
    const alt = greedy(1);
    if (alt) {
      const lenA = plan0 ? plan0.reduce((s, p) => s + raws[p.ri], 0) : Infinity;
      const lenB = alt.reduce((s, p) => s + raws[p.ri], 0);
      if (lenB < lenA) plan0 = alt;
    }
    if (!plan0) return null; // greedy 都無解 -> 可能真的無解

    const usedLen = plan0.reduce((s, p) => s + raws[p.ri], 0);
    const cuts = plan0.reduce((s, p) => s + p.pieces, 0);
    const patCount = countUniquePat(plan0);
    bestCost = usedLen; bestRawCount = plan0.length; bestCuts = cuts; bestUniquePat = patCount;
    best = plan0.map(p => ({ raw: raws[p.ri], counts: Object.assign({}, p.counts), used: p.used, kerf: p.kerf, pieces: p.pieces, leftover: raws[p.ri] - p.used - p.kerf }));
    if (usedLen === totalCol) {
      return { plan: best, lengths, totalRaw: bestRawCount, totalLeftover: 0, totalCuts: bestCuts, totalUniquePat: bestUniquePat, totalKerf: best.reduce((s, p) => s + p.kerf, 0), optimal: true };
    }
  }

  // 多策略分時搜尋: 不同原料順序 / 切法排序各跑一段時間, 取各輪找到的最好結果
  // (單一搜尋順序容易卡在壞的探索路徑上, 分時多策略可大幅提升找到好解的機率)
  const PORTS = [
    { rawDesc: true, patMode: 0 }, // 長料優先 + 高利用率
    { rawDesc: false, patMode: 0 }, // 短料優先 + 高利用率
    { rawDesc: true, patMode: 1 },  // 長料優先 + 切得滿
    { rawDesc: false, patMode: 1 }, // 短料優先 + 切得滿
  ];
  const perSlice = Math.max(250, Math.floor(TIME_LIMIT_MS / PORTS.length));
  for (const p of PORTS) {
    rawDesc = p.rawDesc;
    for (let ri = 0; ri < M; ri++) {
      const pats = rawPatterns[ri];
      if (p.patMode === 1) pats.sort((a, b) => (b.used - a.used) || ((b.used / raws[ri]) - (a.used / raws[ri])));
      else pats.sort((a, b) => ((b.used / raws[ri]) - (a.used / raws[ri])));
    }
    deadline = Date.now() + perSlice;
    truncated = false;
    dfs(0, 0, 0);
    if (!truncated) { exhaustive = true; break; } // 完整搜尋完畢 => 結果保證最優
    if (bestCost === totalCol) break;             // 已達理論下限, 不可能更好
  }

  if (!best) return null;

  // 併組後處理: 同種料重新分配以減少切法組數 (不改變支數/總長度)
  // 僅在「總組數確實更少」時才採用, 否則保留原方案
  const origGroup = countUniquePat(best);
  const regrouped = regroupPlan(best, lengths);
  if (countUniquePat(regrouped) < origGroup) {
    best = regrouped;
  }

  const totalRaw = best.length;
  const totalCuts = best.reduce((s, p) => s + p.pieces, 0);
  const totalUniquePat = countUniquePat(best);
  const totalKerf = best.reduce((s, p) => s + (p.kerf || 0), 0);
  // 總餘料 = 實際還能用的長度 (已扣除切痕損耗)
  const totalLeftover = best.reduce((s, p) => s + (p.raw - p.used - (p.kerf || 0)), 0);
  return { plan: best, lengths, totalRaw, totalLeftover, totalCuts, totalUniquePat, totalKerf, optimal: exhaustive || bestCost === totalCol };
}

/**
 * 併組優化: 將同一種原料的所有支重新分配,
 * 每輪針對「剩餘需求總長度最大的成品」選最合適 pattern 整支集滿,
 * 傾向整支集滿單一/少數成品, 把難併的長料配對, 以減少切法組數。
 * 支數與總長度只可能不增加若無法完整重排則保留原方案。
 * @param {Array} plan   [{raw, counts, used, kerf, leftover}, ...]
 * @param {Array} lengths 成品長度
 * @returns 重新分配後的 plan
 */
function regroupPlan(plan, lengths) {
  // 依原料分組
  const rawGroups = new Map();
  for (const p of plan) {
    if (!rawGroups.has(p.raw)) rawGroups.set(p.raw, []);
    rawGroups.get(p.raw).push(p);
  }
  const out = [];
  for (const [raw, items] of rawGroups) {
    const n = items.length;
    if (n <= 1) { out.push(...items.map(p => Object.assign({}, p))); continue; }
    // 該原料在此方案中要承擔的每種成品段數總量
    const agg = {};
    for (const p of items) for (const k in p.counts) agg[k] = (agg[k] || 0) + p.counts[k];
    const keys = Object.keys(agg).map(Number);
    // 產生該原料所有可行的切割方式 (受限於 agg, 切痕規則與主搜尋一致)
    const pats = [];
    const cur = {};
    (function gen(start, used, cnt) {
      let has = false;
      for (const k in cur) if (cur[k] > 0) { has = true; break; }
      if (has && used > 0 && used + kerfOf(cnt) <= raw) pats.push({ counts: Object.assign({}, cur), used, pieces: cnt, kerf: kerfOf(cnt) });
      for (let j = start; j < keys.length; j++) {
        const k = keys[j];
        if (lengths[k] > raw) continue;
        if (used + lengths[k] + kerfOf(cnt + 1) > raw) continue;
        if ((cur[k] || 0) >= agg[k]) continue;
        cur[k] = (cur[k] || 0) + 1;
        gen(j, used + lengths[k], cnt + 1);
        cur[k]--;
        if (cur[k] === 0) delete cur[k];
      }
    })(0, 0, 0);
    // 每輪先針對「剩餘需求總長度最大」的成品種類,
    // 選能「整除清除該種類」且利用率最高的切割方式, 塞滿該 pattern。
    // 如此傾向「整支集滿單一成品」, 並把難以併組的長料配對起來, 減少組數。
    pats.sort((a, b) => (b.used - a.used) || (Object.keys(a.counts).length - Object.keys(b.counts).length));
    const rem = Object.assign({}, agg);
    const rebuilt = [];
    let guard = 0;
    while (Object.values(rem).some(v => v > 0) && guard++ < 1000) {
      // 找出剩餘需求總長度最大的成品種類
      let maxKey = -1, maxLen = -1;
      for (const k of keys) {
        if (rem[k] > 0 && lengths[k] * rem[k] > maxLen) { maxLen = lengths[k] * rem[k]; maxKey = k; }
      }
      let best = null;
      for (const pat of pats) {
        if (!(pat.counts[maxKey] > 0)) continue; // 必須能涵蓋目標種類
        let maxT = Infinity, ok = true;
        for (const k in pat.counts) {
          if (rem[k] <= 0) { ok = false; break; }
          maxT = Math.min(maxT, Math.floor(rem[k] / pat.counts[k]));
        }
        if (!ok || maxT <= 0) continue;
        const remainAfter = rem[maxKey] % pat.counts[maxKey]; // 0 = 可整除清除
        if (!best || remainAfter < best.remainAfter || (remainAfter === best.remainAfter && pat.used > best.pat.used)) {
          best = { pat, maxT, remainAfter };
        }
      }
      if (!best) break; // 無法繼續, 放棄重排
      const t = best.maxT;
      for (let i = 0; i < t; i++) {
        rebuilt.push({ raw, counts: Object.assign({}, best.pat.counts), used: best.pat.used, pieces: best.pat.pieces, kerf: best.pat.kerf, leftover: raw - best.pat.used - best.pat.kerf });
        for (const k in best.pat.counts) rem[k] -= best.pat.counts[k];
      }
    }
    // 需完整覆蓋; 若重建支數超過原方案支數(更耗料)則不採用該原料的重排
    if (Object.values(rem).some(v => v > 0) || rebuilt.length > n) {
      out.push(...items.map(p => Object.assign({}, p)));
      continue;
    }
    out.push(...rebuilt);
  }
  return out;
}

/* 若在瀏覽器環境提供 window 供引用; 供 Node 測試時匯出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { optimizeOrder, parseLength, kerfOf, KERF_MM, KERF_MIN_SEG, RAW_MATERIALS: [] };
}
