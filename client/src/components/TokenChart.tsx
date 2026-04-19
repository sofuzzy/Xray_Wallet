import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────────────────
interface OHLCPoint {
  time: number;
  open: number; high: number; low: number; close: number;
  volume: number;
}
interface ChartResponse { mint: string; interval: string; points: OHLCPoint[]; }
interface TokenChartProps { mint: string; symbol?: string; interval?: string; }

const INTERVALS  = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type  Interval   = typeof INTERVALS[number];
const CHART_H    = 320;

// One adjacent interval to prefetch after a delay — keeps GeckoTerminal under rate limit
const PREFETCH_FOR: Record<Interval, Interval> = {
  "1m":  "5m",
  "5m":  "15m",
  "15m": "1h",
  "1h":  "4h",
  "4h":  "1d",
  "1d":  "4h",
};

// ─── Data processing (pure, memoised outside component) ──────────────────────
function processPoints(points: OHLCPoint[]) {
  if (!points.length) return { candles: [], volumes: [] };
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const deduped: OHLCPoint[] = [];
  for (const pt of sorted) {
    if (!deduped.length || deduped[deduped.length - 1].time !== pt.time) {
      deduped.push(pt);
    }
  }
  return {
    candles: deduped.map(p => ({
      time: p.time as any,
      open: p.open, high: p.high, low: p.low, close: p.close,
    })),
    volumes: deduped.map(p => ({
      time: p.time as any,
      value: p.volume,
      color: p.close >= p.open ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.16)",
    })),
  };
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div
      className="w-full rounded-lg overflow-hidden relative"
      style={{ height: CHART_H, background: "#0c1017" }}
    >
      {/* Simulated candle silhouettes */}
      <div className="absolute inset-0 flex items-end gap-[3px] px-4 pb-8 pt-10 opacity-20">
        {Array.from({ length: 48 }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.6) * 40 + Math.random() * 30;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm animate-pulse"
                style={{
                  height: h,
                  background: i % 3 === 0 ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)",
                  animationDelay: `${i * 30}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between px-3 py-6 pointer-events-none">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-px bg-white/[0.03]" />
        ))}
      </div>
      {/* Loading label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-white/25 font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
          Loading chart…
        </div>
      </div>
    </div>
  );
}

// ─── Main chart component ─────────────────────────────────────────────────────
export function TokenChart({ mint, symbol, interval: initialInterval }: TokenChartProps) {
  const [activeInterval, setActiveInterval] = useState<Interval>(
    (initialInterval as Interval) ?? "15m"
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<any>(null);
  const candleRef         = useRef<any>(null);
  const volumeRef         = useRef<any>(null);
  const roRef             = useRef<ResizeObserver | null>(null);
  const resizeTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient       = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────────
  // Note: queryFn is explicit because the default fetcher joins the queryKey
  // array as path segments, but our route uses ?interval= query param.
  const fetchChart = useCallback(
    (iv: string) =>
      fetch(`/api/charts/${mint}?interval=${iv}`, { credentials: "include" })
        .then(r => r.json() as Promise<ChartResponse>),
    [mint],
  );

  const { data, isLoading, isFetching } = useQuery<ChartResponse>({
    queryKey: ["/api/charts", mint, activeInterval, refreshKey],
    queryFn: () => fetchChart(activeInterval),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── Memoised data processing — avoids re-sorting on every parent re-render
  const processed = useMemo(() => processPoints(data?.points ?? []), [data?.points]);

  // ── Prefetch one adjacent interval 3s after mount — avoids rate-limit stacking
  useEffect(() => {
    const iv = PREFETCH_FOR[activeInterval];
    if (!iv) return;
    const timer = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["/api/charts", mint, iv, 0],
        queryFn: () => fetchChart(iv),
        staleTime: 5 * 60 * 1000,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [mint, activeInterval, fetchChart, queryClient]);

  // ── Chart initialisation — only when `mint` changes (not on interval change)
  useEffect(() => {
    let cancelled = false;
    let chart: any = null;

    async function init() {
      const container = chartContainerRef.current;
      if (!container) return;

      // Dynamic import — library only loaded when a chart is actually needed
      const { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries }
        = await import("lightweight-charts");

      if (cancelled || !container) return;

      // Destroy previous instance (token switch)
      if (chartRef.current) {
        roRef.current?.disconnect();
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = createChart(container, {
        width:  container.clientWidth,
        height: CHART_H,
        layout: {
          background: { type: ColorType.Solid, color: "#0c1017" },
          textColor:  "rgba(148,163,184,0.75)",
          fontSize:   11,
          fontFamily: "JetBrains Mono, monospace",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: {
          mode:     CrosshairMode.Normal,
          vertLine: { color: "rgba(148,163,184,0.25)", width: 1, style: 3, labelBackgroundColor: "#1e293b" },
          horzLine: { color: "rgba(148,163,184,0.25)", width: 1, style: 3, labelBackgroundColor: "#1e293b" },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins:  { top: 0.08, bottom: 0.28 },
        },
        timeScale: {
          borderVisible:  false,
          timeVisible:    true,
          secondsVisible: false,
          fixLeftEdge:    false,
          fixRightEdge:   false,
        },
        handleScroll: true,
        handleScale:  true,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor:         "#10b981",
        downColor:       "#ef4444",
        borderUpColor:   "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor:     "#10b981",
        wickDownColor:   "#ef4444",
      });

      const volSeries = chart.addSeries(HistogramSeries, {
        color:       "rgba(16,185,129,0.15)",
        priceFormat: { type: "volume" },
        priceScaleId:"vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });

      chartRef.current  = chart;
      candleRef.current = candleSeries;
      volumeRef.current = volSeries;

      // Debounced ResizeObserver — prevents repaint storm during window resize
      roRef.current = new ResizeObserver(() => {
        if (resizeTimer.current) clearTimeout(resizeTimer.current);
        resizeTimer.current = setTimeout(() => {
          if (chartRef.current && chartContainerRef.current) {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        }, 60);
      });
      roRef.current.observe(container);
    }

    init();

    return () => {
      cancelled = true;
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      roRef.current?.disconnect();
      chart?.remove();
      chartRef.current = null;
    };
  }, [mint]); // ← Only re-create chart when the TOKEN changes, not the interval

  // ── When interval changes: update time-scale options only (no chart rebuild)
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      timeVisible:    true,
      secondsVisible: activeInterval === "1m" || activeInterval === "5m",
    });
  }, [activeInterval]);

  // ── Push new data into existing series whenever data arrives
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    if (!processed.candles.length) return;

    try {
      candleRef.current.setData(processed.candles);
      volumeRef.current.setData(processed.volumes);
      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.warn("[TokenChart] setData error:", err);
    }
  }, [processed]);

  const hasData  = processed.candles.length > 0;
  const showEmpty = !isLoading && !isFetching && !hasData;

  return (
    <div className="space-y-2" data-testid="token-chart-root">

      {/* Interval selector */}
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
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={isFetching}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
          data-testid="chart-refresh"
          title="Refresh chart"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Chart area */}
      <div
        className="rounded-lg overflow-hidden relative border border-border/20"
        style={{ background: "#0c1017" }}
      >
        {/* Skeleton while first load */}
        {isLoading && !data && <ChartSkeleton />}

        {/* Empty state */}
        {showEmpty && (
          <div
            className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
            style={{ height: CHART_H }}
          >
            <BarChart2 className="w-8 h-8 opacity-20" />
            <p className="text-sm">Chart unavailable</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRefreshKey(k => k + 1)}
              data-testid="chart-retry"
            >
              Try again
            </Button>
          </div>
        )}

        {/* Stale-data spinner overlay (non-blocking) */}
        {isFetching && hasData && (
          <div className="absolute top-2 right-2 z-10 opacity-60">
            <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Canvas — always rendered so chart can attach */}
        <div
          ref={chartContainerRef}
          className="w-full"
          style={{ display: showEmpty ? "none" : "block" }}
          data-testid="chart-canvas"
        />
      </div>

      <p className="text-[10px] text-muted-foreground/30 text-right pr-1 font-mono">
        Aggregated market data
      </p>
    </div>
  );
}
