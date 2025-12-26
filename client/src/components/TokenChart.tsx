import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
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

export function TokenChart({ isOpen, onClose, tokenMint, tokenSymbol }: TokenChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("24h");

  const { data: priceData, isLoading, error } = useQuery<PriceData>({
    queryKey: ["/api/prices", tokenMint, timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/prices/${tokenMint}?timeframe=${timeframe}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch price data");
      return response.json();
    },
    enabled: isOpen && !!tokenMint,
    staleTime: 60000,
  });

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
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                onClick={() => setTimeframe(tf)}
                data-testid={`button-timeframe-${tf}`}
              >
                {tf}
              </Button>
            ))}
          </div>

          <div className="h-64 w-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Failed to load price data
              </div>
            ) : chartData.length > 0 ? (
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

          <div className="text-center text-xs text-muted-foreground">
            {priceData?.isEstimated 
              ? "Estimated trend based on current market data. Actual history may vary."
              : "Data from DexScreener. Prices may be delayed."}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
