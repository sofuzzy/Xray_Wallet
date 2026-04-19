import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Zap, Wallet, Activity,
  RefreshCw, Send, Download, ArrowRightLeft, Rocket,
  TrendingUp, TrendingDown,
} from "lucide-react";
import { DegenTokenCard, type DegenToken } from "./DegenTokenCard";
import { TradingViewModal } from "@/components/TradingViewModal";
import { SwapModal } from "@/components/SwapModal";
import { Holdings } from "@/components/Holdings";
import { TransactionList } from "@/components/TransactionList";
import { useWallet } from "@/hooks/use-wallet";
import { useTransactions } from "@/hooks/use-transactions";
import { useLocalTransactions } from "@/hooks/use-local-transactions";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { LaunchpadModal } from "@/components/LaunchpadModal";

function fmt(v?: number): string {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v?: number): string {
  if (v == null) return "+0.0%";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtPrice(p?: number): string {
  if (!p) return "—";
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.01)     return `$${p.toFixed(5)}`;
  if (p < 1)        return `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}

/* ── Scrolling ticker ──────────────────────────────────────────────── */
function TickerStrip({ tokens }: { tokens: DegenToken[] }) {
  if (tokens.length === 0) return null;
  const items = [...tokens, ...tokens, ...tokens];
  return (
    <div className="overflow-hidden bg-black/50 border-b border-white/[0.06] h-7 flex items-center">
      <motion.div
        className="flex items-center gap-0 whitespace-nowrap will-change-transform"
        animate={{ x: ["0%", "-33.33%"] }}
        transition={{ repeat: Infinity, duration: 38, ease: "linear" }}
      >
        {items.map((t, i) => {
          const up = (t.priceChange24h ?? 0) >= 0;
          return (
            <span key={i} className="inline-flex items-center gap-2 px-4 border-r border-white/[0.05]">
              <span className="text-[10px] font-mono font-semibold text-white/40 tracking-wide">{t.symbol}</span>
              <span className="text-[10px] font-mono text-white/70">{fmtPrice(t.priceUsd)}</span>
              <span className={`text-[10px] font-mono font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
                {fmtPct(t.priceChange24h)}
              </span>
            </span>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ── Wallet bar ─────────────────────────────────────────────────────── */
function WalletBar({
  balance,
  onRefresh,
  onSend,
  onReceive,
  onSwap,
  onLaunch,
}: {
  balance: number;
  onRefresh: () => void;
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onLaunch: () => void;
}) {
  const solUsd = balance * 150; // rough display — will be off but keeps it snappy

  const actions = [
    { icon: Send, label: "Send", onClick: onSend, testId: "degen-action-send" },
    { icon: Download, label: "Receive", onClick: onReceive, testId: "degen-action-receive" },
    { icon: ArrowRightLeft, label: "Swap", onClick: onSwap, accent: true, testId: "degen-action-swap" },
    { icon: Rocket, label: "Launch", onClick: onLaunch, testId: "degen-action-launch" },
  ];

  return (
    <div className="px-4 pt-3 pb-3">
      <div className="flex items-center justify-between">
        {/* Balance */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white tracking-tighter leading-none">
            {balance.toFixed(3)}
          </span>
          <span className="text-xs text-white/30 font-mono">SOL</span>
          <button
            onClick={onRefresh}
            className="ml-1 text-white/20 hover:text-white/50 transition-colors"
            data-testid="degen-refresh-balance"
            title="Refresh balance"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1.5">
          {actions.map(({ icon: Icon, label, onClick, accent, testId }) => (
            <button
              key={label}
              onClick={onClick}
              data-testid={testId}
              title={label}
              className={`
                flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl
                text-[10px] font-semibold transition-all duration-150 active:scale-95
                ${accent
                  ? "bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-400"
                  : "bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.07] hover:border-white/[0.14] text-white/50 hover:text-white/90"
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Tab bar ────────────────────────────────────────────────────────── */
type TabId = "trending" | "new" | "portfolio" | "activity";

const TABS: { id: TabId; label: string; icon: any; shortLabel: string }[] = [
  { id: "trending", label: "Trending",   shortLabel: "Hot",       icon: Flame },
  { id: "new",      label: "Low MC",     shortLabel: "Low MC",    icon: Zap },
  { id: "portfolio",label: "Portfolio",  shortLabel: "Portfolio", icon: Wallet },
  { id: "activity", label: "Activity",   shortLabel: "Activity",  icon: Activity },
];

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="relative px-4 flex items-center border-b border-white/[0.07]">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            data-testid={`degen-tab-${tab.id}`}
            className={`
              relative flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold
              transition-colors duration-150
              ${isActive ? "text-white" : "text-white/35 hover:text-white/65"}
            `}
          >
            <Icon className={`w-3 h-3 ${isActive ? "text-orange-400" : ""}`} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
            {isActive && (
              <motion.div
                layoutId="degen-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500 rounded-t-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Skeleton loaders ───────────────────────────────────────────────── */
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-[#0d1117] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/[0.06]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-white/[0.06]" />
          <div className="h-2 w-16 rounded bg-white/[0.04]" />
        </div>
        <div className="space-y-1.5 text-right">
          <div className="h-3 w-16 rounded bg-white/[0.06]" />
          <div className="h-2 w-10 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="flex gap-4 ml-11">
        <div className="h-2 w-16 rounded bg-white/[0.04]" />
        <div className="h-2 w-16 rounded bg-white/[0.04]" />
        <div className="h-2 w-16 rounded bg-white/[0.04]" />
      </div>
      <div className="flex gap-2 ml-11">
        <div className="h-6 flex-1 rounded-lg bg-white/[0.04]" />
        <div className="h-6 flex-1 rounded-lg bg-white/[0.04]" />
        <div className="h-6 w-7 rounded-lg bg-white/[0.04]" />
      </div>
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────────── */
function SectionHeader({
  icon: Icon,
  label,
  count,
  onRefresh,
  subtitle,
}: {
  icon: any;
  label: string;
  count?: number;
  onRefresh?: () => void;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-3.5 h-3.5 text-orange-400/70" />
      <span className="text-[11px] font-bold text-white/60 tracking-[0.12em] uppercase">{label}</span>
      {count != null && (
        <span className="text-[10px] text-white/20 font-mono">{count}</span>
      )}
      {subtitle && (
        <span className="text-[10px] text-white/20 hidden sm:inline">— {subtitle}</span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-auto flex items-center gap-1 text-[10px] text-white/25 hover:text-white/55 transition-colors"
          data-testid="degen-refresh-trending"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Refresh
        </button>
      )}
    </div>
  );
}

/* ── Modal token adapter ─────────────────────────────────────────────── */
interface ModalToken {
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

/* ── Main dashboard ─────────────────────────────────────────────────── */
export function DegenDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("trending");
  const [chartToken, setChartToken] = useState<ModalToken | null>(null);
  const [swapToken, setSwapToken] = useState<ModalToken | null>(null);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  const { balance, address, refreshBalance } = useWallet();
  const { data: transactions, isLoading: txLoading } = useTransactions(address);
  const { transactions: localTransactions } = useLocalTransactions(address);

  const { data: trending = [], isLoading: trendingLoading, refetch } = useQuery<DegenToken[]>({
    queryKey: ["/api/swaps/trending"],
    staleTime: 60_000,
  });

  const { data: popular = [], isLoading: popularLoading } = useQuery<DegenToken[]>({
    queryKey: ["/api/swaps/tokens"],
    staleTime: 5 * 60_000,
  });

  const allTokens: DegenToken[] = trending.length > 0 ? trending : popular.slice(0, 20);
  const isLoading = trendingLoading && allTokens.length === 0;

  const hotTokens = [...allTokens]
    .sort((a, b) => Math.abs(b.priceChange24h ?? 0) - Math.abs(a.priceChange24h ?? 0));

  const newTokens = [...allTokens]
    .sort((a, b) => (a.marketCap ?? Infinity) - (b.marketCap ?? Infinity));

  const openChart = (t: DegenToken) => setChartToken({ ...t, decimals: 6 });
  const openSwap  = (t: DegenToken) => setSwapToken({ ...t, decimals: 6 });

  const renderGrid = (tokens: DegenToken[]) => (
    <div className="space-y-2">
      {tokens.map((t, i) => (
        <DegenTokenCard key={t.mint} token={t} index={i} onChart={openChart} onSwap={openSwap} />
      ))}
    </div>
  );

  const renderSkeletons = (n = 5) => (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-53px)] bg-[#080b10] text-white flex flex-col">
      {/* Ambient light */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/3 w-[500px] h-[500px] bg-orange-600/[0.04] rounded-full blur-3xl" />
        <div className="absolute top-32 right-1/4 w-[400px] h-[400px] bg-emerald-600/[0.03] rounded-full blur-3xl" />
      </div>

      {/* Ticker */}
      <TickerStrip tokens={allTokens.slice(0, 12)} />

      {/* Wallet bar */}
      <WalletBar
        balance={balance}
        onRefresh={refreshBalance}
        onSend={() => setIsSendOpen(true)}
        onReceive={() => setIsReceiveOpen(true)}
        onSwap={() => setIsSwapOpen(true)}
        onLaunch={() => setIsLaunchOpen(true)}
      />

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="relative z-10 flex-1 px-4 pt-5 pb-10 max-w-3xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "trending" && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <SectionHeader
                icon={Flame}
                label="Trending Now"
                count={hotTokens.length}
                onRefresh={() => refetch()}
                subtitle="sorted by 24h momentum"
              />
              {isLoading ? renderSkeletons() : renderGrid(hotTokens)}
            </motion.div>
          )}

          {activeTab === "new" && (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <SectionHeader
                icon={Zap}
                label="Low Market Cap"
                count={newTokens.length}
                subtitle="sorted by MC ascending — higher risk"
              />
              {isLoading ? renderSkeletons() : renderGrid(newTokens)}
            </motion.div>
          )}

          {activeTab === "portfolio" && (
            <motion.div
              key="portfolio"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <SectionHeader icon={Wallet} label="Your Holdings" />
              <div className="rounded-xl overflow-hidden border border-white/[0.07]">
                <Holdings
                  solBalance={balance}
                  onSwapToken={(token) => setSwapToken({ ...token, decimals: token.decimals ?? 6 })}
                />
              </div>
            </motion.div>
          )}

          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <SectionHeader icon={Activity} label="Recent Activity" />
              <TransactionList
                transactions={transactions || []}
                localTransactions={localTransactions}
                currentAddress={address}
                isLoading={txLoading}
                activityLogs={[]}
                limit={25}
                showViewAll={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      {chartToken && (
        <TradingViewModal
          isOpen
          onClose={() => setChartToken(null)}
          token={chartToken}
          onTrade={() => { setSwapToken(chartToken); setChartToken(null); }}
        />
      )}
      {(swapToken || isSwapOpen) && (
        <SwapModal
          isOpen
          onClose={() => { setSwapToken(null); setIsSwapOpen(false); }}
          initialOutputToken={swapToken ?? undefined}
        />
      )}
      {isSendOpen    && <SendModal     isOpen onClose={() => setIsSendOpen(false)} />}
      {isReceiveOpen && <ReceiveModal  isOpen onClose={() => setIsReceiveOpen(false)} />}
      {isLaunchOpen  && <LaunchpadModal isOpen onClose={() => setIsLaunchOpen(false)} />}
    </div>
  );
}
