import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, User, Loader2, Check } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useCreateTransaction } from "@/hooks/use-transactions";
import { useLookupUser } from "@/hooks/use-users";
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SendModal({ isOpen, onClose }: SendModalProps) {
  const { keypair, balance, refreshBalance } = useWallet();
  const { mutateAsync: recordTx } = useCreateTransaction();
  const { toast } = useToast();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"input" | "confirm" | "success">("input");

  // Lookup user if input looks like a username
  const looksLikeUsername = recipient.length > 0 && !recipient.includes(" ") && recipient.length < 30 && !/[^a-z0-9]/i.test(recipient);
  const { data: lookedUpUser, isLoading: isLookingUp } = useLookupUser(looksLikeUsername ? recipient : "");

  const getRecipientAddress = () => {
    if (lookedUpUser?.walletPublicKey) return lookedUpUser.walletPublicKey;
    // Basic check for Solana address format (base58, length usually 32-44)
    if (recipient.length >= 32 && recipient.length <= 44) return recipient;
    return null;
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
    
    if (amountNum > balance) {
      toast({ title: "Insufficient funds", variant: "destructive" });
      return;
    }

    try {
      setIsProcessing(true);
      
      // Get blockhash from backend
      const blockhashRes = await fetch("/api/solana/blockhash");
      if (!blockhashRes.ok) throw new Error("Failed to get blockhash");
      const { blockhash } = await blockhashRes.json();
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(destAddr),
          lamports: amountNum * LAMPORTS_PER_SOL,
        })
      );
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      // Sign locally
      transaction.sign(keypair);
      
      // Serialize and send via backend
      const serializedTransaction = transaction.serialize().toString("base64");
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
      
      // Record in DB
      await recordTx({
        fromAddr: keypair.publicKey.toString(),
        toAddr: destAddr,
        amount: amount,
        signature: signature,
      });

      refreshBalance();
      setStep("success");
      
      setTimeout(() => {
        onClose();
        setStep("input");
        setRecipient("");
        setAmount("");
        setIsProcessing(false);
      }, 2000);

    } catch (error: any) {
      console.error(error);
      toast({ title: "Transaction failed", description: error.message || "Could not complete transfer.", variant: "destructive" });
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
        className="relative w-full max-w-md bg-card border border-white/10 rounded-t-3xl md:rounded-3xl p-6 shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white">
          <X className="w-6 h-6" />
        </button>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold font-display">Send SOL</h2>

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
                  <label className="text-sm font-medium text-muted-foreground">Recipient</label>
                  <div className="relative">
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Username or SOL address"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
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
                  <label className="text-sm font-medium text-muted-foreground">Amount (SOL)</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-2xl font-mono placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <div className="absolute right-4 top-4 text-sm text-muted-foreground">
                      Max: {balance.toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>

              <button
                disabled={isProcessing || !recipient || !amount}
                onClick={handleSend}
                className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
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
