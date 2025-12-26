import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Loader2, Search, X, Plus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PublicKey } from "@solana/web3.js";

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

const JUPITER_TOKEN_LIST_URL = "https://token.jup.ag/strict";
const CACHE_KEY = "xray_token_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedTokens(): Token[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { tokens, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return tokens;
  } catch {
    return null;
  }
}

function setCachedTokens(tokens: Token[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tokens, timestamp: Date.now() }));
  } catch {}
}

async function fetchTokensFromJupiter(): Promise<Token[]> {
  const cached = getCachedTokens();
  if (cached) return cached;

  try {
    const response = await fetch(JUPITER_TOKEN_LIST_URL);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const tokens: Token[] = data.map((t: any) => ({
      mint: t.address,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      logoURI: t.logoURI,
    }));
    setCachedTokens(tokens);
    return tokens;
  } catch (error) {
    console.error("Failed to fetch from Jupiter:", error);
    // Return fallback from server
    const response = await fetch("/api/swaps/tokens");
    return response.json();
  }
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

export function SwapModal({ isOpen, onClose }: SwapModalProps) {
  const { balance } = useWallet();
  const { toast } = useToast();
  const [inputAmount, setInputAmount] = useState("");
  const [inputMint, setInputMint] = useState("SOL");
  const [outputMint, setOutputMint] = useState("USDC");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);
  const [customTokens, setCustomTokens] = useState<Token[]>(() => {
    try {
      const saved = localStorage.getItem("xray_custom_tokens");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Fetch tokens from Jupiter (client-side)
  const { data: jupiterTokens = [], isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["jupiter-tokens"],
    queryFn: fetchTokensFromJupiter,
    enabled: isOpen,
    staleTime: CACHE_TTL,
  });

  // Combine Jupiter tokens with custom user-added tokens
  const allTokens = useMemo(() => {
    const tokenMap = new Map<string, Token>();
    customTokens.forEach((t) => tokenMap.set(t.mint, t));
    jupiterTokens.forEach((t) => tokenMap.set(t.mint, t));
    return Array.from(tokenMap.values());
  }, [jupiterTokens, customTokens]);

  // Save custom tokens to localStorage
  useEffect(() => {
    localStorage.setItem("xray_custom_tokens", JSON.stringify(customTokens));
  }, [customTokens]);

  // Check if search query is a valid mint address not in the list
  const isSearchingMintAddress = useMemo(() => {
    const query = searchQuery.trim();
    if (!isValidSolanaAddress(query)) return false;
    return !allTokens.some((t) => t.mint.toLowerCase() === query.toLowerCase());
  }, [searchQuery, allTokens]);

  // Filter tokens based on search
  const filteredTokens = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return allTokens;
    return allTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.mint.toLowerCase().includes(query)
    );
  }, [allTokens, searchQuery]);

  const getTokenBySymbolOrMint = (symbolOrMint: string) => {
    if (symbolOrMint === "SOL") return { symbol: "SOL", name: "Solana", mint: "SOL", decimals: 9 };
    return allTokens.find((t) => t.symbol === symbolOrMint || t.mint === symbolOrMint);
  };

  const inputToken = getTokenBySymbolOrMint(inputMint);
  const outputToken = getTokenBySymbolOrMint(outputMint);

  const handleSelectToken = (token: Token | { symbol: string; name: string; mint?: string }) => {
    const identifier = (token as Token).mint || token.symbol;
    if (selectingFor === "input") {
      setInputMint(identifier);
    } else if (selectingFor === "output") {
      setOutputMint(identifier);
    }
    setSelectingFor(null);
    setSearchQuery("");
  };

  const handleAddCustomToken = () => {
    const mintAddress = searchQuery.trim();
    if (!isValidSolanaAddress(mintAddress)) {
      toast({ title: "Invalid Address", description: "Please enter a valid Solana token address", variant: "destructive" });
      return;
    }

    const newToken: Token = {
      mint: mintAddress,
      name: `Token ${mintAddress.slice(0, 6)}...`,
      symbol: mintAddress.slice(0, 6).toUpperCase(),
      decimals: 9,
    };

    setCustomTokens((prev) => [...prev.filter((t) => t.mint !== mintAddress), newToken]);
    handleSelectToken(newToken);
    toast({ title: "Token Added", description: "Custom token has been added to your list" });
  };

  // Get swap quote
  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ["/api/swaps/quote", inputMint, outputMint, inputAmount],
    queryFn: async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) return null;
      const response = await apiRequest("GET", "/api/swaps/quote", {
        inputMint,
        outputMint,
        amount: Math.floor(parseFloat(inputAmount) * 1e9),
      });
      return response;
    },
    enabled: isOpen && !!inputAmount && parseFloat(inputAmount) > 0,
  });

  // Execute swap mutation
  const { mutate: executeSwap, isPending: isSwapping } = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/swaps", {
        inputMint,
        outputMint,
        amount: Math.floor(parseFloat(inputAmount) * 1e9),
        slippage: 500,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Swap Successful!",
        description: `Swapped ${inputAmount} tokens. Signature: ${data.signature.slice(0, 8)}...`,
      });
      setInputAmount("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Swap Failed",
        description: error.message || "Failed to execute swap",
        variant: "destructive",
      });
    },
  });

  const handleSwapTokens = () => {
    const temp = inputMint;
    setInputMint(outputMint);
    setOutputMint(temp);
  };

  const handleSwap = () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    if (inputMint === outputMint) {
      toast({ title: "Invalid Swap", description: "Input and output tokens must be different", variant: "destructive" });
      return;
    }
    executeSwap();
  };

  const outputAmount = quote ? (quote.outputAmount / 1e9).toFixed(4) : "0";

  // Token selector view
  if (selectingFor) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setSelectingFor(null); setSearchQuery(""); onClose(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search or paste token address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
                autoFocus
                data-testid="input-token-search"
              />
              {searchQuery && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {/* Option to add custom token by mint address */}
                {isSearchingMintAddress && (
                  <button
                    className="flex items-center gap-3 w-full p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left border border-primary/30"
                    onClick={handleAddCustomToken}
                    data-testid="button-add-custom-token"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-primary">Add Custom Token</div>
                      <div className="text-sm text-muted-foreground truncate">{searchQuery.slice(0, 20)}...</div>
                    </div>
                  </button>
                )}

                {/* Always show SOL */}
                <button
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                  onClick={() => handleSelectToken({ symbol: "SOL", name: "Solana", mint: "SOL" })}
                  data-testid="token-option-SOL"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                    S
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Solana</div>
                    <div className="text-sm text-muted-foreground">SOL</div>
                  </div>
                </button>

                {tokensLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  filteredTokens.slice(0, 100).map((token) => (
                    <button
                      key={token.mint}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                      onClick={() => handleSelectToken(token)}
                      data-testid={`token-option-${token.mint.slice(0, 8)}`}
                    >
                      {token.logoURI ? (
                        <img 
                          src={token.logoURI} 
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold ${token.logoURI ? 'hidden' : ''}`}>
                        {token.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{token.name}</div>
                        <div className="text-sm text-muted-foreground">{token.symbol}</div>
                      </div>
                    </button>
                  ))
                )}

                {!tokensLoading && filteredTokens.length === 0 && searchQuery && !isSearchingMintAddress && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No tokens found for "{searchQuery}"</p>
                    <p className="text-xs mt-2">Try pasting a token mint address</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setSelectingFor(null); setSearchQuery(""); }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Swap Tokens</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">You send</label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0.0"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                className="flex-1"
                disabled={isSwapping}
                data-testid="input-swap-amount"
              />
              <Button
                variant="outline"
                className="w-28 justify-between"
                onClick={() => setSelectingFor("input")}
                disabled={isSwapping}
                data-testid="select-input-token"
              >
                {inputToken?.symbol || "Select"}
                <Search className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Balance: {balance.toFixed(2)} SOL
            </p>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              size="icon"
              variant="outline"
              onClick={handleSwapTokens}
              disabled={isSwapping}
              data-testid="button-swap-reverse"
            >
              <ArrowDownUp className="w-4 h-4" />
            </Button>
          </div>

          {/* Output Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">You receive</label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="0.0"
                value={quoteLoading ? "Loading..." : outputAmount}
                readOnly
                className="flex-1"
                data-testid="output-swap-amount"
              />
              <Button
                variant="outline"
                className="w-28 justify-between"
                onClick={() => setSelectingFor("output")}
                disabled={isSwapping}
                data-testid="select-output-token"
              >
                {outputToken?.symbol || "Select"}
                <Search className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </div>
          </div>

          {/* Price Impact */}
          {quote && (
            <div className="flex justify-between text-sm p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Price Impact</span>
              <span className={quote.priceImpact > 0.05 ? "text-destructive" : "text-foreground"}>
                {(quote.priceImpact * 100).toFixed(2)}%
              </span>
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={handleSwap}
            disabled={isSwapping || !inputAmount || parseFloat(inputAmount) <= 0}
            className="w-full"
            data-testid="button-execute-swap"
          >
            {isSwapping ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping...
              </>
            ) : (
              "Swap"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
