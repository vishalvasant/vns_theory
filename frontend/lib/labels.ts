export type MarkLabel = "BU" | "BE" | "R" | "DT" | "DB";

export const LABEL_INFO: Record<
  MarkLabel,
  { short: string; hindi: string; meaning: string; action: string }
> = {
  BU: {
    short: "Bullish high",
    hindi: "Teji (T)",
    meaning:
      "A confirmed upside reference. Price broke a previous low, so we mark that earlier high. Market is showing strength / uptrend structure.",
    action: "Watch for pullbacks (R) or a later breakout above this level.",
  },
  BE: {
    short: "Bearish low",
    hindi: "Mandi (M)",
    meaning:
      "A confirmed downside reference. Price took out a previous high, so we mark that earlier low. Market is showing weakness / downtrend structure.",
    action: "Watch for bounces (R) or a later breakdown below this level.",
  },
  R: {
    short: "Reaction",
    hindi: "Correction",
    meaning:
      "A temporary pullback against the recent move — not a full trend change yet. After a rise you often get an R low; after a fall you often get an R high.",
    action: "Wait. Reaction alone is not a final buy/sell signal.",
  },
  DT: {
    short: "Double top",
    hindi: "Atak (A)",
    meaning:
      "Price tried to go higher again but stalled near a previous high (not always the exact same price — a little above/below still counts). Uptrend looks tired.",
    action: "Possible short / exit longs. Keep stop just above the double-top area.",
  },
  DB: {
    short: "Double bottom",
    hindi: "Atak (A)",
    meaning:
      "Price tried to go lower again but held near a previous low (small difference still counts). Downtrend looks tired.",
    action: "Possible long / exit shorts. Keep stop just below the double-bottom area.",
  },
};

export const TREND_INFO: Record<string, string> = {
  bullish: "Buyers in control — structure is making higher highs (BU).",
  bullish_exhausted: "Still in an uptrend area, but a double top suggests buyers are tiring.",
  bearish: "Sellers in control — structure is making lower lows (BE).",
  bearish_exhausted: "Still in a downtrend area, but a double bottom suggests sellers are tiring.",
  reactive: "Market is reacting / pulling back — not a clean one-way trend right now.",
  unknown: "Not enough structure yet to call the trend.",
};

export const SIGNAL_INFO: Record<
  string,
  { title: string; meaning: string; bias: "buy" | "sell" | "wait" }
> = {
  breakout_long: {
    title: "Breakout (Buy)",
    meaning: "Price crossed above the bullish high (BU) after a weak/reaction phase. Classic VNS buy trigger.",
    bias: "buy",
  },
  breakdown_short: {
    title: "Breakdown (Sell)",
    meaning: "Price crossed below the bearish low (BE) after a bounce/reaction phase. Classic VNS sell trigger.",
    bias: "sell",
  },
  dt_short: {
    title: "Double top (Sell zone)",
    meaning: "A double top formed — early sign the up-move may reverse. Tighter stop than waiting for full breakdown.",
    bias: "sell",
  },
  db_long: {
    title: "Double bottom (Buy zone)",
    meaning: "A double bottom formed — early sign the down-move may reverse. Tighter stop than waiting for full breakout.",
    bias: "buy",
  },
  sideways: {
    title: "Sideways / range",
    meaning: "Price is stuck between levels with repeated tops/bottoms. Forced trades here are risky — better wait.",
    bias: "wait",
  },
  none: {
    title: "No clear signal",
    meaning: "Structure is updating, but there is no clean breakout, breakdown, or DT/DB trigger yet.",
    bias: "wait",
  },
};

export function labelTitle(code: string) {
  const info = LABEL_INFO[code as MarkLabel];
  return info ? `${code} · ${info.short}` : code;
}

export function trendTitle(trend?: string | null) {
  if (!trend) return "Trend unknown";
  const pretty = trend.replaceAll("_", " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export function signalTitle(signal?: string | null) {
  if (!signal) return "No signal";
  return SIGNAL_INFO[signal]?.title || signal.replaceAll("_", " ");
}
