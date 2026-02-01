import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Send, User, Loader2, Check, Coins, Lock } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useCreateTransaction } from "@/hooks/use-transactions";
import { useLookupUser } from "@/hooks/use-users";
import { useBetaStatus } from "@/components/BetaStatusBanner";
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { verifyLegacyTransactionIntegrity, parseTransactionError, serializeTransactionToBase64 } from "@/lib/transactionIntegrity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  tokenProgram?: string;
}

export function SendModal({ isOpen, onClose }: SendModalProps) {
  const { keypair, balance, refreshBalance, address } = useWallet();
  const { mutateAsync: recordTx } = useCreateTransaction();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: betaStatus } = useBetaStatus();
  const isBetaLocked = betaStatus && !betaStatus.unlocked;

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"input" | "confirm" | "success">("input");
  const [selectedToken, setSelectedToken] = useState<string>("SOL");

  // Fetch wallet tokens
  const { data: walletTokens = [] } = useQuery<TokenBalance[]>({
    queryKey: ["wallet-tokens", address],
    queryFn: async () => {
      if (!address) return [];
      const response = await fetch(`/api/wallet/tokens/${address}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isOpen && !!address,
    staleTime: 10000,
  });

  // Get current token info
  const currentToken = useMemo(() => {
    if (selectedToken === "SOL") {
      return { mint: "SOL", symbol: "SOL", name: "Solana", balance, decimals: 9, imageUrl: null };
    }
    return walletTokens.find(t => t.mint === selectedToken) || null;
  }, [selectedToken, balance, walletTokens]);

  const currentBalance = currentToken?.balance ?? 0;
  const currentSymbol = currentToken?.symbol || "SOL";

  // Lookup user if input looks like a username
  const looksLikeUsername = recipient.length > 0 && !recipient.includes(" ") && recipient.length < 30 && !/[^a-z0-9]/i.test(recipient);
  const { data: lookedUpUser, isLoading: isLookingUp } = useLookupUser(looksLikeUsername ? recipient : "");

  const getRecipientAddress = () => {
    if (lookedUpUser?.walletPublicKey) return lookedUpUser.walletPublicKey;
    if (recipient.length >= 32 && recipient.length <= 44) return recipient;
    return null;
  };

  const handleMaxClick = () => {
    if (selectedToken === "SOL") {
      // Leave some SOL for transaction fees (~5000 lamports = 0.000005 SOL)
      const feeReserve = 0.000005;
      const maxAmount = Math.max(0, balance - feeReserve);
      // Format nicely without unnecessary trailing zeros
      if (maxAmount <= 0) {
        setAmount("0");
      } else {
        // Use a reasonable precision based on the amount
        const formatted = maxAmount.toFixed(9).replace(/\.?0+$/, '');
        setAmount(formatted);
      }
    } else {
      setAmount(currentBalance.toString());
    }
  };

  const handleSend = async () => {
    if (!keypair) return;
    const destAddr = getRecipientAddress();
    
    if (!destAddr) {
      toast({ title: "Invalid recipient", description: "Please enter a valid address or username", variant: "destructive" });
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    
    if (amountNum > currentBalance) {
      toast({ title: "Insufficient funds", variant: "destructive" });
      return;
    }

    try {
      setIsProcessing(true);
      
      // Get blockhash from backend
      const blockhashRes = await fetch("/api/solana/blockhash");
      if (!blockhashRes.ok) throw new Error("Failed to get blockhash");
      const { blockhash } = await blockhashRes.json();
      
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      if (selectedToken === "SOL") {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(destAddr),
            lamports: Math.floor(amountNum * LAMPORTS_PER_SOL),
          })
        );
      } else {
        // SPL Token transfer - detect Token-2022 vs regular SPL Token
        const mintPubkey = new PublicKey(selectedToken);
        const decimals = currentToken?.decimals || 9;
        const tokenAmount = Math.floor(amountNum * Math.pow(10, decimals));
        
        // Use the correct token program based on the token's program
        const isToken2022 = currentToken?.tokenProgram === TOKEN_2022_PROGRAM_ID.toString();
        const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        
        const fromAta = await getAssociatedTokenAddress(
          mintPubkey, 
          keypair.publicKey,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const toAta = await getAssociatedTokenAddress(
          mintPubkey, 
          new PublicKey(destAddr),
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        // Check if destination ATA exists, if not create it
        try {
          const ataCheck = await fetch(`/api/solana/account-info?address=${toAta.toString()}`);
          const ataData = await ataCheck.json();
          
          if (!ataData.exists) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                keypair.publicKey,
                toAta,
                new PublicKey(destAddr),
                mintPubkey,
                tokenProgramId,
                ASSOCIATED_TOKEN_PROGRAM_ID
              )
            );
          }
        } catch {
          // If check fails, try to create ATA anyway
          transaction.add(
            createAssociatedTokenAccountInstruction(
              keypair.publicKey,
              toAta,
              new PublicKey(destAddr),
              mintPubkey,
              tokenProgramId,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }
        
        transaction.add(
          createTransferInstruction(
            fromAta,
            toAta,
            keypair.publicKey,
            BigInt(tokenAmount),
            [],
            tokenProgramId
          )
        );
      }

      const preSignMessageBytes = new Uint8Array(transaction.serializeMessage());
      
      transaction.sign(keypair);
      
      const integrityCheck = await verifyLegacyTransactionIntegrity(transaction, preSignMessageBytes);
      if (!integrityCheck.valid) {
        const errorCode = integrityCheck.errorCode || "TX_MUTATED_AFTER_SIGN";
        throw new Error(`${errorCode}: ${integrityCheck.errorMessage || "Transaction integrity check failed"}`);
      }
      
      const serializedTransaction = serializeTransactionToBase64(transaction);
      const sendRes = await fetch("/api/solana/send-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedTransaction }),
      });
      
      if (!sendRes.ok) {
        const err = await sendRes.json();
        throw new Error(err.error || "Transaction failed");
      }
      
      const { signature } = await sendRes.json();
      
      // Record in DB (optional - may fail if not authenticated)
      try {
        await recordTx({
          fromAddr: keypair.publicKey.toString(),
          toAddr: destAddr,
          amount: amount,
          signature: signature,
        });
      } catch (recordError) {
        // Recording failed (likely not authenticated), but transaction succeeded
        console.log("[send] Transaction recording skipped (not authenticated)");
      }

      refreshBalance();
      queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] });
      setStep("success");
      
      setTimeout(() => {
        onClose();
        setStep("input");
        setRecipient("");
        setAmount("");
        setSelectedToken("SOL");
        setIsProcessing(false);
      }, 2000);

    } catch (error: any) {
      console.error("[send] Transaction failed:", error);
      const parsedError = parseTransactionError(error);
      toast({ title: "Transaction failed", description: parsedError.message, variant: "destructive" });
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-3xl p-6 shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground" data-testid="button-close-send">
          <X className="w-6 h-6" />
        </button>

        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold font-display">Send {currentSymbol}</h2>
            <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
          </div>

          {step === "success" ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check className="w-8 h-8" />
              </div>
              <p className="text-xl font-medium">Sent Successfully!</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Token</label>
                  <Select value={selectedToken} onValueChange={setSelectedToken}>
                    <SelectTrigger className="w-full" data-testid="select-send-token">
                      <SelectValue>
                        <span className="flex items-center gap-2">
                          {selectedToken === "SOL" ? (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
                          ) : currentToken?.imageUrl ? (
                            <img src={currentToken.imageUrl} alt={currentSymbol} className="w-5 h-5 rounded-full" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                              <Coins className="w-3 h-3" />
                            </div>
                          )}
                          {currentSymbol}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOL" data-testid="token-option-SOL">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
                          <span>SOL</span>
                          <span className="ml-2 text-muted-foreground text-sm">{balance.toFixed(4)}</span>
                        </div>
                      </SelectItem>
                      {walletTokens.map((token) => (
                        <SelectItem 
                          key={token.mint} 
                          value={token.mint}
                          data-testid={`token-option-${token.symbol}`}
                        >
                          <div className="flex items-center gap-2">
                            {token.imageUrl ? (
                              <img src={token.imageUrl} alt={token.symbol || ""} className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                <Coins className="w-3 h-3" />
                              </div>
                            )}
                            <span>{token.symbol || token.mint.slice(0, 6)}</span>
                            <span className="ml-2 text-muted-foreground text-sm">
                              {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Recipient</label>
                  <div className="relative">
                    <input
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Username or SOL address"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      data-testid="input-recipient"
                    />
                    {isLookingUp && (
                      <div className="absolute right-3 top-3.5">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    )}
                    {lookedUpUser && (
                      <div className="absolute right-3 top-3 text-green-400 flex items-center gap-1 text-sm bg-green-400/10 px-2 py-0.5 rounded-full">
                        <User className="w-3 h-3" /> Found
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Amount ({currentSymbol})</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 pr-28 text-foreground text-2xl font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="input-send-amount"
                    />
                    <button
                      type="button"
                      onClick={handleMaxClick}
                      className="absolute right-4 top-4 text-sm text-primary hover:text-primary/80 font-medium"
                      data-testid="button-max-send"
                    >
                      Max: {currentBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </button>
                  </div>
                </div>
              </div>

              <button
                disabled={isProcessing || !recipient || !amount || isBetaLocked}
                onClick={handleSend}
                className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="button-send-confirm"
              >
                {isBetaLocked ? (
                  <>
                    <Lock className="w-5 h-5" /> Beta Locked
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    Send Now <Send className="w-5 h-5" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
