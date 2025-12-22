import { Transaction } from "@shared/schema";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
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
          <div key={i} className="h-16 w-full bg-white/5 rounded-2xl animate-pulse" />
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

  return (
    <div className="space-y-3 px-4 pb-20">
      <h3 className="text-lg font-bold mb-4 ml-1">Recent Activity</h3>
      {transactions.map((tx, idx) => {
        const isReceived = tx.toAddr === currentAddress;
        
        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-default"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isReceived 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-white/10 text-white"
              }`}>
                {isReceived ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-medium text-white">
                  {isReceived ? "Received" : "Sent"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx.timestamp ? formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true }) : 'Just now'}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <p className={`font-mono font-medium ${isReceived ? "text-green-400" : "text-white"}`}>
                {isReceived ? "+" : "-"}{parseFloat(tx.amount).toFixed(4)} SOL
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {isReceived ? `From: ${shortenAddress(tx.fromAddr)}` : `To: ${shortenAddress(tx.toAddr)}`}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
