import { Transaction } from "@shared/schema";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Clock, ArrowRightLeft, ExternalLink } from "lucide-react";
import { shortenAddress } from "@/lib/solana";
import { formatDistanceToNow } from "date-fns";

interface TransactionListProps {
  transactions: Transaction[];
  currentAddress?: string;
  isLoading: boolean;
}

export function TransactionList({ transactions, currentAddress, isLoading }: TransactionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 px-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
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

  return (
    <div className="space-y-3 px-4 pb-20">
      <h3 className="text-lg font-bold mb-4 ml-1">Recent Activity</h3>
      {transactions.map((tx, idx) => {
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
            className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-border hover:bg-muted transition-colors cursor-pointer group block"
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
    </div>
  );
}
