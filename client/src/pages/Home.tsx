import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-wallet";
import { usePasskey } from "@/hooks/use-passkey";
import { useUpdateUser, useCurrentUser } from "@/hooks/use-users";
import { useTransactions } from "@/hooks/use-transactions";
import { WalletCard } from "@/components/WalletCard";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { ActionButtons } from "@/components/ActionButtons";
import { TransactionList } from "@/components/TransactionList";
import { TokenBalances } from "@/components/TokenBalances";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { SwapModal } from "@/components/SwapModal";
import { LaunchpadModal } from "@/components/LaunchpadModal";
import { StakingModal } from "@/components/StakingModal";
import { SeedPhraseModal } from "@/components/SeedPhraseModal";
import { WalletSwitcher } from "@/components/WalletSwitcher";
import { TokenSearch } from "@/components/TokenSearch";
import { TradingViewModal } from "@/components/TradingViewModal";
import { Watchlist } from "@/components/Watchlist";
import { LogIn, Loader2, Sparkles, LogOut, Settings, KeyRound, Shield, Fingerprint, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

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
}

export default function Home() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { 
    balance, 
    address, 
    isLoading: walletLoading,
    wallets,
    activeWallet,
    switchWallet,
    addWallet,
    removeWallet,
    editWalletName
  } = useWallet();
  const { mutate: updateUser } = useUpdateUser();
  const { data: dbUser } = useCurrentUser();
  const { data: transactions, isLoading: txLoading } = useTransactions(address);
  const { toast } = useToast();
  const { register: registerPasskey, login: loginPasskey, isLoading: passkeyLoading, isSupported: passkeySupported, getStoredUserId } = usePasskey();

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [isStakeOpen, setIsStakeOpen] = useState(false);
  const [isSeedPhraseOpen, setIsSeedPhraseOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showPasskeyOptions, setShowPasskeyOptions] = useState(false);
  const [isInIframe] = useState(() => window.top !== window.self);

  const passkeyUserId = getStoredUserId();
  const isPasskeyAuth = !!passkeyUserId;

  const handlePasskeyRegister = async () => {
    const result = await registerPasskey();
    if (result.success) {
      toast({ title: "Success!", description: "Passkey registered. Welcome to Xray!" });
      window.location.reload();
    } else {
      toast({ title: "Registration Failed", description: result.error || "Could not register passkey", variant: "destructive" });
    }
  };

  const handlePasskeyLogin = async () => {
    const result = await loginPasskey();
    if (result.success) {
      toast({ title: "Welcome back!", description: "Logged in with passkey" });
      window.location.reload();
    } else {
      toast({ title: "Login Failed", description: result.error || "Could not authenticate", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (dbUser && address && dbUser.wallet?.publicKey !== address) {
      updateUser({ walletPublicKey: address });
    }
  }, [dbUser, address, updateUser]);

  if (authLoading || walletLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated && !isPasskeyAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden crt-overlay">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        
        <div className="relative z-10 text-center space-y-6 max-w-md w-full">
          <div className="inline-flex items-center justify-center p-4 rounded border-2 border-primary/50 bg-primary/10 mb-4 glow-border">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold font-mono tracking-tight glow-text">
              <span className="text-primary">&gt; XRAY_</span>
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              // SOLANA WALLET TERMINAL v1.0.0
            </p>
            <p className="text-muted-foreground/70 font-mono text-xs">
              Fast. Secure. Non-custodial.
            </p>
          </div>

          {isInIframe && passkeySupported && (
            <div className="mb-4 p-3 rounded border border-amber-500/50 bg-amber-500/10">
              <p className="text-xs text-amber-500 font-mono mb-2">
                Passkeys require a full browser window
              </p>
              <a 
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-primary font-mono hover:underline"
                data-testid="link-open-new-tab"
              >
                <ExternalLink className="w-3 h-3" />
                Open in new tab to use passkeys
              </a>
            </div>
          )}

          {!showPasskeyOptions ? (
            <div className="space-y-4">
              {passkeySupported && !isInIframe && (
                <button 
                  onClick={() => setShowPasskeyOptions(true)}
                  disabled={passkeyLoading}
                  className="w-full py-4 rounded border-2 border-primary bg-primary/20 text-primary font-mono font-bold text-lg hover:bg-primary/30 active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-3 glow-border disabled:opacity-50"
                  data-testid="button-passkey-auth"
                >
                  {passkeyLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <KeyRound className="w-5 h-5" />
                  )}
                  [CONTINUE_WITH_PASSKEY]
                </button>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-mono">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button 
                onClick={() => window.location.href = "/api/login"}
                className="w-full py-3 rounded border border-border bg-muted/50 text-foreground font-mono hover:bg-muted transition-all flex items-center justify-center gap-3"
                data-testid="button-login-replit"
              >
                <LogIn className="w-4 h-4" />
                Continue with Replit
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button 
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                className="w-full py-4 rounded border-2 border-primary bg-primary/20 text-primary font-mono font-bold text-lg hover:bg-primary/30 active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-3 glow-border disabled:opacity-50"
                data-testid="button-passkey-login"
              >
                {passkeyLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Fingerprint className="w-5 h-5" />
                )}
                [LOGIN_WITH_PASSKEY]
              </button>

              <button 
                onClick={handlePasskeyRegister}
                disabled={passkeyLoading}
                className="w-full py-3 rounded border border-border bg-muted/50 text-foreground font-mono hover:bg-muted transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                data-testid="button-passkey-register"
              >
                {passkeyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                Create New Account
              </button>

              <button 
                onClick={() => setShowPasskeyOptions(false)}
                className="text-xs text-muted-foreground font-mono hover:text-foreground"
                data-testid="button-back"
              >
                &lt; Back to options
              </button>
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
              <Shield className="w-3 h-3 text-primary" />
              <span>NON_CUSTODIAL: Keys never leave your device</span>
            </div>
            <p className="text-xs text-muted-foreground/70 font-mono">
              &gt; network: SOLANA_DEVNET | storage: LOCAL_ONLY
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10 relative overflow-hidden crt-overlay">
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b-2 border-border px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-mono font-bold text-primary glow-text">&gt;_XRAY</h1>
          <WalletSwitcher
            wallets={wallets}
            activeWallet={activeWallet}
            onSwitch={switchWallet}
            onAdd={addWallet}
            onRemove={removeWallet}
            onRename={editWalletName}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground">{user?.firstName || "User"}</p>
            <p className="text-xs text-muted-foreground">@{user?.email?.split("@")[0] || "user"}</p>
          </div>
          {user?.profileImageUrl && (
            <img src={user.profileImageUrl} alt="Profile" className="w-9 h-9 rounded-full ring-2 ring-border" />
          )}
          <ThemeToggle />
          <button 
            onClick={() => setIsSeedPhraseOpen(true)}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => logout()}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-8 space-y-8 relative z-10">
        <div className="px-6">
          <TokenSearch onSelectToken={(token) => setSelectedToken(token)} />
        </div>

        <div className="px-6">
          <WalletCard 
            balance={balance} 
            address={address} 
            username={activeWallet?.name || "Wallet"} 
          />
        </div>

        <div className="px-6">
          <PortfolioSummary address={address} solBalance={balance} />
        </div>

        <div className="px-6">
          <div className="flex items-center justify-center gap-3 p-3 rounded border border-primary/30 bg-primary/5 text-sm font-mono">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">
              <span className="text-primary font-bold">NON_CUSTODIAL:</span> Server cannot sign transactions. Your keys are stored locally.
            </span>
          </div>
        </div>

        <ActionButtons 
          onSend={() => setIsSendOpen(true)}
          onReceive={() => setIsReceiveOpen(true)}
          onSwap={() => setIsSwapOpen(true)}
          onLaunch={() => setIsLaunchOpen(true)}
          onStake={() => setIsStakeOpen(true)}
        />

        <div className="px-6">
          <TokenBalances />
        </div>

        <div className="px-6">
          <Watchlist />
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
        {isSwapOpen && <SwapModal isOpen={isSwapOpen} onClose={() => { setIsSwapOpen(false); setSelectedToken(null); }} initialOutputToken={selectedToken || undefined} />}
        {isLaunchOpen && <LaunchpadModal isOpen={isLaunchOpen} onClose={() => setIsLaunchOpen(false)} />}
        {isStakeOpen && <StakingModal isOpen={isStakeOpen} onClose={() => setIsStakeOpen(false)} />}
        {isSeedPhraseOpen && <SeedPhraseModal isOpen={isSeedPhraseOpen} onClose={() => setIsSeedPhraseOpen(false)} />}
        {selectedToken && !isSwapOpen && (
          <TradingViewModal 
            isOpen={!!selectedToken && !isSwapOpen} 
            onClose={() => setSelectedToken(null)} 
            token={selectedToken}
            onTrade={() => setIsSwapOpen(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
