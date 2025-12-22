import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shortenAddress } from "@/lib/solana";

interface WalletCardProps {
  balance: number;
  address?: string;
  username?: string | null;
}

export function WalletCard({ balance, address, username }: WalletCardProps) {
  const { toast } = useToast();

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
      className="w-full max-w-md mx-auto aspect-[1.586/1] rounded-3xl relative overflow-hidden shadow-2xl group cursor-pointer"
      onClick={handleCopy}
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black animate-gradient-xy" />
      
      {/* Mesh/Grain Texture */}
      <div className="absolute inset-0 opacity-30 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat" />
      
      {/* Glass Effect Overlay */}
      <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px] border border-white/10 rounded-3xl" />

      {/* Content */}
      <div className="relative h-full p-6 md:p-8 flex flex-col justify-between text-white z-10">
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-mono backdrop-blur-md border border-white/5">
              Solana Devnet
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent opacity-80" />
        </div>

        <div className="space-y-1">
          <p className="text-sm text-white/60 font-medium tracking-wide uppercase">Total Balance</p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight font-display">
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            <span className="text-lg md:text-xl text-white/50 ml-2 font-normal">SOL</span>
          </h2>
        </div>

        <div className="flex justify-between items-end">
          <div>
            <p className="text-white/80 font-medium text-lg">{username || "Wallet"}</p>
            <div className="flex items-center gap-2 text-white/50 text-sm font-mono mt-1 group-hover:text-white/80 transition-colors">
              {address ? shortenAddress(address, 6) : "Loading..."}
              <Copy className="w-3 h-3" />
            </div>
          </div>
          <div className="text-white/30 text-xs font-mono">
            SILVER CARD
          </div>
        </div>
      </div>
    </motion.div>
  );
}
