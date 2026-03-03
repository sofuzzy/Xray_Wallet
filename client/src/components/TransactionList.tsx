import { Transaction, ActivityLog } from "@shared/schema";
import { LocalTransaction } from "@/hooks/use-local-transactions";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownLeft, Clock, ArrowRightLeft, ExternalLink, ShieldAlert, AlertCircle, ChevronRight, X, Smartphone } from "lucide-react";
import { shortenAddress } from "@/lib/solana";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

interface TransactionListProps {
  transactions: Transaction[];
  localTransactions?: LocalTransaction[];
  currentAddress?: string;
  isLoading: boolean;
  activityLogs?: ActivityLog[];
  limit?: number;
  showViewAll?: boolean;
}

function getBlockReasonText(code: string): string {
  const reasons: Record<string, string> = {
    BALANCE_UNAVAILABLE: "Balance check failed",
    BALANCE_INSUFFICIENT: "Insufficient balance",
    BALANCE_FETCH_FAILED: "Could not check balance",
    BALANCE_ZERO: "Zero balance",
    BALANCE_INSUFFICIENT_FEES: "Insufficient SOL for fees",
  };
  return reasons[code] || code;
}

export function TransactionList({ transactions, localTransactions = [], currentAddress, isLoading, activityLogs = [], limit, showViewAll }: TransactionListProps) {
  const dismissMutation = useMutation({
    mutationFn: async (logId: number) => {
      await apiRequest("DELETE", `/api/activity-logs/${logId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity-logs"] });
    },
  });

  const handleDismiss = (e: React.MouseEvent, logId: number) => {
    e.stopPropagation();
    dismissMutation.mutate(logId);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 px-4">
        <div className="h-5 w-32 bg-muted rounded-md animate-pulse mb-4 ml-1" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30">
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-20 bg-muted rounded-md animate-pulse" />
              <div className="h-3 w-28 bg-muted/70 rounded-md animate-pulse" />
            </div>
            <div className="space-y-2 text-right">
              <div className="h-4 w-24 bg-muted rounded-md animate-pulse ml-auto" />
              <div className="h-3 w-16 bg-muted/70 rounded-md animate-pulse ml-auto" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Merge DB transactions with local transactions (dedupe by signature)
  const dbSignatures = new Set(transactions.map(tx => tx.signature));
  const uniqueLocalTxs = localTransactions.filter(ltx => !dbSignatures.has(ltx.signature));
  
  // Convert local transactions to display format and merge
  const allTransactions = [
    ...uniqueLocalTxs.map(ltx => ({
      id: ltx.id,
      fromAddr: ltx.fromAddr,
      toAddr: ltx.toAddr,
      amount: ltx.amount,
      signature: ltx.signature,
      status: ltx.status,
      type: ltx.type,
      inputToken: ltx.inputToken || null,
      outputToken: ltx.outputToken || null,
      outputAmount: ltx.outputAmount || null,
      timestamp: new Date(ltx.timestamp),
      isLocal: true,
    })),
    ...transactions.map(tx => ({ ...tx, isLocal: false })),
  ].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });

  const hasNoActivity = allTransactions.length === 0 && activityLogs.length === 0;
  const displayTransactions = limit ? allTransactions.slice(0, limit) : allTransactions;
  const hasMore = limit && allTransactions.length > limit;

  if (hasNoActivity) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mb-4 opacity-20" />
        <p>No recent activity</p>
      </div>
    );
  }

  const getSolscanUrl = (signature: string) => {
    return `https://solscan.io/tx/${signature}`;
  };

  const swapBlockLogs = activityLogs.filter(log => log.action === "swap_blocked");

  return (
    <div className="space-y-3 px-4 pb-20">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 ml-1">Recent Activity</h3>
      
      {swapBlockLogs.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs text-muted-foreground ml-1">Blocked Swaps</p>
          <AnimatePresence mode="popLayout">
            {swapBlockLogs.slice(0, 5).map((log, idx) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                data-testid={`activity-log-${log.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-destructive/20 text-destructive">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3" />
                      Swap Blocked
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.createdAt ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true }) : 'Just now'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-xs text-destructive font-medium">
                      {getBlockReasonText(log.reason)}
                    </p>
                    {log.requestedAmount && (
                      <p className="text-xs text-muted-foreground">
                        {parseFloat(log.requestedAmount).toFixed(4)} requested
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDismiss(e, log.id)}
                    disabled={dismissMutation.isPending}
                    data-testid={`button-dismiss-${log.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {displayTransactions.map((tx, idx) => {
        const isReceived = tx.toAddr === currentAddress;
        const isSwap = tx.type === "swap";
        
        return (
          <motion.a
            key={tx.id}
            href={getSolscanUrl(tx.signature)}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group block"
            data-testid={`transaction-item-${tx.id}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isSwap 
                  ? "bg-purple-500/20 text-purple-400"
                  : isReceived 
                    ? "bg-green-500/20 text-green-400" 
                    : "bg-muted text-foreground"
              }`}>
                {isSwap ? (
                  <ArrowRightLeft className="w-5 h-5" />
                ) : isReceived ? (
                  <ArrowDownLeft className="w-5 h-5" />
                ) : (
                  <ArrowUpRight className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  {isSwap ? "Swap" : isReceived ? "Received" : "Sent"}
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx.timestamp ? formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true }) : 'Just now'}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              {isSwap ? (
                <>
                  <p className="font-mono font-medium text-purple-400">
                    {parseFloat(tx.amount).toFixed(4)} {tx.inputToken || "?"} → {tx.outputAmount ? parseFloat(tx.outputAmount).toFixed(4) : "?"} {tx.outputToken || "?"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {shortenAddress(tx.signature)}
                  </p>
                </>
              ) : (
                <>
                  <p className={`font-mono font-medium ${isReceived ? "text-green-500 dark:text-green-400" : "text-foreground"}`}>
                    {isReceived ? "+" : "-"}{parseFloat(tx.amount).toFixed(4)} SOL
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {isReceived ? `From: ${shortenAddress(tx.fromAddr)}` : `To: ${shortenAddress(tx.toAddr)}`}
                  </p>
                </>
              )}
            </div>
          </motion.a>
        );
      })}

      {showViewAll && hasMore && (
        <Link href="/transactions">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
            data-testid="link-view-all-transactions"
          >
            <span className="text-sm font-medium">View all {allTransactions.length} transactions</span>
            <ChevronRight className="w-4 h-4" />
          </motion.div>
        </Link>
      )}
    </div>
  );
}
