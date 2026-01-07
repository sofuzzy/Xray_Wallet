import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Wallet, TrendingUp, Loader2, PieChart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { getTokenAccounts } from "@/lib/solana";

interface TokenWithPrice {
  mint: string;
  symbol: string;
  name: string;
  priceUsd?: number;
  decimals: number;
}

interface PortfolioHolding {
  symbol: string;
  name: string;
  balance: number;
  usdValue: number;
  percentage: number;
  mint?: string;
}

interface PortfolioSummaryProps {
  address?: string;
  solBalance: number;
}

export function PortfolioSummary({ address, solBalance }: PortfolioSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: solPrice, isLoading: solPriceLoading } = useQuery<number>({
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

  const { data: walletTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["wallet-tokens", address],
    queryFn: () => address ? getTokenAccounts(address) : Promise.resolve([]),
    enabled: !!address,
    staleTime: 30000,
  });

  const { data: tokenPrices = [] } = useQuery<TokenWithPrice[]>({
    queryKey: ["/api/swaps/tokens"],
    staleTime: 30000,
  });

  const solUsdValue = solBalance * (solPrice || 0);

  const tokenHoldings: PortfolioHolding[] = walletTokens
    .map((wt: { mint: string; balance: number; symbol?: string }) => {
      const tokenInfo = tokenPrices.find((t: TokenWithPrice) => t.mint === wt.mint);
      if (!tokenInfo || !wt.balance) return null;
      const usdValue = wt.balance * (tokenInfo.priceUsd || 0);
      return {
        symbol: tokenInfo.symbol || wt.symbol || "???",
        name: tokenInfo.name || tokenInfo.symbol || "Unknown",
        balance: wt.balance,
        usdValue,
        percentage: 0,
        mint: wt.mint,
      };
    })
    .filter((h): h is PortfolioHolding => h !== null && h.usdValue > 0);

  const tokensUsdValue = tokenHoldings.reduce((sum, h) => sum + h.usdValue, 0);
  const totalPortfolioValue = solUsdValue + tokensUsdValue;

  const allHoldings: PortfolioHolding[] = [
    {
      symbol: "SOL",
      name: "Solana",
      balance: solBalance,
      usdValue: solUsdValue,
      percentage: totalPortfolioValue > 0 ? (solUsdValue / totalPortfolioValue) * 100 : 0,
    },
    ...tokenHoldings.map(h => ({
      ...h,
      percentage: totalPortfolioValue > 0 ? (h.usdValue / totalPortfolioValue) * 100 : 0,
    })),
  ].sort((a, b) => b.usdValue - a.usdValue);

  const isLoading = solPriceLoading || tokensLoading;

  if (!address) return null;

  return (
    <Card className="w-full max-w-md mx-auto overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover-elevate active-elevate-2"
        data-testid="button-expand-portfolio"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <PieChart className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Portfolio Value</p>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-xl font-bold text-foreground" data-testid="text-portfolio-total">
                ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {allHoldings.length} asset{allHoldings.length !== 1 ? "s" : ""}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              <div className="h-2 w-full rounded-full overflow-hidden bg-muted flex">
                {allHoldings.map((holding, idx) => (
                  <div
                    key={holding.symbol}
                    className="h-full transition-all"
                    style={{
                      width: `${holding.percentage}%`,
                      backgroundColor: idx === 0 
                        ? "hsl(var(--primary))" 
                        : `hsl(${(idx * 60) % 360}, 70%, 50%)`,
                    }}
                    title={`${holding.symbol}: ${holding.percentage.toFixed(1)}%`}
                  />
                ))}
              </div>

              <div className="space-y-1 mt-3">
                {allHoldings.map((holding) => (
                  <div
                    key={holding.mint || holding.symbol}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover-elevate"
                    data-testid={`portfolio-holding-${holding.symbol}`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          backgroundColor: holding.symbol === "SOL" 
                            ? "hsl(var(--primary) / 0.2)" 
                            : `hsl(${(allHoldings.indexOf(holding) * 60) % 360}, 70%, 50%, 0.2)`,
                          color: holding.symbol === "SOL"
                            ? "hsl(var(--primary))"
                            : `hsl(${(allHoldings.indexOf(holding) * 60) % 360}, 70%, 40%)`,
                        }}
                      >
                        {holding.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{holding.symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {holding.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm text-foreground">
                        ${holding.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {holding.percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {allHoldings.length === 1 && allHoldings[0].symbol === "SOL" && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Wallet className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p>Only SOL in portfolio</p>
                  <p className="text-xs mt-1">Swap or receive tokens to diversify</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
