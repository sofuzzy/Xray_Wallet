import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart2, ArrowRightLeft, ExternalLink, Copy, Flame, Zap, AlertTriangle, Droplets } from "lucide-react";
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
  if (p < 0.0001)   return `$${p.toFixed(7)}`;
  if (p < 0.01)     return `$${p.toFixed(5)}`;
  if (p < 1)        return `$${p.toFixed(4)}`;
  if (p < 1000)     return `$${p.toFixed(2)}`;
  return `$${(p / 1000).toFixed(1)}K`;
}

function formatCompact(v?: number): string {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface Badge {
  label: string;
  icon: any;
  bg: string;
  text: string;
  border: string;
  accentBar: string;
}

function getBadges(token: DegenToken): Badge[] {
  const badges: Badge[] = [];

  if ((token.priceChange24h ?? 0) > 200) {
    badges.push({
      label: "MOON",
      icon: Zap,
      bg: "bg-yellow-400/10",
      text: "text-yellow-300",
      border: "border-yellow-400/25",
      accentBar: "bg-yellow-400",
    });
  } else if (token.isTrending) {
    badges.push({
      label: "HOT",
      icon: Flame,
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      border: "border-orange-500/25",
      accentBar: "bg-orange-500",
    });
  } else if ((token.priceChange24h ?? 0) > 50) {
    badges.push({
      label: "PUMP",
      icon: TrendingUp,
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
      accentBar: "bg-emerald-500",
    });
  }

  if ((token.liquidity ?? Infinity) < 5_000) {
    badges.push({
      label: "LOW LIQ",
      icon: Droplets,
      bg: "bg-red-500/10",
      text: "text-red-400",
      border: "border-red-500/20",
      accentBar: "bg-red-500",
    });
  } else if ((token.liquidity ?? Infinity) < 25_000) {
    badges.push({
      label: "RISKY",
      icon: AlertTriangle,
      bg: "bg-red-500/8",
      text: "text-red-400/70",
      border: "border-red-500/15",
      accentBar: "bg-red-400",
    });
  }

  if ((token.marketCap ?? Infinity) < 100_000) {
    badges.push({
      label: "EARLY",
      icon: Zap,
      bg: "bg-violet-500/10",
      text: "text-violet-400",
      border: "border-violet-500/20",
      accentBar: "bg-violet-500",
    });
  }

  return badges.slice(0, 2);
}

export function DegenTokenCard({ token, index = 0, onChart, onSwap }: DegenTokenCardProps) {
  const { toast } = useToast();
  const badges = getBadges(token);
  const topBadge = badges[0] ?? null;
  const pct24h = token.priceChange24h ?? 0;
  const up24h = pct24h >= 0;

  const copyMint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(token.mint);
    toast({ title: "Copied" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative flex flex-col rounded-xl overflow-hidden border border-white/[0.07] bg-[#0d1117] hover:bg-[#111820] hover:border-white/[0.14] transition-all duration-150 cursor-pointer"
      data-testid={`degen-card-${token.mint}`}
      onClick={() => onChart(token)}
    >
      {/* Left accent bar keyed to top badge */}
      {topBadge && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${topBadge.accentBar} opacity-70`} />
      )}

      <div className="pl-4 pr-3 pt-3 pb-2.5 flex flex-col gap-2">

        {/* Row 1: Logo · Symbol · Badges · Price · Pct */}
        <div className="flex items-center gap-2.5">
          {/* Rank */}
          <span className="text-[10px] font-mono text-white/20 w-5 text-right flex-shrink-0 select-none">
            {String(index + 1).padStart(2, "0")}
          </span>

          {/* Logo */}
          <div className="relative flex-shrink-0">
            {token.logoURI ? (
              <img
                src={token.logoURI}
                alt={token.symbol}
                className="w-8 h-8 rounded-full object-cover ring-1 ring-white/[0.08]"
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.display = "none";
                  const fb = el.nextElementSibling as HTMLElement;
                  if (fb) fb.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/25 to-accent/15 flex items-center justify-center text-xs font-bold text-primary ring-1 ring-white/[0.08]"
              style={{ display: token.logoURI ? "none" : "flex" }}
            >
              {token.symbol?.charAt(0) ?? "?"}
            </div>
          </div>

          {/* Symbol + address */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[13px] text-white leading-none tracking-tight">{token.symbol}</span>
              {badges.map((b) => {
                const Icon = b.icon;
                return (
                  <span
                    key={b.label}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-[4px] text-[9px] font-bold tracking-widest border ${b.bg} ${b.text} ${b.border}`}
                  >
                    <Icon className="w-2 h-2" />
                    {b.label}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-[3px]">
              <span className="text-[10px] text-white/25 font-mono leading-none">{shortenAddr(token.mint)}</span>
              <button
                onClick={copyMint}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                data-testid={`copy-mint-${token.mint}`}
                title="Copy contract"
              >
                <Copy className="w-[9px] h-[9px] text-white/50" />
              </button>
            </div>
          </div>

          {/* Price + pct */}
          <div className="text-right flex-shrink-0 ml-1">
            <div className="font-mono font-bold text-[13px] text-white leading-none">
              {formatPrice(token.priceUsd)}
            </div>
            <div
              className={`inline-flex items-center gap-0.5 mt-[3px] px-1.5 py-[2px] rounded-[4px] text-[10px] font-bold leading-none ${
                up24h
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {up24h ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {up24h ? "+" : ""}{pct24h.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Row 2: Stats inline */}
        <div className="flex items-center gap-0 ml-[52px]">
          <StatPill label="VOL" value={formatCompact(token.volume24h)} />
          <div className="w-px h-3 bg-white/[0.08] mx-2" />
          <StatPill
            label="LIQ"
            value={formatCompact(token.liquidity)}
            warn={(token.liquidity ?? Infinity) < 10_000}
          />
          <div className="w-px h-3 bg-white/[0.08] mx-2" />
          <StatPill label="MC" value={formatCompact(token.marketCap)} />
        </div>

        {/* Row 3: Actions */}
        <div className="flex items-center gap-1.5 ml-[52px]">
          <button
            onClick={(e) => { e.stopPropagation(); onChart(token); }}
            className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] hover:border-white/[0.15] transition-all text-[11px] font-medium text-white/50 hover:text-white/90 active:scale-95"
            data-testid={`chart-btn-${token.mint}`}
          >
            <BarChart2 className="w-3 h-3" />
            Chart
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSwap(token); }}
            className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/22 border border-emerald-500/20 hover:border-emerald-500/40 transition-all text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 active:scale-95"
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
            className="ml-auto p-1.5 rounded-lg border border-transparent hover:border-white/[0.10] hover:bg-white/[0.06] transition-all text-white/25 hover:text-white/60"
            data-testid={`solscan-btn-${token.mint}`}
            title="View on Solscan"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function StatPill({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] text-white/25 uppercase tracking-widest font-medium">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${warn ? "text-red-400/80" : "text-white/60"}`}>
        {value}
      </span>
    </div>
  );
}
