import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SwapModal({ isOpen, onClose }: SwapModalProps) {
  const { balance } = useWallet();
  const { toast } = useToast();
  const [inputAmount, setInputAmount] = useState("");
  const [inputMint, setInputMint] = useState("SOL");
  const [outputMint, setOutputMint] = useState("USDC");
  const [swapped, setSwapped] = useState(false);

  // Fetch available tokens
  const { data: tokens = [] } = useQuery({
    queryKey: ["/api/swaps/tokens"],
    enabled: isOpen,
  });

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
      return response as { outputAmount: number; priceImpact: number };
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
    setSwapped(!swapped);
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
              <Select value={inputMint} onValueChange={setInputMint} disabled={isSwapping}>
                <SelectTrigger className="w-24" data-testid="select-input-token">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOL">SOL</SelectItem>
                  {tokens.map((token) => (
                    <SelectItem key={token.mint} value={token.symbol}>
                      {token.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Select value={outputMint} onValueChange={setOutputMint} disabled={isSwapping}>
                <SelectTrigger className="w-24" data-testid="select-output-token">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC</SelectItem>
                  {tokens.map((token) => (
                    <SelectItem key={token.mint} value={token.symbol}>
                      {token.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
