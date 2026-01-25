import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/use-wallet";
import { Lock, Unlock, Loader2, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface BetaStatus {
  unlocked: boolean;
  balanceRaw: string;
  balanceUi: number;
  requiredUi: number;
  unlockTokenMint?: string | null;
}

export function useBetaStatus() {
  const { address } = useWallet();
  
  return useQuery<BetaStatus>({
    queryKey: ["/api/beta/status", address],
    queryFn: async () => {
      if (!address) {
        return { unlocked: false, balanceRaw: "0", balanceUi: 0, requiredUi: 5000 };
      }
      const response = await fetch(`/api/beta/status?owner=${address}`, { credentials: "include" });
      if (!response.ok) {
        return { unlocked: false, balanceRaw: "0", balanceUi: 0, requiredUi: 5000 };
      }
      return response.json();
    },
    enabled: !!address,
    staleTime: 90000,
    refetchOnWindowFocus: false,
  });
}

export function BetaStatusBanner() {
  const { data: status, isLoading } = useBetaStatus();
  const { address } = useWallet();
  
  if (!address) return null;
  
  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-sm"
        data-testid="banner-beta-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Checking beta status...</span>
      </div>
    );
  }
  
  if (!status) return null;
  
  if (status.unlocked) {
    return (
      <div 
        className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-sm"
        data-testid="banner-beta-unlocked"
      >
        <Unlock className="w-4 h-4 text-emerald-500" />
        <span className="text-emerald-600 dark:text-emerald-400">
          Beta Unlocked
        </span>
        <span className="text-muted-foreground">
          XRAY Balance: {status.balanceUi.toLocaleString()}
        </span>
      </div>
    );
  }
  
  return (
    <div 
      className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-sm"
      data-testid="banner-beta-locked"
    >
      <Lock className="w-4 h-4 text-amber-500" />
      <span className="text-amber-600 dark:text-amber-400">
        Beta Locked
      </span>
      <span className="text-muted-foreground">
        XRAY Balance: {status.balanceUi.toLocaleString()} / {status.requiredUi.toLocaleString()}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-amber-500 hover:text-amber-600"
            data-testid="button-beta-info"
          >
            <Info className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-sm" data-testid="popover-beta-info">
          <p>
            To access beta functionality of the wallet, buy or transfer 5,000 XRAY tokens to the wallet you are transacting from in XRAY.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
