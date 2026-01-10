import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

interface TokenChartProps {
  isOpen: boolean;
  onClose: () => void;
  tokenMint: string;
  tokenSymbol?: string;
}

type Timeframe = "1h" | "24h" | "7d" | "30d";

interface PricePoint {
  timestamp: number;
  price: number;
}

interface PriceData {
  mint: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  history: PricePoint[];
  timeframe: string;
  isEstimated?: boolean;
  provider?: string;
  cachedAt?: number;
}

function formatPrice(price: number): string {
  if (price < 0.0001) return price.toExponential(2);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(2);
  return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatTime(timestamp: number, timeframe: Timeframe): string {
  const date = new Date(timestamp);
  switch (timeframe) {
    case "1h":
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "24h":
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "7d":
      return date.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
    case "30d":
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function ChartSkeleton() {
  return (
    <div className="space-y-4" data-testid="chart-skeleton">
      <div className="text-center space-y-2">
        <Skeleton className="h-9 w-32 mx-auto" />
        <Skeleton className="h-4 w-24 mx-auto" />
      </div>
      <div className="flex gap-2 justify-center">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-12" />
        ))}
      </div>
      <div className="h-64 w-full relative">
        <div className="absolute inset-0 flex flex-col justify-between py-4">
          <Skeleton className="h-px w-full opacity-30" />
          <Skeleton className="h-px w-full opacity-30" />
          <Skeleton className="h-px w-full opacity-30" />
          <Skeleton className="h-px w-full opacity-30" />
        </div>
        <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
          <path
            d="M0,150 Q50,140 100,120 T200,100 T300,80 T400,60"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="2"
            className="animate-pulse"
          />
        </svg>
      </div>
    </div>
  );
}

function ChartUnavailable({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-4">
      <AlertCircle className="w-12 h-12 opacity-50" />
      <div className="text-center">
        <p className="font-medium">Chart unavailable</p>
        <p className="text-sm">Unable to fetch price data from any provider</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
        data-testid="button-retry-chart"
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
        Try Again
      </Button>
    </div>
  );
}

export function TokenChart({ isOpen, onClose, tokenMint, tokenSymbol }: TokenChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("24h");

  const { data: priceData, isLoading, error, refetch, isFetching } = useQuery<PriceData>({
    queryKey: ["/api/prices", tokenMint, timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/prices/${tokenMint}?timeframe=${timeframe}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch price data");
      return response.json();
    },
    enabled: isOpen && !!tokenMint,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setTimeframe(tf);
  }, []);

  const isPositive = (priceData?.priceChange24h ?? 0) >= 0;
  const chartColor = isPositive ? "#22c55e" : "#ef4444";

  const chartData = priceData?.history?.map((point) => ({
    time: formatTime(point.timestamp, timeframe),
    price: point.price,
    timestamp: point.timestamp,
  })) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {priceData?.symbol || tokenSymbol || "Token"} Price Chart
            {priceData && (
              <Badge variant={isPositive ? "default" : "destructive"} className="ml-2">
                {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {isPositive ? "+" : ""}{priceData.priceChange24h.toFixed(2)}%
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
              className="ml-auto h-8 w-8"
              data-testid="button-refresh-chart"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <ChartSkeleton />
          ) : error ? (
            <ChartUnavailable onRefresh={handleRefresh} isRefreshing={isFetching} />
          ) : (
            <>
              {priceData && (
                <div className="text-center">
                  <p className="text-3xl font-bold">${formatPrice(priceData.currentPrice)}</p>
                  <p className="text-sm text-muted-foreground">{priceData.name}</p>
                </div>
              )}

              <div className="flex gap-2 justify-center">
                {(["1h", "24h", "7d", "30d"] as Timeframe[]).map((tf) => (
                  <Button
                    key={tf}
                    variant={timeframe === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleTimeframeChange(tf)}
                    data-testid={`button-timeframe-${tf}`}
                  >
                    {tf}
                  </Button>
                ))}
              </div>

              <div className="h-64 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `$${formatPrice(value)}`}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(value: number) => [`$${formatPrice(value)}`, "Price"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={chartColor}
                        strokeWidth={2}
                        fill="url(#colorPrice)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No price data available
                  </div>
                )}
              </div>

              <div className="text-center text-xs text-muted-foreground space-y-1">
                <p>
                  {priceData?.isEstimated 
                    ? "Estimated trend based on current market data. Actual history may vary."
                    : `Data from ${priceData?.provider || "DexScreener"}. Prices may be delayed.`}
                </p>
                {priceData?.provider && (
                  <p className="opacity-60">Provider: {priceData.provider}</p>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
