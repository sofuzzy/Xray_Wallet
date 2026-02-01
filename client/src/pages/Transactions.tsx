import { Link } from "wouter";
import { useTransactions } from "@/hooks/use-transactions";
import { useLocalTransactions } from "@/hooks/use-local-transactions";
import { useWallet } from "@/hooks/use-wallet";
import { useQuery } from "@tanstack/react-query";
import { type ActivityLog } from "@shared/schema";
import { TransactionList } from "@/components/TransactionList";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Transactions() {
  const { address } = useWallet();
  const { data: transactions, isLoading: txLoading } = useTransactions(address);
  const { transactions: localTransactions } = useLocalTransactions(address);
  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs", address],
    queryFn: async () => {
      const params = address ? `?walletAddress=${address}` : "";
      const response = await fetch(`/api/activity-logs${params}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!address,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">All Transactions</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto py-6">
        <TransactionList 
          transactions={transactions || []} 
          localTransactions={localTransactions}
          currentAddress={address} 
          isLoading={txLoading}
          activityLogs={activityLogs}
        />
      </main>
    </div>
  );
}
