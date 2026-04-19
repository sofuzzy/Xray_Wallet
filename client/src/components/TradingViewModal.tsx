import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, TrendingDown, ExternalLink, Copy, Check, 
  ArrowDownUp
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TokenChart } from "./TokenChart";

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

  const { data: tokenDetails } = useQuery<Token>({
    queryKey: ["token-details", token.mint],
    queryFn: async () => {
      const response = await fetch(`/api/swaps/tokens/${token.mint}`, { credentials: "include" });
      if (!response.ok) return token;
      return response.json();
    },
    enabled: isOpen && token.mint !== "SOL" && token.mint !== "So11111111111111111111111111111111111111112",
    staleTime: 30000,
  });

  const currentToken = tokenDetails ?? token;

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
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-bold">{currentToken.name}</DialogTitle>
                </div>
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
                href={`https://solscan.io/token/${token.mint}`}
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

        <div className="p-5 space-y-5">
          {/* Price hero row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Price</p>
              <p className="text-2xl font-bold font-mono" data-testid="text-token-price">
                {formatPrice(currentToken.priceUsd)}
              </p>
              {currentToken.priceChange24h !== undefined && (
                <div className={`flex items-center gap-1 text-sm mt-1 ${currentToken.priceChange24h >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                  {currentToken.priceChange24h >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {currentToken.priceChange24h >= 0 ? "+" : ""}{Math.abs(currentToken.priceChange24h).toFixed(2)}% (24h)
                </div>
              )}
            </div>
            <div className="text-right space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Market Cap</p>
                <p className="font-semibold text-sm font-mono" data-testid="text-market-cap">{formatMarketCap(currentToken.marketCap)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Volume</p>
                <p className="font-semibold text-sm font-mono" data-testid="text-volume">{formatVolume(currentToken.volume24h)}</p>
              </div>
            </div>
          </div>

          {!isSolToken && (
            <div className="rounded-xl overflow-hidden">
              <TokenChart mint={token.mint} symbol={currentToken.symbol} />
            </div>
          )}

          {!isSolToken && (
            <Button
              onClick={handleTradeClick}
              className="w-full h-11 text-base font-semibold"
              data-testid="button-trade-token"
            >
              <ArrowDownUp className="w-4 h-4 mr-2" />
              Swap {currentToken.symbol}
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
