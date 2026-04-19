import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Zap, TrendingUp, TrendingDown, BarChart2,
  ArrowRightLeft, RefreshCw, Wallet, Activity, Eye
} from "lucide-react";
import { DegenTokenCard, type DegenToken } from "./DegenTokenCard";
import { TradingViewModal } from "@/components/TradingViewModal";
import { SwapModal } from "@/components/SwapModal";
import { Holdings } from "@/components/Holdings";
import { TransactionList } from "@/components/TransactionList";
import { useWallet } from "@/hooks/use-wallet";
import { useTransactions } from "@/hooks/use-transactions";
import { useLocalTransactions } from "@/hooks/use-local-transactions";
import { ActionButtons } from "@/components/ActionButtons";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { LaunchpadModal } from "@/components/LaunchpadModal";

function formatPct(v?: number): string {
  if (v == null) return "0.0%";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function formatPrice(p?: number): string {
  if (!p) return "—";
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}

function TickerStrip({ tokens }: { tokens: DegenToken[] }) {
  const items = [...tokens, ...tokens];
  return (
    <div className="overflow-hidden border-b border-white/[0.05] bg-black/30 h-8 flex items-center">
      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
      >
        {items.map((t, i) => {
          const up = (t.priceChange24h ?? 0) >= 0;
          return (
            <span key={i} className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-white/50">{t.symbol}</span>
              <span className="text-white/80">{formatPrice(t.priceUsd)}</span>
              <span className={up ? "text-emerald-400" : "text-red-400"}>
                {formatPct(t.priceChange24h)}
              </span>
            </span>
          );
        })}
      </motion.div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-orange-400" />
      <span className="text-sm font-bold text-white/80 tracking-wide uppercase">{label}</span>
      {count != null && (
        <span className="ml-auto text-[10px] text-white/30 font-mono">{count} tokens</span>
      )}
    </div>
  );
}

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

type TabId = "trending" | "new" | "portfolio" | "activity";

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

  const hotTokens = [...allTokens]
    .sort((a, b) => Math.abs(b.priceChange24h ?? 0) - Math.abs(a.priceChange24h ?? 0))
    .slice(0, 12);

  const newTokens = [...allTokens]
    .sort((a, b) => (a.marketCap ?? Infinity) - (b.marketCap ?? Infinity))
    .slice(0, 12);

  const openChart = (t: DegenToken) => setChartToken({ ...t, decimals: 6 });
  const openSwap = (t: DegenToken) => setSwapToken({ ...t, decimals: 6 });

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: "trending", label: "Trending", icon: Flame },
    { id: "new", label: "New / Low MC", icon: Zap },
    { id: "portfolio", label: "Portfolio", icon: Wallet },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  const isLoading = trendingLoading || popularLoading;

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/4 rounded-full blur-3xl" />
      </div>

      {/* Ticker */}
      {allTokens.length > 0 && <TickerStrip tokens={allTokens.slice(0, 10)} />}

      {/* Wallet bar */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">SOL Balance</div>
            <div className="text-2xl font-bold font-mono text-white/90 tracking-tight">
              {balance.toFixed(4)} <span className="text-sm text-white/40">SOL</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshBalance}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all text-white/40 hover:text-white/70"
              data-testid="degen-refresh-balance"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="relative z-10 px-4 pb-4">
        <ActionButtons
          onSend={() => setIsSendOpen(true)}
          onReceive={() => setIsReceiveOpen(true)}
          onSwap={() => setIsSwapOpen(true)}
          onLaunch={() => setIsLaunchOpen(true)}
        />
      </div>

      {/* Tabs */}
      <div className="relative z-10 px-4 mb-4">
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`degen-tab-${tab.id}`}
                className={`
                  flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-semibold
                  transition-all duration-200
                  ${active
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "text-white/40 hover:text-white/70 border border-transparent"
                  }
                `}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="relative z-10 px-4 pb-8">
        <AnimatePresence mode="wait">
          {activeTab === "trending" && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between mb-3">
                <SectionHeader icon={Flame} label="Trending Now" count={hotTokens.length} />
                <button
                  onClick={() => refetch()}
                  className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors"
                  data-testid="degen-refresh-trending"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Refresh
                </button>
              </div>
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hotTokens.map((t, i) => (
                    <DegenTokenCard
                      key={t.mint}
                      token={t}
                      index={i}
                      onChart={openChart}
                      onSwap={openSwap}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "new" && (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <SectionHeader icon={Zap} label="New / Low Market Cap" count={newTokens.length} />
              <p className="text-[10px] text-white/25 mb-3">Sorted by market cap ascending — higher risk, earlier stage.</p>
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {newTokens.map((t, i) => (
                    <DegenTokenCard
                      key={t.mint}
                      token={t}
                      index={i}
                      onChart={openChart}
                      onSwap={openSwap}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "portfolio" && (
            <motion.div
              key="portfolio"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <SectionHeader icon={Wallet} label="Your Holdings" />
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <Holdings
                  solBalance={balance}
                  onSwapToken={(token) => {
                    setSwapToken({ ...token, decimals: 6 });
                  }}
                />
              </div>
            </motion.div>
          )}

          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <SectionHeader icon={Activity} label="Recent Activity" />
              <TransactionList
                transactions={transactions || []}
                localTransactions={localTransactions}
                currentAddress={address}
                isLoading={txLoading}
                activityLogs={[]}
                limit={20}
                showViewAll={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      {chartToken && (
        <TradingViewModal
          isOpen={!!chartToken}
          onClose={() => setChartToken(null)}
          token={chartToken}
          onTrade={() => { setSwapToken(chartToken); setChartToken(null); }}
        />
      )}
      {(swapToken || isSwapOpen) && (
        <SwapModal
          isOpen={true}
          onClose={() => { setSwapToken(null); setIsSwapOpen(false); }}
          initialOutputToken={swapToken ?? undefined}
        />
      )}
      {isSendOpen && <SendModal isOpen={isSendOpen} onClose={() => setIsSendOpen(false)} />}
      {isReceiveOpen && <ReceiveModal isOpen={isReceiveOpen} onClose={() => setIsReceiveOpen(false)} />}
      {isLaunchOpen && <LaunchpadModal isOpen={isLaunchOpen} onClose={() => setIsLaunchOpen(false)} />}
    </div>
  );
}
