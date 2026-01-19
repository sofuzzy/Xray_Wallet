import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronUp, Coins, LineChart } from "lucide-react";
import { TokenChart } from "./TokenChart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWallet } from "@/hooks/use-wallet";

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

interface TokenBalancesProps {
  onSwapToken?: (token: { mint: string; symbol: string; name: string; decimals: number; logoURI?: string }) => void;
}

export function TokenBalances({ onSwapToken }: TokenBalancesProps) {
  const { address } = useWallet();
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const handleShowChart = (token: Token) => {
    setSelectedToken(token);
    setShowChartModal(true);
  };

  const formatPrice = (price: number | null) => {
    if (!price) return "";
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toPrecision(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatValue = (balance: number, price: number | null) => {
    if (!price) return null;
    const value = balance * price;
    if (value < 0.01) return "<$0.01";
    if (value < 1) return `$${value.toFixed(2)}`;
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  const getDisplayName = (token: Token) => {
    return token.name || `Token ${token.mint.slice(0, 8)}...`;
  };

  const getDisplaySymbol = (token: Token) => {
    return token.symbol || token.mint.slice(0, 4).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card className="p-6">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center justify-between w-full text-left hover-elevate active-elevate-2 rounded-md p-2 -m-2"
              data-testid="button-toggle-token-balances"
            >
              <h3 className="text-lg font-semibold" data-testid="heading-token-balances">
                Token Balances
              </h3>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">{tokens.length} tokens</span>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-3">
              {tokens.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Coins className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm">No tokens found in this wallet.</p>
                  <p className="text-xs mt-1">Swap SOL for tokens or receive tokens from others.</p>
                </div>
              ) : (
                tokens.map((token: Token) => {
                  const displayName = getDisplayName(token);
                  const displaySymbol = getDisplaySymbol(token);
                  const value = formatValue(token.balance, token.price);
                  const priceChange = token.priceChange24h;
                  const priceChangeColor = priceChange && priceChange > 0 
                    ? "text-green-500" 
                    : priceChange && priceChange < 0 
                      ? "text-destructive" 
                      : "text-muted-foreground";
                  
                  const handleRowClick = () => {
                    if (onSwapToken) {
                      onSwapToken({
                        mint: token.mint,
                        symbol: token.symbol || token.mint.slice(0, 4).toUpperCase(),
                        name: token.name || `Token ${token.mint.slice(0, 8)}`,
                        decimals: token.decimals,
                        logoURI: token.imageUrl || undefined,
                      });
                    }
                  };
                  
                  return (
                    <div
                      key={token.mint}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 transition-colors ${onSwapToken ? 'cursor-pointer hover:bg-muted/70' : ''}`}
                      data-testid={`token-balance-${displaySymbol}`}
                      onClick={handleRowClick}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {token.imageUrl ? (
                          <img 
                            src={token.imageUrl} 
                            alt={displaySymbol} 
                            className="w-8 h-8 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Coins className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate" data-testid={`text-token-name-${displaySymbol}`}>
                            {displayName}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-token-symbol-${displaySymbol}`}>
                            <span>{displaySymbol}</span>
                            {token.price && (
                              <span className="text-xs">{formatPrice(token.price)}</span>
                            )}
                            {priceChange !== null && priceChange !== undefined && (
                              <span className={`text-xs ${priceChangeColor}`}>
                                {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold" data-testid={`text-token-amount-${displaySymbol}`}>
                          {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </div>
                        {value && (
                          <div className="text-sm text-muted-foreground">{value}</div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleShowChart(token)}
                          title="View price chart"
                          data-testid={`button-chart-${displaySymbol}`}
                        >
                          <LineChart className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <TokenChart
        isOpen={showChartModal}
        onClose={() => setShowChartModal(false)}
        tokenMint={selectedToken?.mint || ""}
        tokenSymbol={selectedToken?.symbol || undefined}
      />
    </>
  );
}
