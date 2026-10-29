"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PriceChart from "@/components/PriceChart";
import {
  Analysis,
  Candle,
  Instrument,
  InstrumentSearchHit,
  User,
  getAnalysis,
  getCandles,
  listInstruments,
  logout,
  me,
  openInstrument,
  removeFromWatchlist,
  searchInstruments,
  triggerSync,
} from "@/lib/api";
import { LABEL_INFO, SIGNAL_INFO, TREND_INFO, labelTitle, type MarkLabel } from "@/lib/labels";
import { actionTitle, formatPrice } from "@/lib/opportunities";

const TIMEFRAMES = [
  { value: "15minute", label: "15m" },
  { value: "30minute", label: "30m" },
  { value: "1hour", label: "1h" },
  { value: "4hour", label: "4h" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export default function WatchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSymbol = (searchParams.get("symbol") || "").toUpperCase();

  const [user, setUser] = useState<User | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<InstrumentSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | "NSE" | "BSE">("ALL");
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState("day");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const searchSeq = useRef(0);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  async function refreshLibrary(preferSymbol?: string) {
    const rows = await listInstruments();
    setInstruments(rows);
    setSymbol((prev) => preferSymbol || prev || rows[0]?.symbol || "");
    return rows;
  }

  useEffect(() => {
    if (!user) return;
    refreshLibrary(initialSymbol || undefined).catch((err) =>
      setError(String(err.message || err))
    );
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !symbol) return;
    setLoading(true);
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
      })
      .finally(() => setLoading(false));
  }, [user, symbol, timeframe]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchInstruments(q, exchangeFilter === "ALL" ? undefined : exchangeFilter)
        .then((rows) => {
          if (seq !== searchSeq.current) return;
          setHits(rows);
        })
        .catch((err) => {
          if (seq !== searchSeq.current) return;
          setHits([]);
          setError(String(err.message || err));
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 280);
    return () => clearTimeout(timer);
  }, [query, exchangeFilter]);

  const libraryFilter = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || hits.length > 0) return instruments;
    return instruments.filter(
      (i) =>
        i.symbol.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.trading_symbol || "").toLowerCase().includes(q) ||
        i.instrument_key.toLowerCase().includes(q)
    );
  }, [instruments, query, hits.length]);

  const selected = instruments.find((i) => i.symbol === symbol) || null;
  const signalBias = SIGNAL_INFO[analysis?.signal || ""]?.bias;
  const showUniverse = query.trim().length > 0;

  async function onPickHit(hit: InstrumentSearchHit) {
    setOpeningKey(hit.instrument_key);
    setError("");
    try {
      const res = await openInstrument(hit.instrument_key, true, true);
      if (res.sync?.errors?.length) setError(res.sync.errors.slice(0, 3).join(" | "));
      await refreshLibrary(res.instrument.symbol);
      setSymbol(res.instrument.symbol);
      setMobilePane("detail");
      router.replace(`/watch?symbol=${encodeURIComponent(res.instrument.symbol)}`);
      setQuery("");
      setHits([]);
      const [c, a] = await Promise.all([
        getCandles(res.instrument.symbol, timeframe),
        getAnalysis(res.instrument.symbol, timeframe),
      ]);
      setCandles(c);
      setAnalysis(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open script");
    } finally {
      setOpeningKey(null);
    }
  }

  async function onSelectLibrary(inst: Instrument) {
    setSymbol(inst.symbol);
    setMobilePane("detail");
    router.replace(`/watch?symbol=${encodeURIComponent(inst.symbol)}`);
    // Ensure it stays on the user's revisit list
    try {
      await openInstrument(inst.instrument_key, false, false);
      await refreshLibrary(inst.symbol);
    } catch {
      /* already in DB */
    }
  }

  async function onSyncThis() {
    if (!symbol) return;
    setSyncing(true);
    setError("");
    try {
      const res = await triggerSync(symbol, true);
      if (res.errors?.length) setError(res.errors.slice(0, 3).join(" | "));
      const [c, a] = await Promise.all([getCandles(symbol, timeframe), getAnalysis(symbol, timeframe)]);
      setCandles(c);
      setAnalysis(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function onRemove(sym: string) {
    try {
      await removeFromWatchlist(sym);
      const rows = await refreshLibrary();
      if (symbol === sym) {
        const next = rows[0]?.symbol || "";
        setSymbol(next);
        router.replace(next ? `/watch?symbol=${encodeURIComponent(next)}` : "/watch");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  if (!user) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell
      mode="user"
      user={user}
      active="watch"
      title="Watch a script"
      subtitle="Search any NSE / BSE equity · save to your list · candles stay in DB"
      actions={
        symbol ? (
          <button className="btn secondary" type="button" onClick={onSyncThis} disabled={syncing || !!openingKey}>
            {syncing ? "Syncing…" : "Sync this"}
          </button>
        ) : null
      }
    >
      {error && <p className="error">{error}</p>}
      {openingKey && <p className="muted">Opening script & storing candles…</p>}

      <div className="mobile-pane-tabs" role="tablist" aria-label="Watch panels">
        <button type="button" className={mobilePane === "list" ? "on" : ""} onClick={() => setMobilePane("list")}>
          Scripts
        </button>
        <button
          type="button"
          className={mobilePane === "detail" ? "on" : ""}
          onClick={() => setMobilePane("detail")}
          disabled={!symbol}
        >
          Analysis
        </button>
      </div>

      <section className={`desk pane-${mobilePane}`}>
        <aside className="rail">
          <div className="rail-h">
            <h2>Scripts</h2>
            <span>{libraryFilter.length} saved</span>
          </div>

          <div className="search-box search-universe">
            <div className="exchange-toggle">
              {(["ALL", "NSE", "BSE"] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className={exchangeFilter === ex ? "on" : ""}
                  onClick={() => setExchangeFilter(ex)}
                >
                  {ex === "ALL" ? "All" : ex}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ margin: 0 }}
              placeholder="Search NSE / BSE symbol or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {showUniverse && (
              <div className="search-results">
                {searching && <div className="search-hint">Searching universe…</div>}
                {!searching && hits.length === 0 && (
                  <div className="search-hint">No NSE/BSE match for “{query}”</div>
                )}
                {hits.map((hit) => (
                  <button
                    key={hit.instrument_key}
                    type="button"
                    className="search-hit"
                    disabled={openingKey === hit.instrument_key}
                    onClick={() => onPickHit(hit)}
                  >
                    <div className="hit-top">
                      <span className="sym">{hit.trading_symbol}</span>
                      <span className="exch">{hit.exchange}</span>
                    </div>
                    <div className="hit-name">{hit.name}</div>
                    <div className="hit-meta">
                      {hit.in_library ? "In library · click to open" : "Add · sync candles"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cards script-list">
            {!showUniverse && libraryFilter.length === 0 && (
              <div className="empty-board">Search any NSE or BSE script to add it here</div>
            )}
            {!showUniverse &&
              libraryFilter.map((inst) => (
                <div
                  key={inst.id}
                  className={`setup script-row ${inst.symbol === symbol ? "selected" : ""}`}
                >
                  <button type="button" className="script-main" onClick={() => onSelectLibrary(inst)}>
                    <div className="top">
                      <span className="sym">{inst.trading_symbol || inst.symbol}</span>
                      <span className="exch">{inst.exchange || "NSE"}</span>
                    </div>
                    <div className="why">{inst.name}</div>
                  </button>
                  <button
                    type="button"
                    className="script-remove"
                    title="Remove from list"
                    onClick={() => onRemove(inst.symbol)}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </aside>

        <section className="stage">
          <div className="stage-h">
            <h2>Analysis</h2>
            <span>Chart confirms the structure</span>
          </div>
          <div className="stage-body">
            {!selected ? (
              <div className="empty-board">Search and open a script to start</div>
            ) : (
              <>
                <div className="title-row">
                  <div>
                    <h3>
                      {selected.trading_symbol || selected.symbol}{" "}
                      <span className="exch-inline">{selected.exchange || "NSE"}</span>
                    </h3>
                    <div className="meta">{selected.name}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      className="input"
                      style={{ margin: 0, width: "auto", padding: "0.45rem 0.7rem" }}
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                    >
                      {TIMEFRAMES.map((tf) => (
                        <option key={tf.value} value={tf.value}>
                          {tf.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {loading && <p className="muted">Loading chart & analysis…</p>}

                {analysis && (
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
                )}

                <PriceChart
                  candles={candles}
                  marks={analysis?.marks || []}
                  levels={{
                    bu: analysis?.last_bu,
                    be: analysis?.last_be,
                    dt: analysis?.last_dt,
                    db: analysis?.last_db,
                  }}
                  timeframe={timeframe}
                />

                {analysis && (
                  <>
                    <div className="levels">
                      <div className="level">
                        <div className="k">Trend</div>
                        <div className="v" style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>
                          {analysis.trend.replaceAll("_", " ")}
                        </div>
                      </div>
                      <div className="level">
                        <div className="k">Signal</div>
                        <div className="v" style={{ fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>
                          <span
                            className={`badge ${
                              signalBias === "buy" ? "ok" : signalBias === "sell" ? "danger" : "accent"
                            }`}
                          >
                            {SIGNAL_INFO[analysis.signal]?.title || analysis.signal}
                          </span>
                        </div>
                      </div>
                      <div className="level">
                        <div className="k">DT</div>
                        <div className="v">{formatPrice(analysis.last_dt)}</div>
                      </div>
                      <div className="level">
                        <div className="k">DB</div>
                        <div className="v">{formatPrice(analysis.last_db)}</div>
                      </div>
                    </div>

                    <div className="explain">
                      <p>
                        <strong>Trend:</strong> {TREND_INFO[analysis.trend] || TREND_INFO.unknown}
                      </p>
                      <p>
                        <strong>Signal:</strong>{" "}
                        {SIGNAL_INFO[analysis.signal]?.meaning || analysis.signal_note || "—"}
                      </p>
                      {analysis.signal_note && (
                        <p>
                          <strong>Engine note:</strong> {analysis.signal_note}
                        </p>
                      )}
                    </div>

                    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                      <div className="rail-h">
                        <h2>Structure marks</h2>
                        <span>{(analysis.marks || []).length} marks</span>
                      </div>
                      <div className="table-scroll" style={{ maxHeight: 280 }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Side</th>
                              <th>Label</th>
                              <th>Price</th>
                              <th>Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(analysis.marks || [])
                              .slice()
                              .reverse()
                              .slice(0, 40)
                              .map((m, idx) => {
                                const info = LABEL_INFO[m.label as MarkLabel];
                                return (
                                  <tr key={`${m.mark_date}-${m.label}-${idx}`}>
                                    <td>{String(m.mark_date).slice(0, 10)}</td>
                                    <td>{m.column_side === "BU" ? "High" : "Low"}</td>
                                    <td title={info?.meaning}>{labelTitle(m.label)}</td>
                                    <td style={{ fontFamily: "var(--font-mono)" }}>{formatPrice(m.price)}</td>
                                    <td className="muted">{m.note || info?.short || "—"}</td>
                                  </tr>
                                );
                              })}
                            {(analysis.marks || []).length === 0 && (
                              <tr>
                                <td colSpan={5} className="muted">
                                  No marks yet for this timeframe — try Sync this.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {!loading && !analysis && (
                  <div className="empty-board">
                    Analysis not ready for {symbol} / {timeframe}. Try Sync this.
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
