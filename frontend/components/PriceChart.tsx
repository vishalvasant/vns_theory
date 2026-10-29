"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi } from "lightweight-charts";
import type { Candle, Mark } from "@/lib/api";

const LABEL_COLOR: Record<string, string> = {
  BU: "#0f766e",
  BE: "#b91c1c",
  R: "#a16207",
  DT: "#6d28d9",
  DB: "#0369a1",
};

const MARK_PRIORITY: Record<string, number> = {
  DT: 0,
  DB: 0,
  BU: 1,
  BE: 1,
  R: 2,
};

const INTRADAY = new Set(["15minute", "30minute", "1hour", "4hour"]);

type Props = {
  candles: Candle[];
  marks?: Mark[];
  levels?: { bu?: number | null; be?: number | null; dt?: number | null; db?: number | null };
  timeframe?: string;
};

function toChartTime(iso: string, timeframe: string) {
  if (INTRADAY.has(timeframe)) {
    return Math.floor(new Date(iso).getTime() / 1000);
  }
  return iso.slice(0, 10);
}

function markDay(markDate: string) {
  return String(markDate).slice(0, 10);
}

export default function PriceChart({ candles, marks = [], levels, timeframe = "day" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart: IChartApi = createChart(ref.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#0b1220",
      },
      grid: {
        vertLines: { color: "rgba(15,23,42,0.05)" },
        horzLines: { color: "rgba(15,23,42,0.05)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: INTRADAY.has(timeframe),
        secondsVisible: false,
      },
      height: 280,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#0f766e",
      downColor: "#b91c1c",
      borderVisible: false,
      wickUpColor: "#0f766e",
      wickDownColor: "#b91c1c",
    });

    const data = candles.map((c) => ({
      time: toChartTime(c.ts, timeframe) as never,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const dedup = new Map<string | number, (typeof data)[number]>();
    for (const row of data) dedup.set(row.time as string | number, row);
    const sorted = Array.from(dedup.values()).sort((a, b) =>
      a.time < b.time ? -1 : a.time > b.time ? 1 : 0
    );
    series.setData(sorted);

    if (!INTRADAY.has(timeframe) && sorted.length) {
      const candleTimes = new Set(sorted.map((row) => String(row.time)));
      const byDay = new Map<string, Mark>();
      const ranked = [...marks].sort((a, b) => {
        const pa = MARK_PRIORITY[a.label] ?? 9;
        const pb = MARK_PRIORITY[b.label] ?? 9;
        if (pa !== pb) return pa - pb;
        return String(b.mark_date).localeCompare(String(a.mark_date));
      });
      for (const m of ranked) {
        const day = markDay(String(m.mark_date));
        if (!candleTimes.has(day)) continue;
        const prev = byDay.get(day);
        if (!prev || (MARK_PRIORITY[m.label] ?? 9) < (MARK_PRIORITY[prev.label] ?? 9)) {
          byDay.set(day, m);
        }
      }
      const structure = [...byDay.values()].filter((m) => m.label !== "R");
      const reactions = [...byDay.values()]
        .filter((m) => m.label === "R")
        .sort((a, b) => String(b.mark_date).localeCompare(String(a.mark_date)))
        .slice(0, 20);
      const chosen = [...structure, ...reactions].sort((a, b) =>
        String(a.mark_date).localeCompare(String(b.mark_date))
      );
      series.setMarkers(
        chosen.map((m) => {
          const isHigh = m.column_side === "BU" || m.label === "DT" || m.label === "BU";
          return {
            time: markDay(String(m.mark_date)) as never,
            position: isHigh ? ("aboveBar" as const) : ("belowBar" as const),
            color: LABEL_COLOR[m.label] || "#444",
            shape: isHigh ? ("arrowDown" as const) : ("arrowUp" as const),
            text: m.label === "DT" || m.label === "DB" ? `A·${m.label}` : m.label,
          };
        })
      );
    }

    const addLine = (price: number | null | undefined, color: string, title: string) => {
      if (price == null) return;
      series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title,
      });
    };
    addLine(levels?.bu, "#0f766e", "BU");
    addLine(levels?.be, "#b91c1c", "BE");
    addLine(levels?.dt, "#6d28d9", "DT");
    addLine(levels?.db, "#0369a1", "DB");

    const fit = () => {
      if (!ref.current) return;
      const width = ref.current.clientWidth;
      const height = Math.round(Math.min(400, Math.max(240, width * 0.62)));
      chart.applyOptions({ width, height });
    };
    fit();
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(fit);
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, marks, levels, timeframe]);

  return <div className="chart" ref={ref} />;
}
