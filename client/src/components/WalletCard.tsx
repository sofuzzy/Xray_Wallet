import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Loader2, Wallet, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shortenAddress, getTokenAccounts } from "@/lib/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface WalletCardProps {
  balance: number;
  address?: string;
  username?: string | null;
  onRefresh?: () => Promise<unknown>;
}

interface TokenWithPrice {
  mint: string;
  symbol: string;
  priceUsd?: number;
}

interface WalletToken {
  mint: string;
  balance: number;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoURI?: string;
}

export function WalletCard({ balance, address, username, onRefresh }: WalletCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await Promise.all([
        onRefresh?.(),
        queryClient.invalidateQueries({ queryKey: ["sol-price"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] }),
        queryClient.invalidateQueries({ queryKey: ["token-prices"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/beta/status"] }),
      ]);
      toast({
        title: "Refreshed",
        description: "Balance updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not refresh balance. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch SOL price
  const { data: solPrice } = useQuery<number>({
    queryKey: ["sol-price"],
    queryFn: async () => {
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const data = await response.json();
        return data.solana?.usd || 0;
      } catch {
        return 0;
      }
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  // Fetch wallet token accounts with USD values
  const { data: walletTokens = [] } = useQuery<WalletToken[]>({
    queryKey: ["wallet-tokens", address],
    queryFn: () => address ? getTokenAccounts(address) : Promise.resolve([]),
    enabled: !!address,
    staleTime: 30000,
  });

  // Fetch USD values for all tokens in wallet
  const tokenMints = walletTokens.map(t => t.mint).filter(Boolean);
  const { data: tokenPriceMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["token-prices", tokenMints.join(",")],
    queryFn: async () => {
      if (tokenMints.length === 0) return {};
      try {
        const response = await fetch("/api/tokens/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mints: tokenMints }),
        });
        if (!response.ok) return {};
        return response.json();
      } catch {
        return {};
      }
    },
    enabled: tokenMints.length > 0,
    staleTime: 60000,
  });

  // Calculate total USD balance
  const solUsdValue = balance * (solPrice || 0);
  
  const tokensUsdValue = walletTokens.reduce((total, wt) => {
    const priceUsd = tokenPriceMap[wt.mint];
    if (priceUsd && wt.balance) {
      return total + (wt.balance * priceUsd);
    }
    return total;
  }, 0);

  const totalUsdBalance = solUsdValue + tokensUsdValue;
  const isLoadingPrice = solPrice === undefined;

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({
        title: "Copied!",
        description: "Wallet address copied to clipboard.",
      });
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
      className="w-full max-w-md mx-auto aspect-[1.586/1] rounded-2xl relative overflow-hidden cursor-pointer group"
      onClick={handleCopy}
    >
      {/* Modern gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
      
      {/* Subtle mesh gradient overlay */}
      <div className="absolute inset-0 opacity-20" style={{
        background: `
          radial-gradient(ellipse at 20% 20%, hsl(165 85% 45% / 0.12) 0%, transparent 55%),
          radial-gradient(ellipse at 80% 80%, hsl(270 80% 65% / 0.08) 0%, transparent 55%)
        `
      }} />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }} />

      {/* Gradient border effect */}
      <div className="absolute inset-0 rounded-2xl" style={{
        padding: '1px',
        background: 'linear-gradient(135deg, hsl(165 85% 45% / 0.2), hsl(270 80% 65% / 0.1), transparent)',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude'
      }} />

      {/* Content */}
      <div className="relative h-full p-7 md:p-9 flex flex-col justify-between z-10">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white/80" />
            </div>
            <span className="text-white/40 text-[10px] font-medium tracking-widest uppercase">
              Solana
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-50"
            data-testid="button-refresh-balance"
          >
            <RefreshCw className={`w-4 h-4 text-white/70 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-white/40 text-xs font-medium tracking-widest uppercase">Total Balance</p>
          {isLoadingPrice ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-white/50" />
              <span className="text-white/50 font-medium">Loading...</span>
            </div>
          ) : (
            <>
              <h2 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-none" data-testid="text-total-usd-balance">
                ${totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className="text-white/50 text-sm font-medium mt-1.5 font-mono" data-testid="text-sol-balance">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL
                {tokensUsdValue > 0 && (
                  <span className="text-emerald-300/80"> + ${tokensUsdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens</span>
                )}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-between items-end gap-3">
          <div>
            <p className="text-white font-semibold text-lg">{username || "Wallet"}</p>
            <div className="flex items-center gap-2 text-white/60 text-sm font-mono mt-0.5">
              {address ? shortenAddress(address, 6) : "Loading..."}
              <Copy className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  );
}
