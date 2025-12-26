import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Loader2, Search, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
}

export function SwapModal({ isOpen, onClose }: SwapModalProps) {
  const { balance } = useWallet();
  const { toast } = useToast();
  const [inputAmount, setInputAmount] = useState("");
  const [inputMint, setInputMint] = useState("SOL");
  const [outputMint, setOutputMint] = useState("USDC");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);

  // Fetch available tokens
  const { data: tokens = [], isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens"],
    enabled: isOpen,
  });

  // Filter tokens based on search
  const filteredTokens = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return tokens;
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.mint.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const getTokenBySymbol = (symbol: string) => tokens.find((t) => t.symbol === symbol);
  const inputToken = inputMint === "SOL" ? { symbol: "SOL", name: "Solana" } : getTokenBySymbol(inputMint);
  const outputToken = outputMint === "SOL" ? { symbol: "SOL", name: "Solana" } : getTokenBySymbol(outputMint);

  const handleSelectToken = (token: Token | { symbol: string; name: string }) => {
    if (selectingFor === "input") {
      setInputMint(token.symbol);
    } else if (selectingFor === "output") {
      setOutputMint(token.symbol);
    }
    setSelectingFor(null);
    setSearchQuery("");
  };

  // Get swap quote
  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ["/api/swaps/quote", inputMint, outputMint, inputAmount],
    queryFn: async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) return null;
      const response = await apiRequest("GET", "/api/swaps/quote", {
        inputMint,
        outputMint,
        amount: Math.floor(parseFloat(inputAmount) * 1e9), // Convert to lamports
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
        slippage: 500, // 5% slippage
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
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (inputMint === outputMint) {
      toast({
        title: "Invalid Swap",
        description: "Input and output tokens must be different",
        variant: "destructive",
      });
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
                placeholder="Search by name, symbol, or address..."
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
                {/* Always show SOL */}
                <button
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                  onClick={() => handleSelectToken({ symbol: "SOL", name: "Solana" })}
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
                  filteredTokens.map((token) => (
                    <button
                      key={token.mint}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                      onClick={() => handleSelectToken(token)}
                      data-testid={`token-option-${token.symbol}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {token.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{token.name}</div>
                        <div className="text-sm text-muted-foreground">{token.symbol}</div>
                      </div>
                    </button>
                  ))
                )}

                {!tokensLoading && filteredTokens.length === 0 && searchQuery && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No tokens found for "{searchQuery}"</p>
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
