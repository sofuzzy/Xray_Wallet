import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Settings2, ChevronDown, ChevronUp, Coins } from "lucide-react";
import { AutoTradeModal } from "./AutoTradeModal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getTokenAccounts, TokenAccountInfo } from "@/lib/solana";
import { useWallet } from "@/hooks/use-wallet";

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  balance?: number;
}

export function TokenBalances() {
  const { address } = useWallet();
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showAutoTradeModal, setShowAutoTradeModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch actual token accounts from the wallet
  const { data: walletTokens = [], isLoading: loadingWalletTokens } = useQuery({
    queryKey: ["wallet-tokens", address],
    queryFn: () => address ? getTokenAccounts(address) : Promise.resolve([]),
    enabled: !!address,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch known token metadata from backend
  const { data: knownTokens = [], isLoading: loadingKnownTokens } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens"],
  });

  // Merge wallet tokens with known metadata
  const tokens: Token[] = walletTokens.map((wt: TokenAccountInfo) => {
    const known = knownTokens.find((kt: Token) => kt.mint === wt.mint);
    return {
      mint: wt.mint,
      name: known?.name || `Token ${wt.mint.slice(0, 8)}...`,
      symbol: known?.symbol || wt.mint.slice(0, 4).toUpperCase(),
      decimals: wt.decimals,
      balance: wt.balance,
    };
  });

  const isLoading = loadingWalletTokens || loadingKnownTokens;

  const handleAutoTrade = (token: Token) => {
    setSelectedToken(token);
    setShowAutoTradeModal(true);
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
                tokens.map((token: Token) => (
                  <div
                    key={token.mint}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                    data-testid={`token-balance-${token.symbol}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" data-testid={`text-token-name-${token.symbol}`}>
                        {token.name}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-token-symbol-${token.symbol}`}>
                        {token.symbol}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold" data-testid={`text-token-amount-${token.symbol}`}>
                        {token.balance?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || "0"} {token.symbol}
                      </div>
                    </div>
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
                ))
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
        currentPrice="0"
      />
    </>
  );
}
