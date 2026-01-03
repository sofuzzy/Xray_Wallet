import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Loader2, Search, X, Plus, TrendingUp, Zap, Check, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";
import bs58 from "bs58";

type TransactionStep = "idle" | "building" | "signing" | "sending" | "confirming" | "success" | "error";

function TransactionProgress({ step, errorMessage }: { step: TransactionStep; errorMessage?: string }) {
  const steps = [
    { key: "building", label: "Building transaction" },
    { key: "signing", label: "Signing transaction" },
    { key: "sending", label: "Sending to network" },
    { key: "confirming", label: "Confirming on chain" },
  ];
  
  const stepOrder = ["building", "signing", "sending", "confirming", "success"];
  const currentIndex = stepOrder.indexOf(step);
  
  if (step === "idle") return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 rounded-lg"
    >
      {step === "success" ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <span className="text-lg font-medium">Swap Complete!</span>
        </motion.div>
      ) : step === "error" ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <span className="text-lg font-medium">Transaction Failed</span>
          {errorMessage && <span className="text-sm text-muted-foreground max-w-[250px]">{errorMessage}</span>}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-6 w-full max-w-[280px]">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
          </div>
          
          <div className="space-y-3 w-full">
            {steps.map((s, i) => {
              const isActive = s.key === step;
              const isComplete = currentIndex > stepOrder.indexOf(s.key);
              
              return (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 ${isActive ? "text-foreground" : isComplete ? "text-muted-foreground" : "text-muted-foreground/50"}`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isComplete ? "bg-primary" : isActive ? "bg-primary/20" : "bg-muted"}`}>
                    {isComplete ? (
                      <Check className="w-3 h-3 text-primary-foreground" />
                    ) : isActive ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-primary"
                      />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{s.label}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOutputToken?: Token;
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

type DexOption = "auto" | "orca" | "raydium";

export function SwapModal({ isOpen, onClose, initialOutputToken }: SwapModalProps) {
  const { balance, keypair, address } = useWallet();
  const { toast } = useToast();
  const [inputAmount, setInputAmount] = useState("");
  const [inputMint, setInputMint] = useState("SOL");
  const [outputMint, setOutputMint] = useState(initialOutputToken?.mint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);
  const [priorityFee, setPriorityFee] = useState<"low" | "medium" | "high" | "custom">("medium");
  const [customPriorityFee, setCustomPriorityFee] = useState("");
  const [customTokens, setCustomTokens] = useState<Token[]>(initialOutputToken ? [initialOutputToken] : []);
  const [txStep, setTxStep] = useState<TransactionStep>("idle");
  const [txError, setTxError] = useState<string>("");
  const [dexOption, setDexOption] = useState<DexOption>("auto");

  useEffect(() => {
    if (initialOutputToken && isOpen) {
      setOutputMint(initialOutputToken.mint);
      setCustomTokens(prev => {
        if (prev.some(t => t.mint === initialOutputToken.mint)) return prev;
        return [...prev, initialOutputToken];
      });
    }
  }, [initialOutputToken, isOpen]);

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
    queryKey: ["/api/swaps/quote", inputMint, outputMint, inputAmount, dexOption],
    queryFn: async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) return null;
      const inputDecimals = inputToken?.decimals || 9;
      const amount = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputDecimals));
      
      const params = new URLSearchParams({
        inputMint: inputMint === "SOL" ? "So11111111111111111111111111111111111111112" : inputMint,
        outputMint: outputMint === "SOL" ? "So11111111111111111111111111111111111111112" : outputMint,
        amount: amount.toString(),
        slippage: "50",
        dex: dexOption,
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

      setTxStep("building");
      setTxError("");
      
      const txResponse = await apiRequest("POST", "/api/swaps/transaction", {
        quote: quote.quote,
        userPublicKey: address,
        priorityFee: getActivePriorityFee(),
      });

      if (!txResponse.swapTransaction) {
        throw new Error("Failed to get swap transaction");
      }

      setTxStep("signing");
      const swapTransactionBuf = Buffer.from(txResponse.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([keypair]);
      const signedTx = Buffer.from(transaction.serialize()).toString("base64");

      setTxStep("sending");
      const result = await apiRequest("POST", "/api/swaps/send", {
        signedTransaction: signedTx,
        skipPreflight: true,
        lastValidBlockHeight: txResponse.lastValidBlockHeight,
      });

      setTxStep("confirming");
      // Brief delay to show confirming state
      await new Promise(resolve => setTimeout(resolve, 500));

      return result;
    },
    onSuccess: async (data: any) => {
      setTxStep("success");
      
      // Save swap transaction to database
      try {
        const outputDecimals = outputToken?.decimals || 9;
        const calculatedOutputAmount = quote ? (parseInt(quote.outAmount) / Math.pow(10, outputDecimals)).toString() : "0";
        
        await apiRequest("POST", "/api/transactions", {
          fromAddr: address,
          toAddr: address,
          amount: inputAmount,
          signature: data.signature,
          type: "swap",
          inputToken: inputToken?.symbol || "?",
          outputToken: outputToken?.symbol || "?",
          outputAmount: calculatedOutputAmount,
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      } catch (e) {
        console.error("Failed to save swap transaction:", e);
      }
      
      toast({
        title: "Swap Successful!",
        description: `Transaction: ${data.signature.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      // Show success state briefly before closing
      setTimeout(() => {
        setInputAmount("");
        setTxStep("idle");
        onClose();
      }, 1500);
    },
    onError: (error: any) => {
      setTxStep("error");
      setTxError(error.message || "Failed to execute swap");
      toast({
        title: "Swap Failed",
        description: error.message || "Failed to execute swap",
        variant: "destructive",
      });
      // Reset after showing error
      setTimeout(() => {
        setTxStep("idle");
      }, 3000);
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
        <div className="relative">
          <AnimatePresence>
            {txStep !== "idle" && <TransactionProgress step={txStep} errorMessage={txError} />}
          </AnimatePresence>
          
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Swap Tokens
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Jupiter
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
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
                className="w-36 justify-between"
                onClick={() => setSelectingFor("input")}
                disabled={isSwapping}
                data-testid="select-input-token"
              >
                <span className="flex items-center gap-2">
                  {inputToken?.logoURI ? (
                    <img src={inputToken.logoURI} alt={inputToken.symbol} className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : inputToken?.symbol === "SOL" ? (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">S</div>
                  ) : inputToken ? (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{inputToken.symbol.slice(0, 2)}</div>
                  ) : null}
                  {inputToken?.symbol || "Select"}
                </span>
                <Search className="w-3 h-3 opacity-50" />
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
                className="w-36 justify-between"
                onClick={() => setSelectingFor("output")}
                disabled={isSwapping}
                data-testid="select-output-token"
              >
                <span className="flex items-center gap-2">
                  {outputToken?.logoURI ? (
                    <img src={outputToken.logoURI} alt={outputToken.symbol} className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : outputToken?.symbol === "SOL" ? (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">S</div>
                  ) : outputToken ? (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{outputToken.symbol.slice(0, 2)}</div>
                  ) : null}
                  {outputToken?.symbol || "Select"}
                </span>
                <Search className="w-3 h-3 opacity-50" />
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
              {quote.dex && quote.dex !== "auto" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DEX</span>
                  <span className="capitalize">{quote.dex}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Routing</label>
            <div className="grid grid-cols-3 gap-1">
              {(["auto", "orca", "raydium"] as const).map((dex) => (
                <Button
                  key={dex}
                  variant={dexOption === dex ? "default" : "outline"}
                  size="sm"
                  className="flex-col h-auto py-1.5 px-2"
                  onClick={() => setDexOption(dex)}
                  disabled={isSwapping}
                  data-testid={`button-dex-${dex}`}
                >
                  <span className="capitalize text-xs">{dex === "auto" ? "Best Route" : dex}</span>
                  <span className="text-[10px] opacity-70">
                    {dex === "auto" ? "Jupiter" : "Direct"}
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {dexOption === "auto" 
                ? "Jupiter finds the best price across all DEXes" 
                : `Swap directly on ${dexOption.charAt(0).toUpperCase() + dexOption.slice(1)} - faster for small trades`}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Priority Fee</label>
            <div className="grid grid-cols-4 gap-1">
              {(["low", "medium", "high"] as const).map((level) => {
                const feeInSol = priorityFeeAmounts[level] / 1_000_000_000;
                return (
                  <Button
                    key={level}
                    variant={priorityFee === level ? "default" : "outline"}
                    size="sm"
                    className="flex-col h-auto py-1.5 px-1"
                    onClick={() => setPriorityFee(level)}
                    disabled={isSwapping}
                  >
                    <span className="capitalize text-xs">{level}</span>
                    <span className="text-[10px] opacity-70">{feeInSol.toFixed(5)}</span>
                  </Button>
                );
              })}
              <Button
                variant={priorityFee === "custom" ? "default" : "outline"}
                size="sm"
                className="flex-col h-auto py-1.5 px-1"
                onClick={() => setPriorityFee("custom")}
                disabled={isSwapping}
              >
                <span className="text-xs">Custom</span>
                <span className="text-[10px] opacity-70">Set own</span>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
