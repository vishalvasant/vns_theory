"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PriceChart from "@/components/PriceChart";
import {
  Analysis,
  Candle,
  User,
  getAnalysis,
  getCandles,
  listAnalyses,
  logout,
  me,
  triggerSync,
} from "@/lib/api";
import { SIGNAL_INFO, TREND_INFO } from "@/lib/labels";
import {
  OpportunityBucket,
  actionTitle,
  biasOf,
  briefCopy,
  countBuckets,
  formatPrice,
  isActionable,
  opportunityBucket,
  plainNote,
} from "@/lib/opportunities";

type Filter = "all" | "buy" | "sell" | OpportunityBucket;

export default function TodayPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [symbol, setSymbol] = useState("");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showSideways, setShowSideways] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setLoadingBoard(true);
    listAnalyses("day")
      .then((rows) => {
        setAnalyses(rows);
        setSymbol((prev) => {
          if (prev) return prev;
          const first = rows.find(isActionable) || rows[0];
          return first?.instrument.symbol || "";
        });
      })
      .catch((err) => setError(String(err.message || err)))
      .finally(() => setLoadingBoard(false));
  }, [user]);

  useEffect(() => {
    if (!user || !symbol) return;
    setError("");
    Promise.all([getCandles(symbol, "day"), getAnalysis(symbol, "day")])
      .then(([c, a]) => {
        setCandles(c);
        setAnalysis(a);
      })
      .catch((err) => {
        setCandles([]);
        setAnalysis(null);
        setError(String(err.message || err));
      });
  }, [user, symbol]);

  const counts = useMemo(() => countBuckets(analyses), [analyses]);
  const brief = useMemo(() => briefCopy(counts), [counts]);

  const boardRows = useMemo(() => {
    return analyses
      .filter((a) => {
        const b = opportunityBucket(a);
        const bias = biasOf(a);
        if (!showSideways && (b === "sideways" || b === "none")) return false;
        if (filter === "all") return true;
        if (filter === "buy") return bias === "buy" || b === "db" || b === "teji";
        if (filter === "sell") return bias === "sell" || b === "dt" || b === "mandi";
        return b === filter;
      })
      .sort((a, b) => {
        const rank = (x: Analysis) => {
          const bucket = opportunityBucket(x);
          if (bucket === "db" || bucket === "dt") return 0;
          if (bucket === "teji" || bucket === "mandi") return 1;
          return 2;
        };
        return rank(a) - rank(b) || a.instrument.symbol.localeCompare(b.instrument.symbol);
      });
  }, [analyses, filter, showSideways]);

  async function onSync() {
    setSyncing(true);
    setError("");
    try {
      const res = await triggerSync(undefined, true);
      if (res.errors?.length) setError(res.errors.slice(0, 3).join(" | "));
      const rows = await listAnalyses("day");
      setAnalyses(rows);
      if (symbol) {
        const [c, a] = await Promise.all([getCandles(symbol, "day"), getAnalysis(symbol, "day")]);
        setCandles(c);
        setAnalysis(a);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!user) {
    return (
      <div className="wrap">
        <p className="muted">Loading desk…</p>
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AppShell
      mode="user"
      user={user}
      active="today"
      title="Today’s moves"
      subtitle={`Daily VNS scan · ${todayLabel} · Atak / Teji / Mandi / DT / DB`}
      actions={
        <button className="btn secondary" type="button" onClick={onSync} disabled={syncing}>
          {syncing ? "Refreshing…" : "Refresh scan"}
        </button>
      }
    >
      <section className="brief">
        <div className="brief-main">
          <div className="eyebrow">Daily market brief · {todayLabel}</div>
          <h1>{brief.title}</h1>
          <p>{brief.body}</p>
        </div>
        <div className="mood">
          <div className="mood-card teji">
            <div className="k">Teji</div>
            <div className="v">{counts.teji}</div>
            <div className="s">Bullish / breakout</div>
          </div>
          <div className="mood-card mandi">
            <div className="k">Mandi</div>
            <div className="v">{counts.mandi}</div>
            <div className="s">Bearish / breakdown</div>
          </div>
          <div className="mood-card rev">
            <div className="k">Reversal</div>
            <div className="v">{counts.setup}</div>
            <div className="s">DT + DB</div>
          </div>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <div className="mobile-pane-tabs" role="tablist" aria-label="Today panels">
        <button type="button" className={mobilePane === "list" ? "on" : ""} onClick={() => setMobilePane("list")}>
          Setups
        </button>
        <button
          type="button"
          className={mobilePane === "detail" ? "on" : ""}
          onClick={() => setMobilePane("detail")}
          disabled={!symbol}
        >
          Chart
        </button>
      </div>

      <section className={`desk pane-${mobilePane}`}>
          <aside className="rail">
            <div className="rail-h">
              <h2>Setups</h2>
              <span>Pick one · chart confirms</span>
            </div>
            <div className="filters">
              {(
                [
                  ["all", "All setups"],
                  ["buy", "Buy zones"],
                  ["sell", "Sell zones"],
                  ["teji", "Teji"],
                  ["mandi", "Mandi"],
                  ["dt", "Atak · DT"],
                  ["db", "Atak · DB"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={showSideways ? "active" : ""}
                onClick={() => setShowSideways((v) => !v)}
              >
                {showSideways ? "Hide sideways" : "Show sideways"}
              </button>
            </div>
            <div className="cards">
              {loadingBoard && <div className="empty-board">Loading daily scan…</div>}
              {!loadingBoard && boardRows.length === 0 && (
                <div className="empty-board">No matching setups. Refresh scan or show sideways.</div>
              )}
              {boardRows.map((a) => {
                const bias = biasOf(a);
                const selected = a.instrument.symbol === symbol;
                return (
                  <button
                    key={a.instrument.id}
                    type="button"
                    className={`setup ${selected ? "selected" : ""}`}
                    onClick={() => {
                      setSymbol(a.instrument.symbol);
                      setMobilePane("detail");
                    }}
                  >
                    <div className="top">
                      <span className="sym">{a.instrument.symbol}</span>
                      <span className={`bias ${bias}`}>{bias}</span>
                    </div>
                    <div className="action">{actionTitle(a)}</div>
                    <div className="why">{plainNote(a)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="stage">
            <div className="stage-h">
              <h2>Focus</h2>
              <span>Analytics view · Daily</span>
            </div>
            <div className="stage-body">
              {!analysis ? (
                <div className="empty-board">Select a setup to load the chart</div>
              ) : (
                <>
                  <div className="title-row">
                    <div>
                      <h3>{analysis.instrument.symbol}</h3>
                      <div className="meta">{analysis.instrument.name} · Daily</div>
                    </div>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => router.push(`/watch?symbol=${analysis.instrument.symbol}`)}
                    >
                      Open in Watch
                    </button>
                  </div>

                  <div className="decision">
                    <div className="dbox primary">
                      <div className="lab">Next move</div>
                      <div className="val">{actionTitle(analysis)}</div>
                    </div>
                    <div className="dbox">
                      <div className="lab">BU · Teji</div>
                      <div className="num">{formatPrice(analysis.last_bu)}</div>
                    </div>
                    <div className="dbox">
                      <div className="lab">BE · Mandi</div>
                      <div className="num">{formatPrice(analysis.last_be)}</div>
                    </div>
                    <div className="dbox">
                      <div className="lab">Stop hint</div>
                      <div className="num">{formatPrice(analysis.stop_hint)}</div>
                    </div>
                  </div>

                  <PriceChart
                    candles={candles}
                    marks={analysis.marks || []}
                    levels={{
                      bu: analysis.last_bu,
                      be: analysis.last_be,
                      dt: analysis.last_dt,
                      db: analysis.last_db,
                    }}
                    timeframe="day"
                  />

                  <div className="explain">
                    <p>
                      <strong>Trend:</strong> {TREND_INFO[analysis.trend] || TREND_INFO.unknown}
                    </p>
                    <p>
                      <strong>Signal:</strong>{" "}
                      {SIGNAL_INFO[analysis.signal]?.meaning || analysis.signal_note || "—"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
      </section>
    </AppShell>
  );
}
