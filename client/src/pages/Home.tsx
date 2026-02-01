import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-wallet";
import { usePasskey } from "@/hooks/use-passkey";
import { useWalletRegistry } from "@/hooks/use-wallet-registry";
import { useCurrentUser } from "@/hooks/use-users";
import { useTransactions } from "@/hooks/use-transactions";
import { useLocalTransactions } from "@/hooks/use-local-transactions";
import { type ActivityLog } from "@shared/schema";
import xrayLogo from "@/assets/xray-logo.png";
import { WalletCard } from "@/components/WalletCard";
import { Holdings } from "@/components/Holdings";
import { ActionButtons } from "@/components/ActionButtons";
import { Button } from "@/components/ui/button";
import { TransactionList } from "@/components/TransactionList";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { SwapModal } from "@/components/SwapModal";
import { LaunchpadModal } from "@/components/LaunchpadModal";
import { SeedPhraseModal } from "@/components/SeedPhraseModal";
import { WalletSwitcher } from "@/components/WalletSwitcher";
import { TokenSearch } from "@/components/TokenSearch";
import { TradingViewModal } from "@/components/TradingViewModal";
import { Watchlist } from "@/components/Watchlist";
import { MyTokens } from "@/components/MyTokens";
import { Footer } from "@/components/Footer";
import { LegalAcknowledgmentModal, hasAcknowledgedLegal } from "@/components/LegalAcknowledgmentModal";
import { BetaDisclaimerModal, hasBetaAcknowledged } from "@/components/BetaDisclaimerModal";
import { OnboardingWalkthrough, hasCompletedWalkthrough } from "@/components/OnboardingWalkthrough";
import { LogIn, Loader2, Sparkles, LogOut, Settings, KeyRound, Shield, Fingerprint, ExternalLink, Compass, Lock } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import { SiX, SiGithub } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { tokenManager } from "@/lib/tokenManager";

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
  const queryClient = useQueryClient();
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
    editWalletName,
    lockVault,
    refreshBalance
  } = useWallet();
  const { data: dbUser } = useCurrentUser();
  const { data: transactions, isLoading: txLoading } = useTransactions(address);
  const { transactions: localTransactions } = useLocalTransactions(address);
  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs", address],
    queryFn: async () => {
      const params = address ? `?walletAddress=${address}` : "";
      const response = await fetch(`/api/activity-logs${params}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isAuthenticated || !!address,
    staleTime: 30000,
  });
  const { toast } = useToast();
  const { register: registerPasskey, login: loginPasskey, isLoading: passkeyLoading, isSupported: passkeySupported, isAuthenticated: isPasskeyAuthenticated } = usePasskey();
  const { registeredWallets, registerWallet } = useWalletRegistry(isAuthenticated);
  const [syncRetryTick, setSyncRetryTick] = useState(0);
  const inFlightAddresses = useRef<Set<string>>(new Set());
  const failureInfo = useRef<Map<string, { attempts: number; lastAttempt: number }>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => setSyncRetryTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || wallets.length === 0) return;
    
    const cloudAddresses = new Set(registeredWallets.map(rw => rw.walletAddress));
    const localAddresses = new Set(wallets.map(w => w.publicKey));
    const now = Date.now();
    
    Array.from(failureInfo.current.keys()).forEach(addr => {
      if (!localAddresses.has(addr) || cloudAddresses.has(addr)) {
        failureInfo.current.delete(addr);
      }
    });
    
    wallets.forEach(async w => {
      const inCloud = cloudAddresses.has(w.publicKey);
      const inFlight = inFlightAddresses.current.has(w.publicKey);
      
      if (inCloud || inFlight) return;
      
      let info = failureInfo.current.get(w.publicKey);
      if (info) {
        if (now - info.lastAttempt > 300000) {
          info = undefined;
          failureInfo.current.delete(w.publicKey);
        } else {
          const cooldownMs = Math.min(60000, 5000 * Math.pow(2, info.attempts - 1));
          if (now - info.lastAttempt < cooldownMs) return;
        }
      }
      
      inFlightAddresses.current.add(w.publicKey);
      const result = await registerWallet({
        walletAddress: w.publicKey,
        label: w.name,
        source: "created",
      });
      inFlightAddresses.current.delete(w.publicKey);
      
      if (!result) {
        const prevAttempts = info?.attempts || 0;
        failureInfo.current.set(w.publicKey, { attempts: prevAttempts + 1, lastAttempt: Date.now() });
      }
    });
  }, [isAuthenticated, wallets, registeredWallets, registerWallet, syncRetryTick]);

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [isSeedPhraseOpen, setIsSeedPhraseOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [inputToken, setInputToken] = useState<Token | null>(null);
  const [showPasskeyOptions, setShowPasskeyOptions] = useState(false);
  const [isInIframe] = useState(() => window.top !== window.self);
  const [showBetaModal, setShowBetaModal] = useState(() => !hasBetaAcknowledged());
  const [showLegalModal, setShowLegalModal] = useState(() => hasBetaAcknowledged() && !hasAcknowledgedLegal());
  const [showWalkthrough, setShowWalkthrough] = useState(() => hasBetaAcknowledged() && hasAcknowledgedLegal() && !hasCompletedWalkthrough());

  const isPasskeyAuth = isPasskeyAuthenticated();

  const handlePasskeyRegister = async () => {
    const result = await registerPasskey();
    if (result.success) {
      toast({ title: "Success!", description: "Passkey registered. Welcome to Xray!" });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } else {
      toast({ title: "Registration Failed", description: result.error || "Could not register passkey", variant: "destructive" });
    }
  };

  const handlePasskeyLogin = async () => {
    const result = await loginPasskey();
    if (result.success) {
      toast({ title: "Welcome back!", description: "Logged in with passkey" });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } else {
      // Check if user has an existing valid session before showing error
      // This prevents confusing "Login Failed" when user was already logged in
      const hasExistingSession = await tokenManager.initSession();
      if (hasExistingSession) {
        // User was already authenticated - silently proceed
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } else {
        toast({ title: "Login Failed", description: result.error || "Could not authenticate", variant: "destructive" });
      }
    }
  };


  if (authLoading || walletLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show wallet interface if user has a local wallet (address set), regardless of auth status
  // Authentication is only needed for cloud sync features
  if (!isAuthenticated && !isPasskeyAuth && !address) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/3" />
        
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        
        <div className="relative z-10 text-center space-y-8 max-w-md w-full">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg shadow-primary/25 mb-2">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">XRAY</span>
            </h1>
            <p className="text-muted-foreground text-sm font-medium">
              Next-gen Solana Wallet
            </p>
            <p className="text-muted-foreground/60 text-xs">
              Fast. Secure. Non-custodial.
            </p>
          </div>

          {isInIframe && passkeySupported && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <p className="text-xs text-amber-500 mb-2">
                Passkeys require a full browser window
              </p>
              <a 
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-primary font-medium hover:underline"
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
                <Button 
                  onClick={() => setShowPasskeyOptions(true)}
                  disabled={passkeyLoading}
                  size="lg"
                  className="w-full"
                  data-testid="button-passkey-auth"
                >
                  {passkeyLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <KeyRound className="w-5 h-5 mr-2" />
                  )}
                  Continue with Passkey
                </Button>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button 
                variant="outline"
                size="lg"
                onClick={() => window.location.href = "/api/login"}
                className="w-full"
                data-testid="button-login-replit"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Continue with Replit
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button 
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                size="lg"
                className="w-full"
                data-testid="button-passkey-login"
              >
                {passkeyLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Fingerprint className="w-5 h-5 mr-2" />
                )}
                Login with Passkey
              </Button>

              <Button 
                variant="outline"
                onClick={handlePasskeyRegister}
                disabled={passkeyLoading}
                size="lg"
                className="w-full"
                data-testid="button-passkey-register"
              >
                {passkeyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Shield className="w-4 h-4 mr-2" />
                )}
                Create New Account
              </Button>

              <Button 
                variant="ghost"
                onClick={() => setShowPasskeyOptions(false)}
                className="w-full"
                data-testid="button-back"
              >
                Back to options
              </Button>
            </div>
          )}

          <div className="space-y-3 pt-6">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Non-custodial • Keys never leave your device</span>
            </div>
            <p className="text-xs text-muted-foreground/50">
              Solana Mainnet • Encrypted Local Storage
            </p>
          </div>

          {/* Footer links */}
          <div className="space-y-4 pt-4 border-t border-border/30">
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://x.com/xraythewallet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="login-link-x"
              >
                <SiX className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/sofuzzy/Xray_Wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="login-link-github"
              >
                <SiGithub className="w-4 h-4" />
              </a>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <Link 
                href="/terms" 
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="login-link-terms"
              >
                Terms
              </Link>
              <span className="text-border">•</span>
              <Link 
                href="/privacy" 
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="login-link-privacy"
              >
                Privacy
              </Link>
              <span className="text-border">•</span>
              <Link 
                href="/disclaimer" 
                className="text-muted-foreground hover:text-primary transition-colors"
                data-testid="login-link-disclaimer"
              >
                Risk Disclaimer
              </Link>
            </div>

            <p className="text-center text-xs text-muted-foreground/50">
              XRAY Wallet v0.9.9
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10 relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-br from-primary/3 via-transparent to-accent/2" />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <img src={xrayLogo} alt="XRAY" className="h-8 mix-blend-screen" />
          <WalletSwitcher
            wallets={wallets}
            activeWallet={activeWallet}
            onSwitch={switchWallet}
            onAdd={addWallet}
            onRemove={removeWallet}
            onRename={editWalletName}
            registeredWallets={registeredWallets}
            isAuthenticated={isAuthenticated}
          />
          <span className="hidden sm:inline-block px-2 py-1 text-[10px] font-semibold tracking-wide rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">BETA</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-foreground">{user?.firstName || "User"}</p>
            <p className="text-xs text-muted-foreground">@{user?.email?.split("@")[0] || "user"}</p>
          </div>
          {user?.profileImageUrl && (
            <img src={user.profileImageUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-border hidden sm:block" />
          )}
          <ThemeToggle />
          <Link href="/explore" className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-testid="link-explorer">
            <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>
          <button 
            onClick={() => setIsSeedPhraseOpen(true)}
            className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button 
            onClick={() => lockVault()}
            className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-lock-vault"
            title="Lock Wallet"
          >
            <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button 
            onClick={() => logout()}
            className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-8 space-y-8 relative z-10">
        <div className="px-6">
          <TokenSearch onSelectToken={(token) => setSelectedToken(token)} />
          <div className="flex justify-center mt-3 sm:hidden">
            <span className="px-2 py-1 text-[10px] font-semibold tracking-wide rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">BETA</span>
          </div>
        </div>

        <div className="px-6">
          <WalletCard 
            balance={balance} 
            address={address} 
            username={activeWallet?.name || "Wallet"}
            onRefresh={refreshBalance}
          />
        </div>

        <ActionButtons 
          onSend={() => setIsSendOpen(true)}
          onReceive={() => setIsReceiveOpen(true)}
          onSwap={() => setIsSwapOpen(true)}
          onLaunch={() => setIsLaunchOpen(true)}
        />

        <div className="px-6">
          <Holdings 
            solBalance={balance}
            onSwapToken={(token) => {
              setInputToken(token);
              setSelectedToken(null);
              setIsSwapOpen(true);
            }}
          />
        </div>

        <div className="px-6">
          <MyTokens />
        </div>

        <div className="px-6">
          <div className="flex items-center justify-center gap-3 p-3 rounded border border-primary/30 bg-primary/5 text-sm font-mono">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">
              <span className="text-primary font-bold">NON_CUSTODIAL:</span> Server cannot sign transactions. Your keys are stored locally.
            </span>
          </div>
        </div>

        <div className="px-6">
          <Watchlist />
        </div>

        <TransactionList 
          transactions={transactions || []} 
          localTransactions={localTransactions}
          currentAddress={address} 
          isLoading={txLoading}
          activityLogs={activityLogs}
          limit={10}
          showViewAll={true}
        />
      </main>

      <Footer />

      <BetaDisclaimerModal 
        open={showBetaModal} 
        onAccept={() => {
          setShowBetaModal(false);
          if (!hasAcknowledgedLegal()) {
            setShowLegalModal(true);
          }
        }} 
      />

      <LegalAcknowledgmentModal 
        open={showLegalModal && !showBetaModal} 
        onAcknowledge={() => {
          setShowLegalModal(false);
          if (!hasCompletedWalkthrough()) {
            setShowWalkthrough(true);
          }
        }} 
      />

      <OnboardingWalkthrough
        open={showWalkthrough && !showBetaModal && !showLegalModal}
        onComplete={() => setShowWalkthrough(false)}
      />

      <AnimatePresence>
        {isSendOpen && <SendModal isOpen={isSendOpen} onClose={() => setIsSendOpen(false)} />}
        {isReceiveOpen && <ReceiveModal isOpen={isReceiveOpen} onClose={() => setIsReceiveOpen(false)} />}
        {isSwapOpen && <SwapModal isOpen={isSwapOpen} onClose={() => { setIsSwapOpen(false); setSelectedToken(null); setInputToken(null); }} initialOutputToken={selectedToken || undefined} initialInputToken={inputToken || undefined} />}
        {isLaunchOpen && <LaunchpadModal isOpen={isLaunchOpen} onClose={() => setIsLaunchOpen(false)} />}
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
