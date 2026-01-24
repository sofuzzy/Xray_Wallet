import { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, TrendingUp, TrendingDown, Loader2, Plus, X, Flame, Wallet } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { PublicKey } from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";

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

interface TokenSearchProps {
  onSelectToken: (token: Token) => void;
}

function formatPrice(price?: number): string {
  if (!price) return "";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "";
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(1)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(1)}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(0)}K`;
  return `$${cap.toFixed(0)}`;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

interface WalletToken {
  mint: string;
  balance: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  decimals?: number;
  priceUsd?: number;
}

export function TokenSearch({ onSelectToken }: TokenSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [customTokens, setCustomTokens] = useState<Token[]>([]);
  const autoLookupRef = useRef<string | null>(null);
  const { toast } = useToast();
  const { address } = useWallet();

  const { data: walletTokens = [] } = useQuery<WalletToken[]>({
    queryKey: ["wallet-tokens", address],
    queryFn: async () => {
      if (!address) return [];
      const response = await fetch(`/api/wallet/tokens/${address}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!address,
    staleTime: 30000,
  });

  const heldTokens: Token[] = useMemo(() => {
    return walletTokens
      .filter(wt => wt.balance > 0 && wt.symbol)
      .map(wt => ({
        mint: wt.mint,
        name: wt.name || wt.symbol || "Unknown",
        symbol: wt.symbol || "???",
        decimals: wt.decimals || 9,
        logoURI: wt.logoURI,
        priceUsd: wt.priceUsd,
      }));
  }, [walletTokens]);

  const { data: trendingTokens = [], isLoading: trendingLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/trending"],
    queryFn: async () => {
      const response = await fetch("/api/swaps/trending", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<Token[]>({
    queryKey: ["/api/tokens/search", searchQuery],
    queryFn: async () => {
      const query = searchQuery.trim();
      if (!query || query.length < 2) return [];
      // Skip search for valid Solana addresses (handled by lookupMint)
      if (isValidSolanaAddress(query)) return [];
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(query)}&limit=20`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.trim().length >= 2 && !isValidSolanaAddress(searchQuery.trim()),
    staleTime: 30000,
  });

  const isSearchingMintAddress = useMemo(() => {
    const query = searchQuery.trim();
    if (!isValidSolanaAddress(query)) return false;
    return !searchResults.some((t) => t.mint.toLowerCase() === query.toLowerCase());
  }, [searchQuery, searchResults]);

  const { mutate: lookupMint, isPending: isLookingUp } = useMutation({
    mutationFn: async (mint: string) => {
      const response = await fetch(`/api/swaps/tokens/${mint}`, { credentials: "include" });
      if (!response.ok) throw new Error("Token not found");
      return response.json();
    },
    onSuccess: (token: Token) => {
      setCustomTokens(prev => {
        if (prev.some(t => t.mint === token.mint)) return prev;
        return [...prev, token];
      });
      onSelectToken(token);
      setSearchQuery("");
      toast({ title: "Token Found", description: `Opening ${token.symbol}` });
    },
    onError: () => {
      toast({ title: "Token Not Found", description: "Could not find token information", variant: "destructive" });
    },
  });

  useEffect(() => {
    const query = searchQuery.trim();
    if (isValidSolanaAddress(query) && query !== autoLookupRef.current && !isLookingUp) {
      autoLookupRef.current = query;
      lookupMint(query);
    }
  }, [searchQuery, isLookingUp]);

  const handleAddCustomToken = () => {
    const mintAddress = searchQuery.trim();
    if (isValidSolanaAddress(mintAddress)) {
      lookupMint(mintAddress);
    }
  };

  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setSearchQuery("");
    setIsFocused(false);
  };

  const displayTokens = searchQuery.trim() ? searchResults : trendingTokens.slice(0, 10);
  const showDropdown = isFocused && (displayTokens.length > 0 || heldTokens.length > 0 || isSearchingMintAddress || searchLoading || trendingLoading);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tokens or paste address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          className="pl-10 bg-muted/50 border-border"
          data-testid="input-token-search"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {(searchLoading || trendingLoading) && (
              <div className="p-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searchLoading && !trendingLoading && (
              <div className="max-h-[350px] overflow-y-auto">
                {/* Your Tokens Section */}
                {!searchQuery.trim() && heldTokens.filter(t => t.mint).length > 0 && (
                  <>
                    <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                      <Wallet className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Your Tokens</span>
                    </div>
                    <div className="p-2 space-y-1">
                      {heldTokens.map((token) => (
                        <button
                          key={`held-${token.mint}`}
                          onClick={() => handleSelectToken(token)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                          data-testid={`held-token-${token.symbol}`}
                        >
                          {token.logoURI ? (
                            <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold">
                              {token.symbol?.charAt(0) || "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{token.name}</div>
                            <div className="text-xs text-muted-foreground">{token.symbol}</div>
                          </div>
                          {token.priceUsd && (
                            <div className="text-right">
                              <div className="text-sm font-medium">{formatPrice(token.priceUsd)}</div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Trending Section */}
                {!searchQuery.trim() && trendingTokens.length > 0 && (
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium">Trending</span>
                  </div>
                )}

                <div className="p-2 space-y-1">
                  {displayTokens.map((token) => (
                    <button
                      key={token.mint}
                      onClick={() => handleSelectToken(token)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                      data-testid={`token-item-${token.symbol}`}
                    >
                      {token.logoURI ? (
                        <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold">
                          {token.symbol?.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{token.name}</span>
                          {token.isTrending && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              <TrendingUp className="w-2 h-2 mr-1" />
                              Hot
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{token.symbol}</span>
                          {token.marketCap && <span>{formatMarketCap(token.marketCap)}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatPrice(token.priceUsd)}</div>
                        {token.priceChange24h !== undefined && (
                          <div className={`flex items-center justify-end gap-0.5 text-xs ${token.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {token.priceChange24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(token.priceChange24h).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </button>
                  ))}

                  {isSearchingMintAddress && (
                    <button
                      onClick={handleAddCustomToken}
                      disabled={isLookingUp}
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                      data-testid="button-add-custom-token"
                    >
                      {isLookingUp ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <Plus className="w-5 h-5 text-primary" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">Look up token</div>
                        <div className="text-xs text-muted-foreground truncate">{searchQuery.trim()}</div>
                      </div>
                    </button>
                  )}

                  {!searchLoading && searchQuery.trim() && displayTokens.length === 0 && !isSearchingMintAddress && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No tokens found
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
