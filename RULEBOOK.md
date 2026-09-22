# VNS Theory — Rulebook

Source: *MONEY* (VNS Theory chapter).  
Purpose: single source of truth for marking, reading trend, and later app logic.

---

## 1. What this system is

VNS Theory is a **manual OHLC journaling method**. You write daily High / Low / Open / Close for each script (index, stock, commodity, forex). From those prints you mark swing points and read:

- trend (bullish / bearish)
- reaction (pullback)
- exhaustion (double top / double bottom)
- breakout / breakdown

No indicators. Price structure only.

---

## 2. Daily notebook layout

One page (or sheet) per script. Heading = script name (e.g. Nifty, Sensex, RELIANCE).

| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |
|-------|-------|-------|-------|-------|
| Date | High above Low | Open above Close | **BU side** — marked High + date | **BE side** — marked Low + date |

Blank dates = holidays / weekends.

**Weekly note (after each week):** compare that week’s High/Low to the previous week’s High/Low and label BU / BE / DT / DB as needed (same meaning as daily marks).

---

## 3. Core marking rules (non-negotiable)

These two rules drive everything. Columns 4 and 5 alternate as structure unfolds.

### Rule A — Mark High (Column 4)

**When a prior day’s Low is broken → mark that prior day’s High** (and its date).

That marked High is a candidate for:

- **BU / T (Teji)** — bullish / uptrend reference, if it is a **higher** high vs the relevant previous marked high
- **R (Reaction)** — if it is a bounce high after a fall (typically after BE)
- **DT / A (Atak)** — if it fails to make a meaningfully higher high (see §5)

### Rule B — Mark Low (Column 5)

**When a prior day’s High is taken out → mark that prior day’s Low** (and its date).

That marked Low is a candidate for:

- **BE / M (Mandi)** — bearish / downtrend reference, if it is a **lower** low vs the relevant previous marked low
- **R (Reaction)** — if it is a pullback low after a rise (typically after BU)
- **DB / A** — if it fails to make a meaningfully lower low (see §5)

### Flow

You keep moving **Col 4 ↔ Col 5**:

1. Low broken → mark High (Col 4)  
2. Wait until that High (or a later day’s High in the sequence) is taken out → mark Low (Col 5)  
3. Wait until that Low is broken → mark High again  
4. Repeat

Always judge the new mark against the **previous relevant marks** in Col 4 / Col 5 (not against every raw daily print).

---

## 4. Label glossary

| Label | Hindi | Meaning |
|-------|--------|---------|
| **BU** | **T** Teji | Bullish / uptrend marked High |
| **BE** | **M** Mandi | Bearish / downtrend marked Low |
| **R** | — | Reaction: pullback from a marked BU high, or bounce from a marked BE low |
| **DT** | **A** Atak | Double top — uptrend exhaustion / possible turn down |
| **DB** | **A** Atak | Double bottom — downtrend exhaustion / possible turn up |
| **H / L** | — | Week (or swing) High / Low summary when noted together |

### Typical sequences (from the manual)

- After **BU(T)** → usually **R**, else **DT(A)**, else price goes straight into **BE(M)**
- After **BE(M)** → usually **R**, else **DB(A)**, else price goes straight into **BU(T)**

---

## 5. Double Top / Double Bottom — equality is *not* exact

### Principle

A Double Top or Double Bottom does **not** require the second extreme to print the **same** price as the first.

Markets print noise. Tick size, lot rounding, and instrument decimals differ:

| Script type | Typical print style | Example |
|-------------|---------------------|---------|
| Index (Nifty / Sensex) | often `X.XX` or whole points | 24336.80 vs 24354.55 |
| Stocks | often `0.XX` or `X.XX` | 152.40 vs 152.65 |
| Commodities / forex | varies by contract | may be 0.01, 0.05, 1.0, etc. |

From the manual itself:

- Nasdaq lows **17238.24** and **17239.44** (~1 point apart) → still **DB(A)**
- Nifty highs **24351.55** and **24354.55** (~3 points) → treated as “as good as” a double top in spirit when they fail to expand cleanly

So the app (and the trader) must use **tolerance**, not strict `price1 == price2`.

