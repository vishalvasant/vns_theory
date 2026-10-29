import type { Analysis } from "@/lib/api";
import { SIGNAL_INFO, signalTitle } from "@/lib/labels";

export type OpportunityBucket = "teji" | "mandi" | "db" | "dt" | "sideways" | "none";

export function opportunityBucket(a: Analysis): OpportunityBucket {
  // Mode B Atak first — never bury DT/DB under sideways/trend heuristics
  if (a.signal === "db_long") return "db";
  if (a.signal === "dt_short") return "dt";
  if (a.signal === "breakout_long") return "teji";
  if (a.signal === "breakdown_short") return "mandi";
  if (a.signal === "sideways") return "sideways";
  if (a.trend === "bullish" || a.trend === "bullish_exhausted") return "teji";
  if (a.trend === "bearish" || a.trend === "bearish_exhausted") return "mandi";
  if (a.trend === "reactive") return "teji";
  // Soft Atak cues from stored levels when signal is still settling
  if (a.last_dt != null && a.trend === "bullish_exhausted") return "dt";
  if (a.last_db != null && a.trend === "bearish_exhausted") return "db";
  return "none";
}

export function isActionable(a: Analysis): boolean {
  const b = opportunityBucket(a);
  return b !== "sideways" && b !== "none";
}

export function bucketTag(bucket: OpportunityBucket): { label: string; className: string } {
  switch (bucket) {
    case "teji":
      return { label: "Teji", className: "teji" };
    case "mandi":
      return { label: "Mandi", className: "mandi" };
    case "db":
      return { label: "Atak · DB", className: "setup" };
    case "dt":
      return { label: "Atak · DT", className: "setup" };
    case "sideways":
      return { label: "Sideways", className: "sideways" };
    default:
      return { label: "Watch", className: "sideways" };
  }
}

export function plainNote(a: Analysis): string {
  const bucket = opportunityBucket(a);
  if (bucket === "db") return "Atak (DB) — Mandi tired near support";
  if (bucket === "dt") return "Atak (DT) — Teji tired near resistance";
  if (bucket === "teji" && a.signal === "breakout_long") return "Above last BU — strength continuing";
  if (bucket === "mandi" && a.signal === "breakdown_short") return "Below last BE — sellers in control";
  if (bucket === "teji" && a.trend === "reactive") return "Reaction / pullback — wait for next cue";
  if (bucket === "teji") return "Buyers in control — Teji structure";
  if (bucket === "mandi") return "Sellers in control — Mandi structure";
  if (bucket === "sideways") return "Range / sideways — skip forced trades";
  return a.signal_note || SIGNAL_INFO[a.signal]?.meaning || "Structure updating";
}

export function actionTitle(a: Analysis): string {
  const bucket = opportunityBucket(a);
  if (bucket === "db") return "Atak · Double bottom (DB)";
  if (bucket === "dt") return "Atak · Double top (DT)";
  if (a.signal === "breakout_long") return "Teji · Breakout watch";
  if (a.signal === "breakdown_short") return "Mandi · Breakdown watch";
  if (a.trend === "reactive") return "Teji · Pullback (R)";
  if (a.trend === "bullish_exhausted") return "Atak watch · Teji tired";
  if (a.trend === "bearish_exhausted") return "Atak watch · Mandi tired";
  if (bucket === "teji") return "Teji · Bullish structure";
  if (bucket === "mandi") return "Mandi · Bearish structure";
  if (bucket === "sideways") return "Sideways · Wait";
  return signalTitle(a.signal);
}

export function biasOf(a: Analysis): "buy" | "sell" | "wait" {
  const bucket = opportunityBucket(a);
  if (bucket === "db" || bucket === "teji") return "buy";
  if (bucket === "dt" || bucket === "mandi") return "sell";
  return SIGNAL_INFO[a.signal]?.bias || "wait";
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function briefCopy(counts: ReturnType<typeof countBuckets>): { title: string; body: string } {
  if (counts.actionable === 0) {
    return {
      title: "No clean setups yet — wait for structure to clarify.",
      body: "Sideways names stay hidden. Refresh the scan after sync, or show sideways if you want the full list.",
    };
  }
  if (counts.setup > 0) {
    return {
      title: `${counts.setup} Atak setups (DT/DB) on the board today.`,
      body: "Start with Atak names, then Teji / Mandi structure. Sideways stays filtered unless you turn it on.",
    };
  }
  if (counts.mandi > counts.teji) {
    return {
      title: `Mandi bias across ${counts.mandi} scripts today.`,
      body: "Respect BE levels on the chart. Wait for DB Atak before flipping long.",
    };
  }
  return {
    title: `Teji bias across ${counts.teji} scripts today.`,
    body: "Chart-confirm BU levels before chasing. Watch for DT Atak near resistance.",
  };
}

export function countBuckets(rows: Analysis[]) {
  const counts = { actionable: 0, teji: 0, mandi: 0, setup: 0, sideways: 0 };
  for (const a of rows) {
    const b = opportunityBucket(a);
    if (b === "sideways") counts.sideways += 1;
    if (b === "teji") {
      counts.teji += 1;
      counts.actionable += 1;
    } else if (b === "mandi") {
      counts.mandi += 1;
      counts.actionable += 1;
    } else if (b === "db" || b === "dt") {
      counts.setup += 1;
      counts.actionable += 1;
    }
  }
  return counts;
}
