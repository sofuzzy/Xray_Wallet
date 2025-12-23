import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  balance?: number;
}

export function TokenBalances() {
  // Fetch available tokens
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["/api/swaps/tokens"],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4" data-testid="heading-token-balances">
        Token Balances
      </h3>
      <div className="space-y-3">
        {tokens.map((token: Token) => (
          <div
            key={token.mint}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
            data-testid={`token-balance-${token.symbol}`}
          >
            <div className="flex-1">
              <div className="font-medium" data-testid={`text-token-name-${token.symbol}`}>
                {token.name}
              </div>
              <div className="text-sm text-muted-foreground" data-testid={`text-token-symbol-${token.symbol}`}>
                {token.symbol}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold" data-testid={`text-token-amount-${token.symbol}`}>
                0.00 {token.symbol}
              </div>
              <div className="text-sm text-muted-foreground">$0.00</div>
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-white/10 mt-3 text-sm text-muted-foreground">
          <p>Balances will appear after you swap tokens. Start by clicking the Swap button to exchange SOL for other tokens.</p>
        </div>
      </div>
    </Card>
  );
}
