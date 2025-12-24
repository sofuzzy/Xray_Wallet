import { useState } from "react";
import { motion } from "framer-motion";
import { X, Coins, Loader2, Check, AlertCircle, ChevronDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";
import {
  getLocalKeypair,
  getStakeAccounts,
  getValidators,
  createStakeAccount,
  deactivateStake,
  withdrawStake,
  shortenAddress,
  StakeAccountInfo,
  LAMPORTS_PER_SOL,
} from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

interface StakingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "stake" | "manage";

export function StakingModal({ isOpen, onClose }: StakingModalProps) {
  const [tab, setTab] = useState<Tab>("stake");
  const [amount, setAmount] = useState("");
  const [selectedValidator, setSelectedValidator] = useState<string>("");
  const [showValidatorDropdown, setShowValidatorDropdown] = useState(false);
  const { balance, address, refreshBalance } = useWallet();
  const { toast } = useToast();

  const { data: validators, isLoading: validatorsLoading } = useQuery({
    queryKey: ["validators"],
    queryFn: getValidators,
    staleTime: 60000,
  });

  const { data: stakeAccounts, isLoading: stakeAccountsLoading, refetch: refetchStakeAccounts } = useQuery({
    queryKey: ["stake-accounts", address],
    queryFn: async () => {
      if (!address) return [];
      return getStakeAccounts(new PublicKey(address));
    },
    enabled: !!address,
  });

  const stakeMutation = useMutation({
    mutationFn: async ({ amountSol, validatorPubkey }: { amountSol: number; validatorPubkey: string }) => {
      const keypair = getLocalKeypair();
      if (!keypair) throw new Error("Wallet not found");
      return createStakeAccount(keypair, amountSol, validatorPubkey);
    },
    onSuccess: () => {
      toast({ title: "Stake Created", description: "Your SOL has been staked. It will activate over the next few epochs." });
      setAmount("");
      setSelectedValidator("");
      refreshBalance();
      refetchStakeAccounts();
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    },
    onError: (error: Error) => {
      toast({ title: "Staking Failed", description: error.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (stakeAccountPubkey: PublicKey) => {
      const keypair = getLocalKeypair();
      if (!keypair) throw new Error("Wallet not found");
      return deactivateStake(keypair, stakeAccountPubkey);
    },
    onSuccess: () => {
      toast({ title: "Unstaking Started", description: "Your stake is deactivating. You can withdraw after the cooldown period." });
      refetchStakeAccounts();
    },
    onError: (error: Error) => {
      toast({ title: "Deactivation Failed", description: error.message, variant: "destructive" });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async ({ stakeAccountPubkey, lamports }: { stakeAccountPubkey: PublicKey; lamports: number }) => {
      const keypair = getLocalKeypair();
      if (!keypair) throw new Error("Wallet not found");
      return withdrawStake(keypair, stakeAccountPubkey, lamports);
    },
    onSuccess: () => {
      toast({ title: "Withdrawn", description: "Your staked SOL has been returned to your wallet." });
      refreshBalance();
      refetchStakeAccounts();
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    },
    onError: (error: Error) => {
      toast({ title: "Withdrawal Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleStake = () => {
    const amountSol = parseFloat(amount);
    if (isNaN(amountSol) || amountSol <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    if (amountSol > (balance || 0) - 0.01) {
      toast({ title: "Insufficient Balance", description: "Keep at least 0.01 SOL for fees", variant: "destructive" });
      return;
    }
    if (!selectedValidator) {
      toast({ title: "No Validator", description: "Please select a validator", variant: "destructive" });
      return;
    }
    stakeMutation.mutate({ amountSol, validatorPubkey: selectedValidator });
  };

  const getStateColor = (state: StakeAccountInfo["state"]) => {
    switch (state) {
      case "active":
        return "bg-emerald-500/20 text-emerald-400";
      case "activating":
        return "bg-yellow-500/20 text-yellow-400";
      case "deactivating":
        return "bg-orange-500/20 text-orange-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const totalStaked = stakeAccounts?.reduce((sum, acc) => sum + acc.lamports, 0) || 0;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-card border border-white/10 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Staking</h2>
              <p className="text-sm text-muted-foreground">
                {totalStaked > 0 ? `${(totalStaked / LAMPORTS_PER_SOL).toFixed(4)} SOL staked` : "Earn rewards on your SOL"}
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-staking">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab("stake")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "stake" ? "text-white border-b-2 border-primary" : "text-muted-foreground"
            }`}
            data-testid="tab-stake"
          >
            Stake SOL
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "manage" ? "text-white border-b-2 border-primary" : "text-muted-foreground"
            }`}
            data-testid="tab-manage"
          >
            Manage Stakes
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {tab === "stake" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="stake-amount">Amount (SOL)</Label>
                <div className="relative">
                  <Input
                    id="stake-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white pr-20"
                    data-testid="input-stake-amount"
                  />
                  <button
                    onClick={() => setAmount(((balance || 0) - 0.01).toFixed(4))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-medium"
                    data-testid="button-stake-max"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Available: {balance?.toFixed(4) || "0.0000"} SOL
                </p>
              </div>

              <div className="space-y-2">
                <Label>Select Validator</Label>
                <div className="relative">
                  <button
                    onClick={() => setShowValidatorDropdown(!showValidatorDropdown)}
                    className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg text-left"
                    data-testid="button-select-validator"
                  >
                    <span className={selectedValidator ? "text-white" : "text-muted-foreground"}>
                      {selectedValidator ? shortenAddress(selectedValidator, 8) : "Choose a validator..."}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {showValidatorDropdown && (
                    <div className="absolute z-10 mt-2 w-full bg-card border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {validatorsLoading ? (
                        <div className="p-4 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : validators?.length ? (
                        validators.map((v) => (
                          <button
                            key={v.votePubkey}
                            onClick={() => {
                              setSelectedValidator(v.votePubkey);
                              setShowValidatorDropdown(false);
                            }}
                            className="w-full p-3 text-left hover:bg-white/5 flex items-center justify-between"
                            data-testid={`validator-${v.votePubkey.slice(0, 8)}`}
                          >
                            <div>
                              <p className="text-sm text-white">{shortenAddress(v.votePubkey, 6)}</p>
                              <p className="text-xs text-muted-foreground">
                                {(v.activatedStake / LAMPORTS_PER_SOL / 1000000).toFixed(2)}M SOL staked
                              </p>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {v.commission}% fee
                            </Badge>
                          </button>
                        ))
                      ) : (
                        <p className="p-4 text-sm text-muted-foreground text-center">No validators found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-xl space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p>Staking takes 2-3 days to activate. Unstaking also requires a cooldown period before withdrawal.</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleStake}
                disabled={stakeMutation.isPending || !amount || !selectedValidator}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                data-testid="button-confirm-stake"
              >
                {stakeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Staking...
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4 mr-2" />
                    Stake SOL
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {stakeAccountsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : stakeAccounts?.length ? (
                stakeAccounts.map((account) => (
                  <div
                    key={account.pubkey.toString()}
                    className="p-4 bg-white/5 rounded-xl space-y-3"
                    data-testid={`stake-account-${account.pubkey.toString().slice(0, 8)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {(account.lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shortenAddress(account.pubkey.toString(), 6)}
                        </p>
                      </div>
                      <Badge className={getStateColor(account.state)}>
                        {account.state}
                      </Badge>
                    </div>

                    {account.validator && (
                      <p className="text-xs text-muted-foreground">
                        Validator: {shortenAddress(account.validator, 6)}
                      </p>
                    )}

                    <div className="flex gap-2">
                      {account.state === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deactivateMutation.mutate(account.pubkey)}
                          disabled={deactivateMutation.isPending}
                          data-testid={`button-unstake-${account.pubkey.toString().slice(0, 8)}`}
                        >
                          {deactivateMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Unstake"
                          )}
                        </Button>
                      )}
                      {account.state === "inactive" && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            withdrawMutation.mutate({
                              stakeAccountPubkey: account.pubkey,
                              lamports: account.lamports,
                            })
                          }
                          disabled={withdrawMutation.isPending}
                          data-testid={`button-withdraw-${account.pubkey.toString().slice(0, 8)}`}
                        >
                          {withdrawMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Withdraw"
                          )}
                        </Button>
                      )}
                      {account.state === "deactivating" && (
                        <p className="text-xs text-orange-400">Cooling down...</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Coins className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No active stakes</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Stake your SOL to earn rewards
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
