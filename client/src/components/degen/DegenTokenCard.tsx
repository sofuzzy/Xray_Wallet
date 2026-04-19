import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart2, ArrowRightLeft, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface DegenToken {
  mint: string;
  name: string;
  symbol: string;
  logoURI?: string;
  priceUsd?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  buys24h?: number;
  sells24h?: number;
  isTrending?: boolean;
}

interface DegenTokenCardProps {
  token: DegenToken;
  index?: number;
  onChart: (token: DegenToken) => void;
  onSwap: (token: DegenToken) => void;
}

function formatPrice(p?: number): string {
  if (!p) return "—";
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  if (p < 1000) return `$${p.toFixed(2)}`;
  return `$${(p / 1000).toFixed(1)}K`;
}

function formatVol(v?: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatMC(v?: number): string {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function getBadges(token: DegenToken): { label: string; color: string }[] {
  const badges: { label: string; color: string }[] = [];

  if (token.isTrending) {
    badges.push({ label: "HOT", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" });
  }
  if ((token.priceChange24h ?? 0) > 200) {
    badges.push({ label: "MOON", color: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30" });
  } else if ((token.priceChange24h ?? 0) > 50) {
    badges.push({ label: "MOMENTUM", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" });
  }
  if ((token.liquidity ?? Infinity) < 5000) {
    badges.push({ label: "LOW LIQ", color: "bg-red-500/20 text-red-400 border-red-500/30" });
  } else if ((token.liquidity ?? Infinity) < 20000) {
    badges.push({ label: "HIGH RISK", color: "bg-red-500/15 text-red-400/80 border-red-500/20" });
  }
  if ((token.marketCap ?? Infinity) < 100000) {
    badges.push({ label: "EARLY", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" });
  }

  return badges.slice(0, 3);
}

export function DegenTokenCard({ token, index = 0, onChart, onSwap }: DegenTokenCardProps) {
  const { toast } = useToast();
  const badges = getBadges(token);
  const pct24h = token.priceChange24h ?? 0;
  const up24h = pct24h >= 0;

  const copyMint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(token.mint);
    toast({ title: "Copied", description: "Contract address copied" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="group relative rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 overflow-hidden cursor-pointer"
      data-testid={`degen-card-${token.mint}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20 pointer-events-none" />

      <div className="relative p-3 space-y-2.5">
        {/* Top row: logo + name + badges + price */}
        <div className="flex items-start gap-2.5">
          <div className="relative flex-shrink-0">
            {token.logoURI ? (
              <img
                src={token.logoURI}
                alt={token.symbol}
                className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center text-xs font-bold text-primary ring-1 ring-white/10">
                {token.symbol?.charAt(0) ?? "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-white/90 truncate">{token.symbol}</span>
              {badges.map((b) => (
                <span
                  key={b.label}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide border ${b.color}`}
                >
                  {b.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-white/30 font-mono">{shortenAddr(token.mint)}</span>
              <button
                onClick={copyMint}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-white/60 text-white/30"
                data-testid={`copy-mint-${token.mint}`}
              >
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="font-mono font-bold text-sm text-white/90">{formatPrice(token.priceUsd)}</div>
            <div className={`flex items-center justify-end gap-0.5 text-[11px] font-semibold mt-0.5 ${up24h ? "text-emerald-400" : "text-red-400"}`}>
              {up24h ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {up24h ? "+" : ""}{pct24h.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/[0.03] rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">Vol 24h</div>
            <div className="text-[11px] font-mono font-semibold text-white/70">{formatVol(token.volume24h)}</div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">Liq</div>
            <div className={`text-[11px] font-mono font-semibold ${(token.liquidity ?? 0) < 10000 ? "text-red-400/80" : "text-white/70"}`}>
              {formatVol(token.liquidity)}
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">MCap</div>
            <div className="text-[11px] font-mono font-semibold text-white/70">{formatMC(token.marketCap)}</div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onChart(token); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.06] hover:border-white/[0.12] transition-all text-[11px] font-medium text-white/60 hover:text-white/90"
            data-testid={`chart-btn-${token.mint}`}
          >
            <BarChart2 className="w-3 h-3" />
            Chart
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSwap(token); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500/40 transition-all text-[11px] font-semibold text-emerald-400"
            data-testid={`swap-btn-${token.mint}`}
          >
            <ArrowRightLeft className="w-3 h-3" />
            Swap
          </button>
          <a
            href={`https://solscan.io/token/${token.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.06] hover:border-white/[0.12] transition-all text-white/40 hover:text-white/70"
            data-testid={`solscan-btn-${token.mint}`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
