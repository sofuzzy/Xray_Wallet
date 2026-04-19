import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { shortenAddress } from "@/lib/solana";

interface TokenLaunch {
  id: number;
  name: string;
  symbol: string;
  mintAddress: string;
  decimals: number;
  totalSupply: string;
  creatorAddress: string;
  imageUrl?: string;
  createdAt: string;
}

export function MyTokens() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: launches = [], isLoading } = useQuery<TokenLaunch[]>({
    queryKey: ["/api/token-launches"],
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Address copied to clipboard" });
  };

  const openSolscan = (mintAddress: string) => {
    window.open(`https://solscan.io/token/${mintAddress}`, "_blank");
  };

  if (!isAuthenticated) return null;
  if (isLoading) {
    return (
      <div className="rounded-xl p-0">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">My Tokens</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (launches.length === 0) return null;

  return (
    <div className="rounded-xl p-0">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground" data-testid="text-my-tokens-title">My Tokens</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full" data-testid="text-token-count">
          {launches.length}
        </span>
      </div>

      <div className="space-y-3">
        {launches.map((token) => (
          <div
            key={token.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50"
            data-testid={`card-token-launch-${token.id}`}
          >
            {token.imageUrl ? (
              <img
                src={token.imageUrl.startsWith("http") ? token.imageUrl : `/api/object-storage/public/${token.imageUrl}`}
                alt={token.name}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ring-2 ring-border">
                <span className="text-white text-sm font-bold">
                  {token.symbol.charAt(0)}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate" data-testid={`text-token-name-${token.id}`}>
                  {token.name}
                </span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded" data-testid={`text-token-symbol-${token.id}`}>
                  {token.symbol}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono" data-testid={`text-token-address-${token.id}`}>{shortenAddress(token.mintAddress, 6)}</span>
                <span>·</span>
                <span data-testid={`text-token-supply-${token.id}`}>{Number(token.totalSupply).toLocaleString()} supply</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => copyToClipboard(token.mintAddress)}
                data-testid={`button-copy-token-${token.id}`}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => openSolscan(token.mintAddress)}
                data-testid={`button-view-token-${token.id}`}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
