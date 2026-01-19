import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, RefreshCw, ArrowRightLeft, ExternalLink } from "lucide-react";

interface TokenChartProps {
  isOpen: boolean;
  onClose: () => void;
  tokenMint: string;
  tokenSymbol?: string;
  onSwap?: () => void;
}

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  pairAddress?: string;
}

function formatPrice(price: number): string {
  if (price < 0.0001) return price.toExponential(2);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(2);
  return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ChartSkeleton() {
  return (
    <div className="space-y-4" data-testid="chart-skeleton">
      <div className="text-center space-y-2">
        <Skeleton className="h-9 w-32 mx-auto" />
        <Skeleton className="h-4 w-24 mx-auto" />
      </div>
      <div className="h-[400px] w-full">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

export function TokenChart({ isOpen, onClose, tokenMint, tokenSymbol, onSwap }: TokenChartProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const { data: tokenInfo, isLoading, refetch, isFetching } = useQuery<TokenInfo>({
    queryKey: ["/api/prices", tokenMint, "info"],
    queryFn: async () => {
      const response = await fetch(`/api/prices/${tokenMint}?timeframe=24h`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch token info");
      const data = await response.json();
      return {
        mint: data.mint,
        symbol: data.symbol,
        name: data.name,
        currentPrice: data.currentPrice,
        priceChange24h: data.priceChange24h,
        pairAddress: data.pairAddress,
      };
    },
    enabled: isOpen && !!tokenMint,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const isPositive = (tokenInfo?.priceChange24h ?? 0) >= 0;
  
  const dexScreenerUrl = `https://dexscreener.com/solana/${tokenMint}?embed=1&theme=dark&trades=0&info=0`;
  const dexScreenerLink = `https://dexscreener.com/solana/${tokenMint}`;

  const handleSwap = () => {
    if (onSwap) {
      onSwap();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{tokenInfo?.symbol || tokenSymbol || "Token"} Price Chart</span>
            {tokenInfo && (
              <Badge variant={isPositive ? "default" : "destructive"}>
                {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {isPositive ? "+" : ""}{tokenInfo.priceChange24h.toFixed(2)}%
              </Badge>
            )}
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8"
                data-testid="button-refresh-chart"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(dexScreenerLink, "_blank")}
                className="h-8 w-8"
                title="Open in DexScreener"
                data-testid="button-open-dexscreener"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <ChartSkeleton />
          ) : (
            <>
              {tokenInfo && (
                <div className="text-center">
                  <p className="text-3xl font-bold">${formatPrice(tokenInfo.currentPrice)}</p>
                  <p className="text-sm text-muted-foreground">{tokenInfo.name}</p>
                </div>
              )}

              <div className="relative h-[400px] w-full rounded-lg overflow-hidden bg-black/50">
                {!iframeLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                )}
                <iframe
                  src={dexScreenerUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setIframeLoaded(true)}
                  title="DexScreener Chart"
                  allow="clipboard-write"
                  loading="lazy"
                />
              </div>

              <div className="flex gap-3 justify-center">
                {onSwap && (
                  <Button
                    onClick={handleSwap}
                    className="flex-1 max-w-xs"
                    data-testid="button-swap-from-chart"
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Swap {tokenInfo?.symbol || tokenSymbol || "Token"}
                  </Button>
                )}
              </div>

              <div className="text-center text-xs text-muted-foreground">
                <p>Chart powered by DexScreener</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
