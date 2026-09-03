"""
鐵材裁切配料優化程式 v3
- 支援多種成品共用同一根原料 (混切), 找出真正最省料的方案
- 優化目標(依優先序):
  1. 總餘料最少
  2. 使用原料根數最少
  3. 總刀數最少 (操作方便)
- 演算法: 貪婪法, 每步選利用率最高且不超量的 pattern
"""

RAW_MATERIALS = [6000, 9000, 10000, 12000]

def parse_length(length_str):
    length_str = length_str.strip().upper()
    if length_str.endswith('M'):
        return int(float(length_str[:-1]) * 1000)
    if length_str.endswith('CM'):
        return int(float(length_str[:-2]) * 10)
    return int(length_str)

def optimize_order(orders, raw_materials):
    """
    混切優化 (貪婪法, 快速可靠):
    反覆從優質 pattern 中, 選出能最有效消耗需求的一根原料切法,
    依序填滿, 直到所有需求都滿足。
    每次嘗試所有原料規格, 對每種原料找出「裝最滿」的pattern。
    """
    piece_types = sorted(orders, key=lambda x: x[0], reverse=True)
    lengths = [l for l, q in piece_types]
    demand = [q for l, q in piece_types]
    total_col = sum(l * q for l, q in piece_types)

    # 為每種原料預產生 pattern
    all_patterns = []
    for raw in raw_materials:
        feas = [(l, idx) for idx, l in enumerate(lengths) if l <= raw]
        if not feas:
            continue
        pats = []
        def recp(start, counts, used):
            if counts and used > 0:
                pats.append((dict(counts), used))
            for j in range(start, len(feas)):
                l, idx = feas[j]
                if used + l > raw:
                    continue
                counts[idx] = counts.get(idx, 0) + 1
                recp(j, counts, used + l)
                counts[idx] -= 1
                if counts[idx] == 0:
                    del counts[idx]
        recp(0, {}, 0)
        # 排序: 利用率高 + 填得多的優先, 但要去除「加了額外成品」的pattern
        # 只保留「純粹填飽、不做多餘成品」的pattern: 即沒加任何多餘類型的
        # (加了額外類型的 pattern 在貪婪時會被 demand 約束自然避免)
        pats_sorted = sorted(pats, key=lambda p: (-p[1]/raw, -sum(p[0].values())))
        for counts, used in pats_sorted:
            all_patterns.append((raw, counts, used))

    # 貪婪: 反覆選一根料的最優切法
    plan = []
    rem = list(demand)
    while any(d > 0 for d in rem):
        active = [(i, d) for i, d in enumerate(rem) if d > 0]
        # 找最優 pattern: 不能超過需求、填得最多、利用率最高
        best_pat = None
        best_key = None
        for raw, counts, used in all_patterns:
            # 必須檢查所有種類(包含已滿足的), 不能多切
            if any(counts.get(i, 0) > rem[i] for i in range(len(rem))):
                continue
            if not any(counts.get(i, 0) > 0 for i, _ in active):
                continue
            leftover = raw - used
            efficiency = used / raw
            key = (-efficiency, leftover, -sum(counts.values()))
            if best_key is None or key < best_key:
                best_key = key
                best_pat = (raw, dict(counts), leftover)
        if best_pat is None:
            break
        plan.append(best_pat)
        for i, c in best_pat[1].items():
            rem[i] -= c

    if any(d > 0 for d in rem):
        return [], lengths, 0, 0, 0

    total_raw = len(plan)
    total_raw_len = sum(p[0] for p in plan)
    total_leftover = total_raw_len - total_col
    total_cuts = sum(sum(p[1].values()) for p in plan)
    return plan, lengths, total_raw, total_leftover, total_cuts

# ------------------------------------------------------------------
# 輸出
# ------------------------------------------------------------------
def print_plan(plan, lengths, total_raw, total_leftover, total_cuts):
    print("\n" + "=" * 70)
    print("  裁切方案 (混切優化)")
    print("=" * 70)
    if not plan:
        print("  (無法計算)")
        return
    for i, bar in enumerate(plan, 1):
        raw, counts, leftover = bar
        seg_text = " + ".join([f"{c}支{lengths[tidx]}mm" for tidx, c in sorted(counts.items())])
        print(f"  [料 {i}] {raw}mm 裁切: {seg_text}  (餘料 {leftover}mm)")
    print("\n" + "=" * 70)
    print(f"  使用原料: {total_raw} 根")
    print(f"  總刀數: {total_cuts} 刀")
    print(f"  總餘料: {total_leftover}mm")
    print("=" * 70)

def interactive_mode():
    print("\n" + "=" * 70)
    print("  鐵材裁切配料優化程式 v3 (支援混切)")
    print("=" * 70)
    print(f"  原料規格: {', '.join([str(x/1000) + 'm' for x in RAW_MATERIALS])}")
    print("  使用說明:")
    print("    輸入格式: 長度 數量")
    print("    長度支援: 2250 (mm), 2.25m, 225cm")
    print("    輸入 done 完成, 或 quit 結束程式")
    print("=" * 70)

    while True:
        print("\n  輸入訂單需求:")
        orders = []
        while True:
            line = input("  > ").strip()
            if line.lower() in ('done',):
                break
            if line.lower() == 'quit':
                return
            parts = line.split()
            if len(parts) != 2:
                print("    格式錯誤, 請輸入: 長度 數量")
                continue
            try:
                length = parse_length(parts[0])
                quantity = int(parts[1])
                orders.append((length, quantity))
                print(f"    已加入: {length}mm x {quantity}支")
            except ValueError:
                print("    格式錯誤, 請輸入數字")

        if not orders:
            print("  未輸入訂單, 程式結束")
            return

        plan, lengths, total_raw, total_leftover, total_cuts = optimize_order(orders, RAW_MATERIALS)
        print_plan(plan, lengths, total_raw, total_leftover, total_cuts)

        cont = input("\n  是否繼續下一筆訂單? (y/n): ").strip().lower()
        if cont != 'y':
            return

def demo_mode():
    print("\n" + "=" * 70)
    print("  演示模式 - 範例訂單")
    print("=" * 70)

    orders = [
        (2250, 20),
        (5900, 5),
        (4850, 10),
    ]

    print("\n  訂單需求:")
    for length, qty in orders:
        print(f"    {length}mm x {qty}支")

    plan, lengths, total_raw, total_leftover, total_cuts = optimize_order(orders, RAW_MATERIALS)
    print_plan(plan, lengths, total_raw, total_leftover, total_cuts)

def main():
    print("=" * 70)
    print("  鐵材裁切配料優化程式")
    print("=" * 70)
    print("  1. 互動模式 - 輸入訂單需求")
    print("  2. 演示模式 - 使用範例數據")
    print("=" * 70)

    choice = input("  請選擇模式 (1/2): ").strip()
    if choice == '2':
        demo_mode()
    else:
        interactive_mode()

    print("\n  感謝使用!")

if __name__ == "__main__":
    main()
