/* ============================================================
 * 鐵材裁切配料優化程式 (PWA 手機版)
 * 演算法: 混切優化 (分支限界 + 回溯 全域搜尋)
 * 目標優先順序: 總長度 → 切法設定數 → 刀數 → 根數
 * 庫存長度完全由使用者自行輸入 (無內建)
 * ============================================================ */

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
  const KERF = 0; // 鋸縫 (mm) - 目前停用, 不算刀痕
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
      if (has && used > 0 && used + pieces * KERF <= raw) {
        pats.push({ counts: Object.assign({}, counts), used, pieces, kerf: pieces * KERF });
      }
      for (let j = start; j < N; j++) {
        if (lengths[j] > raw) continue;
        if (used + lengths[j] + (pieces + 1) * KERF > raw) continue;
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

  let nodes = 0;
  const NODE_LIMIT = 6000000; // 節點保護上限 (較大以便深入找到最省總長)

  function dfs(usedLen, rawCount, cuts) {
    if (++nodes > NODE_LIMIT) return; // 超出保護上限即停止 (保留目前已找到的最佳)

    if (!rem.some(d => d > 0)) {
      const patCount = countUniquePat(plan);
      if (usedLen < bestCost ||
          (usedLen === bestCost && cuts < bestCuts) ||
          (usedLen === bestCost && cuts === bestCuts && patCount < bestUniquePat) ||
          (usedLen === bestCost && cuts === bestCuts && patCount === bestUniquePat && rawCount < bestRawCount)) {
        bestCost = usedLen; bestRawCount = rawCount; bestCuts = cuts; bestUniquePat = patCount;
        best = plan.map(p => ({ raw: raws[p.ri], counts: Object.assign({}, p.counts), used: p.used, kerf: p.kerf, leftover: raws[p.ri] - p.used - p.kerf }));
      }
      return;
    }

    // 下界剪枝 (總長度)
    if (usedLen + needLen(rem) > bestCost) return;

    // 最長剩餘需求
    let longest = 0;
    for (let i = 0; i < N; i++) if (rem[i] > 0 && lengths[i] > longest) longest = lengths[i];

    // 長料優先嘗試 (更容易先找到解, 改善剪枝效果)
    for (let ri = M - 1; ri >= 0; ri--) {
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
        plan.push({ ri, counts: pat.counts, used: pat.used, kerf: pat.kerf });
        for (let i = 0; i < N; i++) rem[i] -= (pat.counts[i] || 0);
        dfs(usedLen + raw, rawCount + 1, cuts + Object.values(pat.counts).reduce((s, v) => s + v, 0));
        for (let i = 0; i < N; i++) rem[i] += (pat.counts[i] || 0);
        plan.pop();
        stockLeft[ri]++;
      }
    }
  }

  // 先以貪婪求得一個良好上界
  {
    const rem0 = demand.slice();
    const st0 = stockLeft.slice();
    const plan0 = [];
    let ok = true;
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
          if (!cand || eff > cand.eff) cand = { pat, eff };
        }
        if (cand && (!chosen || cand.eff > chosen.eff)) chosen = { ri, ...cand };
      }
      if (!chosen) { ok = false; break; }
      st0[chosen.ri]--;
      plan0.push({ ri: chosen.ri, counts: Object.assign({}, chosen.pat.counts), used: chosen.pat.used, kerf: chosen.pat.kerf });
      for (const i in chosen.pat.counts) rem0[i] -= chosen.pat.counts[i];
    }
    if (ok) {
      const usedLen = plan0.reduce((s, p) => s + raws[p.ri], 0);
      const cuts = plan0.reduce((s, p) => s + Object.values(p.counts).reduce((a, b) => a + b, 0), 0);
      const patCount = countUniquePat(plan0);
      bestCost = usedLen; bestRawCount = plan0.length; bestCuts = cuts; bestUniquePat = patCount;
      best = plan0.map(p => ({ raw: raws[p.ri], counts: Object.assign({}, p.counts), used: p.used, kerf: p.kerf, leftover: raws[p.ri] - p.used - p.kerf }));
      if (usedLen === totalCol) {
        return { plan: best, lengths, totalRaw: bestRawCount, totalLeftover: 0, totalCuts: bestCuts, totalUniquePat: bestUniquePat };
      }
    } else {
      // greedy 都無解 -> 可能真的無解
      return null;
    }
  }

  dfs(0, 0, 0);

  if (!best) return null;

  // 併組後處理: 同種料重新分配以減少切法組數 (不改變支數/總長度)
  // 僅在「總組數確實更少」時才採用, 否則保留原方案
  const origGroup = countUniquePat(best);
  const regrouped = regroupPlan(best, lengths);
  if (countUniquePat(regrouped) < origGroup) {
    best = regrouped;
  }

  const totalRaw = best.length;
  const totalCuts = best.reduce((s, p) => s + Object.values(p.counts).reduce((a, b) => a + b, 0), 0);
  const totalUniquePat = countUniquePat(best);
  const totalLeftover = best.reduce((s, p) => s + p.raw, 0) - totalCol;
  return { plan: best, lengths, totalRaw, totalLeftover, totalCuts, totalUniquePat };
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
    // 產生該原料所有可行的切割方式 (受限於 agg)
    const pats = [];
    const cur = {};
    (function gen(start, used) {
      let has = false;
      for (const k in cur) if (cur[k] > 0) { has = true; break; }
      if (has && used > 0 && used <= raw) pats.push({ counts: Object.assign({}, cur), used });
      for (let j = start; j < keys.length; j++) {
        const k = keys[j];
        if (lengths[k] > raw) continue;
        if (used + lengths[k] > raw) continue;
        if ((cur[k] || 0) >= agg[k]) continue;
        cur[k] = (cur[k] || 0) + 1;
        gen(j, used + lengths[k]);
        cur[k]--;
        if (cur[k] === 0) delete cur[k];
      }
    })(0, 0);
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
        rebuilt.push({ raw, counts: Object.assign({}, best.pat.counts), used: best.pat.used, kerf: 0, leftover: raw - best.pat.used });
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
  module.exports = { optimizeOrder, parseLength, RAW_MATERIALS: [] };
}
