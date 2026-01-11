import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Settings2, ChevronDown, ChevronUp, Coins, LineChart } from "lucide-react";
import { AutoTradeModal } from "./AutoTradeModal";
import { TokenChart } from "./TokenChart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getTokenAccounts, TokenAccountInfo } from "@/lib/solana";
import { useWallet } from "@/hooks/use-wallet";
import { apiRequest } from "@/lib/queryClient";

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  balance?: number;
  imageUrl?: string | null;
  price?: number;
  priceChange24h?: number;
}

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  price: number;
  priceChange24h: number;
}

export function TokenBalances() {
  const { address } = useWallet();
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showAutoTradeModal, setShowAutoTradeModal] = useState(false);
  const [showChartModal, setShowChartModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: walletTokens = [], isLoading: loadingWalletTokens } = useQuery({
    queryKey: ["wallet-tokens", address],
    queryFn: () => address ? getTokenAccounts(address) : Promise.resolve([]),
    enabled: !!address,
    refetchInterval: 30000,
  });

  const { data: knownTokens = [], isLoading: loadingKnownTokens } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens"],
  });

  const walletMints = useMemo(() => 
    walletTokens.map((wt: TokenAccountInfo) => wt.mint).sort(),
    [walletTokens]
  );

  const mintsKey = useMemo(() => walletMints.join(","), [walletMints]);

  const { data: dynamicMetadata = {}, isLoading: loadingMetadata } = useQuery<Record<string, TokenMetadata>>({
    queryKey: ["/api/tokens/metadata/batch", mintsKey],
    queryFn: async () => {
      if (walletMints.length === 0) return {};
      const res = await apiRequest("POST", "/api/tokens/metadata/batch", { mints: walletMints });
      return res.json();
    },
    enabled: walletMints.length > 0,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const tokens: Token[] = useMemo(() => {
    return walletTokens.map((wt: TokenAccountInfo) => {
      const dynamic = dynamicMetadata[wt.mint];
      const known = knownTokens.find((kt: Token) => kt.mint === wt.mint);
      
      const name = dynamic?.name || known?.name || `Token ${wt.mint.slice(0, 8)}...`;
      const symbol = dynamic?.symbol || known?.symbol || wt.mint.slice(0, 4).toUpperCase();
      
      return {
        mint: wt.mint,
        name,
        symbol,
        decimals: wt.decimals,
        balance: wt.balance,
        imageUrl: dynamic?.imageUrl,
        price: dynamic?.price,
        priceChange24h: dynamic?.priceChange24h,
      };
    });
  }, [walletTokens, dynamicMetadata, knownTokens]);

  const isLoading = loadingWalletTokens || loadingKnownTokens;
  const isLoadingMetadata = walletMints.length > 0 && loadingMetadata;

  const handleAutoTrade = (token: Token) => {
    setSelectedToken(token);
    setShowAutoTradeModal(true);
  };

  const handleShowChart = (token: Token) => {
    setSelectedToken(token);
    setShowChartModal(true);
  };

  const formatPrice = (price: number | undefined) => {
    if (!price) return "";
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toPrecision(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatValue = (balance: number | undefined, price: number | undefined) => {
    if (!balance || !price) return null;
    const value = balance * price;
    if (value < 0.01) return "<$0.01";
    if (value < 1) return `$${value.toFixed(2)}`;
    if (value < 1000) return `$${value.toFixed(2)}`;
    if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${(value / 1000000).toFixed(2)}M`;
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
                {isLoadingMetadata && <Loader2 className="w-3 h-3 animate-spin" />}
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
                  const value = formatValue(token.balance, token.price);
                  const priceChange = token.priceChange24h;
                  const priceChangeColor = priceChange && priceChange > 0 
                    ? "text-green-500" 
                    : priceChange && priceChange < 0 
                      ? "text-destructive" 
                      : "text-muted-foreground";
                  
                  return (
                    <div
                      key={token.mint}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                      data-testid={`token-balance-${token.symbol}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {token.imageUrl ? (
                          <img 
                            src={token.imageUrl} 
                            alt={token.symbol} 
                            className="w-8 h-8 rounded-full flex-shrink-0"
                          />
                        ) : isLoadingMetadata ? (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Coins className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate" data-testid={`text-token-name-${token.symbol}`}>
                            {isLoadingMetadata && !token.imageUrl ? (
                              <span className="text-muted-foreground">Loading...</span>
                            ) : (
                              token.name
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-token-symbol-${token.symbol}`}>
                            <span>{isLoadingMetadata && !token.imageUrl ? "..." : token.symbol}</span>
                            {token.price && (
                              <span className="text-xs">{formatPrice(token.price)}</span>
                            )}
                            {priceChange !== undefined && (
                              <span className={`text-xs ${priceChangeColor}`}>
                                {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold" data-testid={`text-token-amount-${token.symbol}`}>
                          {token.balance?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || "0"}
                        </div>
                        {value && (
                          <div className="text-sm text-muted-foreground">{value}</div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleShowChart(token)}
                          title="View price chart"
                          data-testid={`button-chart-${token.symbol}`}
                        >
                          <LineChart className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleAutoTrade(token)}
                          title="Set auto-trade rules"
                          data-testid={`button-autotrade-${token.symbol}`}
                        >
                          <Settings2 className="w-4 h-4" />
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

      <AutoTradeModal
        isOpen={showAutoTradeModal}
        onClose={() => setShowAutoTradeModal(false)}
        tokenMint={selectedToken?.mint}
        tokenSymbol={selectedToken?.symbol}
        currentPrice={selectedToken?.price?.toString() || "0"}
      />

      <TokenChart
        isOpen={showChartModal}
        onClose={() => setShowChartModal(false)}
        tokenMint={selectedToken?.mint || ""}
        tokenSymbol={selectedToken?.symbol}
      />
    </>
  );
}
