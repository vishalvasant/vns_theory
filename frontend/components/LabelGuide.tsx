"use client";

import { LABEL_INFO, SIGNAL_INFO, type MarkLabel } from "@/lib/labels";

export default function LabelGuide() {
  const labels = Object.keys(LABEL_INFO) as MarkLabel[];

  return (
    <div className="panel">
      <h2>How to read the labels</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        VNS is a price-structure method. We mark important highs and lows from daily (or other
        timeframe) open-high-low-close data — then read trend and trade ideas from those marks.
      </p>

      <div className="guide-grid">
        {labels.map((code) => {
          const item = LABEL_INFO[code];
          return (
            <article key={code} className="guide-card">
              <div className="guide-code">{code}</div>
              <h3>
                {item.short} <span className="muted">· {item.hindi}</span>
              </h3>
              <p>{item.meaning}</p>
              <p className="muted">
                <strong>What to do:</strong> {item.action}
              </p>
            </article>
          );
        })}
      </div>

      <h3 style={{ marginTop: "1.25rem" }}>Trade signals (simple English)</h3>
      <div className="guide-grid">
        {Object.entries(SIGNAL_INFO).map(([code, item]) => (
          <article key={code} className="guide-card">
            <div className={`badge ${item.bias === "buy" ? "ok" : item.bias === "sell" ? "danger" : "accent"}`}>
              {item.title}
            </div>
            <p style={{ marginBottom: 0 }}>{item.meaning}</p>
          </article>
        ))}
      </div>

      <p className="muted" style={{ marginBottom: 0, marginTop: "1rem" }}>
        Tip: Double top / double bottom do not need the exact same price. A small difference still
        counts — stocks print in paise/points, so we allow a little tolerance.
      </p>
    </div>
  );
}
