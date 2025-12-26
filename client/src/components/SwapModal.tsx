import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Loader2, Search, X, Plus, TrendingUp, Zap } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

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
  volume24h?: number;
  liquidity?: number;
  priceChange24h?: number;
  isTrending?: boolean;
  priceUsd?: number;
  marketCap?: number;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "N/A";
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}K`;
  return `$${cap.toFixed(0)}`;
}

function formatPrice(price?: number): string {
  if (!price) return "N/A";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

function formatVolume(volume?: number): string {
  if (!volume) return "";
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

export function SwapModal({ isOpen, onClose }: SwapModalProps) {
  const { balance, keypair, address } = useWallet();
  const { toast } = useToast();
  const [inputAmount, setInputAmount] = useState("");
  const [inputMint, setInputMint] = useState("SOL");
  const [outputMint, setOutputMint] = useState("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);
  const [priorityFee, setPriorityFee] = useState<"low" | "medium" | "high" | "custom">("medium");
  const [customPriorityFee, setCustomPriorityFee] = useState("");
  const [customTokens, setCustomTokens] = useState<Token[]>([]);

  const priorityFeeAmounts = { low: 5000, medium: 25000, high: 100000, custom: 0 };
  
  const getActivePriorityFee = () => {
    if (priorityFee === "custom") {
      const customLamports = Math.floor(parseFloat(customPriorityFee || "0") * 1_000_000_000);
      return Math.max(0, customLamports);
    }
    return priorityFeeAmounts[priorityFee];
  };

  const { data: tokens = [], isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "100");
      const response = await fetch(`/api/swaps/tokens?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch tokens");
      return response.json();
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const { data: trendingTokens = [] } = useQuery<Token[]>({
    queryKey: ["/api/swaps/trending"],
    queryFn: async () => {
      const response = await fetch("/api/swaps/trending", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isOpen && !searchQuery,
    staleTime: 30000,
  });

  const isSearchingMintAddress = useMemo(() => {
    const query = searchQuery.trim();
    if (!isValidSolanaAddress(query)) return false;
    return !tokens.some((t) => t.mint.toLowerCase() === query.toLowerCase());
  }, [searchQuery, tokens]);

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
      handleSelectToken(token);
      toast({ title: "Token Found", description: `Added ${token.symbol} to your list` });
    },
    onError: () => {
      toast({ title: "Token Not Found", description: "Could not find token information", variant: "destructive" });
    },
  });

  const getTokenByMint = (mint: string): Token | undefined => {
    if (mint === "SOL") return { mint: "SOL", name: "Solana", symbol: "SOL", decimals: 9 };
    const fromTokens = tokens.find((t) => t.mint === mint);
    if (fromTokens) return fromTokens;
    return customTokens.find((t) => t.mint === mint);
  };

  const inputToken = getTokenByMint(inputMint);
  const outputToken = getTokenByMint(outputMint);

  const handleSelectToken = async (token: Token) => {
    if (selectingFor === "input") {
      setInputMint(token.mint);
    } else if (selectingFor === "output") {
      setOutputMint(token.mint);
      if (token.mint !== "SOL" && !token.priceUsd) {
        try {
          const response = await fetch(`/api/swaps/tokens/${token.mint}`, { credentials: "include" });
          if (response.ok) {
            const enrichedToken = await response.json();
            setCustomTokens(prev => {
              const filtered = prev.filter(t => t.mint !== enrichedToken.mint);
              return [...filtered, enrichedToken];
            });
          }
        } catch (e) {
          console.error("Failed to fetch token details:", e);
        }
      }
    }
    setSelectingFor(null);
    setSearchQuery("");
  };

  const handleAddCustomToken = () => {
    const mintAddress = searchQuery.trim();
    if (isValidSolanaAddress(mintAddress)) {
      lookupMint(mintAddress);
    }
  };

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery({
    queryKey: ["/api/swaps/quote", inputMint, outputMint, inputAmount],
    queryFn: async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) return null;
      const inputDecimals = inputToken?.decimals || 9;
      const amount = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputDecimals));
      
      const params = new URLSearchParams({
        inputMint: inputMint === "SOL" ? "So11111111111111111111111111111111111111112" : inputMint,
        outputMint: outputMint === "SOL" ? "So11111111111111111111111111111111111111112" : outputMint,
        amount: amount.toString(),
        slippage: "50",
      });
      
      const response = await fetch(`/api/swaps/quote?${params}`, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to get quote");
      }
      return response.json();
    },
    enabled: isOpen && !!inputAmount && parseFloat(inputAmount) > 0 && inputMint !== outputMint,
    retry: false,
  });

  const { mutate: executeSwap, isPending: isSwapping } = useMutation({
    mutationFn: async () => {
      if (!quote?.quote || !keypair || !address) {
        throw new Error("Missing quote or wallet");
      }

      const txResponse = await apiRequest("POST", "/api/swaps/transaction", {
        quote: quote.quote,
        userPublicKey: address,
        priorityFee: getActivePriorityFee(),
      });

      if (!txResponse.swapTransaction) {
        throw new Error("Failed to get swap transaction");
      }

      const swapTransactionBuf = Buffer.from(txResponse.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([keypair]);
      const signedTx = Buffer.from(transaction.serialize()).toString("base64");

      const result = await apiRequest("POST", "/api/swaps/send", {
        signedTransaction: signedTx,
        skipPreflight: true,
        lastValidBlockHeight: txResponse.lastValidBlockHeight,
      });

      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Swap Successful!",
        description: `Transaction: ${data.signature.slice(0, 8)}...`,
      });
      setInputAmount("");
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
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
    if (!quote) {
      toast({ title: "No Quote", description: "Please wait for a quote", variant: "destructive" });
      return;
    }
    executeSwap();
  };

  const outputDecimals = outputToken?.decimals || 9;
  const outputAmount = quote ? (parseInt(quote.outAmount) / Math.pow(10, outputDecimals)).toFixed(6) : "0";

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

            <ScrollArea className="h-[350px]">
              <div className="space-y-1">
                {isSearchingMintAddress && (
                  <button
                    className="flex items-center gap-3 w-full p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left border border-primary/30"
                    onClick={handleAddCustomToken}
                    disabled={isLookingUp}
                    data-testid="button-add-custom-token"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-primary">Add Token by Address</div>
                      <div className="text-sm text-muted-foreground truncate">{searchQuery.slice(0, 20)}...</div>
                    </div>
                  </button>
                )}

                <button
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                  onClick={() => handleSelectToken({ mint: "SOL", name: "Solana", symbol: "SOL", decimals: 9 })}
                  data-testid="token-option-SOL"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
                  <div className="flex-1">
                    <div className="font-medium">Solana</div>
                    <div className="text-sm text-muted-foreground">SOL</div>
                  </div>
                </button>

                {!searchQuery && trendingTokens.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <TrendingUp className="w-4 h-4" />
                      Trending
                    </div>
                    {trendingTokens.slice(0, 5).map((token) => (
                      <button
                        key={token.mint}
                        className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                        onClick={() => handleSelectToken(token)}
                        data-testid={`token-trending-${token.mint.slice(0, 8)}`}
                      >
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{token.symbol.slice(0, 2)}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {token.name}
                            <Badge variant="secondary" className="text-xs">
                              <TrendingUp className="w-3 h-3 mr-1" />
                              {token.priceChange24h?.toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {token.symbol}
                            {token.volume24h && <span className="text-xs">{formatVolume(token.volume24h)} vol</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-border my-2" />
                  </>
                )}

                {tokensLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  tokens.slice(0, 50).map((token) => (
                    <button
                      key={token.mint}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                      onClick={() => handleSelectToken(token)}
                      data-testid={`token-option-${token.mint.slice(0, 8)}`}
                    >
                      {token.logoURI ? (
                        <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{token.symbol.slice(0, 2)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{token.name}</div>
                        <div className="text-sm text-muted-foreground">{token.symbol}</div>
                      </div>
                      {token.isTrending && <Badge variant="secondary"><TrendingUp className="w-3 h-3" /></Badge>}
                    </button>
                  ))
                )}

                {!tokensLoading && tokens.length === 0 && searchQuery && !isSearchingMintAddress && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No tokens found for "{searchQuery}"</p>
                    <p className="text-xs mt-2">Try pasting a token mint address</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Button variant="outline" className="w-full" onClick={() => { setSelectingFor(null); setSearchQuery(""); }}>
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
          <DialogTitle className="flex items-center gap-2">
            Swap Tokens
            <Badge variant="outline" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              Jupiter
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                className="w-32 justify-between"
                onClick={() => setSelectingFor("input")}
                disabled={isSwapping}
                data-testid="select-input-token"
              >
                {inputToken?.symbol || "Select"}
                <Search className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Balance: {balance.toFixed(4)} SOL</p>
          </div>

          <div className="flex justify-center">
            <Button size="icon" variant="outline" onClick={handleSwapTokens} disabled={isSwapping} data-testid="button-swap-reverse">
              <ArrowDownUp className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">You receive</label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="0.0"
                value={quoteLoading ? "Loading..." : quoteError ? "No route" : outputAmount}
                readOnly
                className="flex-1"
                data-testid="output-swap-amount"
              />
              <Button
                variant="outline"
                className="w-32 justify-between"
                onClick={() => setSelectingFor("output")}
                disabled={isSwapping}
                data-testid="select-output-token"
              >
                {outputToken?.symbol || "Select"}
                <Search className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </div>
          </div>

          {outputToken && (outputToken.priceUsd || outputToken.marketCap) && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token Price</span>
                <span>{formatPrice(outputToken.priceUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Cap</span>
                <span>{formatMarketCap(outputToken.marketCap)}</span>
              </div>
              {outputToken.priceChange24h !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">24h Change</span>
                  <span className={outputToken.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}>
                    {outputToken.priceChange24h >= 0 ? "+" : ""}{outputToken.priceChange24h.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {quote && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price Impact</span>
                <span className={quote.priceImpact > 0.05 ? "text-destructive" : "text-foreground"}>
                  {(quote.priceImpact * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route</span>
                <span>{quote.routePlan?.length || 1} hop{(quote.routePlan?.length || 1) > 1 ? "s" : ""}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Priority Fee</label>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((level) => {
                const feeInSol = priorityFeeAmounts[level] / 1_000_000_000;
                return (
                  <Button
                    key={level}
                    variant={priorityFee === level ? "default" : "outline"}
                    size="sm"
                    className="flex-1 flex-col h-auto py-2"
                    onClick={() => setPriorityFee(level)}
                    disabled={isSwapping}
                  >
                    <span className="capitalize">{level}</span>
                    <span className="text-xs opacity-70">{feeInSol.toFixed(6)} SOL</span>
                  </Button>
                );
              })}
              <Button
                variant={priorityFee === "custom" ? "default" : "outline"}
                size="sm"
                className="flex-1 flex-col h-auto py-2"
                onClick={() => setPriorityFee("custom")}
                disabled={isSwapping}
              >
                <span>Custom</span>
                <span className="text-xs opacity-70">Set your own</span>
              </Button>
            </div>
            {priorityFee === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  placeholder="0.0001"
                  value={customPriorityFee}
                  onChange={(e) => setCustomPriorityFee(e.target.value)}
                  className="flex-1"
                  step="0.000001"
                  min="0"
                  disabled={isSwapping}
                  data-testid="input-custom-priority-fee"
                />
                <span className="text-sm text-muted-foreground">SOL</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleSwap}
            disabled={isSwapping || !inputAmount || parseFloat(inputAmount) <= 0 || !quote}
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
