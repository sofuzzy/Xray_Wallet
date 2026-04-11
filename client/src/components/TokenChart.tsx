import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";

interface OHLCPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartResponse {
  mint: string;
  interval: string;
  points: OHLCPoint[];
}

interface TokenChartProps {
  mint: string;
  symbol?: string;
  interval?: string;
}

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Interval = typeof INTERVALS[number];

export function TokenChart({ mint, symbol, interval: initialInterval }: TokenChartProps) {
  const [activeInterval, setActiveInterval] = useState<Interval>((initialInterval as Interval) ?? "15m");
  const [refreshKey, setRefreshKey] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  const { data, isLoading, isFetching } = useQuery<ChartResponse>({
    queryKey: ["/api/charts", mint, activeInterval, refreshKey],
    queryFn: async () => {
      const res = await fetch(`/api/charts/${encodeURIComponent(mint)}?interval=${activeInterval}`);
      if (!res.ok) throw new Error("Chart fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const buildChart = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1017" },
        textColor: "rgba(148,163,184,0.75)",
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(148,163,184,0.25)", width: 1, style: 3, labelBackgroundColor: "#1e293b" },
        horzLine: { color: "rgba(148,163,184,0.25)", width: 1, style: 3, labelBackgroundColor: "#1e293b" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: activeInterval === "1m" || activeInterval === "5m",
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:          "#10b981",
      downColor:        "#ef4444",
      borderUpColor:    "#10b981",
      borderDownColor:  "#ef4444",
      wickUpColor:      "#10b981",
      wickDownColor:    "#ef4444",
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(16,185,129,0.15)",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volSeries;

    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [activeInterval]);

  useEffect(() => {
    const cleanup = buildChart();
    return cleanup;
  }, [buildChart]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (data.points.length === 0) return;

    const sorted = [...data.points].sort((a, b) => a.time - b.time);

    const deduped: OHLCPoint[] = [];
    for (const pt of sorted) {
      if (deduped.length === 0 || deduped[deduped.length - 1].time !== pt.time) {
        deduped.push(pt);
      }
    }

    try {
      candleSeriesRef.current.setData(
        deduped.map((p) => ({ time: p.time as any, open: p.open, high: p.high, low: p.low, close: p.close }))
      );
      volumeSeriesRef.current.setData(
        deduped.map((p) => ({
          time: p.time as any,
          value: p.volume,
          color: p.close >= p.open ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)",
        }))
      );
      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.warn("[TokenChart] render error:", err);
    }
  }, [data]);

  const hasData = data && data.points.length > 0;
  const showEmpty = !isLoading && !isFetching && !hasData;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setActiveInterval(iv)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeInterval === iv
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`chart-interval-${iv}`}
            >
              {iv}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={isFetching}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
          data-testid="chart-refresh"
          title="Refresh chart"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div
        className="rounded-lg overflow-hidden relative border border-border/20"
        style={{ minHeight: 280, background: "#0c1017" }}
      >
        {isLoading && !data ? (
          <div className="p-3" style={{ height: 280 }}>
            <Skeleton className="h-full w-full rounded opacity-20" />
          </div>
        ) : showEmpty ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
            style={{ height: 280 }}
          >
            <BarChart2 className="w-8 h-8 opacity-20" />
            <p className="text-sm">Chart unavailable right now</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              data-testid="chart-retry"
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            {isFetching && (
              <div className="absolute top-2 right-2 z-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/40" />
              </div>
            )}
            <div ref={chartContainerRef} className="w-full" data-testid="chart-canvas" />
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/35 text-right pr-1">
        Chart powered by aggregated market data
      </p>
    </div>
  );
}
