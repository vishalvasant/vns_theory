"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PriceChart from "@/components/PriceChart";
import LabelGuide from "@/components/LabelGuide";
import {
  Analysis,
  Candle,
  Instrument,
  User,
  getAnalysis,
  getCandles,
  listAnalyses,
  listInstruments,
  logout,
  me,
  triggerSync,
} from "@/lib/api";
import {
  LABEL_INFO,
  SIGNAL_INFO,
  TREND_INFO,
  labelTitle,
  signalTitle,
  trendTitle,
  type MarkLabel,
} from "@/lib/labels";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [timeframe, setTimeframe] = useState("day");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

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
    Promise.all([listInstruments(), listAnalyses(timeframe)])
      .then(([inst, ans]) => {
        setInstruments(inst);
        setAnalyses(ans);
        if (inst.length && !inst.find((i) => i.symbol === symbol)) {
          setSymbol(inst[0].symbol);
        }
      })
      .catch((err) => setError(String(err.message || err)));
  }, [user, symbol, timeframe]);

  useEffect(() => {
    if (!user || !symbol) return;
    setError("");
    Promise.all([getCandles(symbol, timeframe), getAnalysis(symbol, timeframe)])
      .then(([c, a]) => {
        setCandles(c);
        setAnalysis(a);
      })
      .catch((err) => {
        setCandles([]);
        setAnalysis(null);
        setError(String(err.message || err));
      });
  }, [user, symbol, timeframe]);

  const signalClass = useMemo(() => {
    const s = analysis?.signal || "";
    const bias = SIGNAL_INFO[s]?.bias;
    if (bias === "buy") return "ok";
    if (bias === "sell") return "danger";
    return "accent";
  }, [analysis]);

  const reading = useMemo(() => {
    const trend = analysis?.trend || "unknown";
    const signal = analysis?.signal || "none";
    return {
      trendTitle: trendTitle(trend),
      trendMeaning: TREND_INFO[trend] || TREND_INFO.unknown,
      signalTitle: signalTitle(signal),
      signalMeaning: SIGNAL_INFO[signal]?.meaning || SIGNAL_INFO.none.meaning,
    };
  }, [analysis]);

  async function onSync(allSymbols = false) {
    setSyncing(true);
    setError("");
    try {
      const res = await triggerSync(allSymbols ? undefined : symbol, true);
      if (res.errors?.length) setError(res.errors.slice(0, 5).join(" | "));
      const [c, a, ans] = await Promise.all([
        getCandles(symbol, timeframe),
        getAnalysis(symbol, timeframe),
        listAnalyses(timeframe === "1minute" || timeframe === "30minute" ? "day" : timeframe),
      ]);
      setCandles(c);
      setAnalysis(a);
      setAnalyses(ans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!user) {
    return (
      <div className="app-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          VNS <span>Analytics</span>
        </div>
        <nav className="nav">
          {user.is_admin && (
            <button className="btn secondary" onClick={() => router.push("/admin")}>
              Admin
            </button>
          )}
          <span>
            {user.email} · {user.package}
          </span>
          <button
            className="btn secondary"
            onClick={() => {
              logout();
              router.push("/");
            }}
          >
            Log out
          </button>
        </nav>
      </header>

      <div className="grid grid-2">
        <aside className="panel">
          <h2>Nifty 50</h2>
          <p className="muted">Select a script</p>
          <ul className="list">
            {instruments.map((i) => (
              <li key={i.id}>
                <button
                  className={i.symbol === symbol ? "active" : ""}
                  onClick={() => setSymbol(i.symbol)}
                >
                  <strong>{i.symbol}</strong>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {i.name}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="grid">
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: "1.8rem" }}>{symbol}</h1>
                <p className="muted" style={{ margin: 0 }}>
                  {analysis?.instrument.name || "VNS structure view"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select
                  className="input"
                  style={{ width: "auto", margin: 0 }}
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                >
                  <option value="1minute">1 Minute</option>
                  <option value="30minute">30 Minute</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
                <button className="btn secondary" onClick={() => onSync(true)} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync all TFs"}
                </button>
                <button className="btn" onClick={() => onSync(false)} disabled={syncing}>
                  {syncing ? "…" : "Sync this"}
                </button>
              </div>
            </div>

            <div className="badges">
              <span className="badge accent">{reading.trendTitle}</span>
              <span className={`badge ${signalClass}`}>{reading.signalTitle}</span>
              {analysis?.last_bu != null && (
                <span className="badge ok" title={LABEL_INFO.BU.meaning}>
                  Bullish high (BU) {analysis.last_bu}
                </span>
              )}
              {analysis?.last_be != null && (
                <span className="badge danger" title={LABEL_INFO.BE.meaning}>
                  Bearish low (BE) {analysis.last_be}
                </span>
              )}
              {analysis?.last_dt != null && (
                <span className="badge" title={LABEL_INFO.DT.meaning}>
                  Double top (DT) {analysis.last_dt}
                </span>
              )}
              {analysis?.last_db != null && (
                <span className="badge" title={LABEL_INFO.DB.meaning}>
                  Double bottom (DB) {analysis.last_db}
                </span>
              )}
              {analysis?.stop_hint != null && (
                <span className="badge">Suggested stop ~ {analysis.stop_hint}</span>
              )}
            </div>

            <div className="reading-box">
              <p>
                <strong>Trend:</strong> {reading.trendMeaning}
              </p>
              <p>
                <strong>Signal:</strong> {reading.signalMeaning}
              </p>
              {analysis?.signal_note && (
                <p className="muted">
                  <strong>Engine note:</strong> {analysis.signal_note}
                </p>
              )}
            </div>
            {error && <p className="error">{error}</p>}

            <PriceChart
              candles={candles}
              marks={analysis?.marks || []}
              levels={{ bu: analysis?.last_bu, be: analysis?.last_be }}
              timeframe={timeframe}
            />
          </div>

          <div className="panel">
            <h2>Recent structure marks</h2>
            <p className="muted">Each row is a VNS mark — hover the label for meaning.</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Side</th>
                  <th>Label</th>
                  <th>In plain English</th>
                  <th>Price</th>
                  <th>Why marked</th>
                </tr>
              </thead>
              <tbody>
                {(analysis?.marks || []).slice(-25).reverse().map((m, idx) => {
                  const info = LABEL_INFO[m.label as MarkLabel];
                  return (
                    <tr key={`${m.mark_date}-${m.label}-${idx}`}>
                      <td>{String(m.mark_date).slice(0, 10)}</td>
                      <td>{m.column_side === "BU" ? "High side" : "Low side"}</td>
                      <td title={info?.meaning}>{labelTitle(m.label)}</td>
                      <td>{info?.meaning || "—"}</td>
                      <td>{m.price}</td>
                      <td className="muted">{m.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LabelGuide />

          <div className="panel">
            <h2>Scanner</h2>
            <p className="muted">Latest Nifty 50 readings in plain English</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Trend</th>
                  <th>Signal</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {analyses.slice(0, 20).map((a) => (
                  <tr key={a.instrument.id}>
                    <td>
                      <button
                        className="btn secondary"
                        style={{ padding: "0.2rem 0.6rem" }}
                        onClick={() => setSymbol(a.instrument.symbol)}
                      >
                        {a.instrument.symbol}
                      </button>
                    </td>
                    <td>{trendTitle(a.trend)}</td>
                    <td>{signalTitle(a.signal)}</td>
                    <td className="muted">
                      {SIGNAL_INFO[a.signal]?.meaning || a.signal_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
