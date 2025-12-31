import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronUp, Eye, Trash2, Plus, LineChart, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TokenChart } from "./TokenChart";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistToken } from "@shared/schema";

interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
}

export function Watchlist() {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [mintAddress, setMintAddress] = useState("");
  const [selectedToken, setSelectedToken] = useState<WatchlistToken | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);

  const { data: watchlist = [], isLoading } = useQuery<WatchlistToken[]>({
    queryKey: ["/api/watchlist"],
  });

  const { data: knownTokens = [] } = useQuery<TokenInfo[]>({
    queryKey: ["/api/swaps/tokens"],
  });

  const addMutation = useMutation({
    mutationFn: async (token: TokenInfo) => {
      return apiRequest("POST", "/api/watchlist", {
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        tokenDecimals: token.decimals,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setShowAddForm(false);
      setMintAddress("");
      toast({ title: "Token added to watchlist" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add token", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Token removed from watchlist" });
    },
  });

  const handleAddToken = () => {
    const trimmed = mintAddress.trim();
    if (trimmed.length < 32) {
      toast({ title: "Invalid mint address", description: "Please enter a valid token mint address", variant: "destructive" });
      return;
    }

    const known = knownTokens.find((t: TokenInfo) => t.mint === trimmed);
    if (known) {
      addMutation.mutate(known);
    } else {
      addMutation.mutate({
        mint: trimmed,
        name: `Token ${trimmed.slice(0, 6)}...`,
        symbol: trimmed.slice(0, 4).toUpperCase(),
        decimals: 9,
      });
    }
  };

  const handleShowChart = (token: WatchlistToken) => {
    setSelectedToken(token);
    setShowChartModal(true);
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
              data-testid="button-toggle-watchlist"
            >
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold" data-testid="heading-watchlist">
                  Watchlist
                </h3>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">{watchlist.length} tokens</span>
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
              {showAddForm ? (
                <div className="flex gap-2 items-center p-3 rounded-lg bg-muted/50">
                  <Input
                    placeholder="Paste token mint address..."
                    value={mintAddress}
                    onChange={(e) => setMintAddress(e.target.value)}
                    className="flex-1 font-mono text-sm"
                    data-testid="input-watchlist-mint"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddToken}
                    disabled={addMutation.isPending || mintAddress.length < 32}
                    data-testid="button-confirm-add-watchlist"
                  >
                    {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setShowAddForm(false); setMintAddress(""); }}
                    data-testid="button-cancel-add-watchlist"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddForm(true)}
                  data-testid="button-add-to-watchlist"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Token to Watchlist
                </Button>
              )}

              {watchlist.length === 0 && !showAddForm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Eye className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm">Your watchlist is empty.</p>
                  <p className="text-xs mt-1">Add tokens to track their prices.</p>
                </div>
              ) : (
                watchlist.map((token: WatchlistToken) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                    data-testid={`watchlist-token-${token.tokenSymbol}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" data-testid={`text-watchlist-name-${token.tokenSymbol}`}>
                        {token.tokenName}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-watchlist-symbol-${token.tokenSymbol}`}>
                        {token.tokenSymbol}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleShowChart(token)}
                        title="View price chart"
                        data-testid={`button-watchlist-chart-${token.tokenSymbol}`}
                      >
                        <LineChart className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMutation.mutate(token.id)}
                        disabled={removeMutation.isPending}
                        title="Remove from watchlist"
                        data-testid={`button-watchlist-remove-${token.tokenSymbol}`}
                      >
                        {removeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <TokenChart
        isOpen={showChartModal}
        onClose={() => setShowChartModal(false)}
        tokenMint={selectedToken?.tokenMint || ""}
        tokenSymbol={selectedToken?.tokenSymbol}
      />
    </>
  );
}
