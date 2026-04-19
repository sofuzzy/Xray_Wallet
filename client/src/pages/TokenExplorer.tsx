import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, TrendingUp, TrendingDown, Loader2, Flame, Star, 
  ArrowLeft, ExternalLink, Copy, Plus, BarChart3, Volume2,
  DollarSign, Activity, X, Eye, Home, ArrowRightLeft
} from "lucide-react";
import { Link } from "wouter";
import xrayLogo from "@/assets/xray-logo.png";
import { SwapModal } from "@/components/SwapModal";
import { TokenChart } from "@/components/TokenChart";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { PublicKey } from "@solana/web3.js";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { tokenManager } from "@/lib/tokenManager";

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
  isTrending?: boolean;
}

function formatPrice(price?: number): string {
  if (!price) return "$0.00";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "--";
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}K`;
  return `$${cap.toFixed(0)}`;
}

function formatVolume(vol?: number): string {
  if (!vol) return "--";
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(2)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

function TokenCard({ token, onClick, onAddToWatchlist }: { 
  token: Token; 
  onClick: () => void;
  onAddToWatchlist: (token: { mint: string; symbol: string; name: string; decimals?: number }) => void;
}) {
  return (
    <div
      className="p-4 cursor-pointer transition-all duration-200 rounded-xl border border-border/25 bg-card/50 hover:border-border/50 hover:bg-card/80"
      onClick={onClick}
      data-testid={`token-card-${token.symbol}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {token.logoURI ? (
            <img src={token.logoURI} alt={token.symbol} className="w-9 h-9 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-foreground text-sm leading-none">{token.symbol}</h3>
              {token.isTrending && (
                <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-orange-500/8 text-orange-400/70 font-medium tracking-wide">
                  <Flame className="w-2 h-2" />
                  HOT
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{token.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="text-right mr-1">
            <div className="font-semibold text-sm font-mono text-foreground leading-none">{formatPrice(token.priceUsd)}</div>
            {token.priceChange24h !== undefined && (
              <div className={`text-[11px] font-medium mt-0.5 ${token.priceChange24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {token.priceChange24h >= 0 ? "+" : ""}{token.priceChange24h.toFixed(1)}%
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToWatchlist({ mint: token.mint, symbol: token.symbol, name: token.name, decimals: token.decimals });
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            data-testid={`button-add-watchlist-${token.symbol}`}
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono">
        <span>MC {formatMarketCap(token.marketCap)}</span>
        <span>VOL {formatVolume(token.volume24h)}</span>
      </div>
    </div>
  );
}

function TokenDetail({ token, onBack, onAddToWatchlist, onSwap }: { 
  token: Token; 
  onBack: () => void;
  onAddToWatchlist: (token: { mint: string; symbol: string; name: string; decimals?: number }) => void;
  onSwap: () => void;
}) {
  const { toast } = useToast();

  const handleCopyMint = () => {
    navigator.clipboard.writeText(token.mint);
    toast({ title: "Copied!", description: "Token address copied to clipboard" });
  };

  const dexScreenerUrl = `https://dexscreener.com/solana/${token.mint}`;
  const birdeyeUrl = `https://birdeye.so/token/${token.mint}?chain=solana`;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-explorer">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-bold text-foreground">Token Details</h2>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {token.logoURI ? (
              <img src={token.logoURI} alt={token.symbol} className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-lg sm:text-xl font-bold text-primary flex-shrink-0">
                {token.symbol?.charAt(0) || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">{token.name}</h1>
                {token.isTrending && (
                  <Badge variant="secondary" className="flex-shrink-0">
                    <Flame className="w-3 h-3 mr-1 text-orange-500" />
                    Trending
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm sm:text-base">{token.symbol}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={onSwap} size="sm" data-testid="button-swap-token">
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Swap
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAddToWatchlist({ mint: token.mint, symbol: token.symbol, name: token.name, decimals: token.decimals })} data-testid="button-add-watchlist-detail">
              <Star className="w-4 h-4 mr-2" />
              Watchlist
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 text-sm">
          <code className="px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-mono">
            {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
          </code>
          <Button size="icon" variant="ghost" onClick={handleCopyMint}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Price
          </div>
          <p className="text-xl font-bold text-foreground">{formatPrice(token.priceUsd)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Activity className="w-4 h-4" />
            24h Change
          </div>
          <p className={`text-xl font-bold ${(token.priceChange24h || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
            {token.priceChange24h !== undefined ? `${token.priceChange24h >= 0 ? "+" : ""}${token.priceChange24h.toFixed(2)}%` : "--"}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <BarChart3 className="w-4 h-4" />
            Market Cap
          </div>
          <p className="text-xl font-bold text-foreground">{formatMarketCap(token.marketCap)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Volume2 className="w-4 h-4" />
            24h Volume
          </div>
          <p className="text-xl font-bold text-foreground">{formatVolume(token.volume24h)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <TokenChart mint={token.mint} symbol={token.symbol} />
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <a href={dexScreenerUrl} target="_blank" rel="noopener noreferrer" data-testid="link-dexscreener">
            <Eye className="w-4 h-4 mr-2" />
            DexScreener
            <ExternalLink className="w-3 h-3 ml-2" />
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={birdeyeUrl} target="_blank" rel="noopener noreferrer" data-testid="link-birdeye">
            <Eye className="w-4 h-4 mr-2" />
            Birdeye
            <ExternalLink className="w-3 h-3 ml-2" />
          </a>
        </Button>
      </div>
    </motion.div>
  );
}

interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  marketCap?: number;
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  sparkline?: number[];
}

export default function TokenExplorer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [activeTab, setActiveTab] = useState("trending");
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const { toast } = useToast();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await tokenManager.getValidAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Live search using DexScreener API
  const { data: liveSearchResults = [], isLoading: searchLoading } = useQuery<Token[]>({
    queryKey: ["/api/tokens/search", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`, {
        credentials: "include",
        headers,
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: debouncedQuery.length >= 2 && !isValidSolanaAddress(debouncedQuery),
    staleTime: 30000,
  });

  const { data: trendingTokens = [], isLoading: trendingLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/trending"],
    staleTime: 60000,
  });

  const { data: allTokens = [], isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens"],
    staleTime: 60000,
  });

  // Get all unique mints from both lists
  const allMints = useMemo(() => {
    const mints = new Set<string>();
    trendingTokens.forEach(t => mints.add(t.mint));
    allTokens.forEach(t => mints.add(t.mint));
    return Array.from(mints);
  }, [trendingTokens, allTokens]);

  // Fetch enriched metadata for all tokens in batches of 20 (same as Watchlist)
  const { data: tokenMetadata = {} } = useQuery<Record<string, TokenMetadata>>({
    queryKey: ["/api/tokens/metadata/batch", allMints],
    queryFn: async () => {
      if (allMints.length === 0) return {};
      
      // Batch requests in groups of 20 (API limit)
      const batchSize = 20;
      const batches: string[][] = [];
      for (let i = 0; i < allMints.length; i += batchSize) {
        batches.push(allMints.slice(i, i + batchSize));
      }
      
      const results: Record<string, TokenMetadata> = {};
      
      const authHeaders = await getAuthHeaders();
      for (const batch of batches) {
        try {
          const response = await fetch("/api/tokens/metadata/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ mints: batch }),
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            Object.assign(results, data);
          }
        } catch (e) {
          console.error("Batch metadata fetch failed:", e);
        }
      }
      
      return results;
    },
    enabled: allMints.length > 0,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Enrich tokens with metadata
  const enrichToken = (token: Token): Token => {
    const meta = tokenMetadata[token.mint];
    if (!meta) return token;
    return {
      ...token,
      name: meta.name || token.name,
      symbol: meta.symbol || token.symbol,
      logoURI: meta.imageUrl || token.logoURI,
      priceUsd: meta.price ?? token.priceUsd,
      marketCap: meta.marketCap ?? token.marketCap,
      priceChange24h: meta.priceChange24h ?? token.priceChange24h,
      volume24h: meta.volume24h ?? token.volume24h,
    };
  };

  const enrichedTrending = useMemo(() => trendingTokens.map(enrichToken), [trendingTokens, tokenMetadata]);
  const enrichedAll = useMemo(() => allTokens.map(enrichToken), [allTokens, tokenMetadata]);

  // Combine local cache search with live DexScreener results
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || query.length < 2) return [];
    
    // If we have live search results, use them
    if (liveSearchResults.length > 0) {
      return liveSearchResults;
    }
    
    // Fall back to local cache search
    const allData = [...enrichedTrending, ...enrichedAll];
    const uniqueTokens = allData.reduce((acc, token) => {
      if (!acc.find(t => t.mint === token.mint)) {
        acc.push(token);
      }
      return acc;
    }, [] as Token[]);
    return uniqueTokens.filter(t => 
      t.name?.toLowerCase().includes(query) ||
      t.symbol?.toLowerCase().includes(query) ||
      t.mint?.toLowerCase().includes(query)
    ).slice(0, 30);
  }, [searchQuery, enrichedTrending, enrichedAll, liveSearchResults]);

  const { mutate: lookupMint, isPending: isLookingUp } = useMutation({
    mutationFn: async (mint: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/swaps/tokens/${mint}`, { credentials: "include", headers });
      if (!response.ok) throw new Error("Token not found");
      return response.json();
    },
    onSuccess: (token: Token) => {
      setSelectedToken(token);
      setSearchQuery("");
    },
    onError: () => {
      toast({ title: "Token Not Found", description: "Could not find token information", variant: "destructive" });
    },
  });

  const handleSelectToken = async (token: Token) => {
    if (!token.priceUsd && !token.marketCap) {
      lookupMint(token.mint);
    } else {
      setSelectedToken(token);
    }
    setSearchQuery("");
  };

  const { mutate: addToWatchlist } = useMutation({
    mutationFn: async (token: { mint: string; symbol: string; name: string; decimals?: number }) => {
      return apiRequest("POST", "/api/watchlist", {
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        tokenDecimals: token.decimals || 9,
      });
    },
    onSuccess: () => {
      toast({ title: "Added!", description: "Token added to your watchlist" });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
    onError: (error: any) => {
      const message = error?.message || "";
      if (message.includes("409") || message.includes("already")) {
        toast({ title: "Already added", description: "Token is already in your watchlist", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Failed to add token to watchlist", variant: "destructive" });
      }
    },
  });

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (isValidSolanaAddress(query)) {
      lookupMint(query);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text").trim();
    if (isValidSolanaAddress(pastedText)) {
      e.preventDefault();
      setSearchQuery(pastedText);
      lookupMint(pastedText);
    }
  };

  const displayTokens = searchQuery.trim() 
    ? searchResults 
    : activeTab === "trending" 
      ? enrichedTrending 
      : enrichedAll.slice(0, 50);

  const isLoading = searchQuery.trim() && searchQuery.trim().length >= 2 
    ? searchLoading 
    : activeTab === "trending" ? trendingLoading : tokensLoading;
  const isSearchingMint = isValidSolanaAddress(searchQuery.trim()) && searchResults.length === 0;

  if (selectedToken) {
    return (
      <div className="min-h-screen bg-background overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <AnimatePresence mode="wait">
            <TokenDetail 
              token={selectedToken} 
              onBack={() => setSelectedToken(null)}
              onAddToWatchlist={addToWatchlist}
              onSwap={() => setIsSwapOpen(true)}
            />
          </AnimatePresence>
          {isSwapOpen && (
            <SwapModal 
              isOpen={isSwapOpen} 
              onClose={() => setIsSwapOpen(false)} 
              initialOutputToken={selectedToken} 
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/60 px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/" data-testid="link-logo-home">
            <img src={xrayLogo} alt="XRAY" className="h-7 mix-blend-screen hover:opacity-80 transition-opacity" />
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-testid="link-home">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Token Explorer</h1>
          <p className="text-sm text-muted-foreground">Discover and track Solana tokens</p>
        </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tokens or paste mint address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onPaste={handlePaste}
            className="pl-10 bg-muted/50"
            data-testid="input-explorer-search"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {isSearchingMint && (
          <Button onClick={handleSearch} disabled={isLookingUp} data-testid="button-lookup-mint">
            {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Lookup
          </Button>
        )}
      </div>

      {!searchQuery.trim() && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="trending" data-testid="tab-trending">
              <Flame className="w-4 h-4 mr-2" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              <BarChart3 className="w-4 h-4 mr-2" />
              All Tokens
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isLoading || isLookingUp ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : displayTokens.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No tokens found</p>
          {searchQuery.trim() && !isSearchingMint && (
            <p className="text-sm mt-2">Try a different search term or paste a mint address</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayTokens.map((token) => (
            <TokenCard
              key={token.mint}
              token={token}
              onClick={() => handleSelectToken(token)}
              onAddToWatchlist={addToWatchlist}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
