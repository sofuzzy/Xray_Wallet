import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-wallet";
import { useUpdateUser, useCurrentUser } from "@/hooks/use-users";
import { useTransactions } from "@/hooks/use-transactions";
import { WalletCard } from "@/components/WalletCard";
import { ActionButtons } from "@/components/ActionButtons";
import { TransactionList } from "@/components/TransactionList";
import { TokenBalances } from "@/components/TokenBalances";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { SwapModal } from "@/components/SwapModal";
import { BuyModal } from "@/components/BuyModal";
import { LaunchpadModal } from "@/components/LaunchpadModal";
import { LogIn, Loader2, Sparkles, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { balance, address, requestAirdrop } = useWallet();
  const { mutate: updateUser } = useUpdateUser();
  const { data: dbUser } = useCurrentUser();
  const { data: transactions, isLoading: txLoading } = useTransactions(address);
  const { toast } = useToast();

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  useEffect(() => {
    if (dbUser && address && dbUser.walletPublicKey !== address) {
      updateUser({ walletPublicKey: address });
    }
  }, [dbUser, address, updateUser]);

  const handleTopUp = async () => {
    try {
      toast({ title: "Requesting Airdrop...", description: "Please wait ~10-20 seconds for confirmation." });
      await requestAirdrop();
      toast({ title: "Airdrop Received!", description: "1 SOL has been added to your devnet wallet." });
    } catch (e) {
      toast({ title: "Airdrop Failed", description: "You may be rate limited. Try again later.", variant: "destructive" });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-background to-background" />
        
        <div className="relative z-10 text-center space-y-8 max-w-md w-full">
          <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl mb-4">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-white">
              Silver <span className="text-primary">Wallet</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              The premium Solana experience. Fast, secure, and beautiful.
            </p>
          </div>

          <button 
            onClick={() => window.location.href = "/api/login"}
            className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-white/90 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5"
          >
            <LogIn className="w-5 h-5" />
            Continue with Replit
          </button>
          
          <p className="text-xs text-muted-foreground">
            Connects to Solana Devnet. Keys stored locally.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,_rgba(120,119,198,0.1),_rgba(255,255,255,0))]" />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold text-white">Silver</h1>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white">{user?.firstName || "User"}</p>
            <p className="text-xs text-muted-foreground">@{dbUser?.username || "loading..."}</p>
          </div>
          {user?.profileImageUrl && (
            <img src={user.profileImageUrl} alt="Profile" className="w-9 h-9 rounded-full ring-2 ring-white/10" />
          )}
          <button 
            onClick={() => logout()}
            className="ml-2 p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-8 space-y-8 relative z-10">
        <div className="px-6">
          <WalletCard 
            balance={balance} 
            address={address} 
            username={dbUser?.displayName || dbUser?.username} 
          />
        </div>

        <ActionButtons 
          onSend={() => setIsSendOpen(true)}
          onReceive={() => setIsReceiveOpen(true)}
          onSwap={() => setIsSwapOpen(true)}
          onTopUp={handleTopUp}
          onBuy={() => setIsBuyOpen(true)}
          onLaunch={() => setIsLaunchOpen(true)}
        />

        <div className="px-6">
          <TokenBalances />
        </div>

        <TransactionList 
          transactions={transactions || []} 
          currentAddress={address} 
          isLoading={txLoading} 
        />
      </main>

      <AnimatePresence>
        {isSendOpen && <SendModal isOpen={isSendOpen} onClose={() => setIsSendOpen(false)} />}
        {isReceiveOpen && <ReceiveModal isOpen={isReceiveOpen} onClose={() => setIsReceiveOpen(false)} />}
        {isSwapOpen && <SwapModal isOpen={isSwapOpen} onClose={() => setIsSwapOpen(false)} />}
        {isBuyOpen && <BuyModal isOpen={isBuyOpen} onClose={() => setIsBuyOpen(false)} />}
        {isLaunchOpen && <LaunchpadModal isOpen={isLaunchOpen} onClose={() => setIsLaunchOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