### Definition (operational)

Let `P1` = earlier marked extreme (high for DT, low for DB).  
Let `P2` = newly marked extreme of the same type.

**Double Top (DT)** when a new marked High is **not a clear higher high** vs `P1` — i.e. it is equal-ish or only slightly higher/lower within tolerance, and fails to establish a clean BU expansion.

**Double Bottom (DB)** when a new marked Low is **not a clear lower low** vs `P1` — equal-ish or only slightly lower/higher within tolerance, and fails to establish a clean BE expansion.

### Tolerance model (for the future app)

Use **both** absolute and relative checks; a match if **either** passes (or both — pick one policy and stick to it; recommended: **either**).

```
abs_diff = |P2 - P1|

# Relative (percent of price level)
pct_diff = abs_diff / P1 * 100

# Tick-aware absolute (script-specific)
tick = instrument tick size   # e.g. 0.05 stock, 0.05 Nifty, 1 Sensex, etc.
abs_ok = abs_diff <= max(N * tick, floor_abs)

# Relative ok
pct_ok = pct_diff <= pct_limit

is_double = abs_ok OR pct_ok
```

### Suggested default tolerances (tunable per script)

These are starting defaults for the app — not sacred numbers. Adjust per instrument class.

| Instrument class | Tick (example) | Absolute floor | Max ticks `N` | % limit |
|------------------|----------------|----------------|---------------|---------|
| Index (Nifty-like) | 0.05 | 5–15 points | — or use floor | 0.05%–0.10% |
| Index (Sensex-like) | 1 | 10–30 points | — | 0.05%–0.10% |
| Mid/high priced stock (> ₹200) | 0.05 / 0.10 | ₹1–₹3 | 20–40 ticks | 0.10%–0.25% |
| Low priced stock (< ₹200) | 0.05 | ₹0.25–₹1 | 10–25 ticks | 0.15%–0.40% |
| Forex / commodity | contract tick | 2–10 ticks | 5–15 ticks | instrument-specific |

**Worked intuition**

- Nifty ~24,000 → 0.05% ≈ 12 points; 3-point gap easily DT/DB noise  
- Stock @ ₹100 → 0.25% = ₹0.25; a ₹0.15 miss can still be DB  
- Stock @ ₹2,500 → 0.10% = ₹2.50  

### Classification rules once tolerance is applied

| Situation | Label |
|-----------|--------|
| New marked High **clearly above** prior BU high (outside tolerance) | **BU / T** |
| New marked High **within tolerance** of prior high (or slightly below but still “same area”) | **DT / A** |
| New marked Low **clearly below** prior BE low (outside tolerance) | **BE / M** |
| New marked Low **within tolerance** of prior low (or slightly above but same area) | **DB / A** |
| Marked High after BE (bounce, not new trend high) | often **R** |
| Marked Low after BU (dip, not new trend low) | often **R** |

### Edge cases

1. **“Almost BU but looks like DT”** — Manual: a high only a few points above prior BU can still behave like DT. App should flag `BU_weak` / `near_DT` when `P2 > P1` but still inside a small “expansion” band (e.g. half of normal BU threshold). Prefer showing both: raw rule + soft label.
2. **DB by 1 tick** — Always treat as DB if within tolerance; do not require exact equality.
3. **Sideways range** — Repeated DT/DB between the same band without breakout = **range / no trade** (manual warning).

---

## 6. Breakout & breakdown

### Breakout (buy side — classic VNS)

Pattern shape: **BU → BE → price crosses the BU level again**.

- Sequence idea in Hindi: **T → M → T** (TMT) at the cross of the earlier T/BU.
- The **breakout price** = the BU high that is finally crossed after the BE phase.
- Example from manual (simplified): BU at 100 → R/DT area → BE at 90 → later cross of **100** = breakout. Breakdown mirror = **90**.

### Breakdown (sell side)

Mirror: **BE → BU → price breaks the BE level again** (MTM-style).

### Author’s trading preference vs father’s rule

