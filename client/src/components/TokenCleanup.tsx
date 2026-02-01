import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2, RefreshCw, CheckCircle2, AlertCircle, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { addLocalTransaction } from "@/hooks/use-local-transactions";

interface CloseableAccount {
  tokenAccount: string;
  mint: string;
  programId: string;
  lamports: number;
  estimatedReclaimLamports: number;
}

interface CloseableResponse {
  owner: string;
  accounts: CloseableAccount[];
  totalAccounts: number;
  totalReclaimableLamports: number;
  totalReclaimableSol: number;
}

export function TokenCleanup() {
  const { toast } = useToast();
  const { address, getPrivateKey } = useWallet();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [isClosing, setIsClosing] = useState(false);

  const walletAddress = address || "";

  const { data, isLoading, refetch, isFetching } = useQuery<CloseableResponse>({
    queryKey: ["/api/cleanup/closeable-token-accounts", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("No wallet");
      const res = await fetch(`/api/cleanup/closeable-token-accounts?owner=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 30000,
  });

  useEffect(() => {
    setSelectedAccounts(new Set());
  }, [data]);

  const handleSelectAll = () => {
    if (!data) return;
    if (selectedAccounts.size === data.accounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(data.accounts.map(a => a.tokenAccount)));
    }
  };

  const handleToggle = (tokenAccount: string) => {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(tokenAccount)) {
      newSet.delete(tokenAccount);
    } else {
      newSet.add(tokenAccount);
    }
    setSelectedAccounts(newSet);
  };

  const selectedTotal = data?.accounts
    .filter(a => selectedAccounts.has(a.tokenAccount))
    .reduce((sum, a) => sum + a.estimatedReclaimLamports, 0) || 0;
  const selectedSol = selectedTotal / 1_000_000_000;

  const handleClose = async () => {
    if (!walletAddress || selectedAccounts.size === 0) return;
    
    setIsClosing(true);
    try {
      const buildRes = await fetch("/api/cleanup/build-close-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: walletAddress,
          tokenAccounts: Array.from(selectedAccounts),
        }),
      });
      
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error || "Failed to build transaction");
      }
      
      const { transactionsBase64, totalAccounts, estimatedReclaimLamports } = await buildRes.json();
      
      if (transactionsBase64.length === 0) {
        toast({ title: "Nothing to close", description: "No closeable accounts found" });
        setIsClosing(false);
        return;
      }

      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error("Failed to get keypair for signing");
      }
      const signer = Keypair.fromSecretKey(bs58.decode(privateKey));
      
      const signedTxs: string[] = [];
      for (const txBase64 of transactionsBase64) {
        const txBuffer = Buffer.from(txBase64, "base64");
        const tx = Transaction.from(txBuffer);
        tx.sign(signer);
        signedTxs.push(tx.serialize().toString("base64"));
      }

      const sendRes = await fetch("/api/cleanup/send-close-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: walletAddress,
          signedTxsBase64: signedTxs,
        }),
      });
      
      if (!sendRes.ok) {
        const err = await sendRes.json();
        // Handle specific error codes with user-friendly messages
        if (err.error === "INSUFFICIENT_SOL_FOR_FEES") {
          throw new Error("You need some SOL in your wallet to pay for transaction fees. Add SOL and try again.");
        }
        throw new Error(err.message || err.error || "Failed to send transaction");
      }
      
      const { signatures, accountsClosed, reclaimedSol } = await sendRes.json();

      for (const sig of signatures) {
        addLocalTransaction({
          signature: sig,
          type: "cleanup",
          fromAddr: walletAddress,
          toAddr: walletAddress,
          amount: (reclaimedSol / signatures.length).toFixed(6),
          status: "confirmed",
        });
      }

      toast({
        title: "Cleanup complete!",
        description: `Closed ${accountsClosed} accounts, reclaimed ~${reclaimedSol.toFixed(6)} SOL`,
      });

      setSelectedAccounts(new Set());
      refetch();
    } catch (error) {
      console.error("Cleanup failed:", error);
      toast({
        title: "Cleanup failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  if (!walletAddress) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>No wallet connected</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Reclaim SOL
          </h3>
          <p className="text-sm text-muted-foreground">
            Close empty token accounts to reclaim rent
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-closeable"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.accounts.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <p className="text-muted-foreground">No empty token accounts found</p>
          <p className="text-xs text-muted-foreground">
            Your wallet is already clean!
          </p>
        </div>
      ) : (
        <>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {data.totalAccounts} empty account{data.totalAccounts !== 1 ? "s" : ""} found
                </p>
                <p className="text-xs text-muted-foreground">
                  Total reclaimable: ~{data.totalReclaimableSol.toFixed(6)} SOL
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                data-testid="button-select-all"
              >
                {selectedAccounts.size === data.accounts.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </div>

          <ScrollArea className="h-48 rounded-md border p-2">
            <div className="space-y-2">
              {data.accounts.map((account) => (
                <div
                  key={account.tokenAccount}
                  className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer"
                  onClick={() => handleToggle(account.tokenAccount)}
                  data-testid={`account-row-${account.tokenAccount.slice(0, 8)}`}
                >
                  <Checkbox
                    checked={selectedAccounts.has(account.tokenAccount)}
                    onCheckedChange={() => handleToggle(account.tokenAccount)}
                    data-testid={`checkbox-${account.tokenAccount.slice(0, 8)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{account.mint}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {account.tokenAccount}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      {(account.estimatedReclaimLamports / 1_000_000_000).toFixed(6)} SOL
                    </Badge>
                    {account.programId.includes("2022") && (
                      <Badge variant="outline" className="text-xs ml-1">
                        T22
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {selectedAccounts.size > 0 && (
            <div className="p-3 rounded-lg bg-muted border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {selectedAccounts.size} selected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reclaim: ~{selectedSol.toFixed(6)} SOL
                  </p>
                </div>
                <Button
                  onClick={handleClose}
                  disabled={isClosing}
                  className="gap-2"
                  data-testid="button-close-accounts"
                >
                  {isClosing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isClosing ? "Closing..." : "Close Selected"}
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/30 rounded">
            <p className="flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              Closing accounts is permanent. Only empty accounts (0 balance) can be closed.
            </p>
            <p>
              Each token account uses ~0.002 SOL for rent. Closing reclaims this SOL.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
