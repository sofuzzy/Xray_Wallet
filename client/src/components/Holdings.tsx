import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { TradingViewModal } from "./TradingViewModal";

interface Token {
  mint: string;
  balance: number;
  decimals: number;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  price: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
}

interface TradingToken {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  priceUsd?: number;
  marketCap?: number;
  priceChange24h?: number;
}

interface HoldingsProps {
  solBalance: number;
  onSwapToken?: (token: { mint: string; symbol: string; name: string; decimals: number; logoURI?: string }) => void;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

export function Holdings({ solBalance, onSwapToken }: HoldingsProps) {
  const { address } = useWallet();
  const [selectedToken, setSelectedToken] = useState<TradingToken | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: solPrice } = useQuery<number>({
    queryKey: ["sol-price"],
    queryFn: async () => {
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const data = await response.json();
        return data.solana?.usd || 0;
      } catch {
        return 0;
      }
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: tokens = [], isLoading } = useQuery<Token[]>({
    queryKey: ["wallet-tokens", address],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch(`/api/wallet/tokens/${address}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!address,
    refetchInterval: 30000,
  });

  const formatPrice = (price: number | null) => {
    if (!price) return "";
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toPrecision(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatValue = (value: number) => {
    if (value < 0.01) return "<$0.01";
    if (value < 1) return `$${value.toFixed(2)}`;
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const solUsdValue = solBalance * (solPrice || 0);
  const tokensWithValue = tokens.map(t => ({
    ...t,
    usdValue: t.balance * (t.price || 0)
  }));
  const totalTokenValue = tokensWithValue.reduce((sum, t) => sum + t.usdValue, 0);
  const totalPortfolioValue = solUsdValue + totalTokenValue;

  const handleAssetClick = (asset: TradingToken) => {
    setSelectedToken(asset);
  };

  const handleTrade = () => {
    if (selectedToken && onSwapToken) {
      onSwapToken({
        mint: selectedToken.mint,
        symbol: selectedToken.symbol,
        name: selectedToken.name,
        decimals: selectedToken.decimals,
        logoURI: selectedToken.logoURI,
      });
      setSelectedToken(null);
    }
  };

  const assetCount = 1 + tokens.length;

  if (isLoading) {
    return (
      <div className="p-0" data-testid="holdings-skeleton">
        <div className="flex items-center justify-between mb-5">
          <div>
            <Skeleton className="h-5 w-20 mb-2" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-20 mb-1.5" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
              <div className="text-right">
                <Skeleton className="h-4 w-16 mb-1.5" />
                <Skeleton className="h-3 w-12 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl p-0">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center justify-between w-full text-left rounded-xl py-2 transition-opacity hover:opacity-80"
              data-testid="button-toggle-holdings"
            >
              <div>
                <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-1">
                  Portfolio
                </p>
                <p className="text-2xl font-bold text-foreground font-mono" data-testid="text-portfolio-value">
                  {formatValue(totalPortfolioValue)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs">{assetCount} assets</span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              <div
                className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-all duration-200"
                onClick={() => handleAssetClick({
                  mint: SOL_MINT,
                  name: "Solana",
                  symbol: "SOL",
                  decimals: 9,
                  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
                  priceUsd: solPrice || 0,
                  priceChange24h: undefined,
                })}
                data-testid="holding-SOL"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img 
                    src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                    alt="SOL" 
                    className="w-10 h-10 rounded-full flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-medium">Solana</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>SOL</span>
                      <span className="text-xs">{formatPrice(solPrice || 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold font-mono">
                    {solBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className="text-sm text-muted-foreground">{formatValue(solUsdValue)}</div>
                </div>
              </div>

              {tokensWithValue
                .sort((a, b) => b.usdValue - a.usdValue)
                .map((token) => {
                  const displayName = token.name || `Token ${token.mint.slice(0, 8)}...`;
                  const displaySymbol = token.symbol || token.mint.slice(0, 4).toUpperCase();
                  const priceChange = token.priceChange24h;
                  const priceChangeColor = priceChange && priceChange > 0 
                    ? "text-green-500/70" 
                    : priceChange && priceChange < 0 
                      ? "text-destructive/70" 
                      : "text-muted-foreground";
                  
                  return (
                    <div
                      key={token.mint}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-all duration-200"
                      onClick={() => handleAssetClick({
                        mint: token.mint,
                        name: displayName,
                        symbol: displaySymbol,
                        decimals: token.decimals,
                        logoURI: token.imageUrl || undefined,
                        priceUsd: token.price || undefined,
                        marketCap: token.marketCap || undefined,
                        priceChange24h: token.priceChange24h || undefined,
                      })}
                      data-testid={`holding-${displaySymbol}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {token.imageUrl ? (
                          <img 
                            src={token.imageUrl} 
                            alt={displaySymbol} 
                            className="w-10 h-10 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Coins className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{displayName}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>{displaySymbol}</span>
                            {token.price && (
                              <span className="text-xs">{formatPrice(token.price)}</span>
                            )}
                            {priceChange !== null && priceChange !== undefined && (
                              <span className={`text-xs flex items-center gap-0.5 ${priceChangeColor}`}>
                                {priceChange > 0 ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : priceChange < 0 ? (
                                  <TrendingDown className="w-3 h-3" />
                                ) : null}
                                {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold font-mono">
                          {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </div>
                        {token.usdValue > 0 && (
                          <div className="text-sm text-muted-foreground">{formatValue(token.usdValue)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {tokens.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <Coins className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No other tokens yet</p>
                  <p className="text-xs mt-1">Swap SOL for tokens or receive tokens from others</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {selectedToken && (
        <TradingViewModal
          isOpen={!!selectedToken}
          onClose={() => setSelectedToken(null)}
          token={selectedToken}
          onTrade={handleTrade}
        />
      )}
    </>
  );
}
