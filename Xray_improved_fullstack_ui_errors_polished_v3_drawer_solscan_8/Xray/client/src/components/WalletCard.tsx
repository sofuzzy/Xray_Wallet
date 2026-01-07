import { motion } from "framer-motion";
import { Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shortenAddress, getTokenAccounts } from "@/lib/solana";
import { useQuery } from "@tanstack/react-query";

interface WalletCardProps {
  balance: number;
  address?: string;
  username?: string | null;
}

interface TokenWithPrice {
  mint: string;
  symbol: string;
  priceUsd?: number;
}

export function WalletCard({ balance, address, username }: WalletCardProps) {
  const { toast } = useToast();

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

  // Fetch wallet token accounts
  const { data: walletTokens = [] } = useQuery({
    queryKey: ["wallet-tokens", address],
    queryFn: () => address ? getTokenAccounts(address) : Promise.resolve([]),
    enabled: !!address,
    staleTime: 30000,
  });

  // Fetch token prices from our backend
  const { data: tokenPrices = [] } = useQuery<TokenWithPrice[]>({
    queryKey: ["/api/swaps/tokens"],
    staleTime: 30000,
  });

  // Calculate total USD balance
  const solUsdValue = balance * (solPrice || 0);
  
  const tokensUsdValue = walletTokens.reduce((total, wt: { mint: string; balance: number }) => {
    const tokenInfo = tokenPrices.find((t: TokenWithPrice) => t.mint === wt.mint);
    if (tokenInfo?.priceUsd && wt.balance) {
      return total + (wt.balance * tokenInfo.priceUsd);
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
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, type: "spring" }}
      className="w-full max-w-md mx-auto aspect-[1.586/1] rounded-lg relative overflow-hidden shadow-2xl group cursor-pointer"
      onClick={handleCopy}
    >
      {/* CRT Monitor Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-green-950 to-black" />
      
      {/* Scanline Effect */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
      }} />
      
      {/* CRT Glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-emerald-500/5 to-emerald-400/10" />
      
      {/* Border Glow */}
      <div className="absolute inset-0 rounded-lg border-2 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2),inset_0_0_30px_rgba(16,185,129,0.05)]" />

      {/* Content */}
      <div className="relative h-full p-6 md:p-8 flex flex-col justify-between text-white z-10">
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-block px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/30">
              [SOLANA_MAINNET]
            </span>
          </div>
          <div className="w-10 h-10 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-mono text-xs">
            SOL
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-emerald-400/70 font-mono tracking-wide uppercase">&gt; TOTAL_BALANCE</p>
          {isLoadingPrice ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400/50" />
              <span className="text-emerald-400/50 font-mono">LOADING...</span>
            </div>
          ) : (
            <>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight font-mono text-emerald-400 glow-text" data-testid="text-total-usd-balance">
                ${totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <p className="text-sm text-emerald-500/60 font-mono mt-1" data-testid="text-sol-balance">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL
                {tokensUsdValue > 0 && ` + $${tokensUsdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens`}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-between items-end gap-3">
          <div>
            <p className="text-emerald-300 font-mono text-lg">{username || "Wallet"}</p>
            <div className="flex items-center gap-2 text-emerald-500/60 text-sm font-mono mt-1 group-hover:text-emerald-400 transition-colors">
              {address ? shortenAddress(address, 6) : "LOADING..."}
              <Copy className="w-3 h-3" />
            </div>
          </div>
          <div className="text-emerald-600/50 text-xs font-mono border border-emerald-500/20 px-2 py-1 rounded">
            v1.0.0
          </div>
        </div>
      </div>
    </motion.div>
  );
}
