"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle, Mark } from "@/lib/api";

const LABEL_COLOR: Record<string, string> = {
  BU: "#1f7a4d",
  BE: "#b42318",
  R: "#b54708",
  DT: "#6941c6",
  DB: "#026aa2",
};

const INTRADAY = new Set(["1minute", "30minute"]);

type Props = {
  candles: Candle[];
  marks?: Mark[];
  levels?: { bu?: number | null; be?: number | null };
  timeframe?: string;
};

function toChartTime(iso: string, timeframe: string): UTCTimestamp | `${number}-${number}-${number}` {
  if (INTRADAY.has(timeframe)) {
    return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
  }
  return iso.slice(0, 10) as `${number}-${number}-${number}`;
}

export default function PriceChart({ candles, marks = [], levels, timeframe = "day" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { color: "#f6f1e7" },
        textColor: "#1c1917",
      },
      grid: {
        vertLines: { color: "rgba(28,25,23,0.06)" },
        horzLines: { color: "rgba(28,25,23,0.06)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: INTRADAY.has(timeframe),
        secondsVisible: false,
      },
      height: 420,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#1f7a4d",
      downColor: "#b42318",
      borderVisible: false,
      wickUpColor: "#1f7a4d",
      wickDownColor: "#b42318",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [timeframe]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const data = candles.map((c) => ({
      time: toChartTime(c.ts, timeframe),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    // lightweight-charts requires ascending unique times
    const dedup = new Map<string | number, (typeof data)[number]>();
    for (const row of data) dedup.set(row.time as string | number, row);
    const sorted = Array.from(dedup.values()).sort((a, b) =>
      a.time < b.time ? -1 : a.time > b.time ? 1 : 0
    );
    seriesRef.current.setData(sorted);

    if (!INTRADAY.has(timeframe)) {
      const markers = marks.slice(-40).map((m) => ({
        time: String(m.mark_date).slice(0, 10) as `${number}-${number}-${number}`,
        position: m.column_side === "BU" ? ("aboveBar" as const) : ("belowBar" as const),
        color: LABEL_COLOR[m.label] || "#444",
        shape: m.column_side === "BU" ? ("arrowDown" as const) : ("arrowUp" as const),
        text: m.label,
      }));
      seriesRef.current.setMarkers(markers);
    } else {
      seriesRef.current.setMarkers([]);
    }

    // Clear old lines by recreating series data only; price lines stack, so recreate series opts via remove+add is heavy.
    // Use createPriceLine sparingly: wipe by setting data on fresh mount (timeframe effect remounts chart).
    if (levels?.bu != null) {
      seriesRef.current.createPriceLine({
        price: levels.bu,
        color: "#1f7a4d",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "BU",
      });
    }
    if (levels?.be != null) {
      seriesRef.current.createPriceLine({
        price: levels.be,
        color: "#b42318",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "BE",
      });
    }
    chartRef.current.timeScale().fitContent();
  }, [candles, marks, levels, timeframe]);

  return <div className="chart" ref={ref} />;
}
