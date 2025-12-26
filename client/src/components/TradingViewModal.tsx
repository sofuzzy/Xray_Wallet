import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, TrendingDown, ExternalLink, Copy, Check, 
  ArrowDownUp, Loader2, BarChart3
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  priceUsd?: number;
  marketCap?: number;
  priceChange24h?: number;
  volume24h?: number;
}

interface TradingViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: Token;
  onTrade?: () => void;
}

function formatPrice(price?: number): string {
  if (!price) return "N/A";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "N/A";
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}K`;
  return `$${cap.toFixed(0)}`;
}

function formatVolume(volume?: number): string {
  if (!volume) return "N/A";
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function TradingViewModal({ isOpen, onClose, token, onTrade }: TradingViewModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  interface PriceHistoryResponse {
    mint: string;
    currentPrice: number;
    priceChange24h: number;
    history: { timestamp: number; price: number }[];
  }

  const { data: priceHistoryData, isLoading: chartLoading } = useQuery<PriceHistoryResponse | null>({
    queryKey: ["/api/price-history", token.mint],
    queryFn: async () => {
      const response = await fetch(`/api/price-history/${token.mint}?timeframe=24h`, { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isOpen && token.mint !== "SOL" && token.mint !== "So11111111111111111111111111111111111111112",
    staleTime: 60000,
  });

  const priceHistory = priceHistoryData?.history || [];

  const { data: tokenDetails } = useQuery<Token>({
    queryKey: ["/api/swaps/tokens", token.mint],
    queryFn: async () => {
      const response = await fetch(`/api/swaps/tokens/${token.mint}`, { credentials: "include" });
      if (!response.ok) return token;
      return response.json();
    },
    enabled: isOpen && token.mint !== "SOL" && token.mint !== "So11111111111111111111111111111111111111112",
    initialData: token,
    staleTime: 30000,
  });

  const currentToken = tokenDetails || token;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Token address copied to clipboard" });
  };

  const handleTradeClick = () => {
    if (onTrade) {
      onTrade();
    }
  };

  const maxPrice = priceHistory.length > 0 ? Math.max(...priceHistory.map(p => p.price)) : 0;
  const minPrice = priceHistory.length > 0 ? Math.min(...priceHistory.map(p => p.price)) : 0;
  const priceRange = maxPrice - minPrice || 1;

  const isSolToken = token.mint === "SOL" || token.mint === "So11111111111111111111111111111111111111112";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border">
        <DialogHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {currentToken.logoURI ? (
                <img src={currentToken.logoURI} alt={currentToken.symbol} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-sm font-bold">
                  {currentToken.symbol?.charAt(0) || "?"}
                </div>
              )}
              <div>
                <DialogTitle className="text-lg font-bold">{currentToken.name}</DialogTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{currentToken.symbol}</span>
                  {!isSolToken && (
                    <button
                      onClick={handleCopy}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      data-testid="button-copy-address"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {shortenAddress(token.mint)}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!isSolToken && (
              <a
                href={`https://solscan.io/token/${token.mint}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
                data-testid="link-solscan"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Price</div>
              <div className="font-bold text-sm" data-testid="text-token-price">{formatPrice(currentToken.priceUsd)}</div>
              {currentToken.priceChange24h !== undefined && (
                <div className={`flex items-center gap-1 text-xs ${currentToken.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {currentToken.priceChange24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(currentToken.priceChange24h).toFixed(2)}%
                </div>
              )}
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
              <div className="font-bold text-sm" data-testid="text-market-cap">{formatMarketCap(currentToken.marketCap)}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
              <div className="font-bold text-sm" data-testid="text-volume">{formatVolume(currentToken.volume24h)}</div>
            </div>
          </div>

          {!isSolToken && (
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Price Chart (24h)</span>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
              
              {chartLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : priceHistory.length > 0 ? (
                <div className="h-32 relative" data-testid="chart-price-history">
                  <svg className="w-full h-full" viewBox={`0 0 ${priceHistory.length} 100`} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M0,${100 - ((priceHistory[0]?.price || 0) - minPrice) / priceRange * 100} ${priceHistory.map((p, i) => `L${i},${100 - (p.price - minPrice) / priceRange * 100}`).join(" ")} V100 H0 Z`}
                      fill="url(#priceGradient)"
                    />
                    <path
                      d={`M0,${100 - ((priceHistory[0]?.price || 0) - minPrice) / priceRange * 100} ${priceHistory.map((p, i) => `L${i},${100 - (p.price - minPrice) / priceRange * 100}`).join(" ")}`}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div className="absolute top-0 right-0 text-xs text-muted-foreground">{formatPrice(maxPrice)}</div>
                  <div className="absolute bottom-0 right-0 text-xs text-muted-foreground">{formatPrice(minPrice)}</div>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                  No price data available
                </div>
              )}
            </div>
          )}

          {!isSolToken && (
            <Button
              onClick={handleTradeClick}
              className="w-full"
              data-testid="button-trade-token"
            >
              <ArrowDownUp className="w-4 h-4 mr-2" />
              Trade {currentToken.symbol}
            </Button>
          )}

          {isSolToken && (
            <div className="text-center text-sm text-muted-foreground py-4">
              This is the native SOL token. Use the Swap feature to trade other tokens for SOL.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