| Approach | Entry | Stop idea | Notes |
|----------|--------|-----------|--------|
| Father / classic | Only at breakout / breakdown | Far stop (e.g. opposite extreme) | Clean trend confirmation |
| Author preference | At **DT** (short) or **DB** (long) | Tight stop just beyond the DT/DB extreme | Earlier entry, closer stop |

Both are valid; the app should support **both modes**.

---

## 7. Trade rules (decision layer)

### Mode A — Breakout / Breakdown only

- **Long:** after BU → BE (or reaction structure), **buy when price crosses BU**.
- **Short:** after BE → BU, **sell when price crosses BE**.
- Stop: opposite structure extreme (or user risk %).

### Mode B — Double Top / Double Bottom (preferred in manual for risk)

- **Short on DT:** enter near DT area; stop just above DT high (tolerance-aware high of the two tops).
- **Long on DB:** enter near DB area; stop just below DB low (tolerance-aware low of the two bottoms).
- Rationale: early trend-change signal + tight stop.

### Do not force trades when

- Price chops between the same BU and BE band making repeated DT/DB without expansion (**sideways**).
- Marks are incomplete (need the next Col 4/5 event before labeling confidently).

### Product / instrument preferences (from manual)

- Preferred: **cash / delivery**
- Optional: **Futures** with stop loss always set
- Discouraged: **Options** (time decay)

Script count: discretionary; manual author writes ~40 scripts (~1 minute each). App can watch a watchlist of any size.

---

## 8. Worked micro-example (tolerance + trade)

Prices schematic:

1. Marked high **100** → **BU**  
2. Pullback → marked low **95** → **R**  
3. Bounce high **98** → within tolerance of 100? If using loose “exhaustion”, may be **DT**; if 98 is clearly lower, still often treated as Atak/DT area in discretionary reading  
4. Break below 95 → marked low **90** → **BE**  
5. Bounce, then low near **92** with prior low 90 → if `|92-90|` within tolerance → **DB**  
6. Classic breakout long only above **100**; Mode B long near **92** with stop under **90**

---

## 9. Implementation checklist (for the future app)

When we build, encode in this order:

1. **Ingest OHLC** (daily bars per script) + instrument meta: `tick_size`, `tolerance_abs`, `tolerance_pct`, `class`
2. **Apply Rule A / Rule B** chronologically → produce mark events (high-mark / low-mark with date)
3. **Classify each mark:** BU / BE / R / DT / DB using prior marks + **tolerance**
4. **Detect patterns:** TMT breakout, MTM breakdown, open DT/DB signals
5. **Signal engine:** Mode A and Mode B entries + suggested stops
6. **UI:** notebook-style columns 1–5 + alerts (never require exact price equality for DT/DB)

### Required config fields per script

```text
symbol
tick_size
tolerance_abs          # optional override
tolerance_pct          # optional override
tolerance_mode         # abs | pct | either (default either)
trade_mode             # breakout | double | both
```

### Hard invariants

- Never mark Col 4 High without a Low break event.
- Never mark Col 5 Low without a High takeout event.
- DT/DB comparison always uses **tolerance**, never raw float equality.
- Compare new marks to **previous structure marks**, not to arbitrary earlier days unless they are the active reference.

---

## 10. Open parameters (decide during app build)

- Exact default `tolerance_pct` / `tolerance_abs` per instrument class  
- Whether “slightly higher high inside band” is **DT** or **weak BU**  
- Intraday vs EOD only (manual is daily)  
- Whether weekly marks are auto-derived from daily  

Until decided, use §5 defaults and **Mode B + Mode A both available**.

---

## Quick reference card

1. Low broken → mark prior High (Col 4)  
2. High taken out → mark prior Low (Col 5)  
3. Higher high (outside tolerance) → **BU**; lower low (outside tolerance) → **BE**  
4. Same-area high → **DT**; same-area low → **DB** (tolerance!)  
5. Pullback marks → **R**  
6. Breakout = cross prior **BU** after bearish phase; Breakdown = cross prior **BE** after bullish phase  
7. Trade: breakout/breakdown and/or DT/DB with stop  
8. No trade in tight sideways DT/DB chop  

---

*End of rulebook v1 — ready to drive app design next.*
