import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronUp, Eye, Trash2, Plus, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TradingViewModal } from "./TradingViewModal";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistToken } from "@shared/schema";

interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  marketCap: number | null;
  price: number;
  priceChange24h: number;
  sparkline: number[];
  createdAt: number | null;
}

function formatMarketCap(value: number | null): string {
  if (!value) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatAge(timestamp: number | null): string {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  
  const width = 80;
  const height = 32;
  const padding = 2;
  
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  
  const color = positive ? "#22c55e" : "#ef4444";
  
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

  // Fetch metadata for all watchlist tokens - returns object keyed by mint
  const mints = watchlist.map(t => t.tokenMint);
  const { data: tokenMetadata = {} } = useQuery<Record<string, TokenMetadata>>({
    queryKey: ["/api/tokens/metadata/batch", mints],
    queryFn: async () => {
      if (mints.length === 0) return {};
      const response = await fetch("/api/tokens/metadata/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints }),
        credentials: "include",
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: mints.length > 0,
    refetchInterval: 30000,
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
      <Card className="p-4">
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
            <div className="space-y-1">
              {showAddForm ? (
                <div className="flex gap-2 items-center p-3 rounded-lg bg-muted/50 mb-3">
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
                  className="w-full mb-3"
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
                watchlist.map((token: WatchlistToken) => {
                  const meta = tokenMetadata[token.tokenMint];
                  const isPositive = (meta?.priceChange24h || 0) >= 0;
                  
                  return (
                    <div
                      key={token.id}
                      className="flex items-center gap-3 py-3 px-2 rounded-lg hover-elevate active-elevate-2 cursor-pointer"
                      onClick={() => handleShowChart(token)}
                      data-testid={`watchlist-token-${token.tokenSymbol}`}
                    >
                      {/* Token Image */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {meta?.imageUrl ? (
                          <img 
                            src={meta.imageUrl} 
                            alt={token.tokenSymbol}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-bold text-lg">
                            {token.tokenSymbol.charAt(0)}
                          </div>
                        )}
                      </div>
                      
                      {/* Token Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate" data-testid={`text-watchlist-name-${token.tokenSymbol}`}>
                          {meta?.name || token.tokenName}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <span data-testid={`text-watchlist-symbol-${token.tokenSymbol}`}>
                            {meta?.symbol || token.tokenSymbol}
                          </span>
                          {meta?.createdAt && (
                            <span className="opacity-70">{formatAge(meta.createdAt)}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Sparkline Chart */}
                      <div className="hidden sm:block">
                        <Sparkline 
                          data={meta?.sparkline || []} 
                          positive={isPositive}
                        />
                      </div>
                      
                      {/* Market Cap */}
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-lg" data-testid={`text-watchlist-mcap-${token.tokenSymbol}`}>
                          {formatMarketCap(meta?.marketCap || null)}
                        </div>
                      </div>
                      
                      {/* Remove Button */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMutation.mutate(token.id);
                        }}
                        disabled={removeMutation.isPending}
                        title="Remove from watchlist"
                        className="flex-shrink-0"
                        data-testid={`button-watchlist-remove-${token.tokenSymbol}`}
                      >
                        {removeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {showChartModal && selectedToken && (
        <TradingViewModal
          isOpen={showChartModal}
          onClose={() => setShowChartModal(false)}
          token={{
            mint: selectedToken.tokenMint,
            name: selectedToken.tokenName,
            symbol: selectedToken.tokenSymbol,
            decimals: selectedToken.tokenDecimals ?? 9,
          }}
        />
      )}
    </>
  );
}
