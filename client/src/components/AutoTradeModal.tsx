import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingDown, TrendingUp, Loader2, CheckCircle, AlertCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AutoTradeRule } from "@shared/schema";

interface AutoTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenMint?: string;
  tokenSymbol?: string;
  currentPrice?: string;
}

interface RuleFormData {
  stopLossPercent: string;
  takeProfitPercent: string;
  targetToken: string;
}

export function AutoTradeModal({ isOpen, onClose, tokenMint, tokenSymbol, currentPrice }: AutoTradeModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<RuleFormData>({
    stopLossPercent: "10",
    takeProfitPercent: "50",
    targetToken: "SOL",
  });
  const [step, setStep] = useState<"form" | "creating" | "success" | "error">("form");
  const [enableStopLoss, setEnableStopLoss] = useState(true);
  const [enableTakeProfit, setEnableTakeProfit] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const { data: existingRules } = useQuery<AutoTradeRule[]>({
    queryKey: ["/api/auto-trade-rules"],
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: {
      tokenMint: string;
      tokenSymbol: string;
      entryPrice: string;
      stopLossPercent?: number;
      takeProfitPercent?: number;
      targetToken: string;
    }) => {
      return apiRequest("POST", "/api/auto-trade-rules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-trade-rules"] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/auto-trade-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-trade-rules"] });
      toast({ title: "Rule deleted", description: "Auto-trade rule has been removed" });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/auto-trade-rules/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-trade-rules"] });
    },
  });

  const handleInputChange = (field: keyof RuleFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    setStep("form");
    setFormData({ stopLossPercent: "10", takeProfitPercent: "50", targetToken: "SOL" });
    setEnableStopLoss(true);
    setEnableTakeProfit(true);
    setErrorMessage("");
    onClose();
  };

  const createRule = async () => {
    if (!tokenMint || !tokenSymbol) {
      toast({ title: "Error", description: "No token selected", variant: "destructive" });
      return;
    }

    if (!enableStopLoss && !enableTakeProfit) {
      toast({ title: "Error", description: "Enable at least stop loss or take profit", variant: "destructive" });
      return;
    }

    const stopLoss = enableStopLoss ? parseInt(formData.stopLossPercent) : undefined;
    const takeProfit = enableTakeProfit ? parseInt(formData.takeProfitPercent) : undefined;

    if (enableStopLoss && (isNaN(stopLoss!) || stopLoss! < 1 || stopLoss! > 100)) {
      toast({ title: "Error", description: "Stop loss must be between 1-100%", variant: "destructive" });
      return;
    }

    if (enableTakeProfit && (isNaN(takeProfit!) || takeProfit! < 1 || takeProfit! > 1000)) {
      toast({ title: "Error", description: "Take profit must be between 1-1000%", variant: "destructive" });
      return;
    }

    setStep("creating");

    try {
      await createRuleMutation.mutateAsync({
        tokenMint,
        tokenSymbol,
        entryPrice: currentPrice || "0",
        stopLossPercent: stopLoss,
        takeProfitPercent: takeProfit,
        targetToken: formData.targetToken,
      });

      setStep("success");
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to create auto-trade rule");
      setStep("error");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="modal-autotrade"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
        
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-border/50 rounded-md shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Auto-Trade Rules</h2>
              <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
            </div>
            <Button size="icon" variant="ghost" onClick={handleClose} data-testid="button-close-autotrade">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4 max-h-[70vh] overflow-y-auto">
            {step === "form" && (
              <div className="space-y-6">
                {tokenMint ? (
                  <>
                    <div className="bg-muted/50 rounded-md p-3">
                      <div className="text-sm text-muted-foreground">Setting rules for</div>
                      <div className="font-semibold">{tokenSymbol}</div>
                      {currentPrice && (
                        <div className="text-sm text-muted-foreground">Current price: ${currentPrice}</div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-destructive" />
                          <Label>Stop Loss</Label>
                        </div>
                        <Switch 
                          checked={enableStopLoss} 
                          onCheckedChange={setEnableStopLoss}
                          data-testid="switch-stoploss"
                        />
                      </div>
                      {enableStopLoss && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Sell if price drops</span>
                          <Input
                            type="number"
                            value={formData.stopLossPercent}
                            onChange={(e) => handleInputChange("stopLossPercent", e.target.value)}
                            className="w-20 text-center"
                            min="1"
                            max="100"
                            data-testid="input-stoploss-percent"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <Label>Take Profit</Label>
                        </div>
                        <Switch 
                          checked={enableTakeProfit} 
                          onCheckedChange={setEnableTakeProfit}
                          data-testid="switch-takeprofit"
                        />
                      </div>
                      {enableTakeProfit && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Sell if price gains</span>
                          <Input
                            type="number"
                            value={formData.takeProfitPercent}
                            onChange={(e) => handleInputChange("takeProfitPercent", e.target.value)}
                            className="w-20 text-center"
                            min="1"
                            max="1000"
                            data-testid="input-takeprofit-percent"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Convert to</Label>
                      <div className="flex gap-2">
                        <Button
                          variant={formData.targetToken === "SOL" ? "default" : "outline"}
                          onClick={() => handleInputChange("targetToken", "SOL")}
                          className="flex-1"
                          data-testid="button-target-sol"
                        >
                          SOL
                        </Button>
                        <Button
                          variant={formData.targetToken === "USDC" ? "default" : "outline"}
                          onClick={() => handleInputChange("targetToken", "USDC")}
                          className="flex-1"
                          data-testid="button-target-usdc"
                        >
                          USDC
                        </Button>
                      </div>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={createRule}
                      disabled={!enableStopLoss && !enableTakeProfit}
                      data-testid="button-create-rule"
                    >
                      <Settings2 className="w-4 h-4 mr-2" />
                      Create Auto-Trade Rule
                    </Button>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Select a token from your portfolio to set up auto-trade rules
                  </div>
                )}

                {existingRules && existingRules.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border/50">
                    <h3 className="font-medium text-sm text-muted-foreground">Active Rules</h3>
                    {existingRules.map((rule) => (
                      <div 
                        key={rule.id} 
                        className="bg-muted/30 rounded-md p-3 space-y-2"
                        data-testid={`rule-item-${rule.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{rule.tokenSymbol}</span>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.isActive}
                              onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, isActive: checked })}
                              data-testid={`switch-rule-${rule.id}`}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                              data-testid={`button-delete-rule-${rule.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-2">
                          {rule.stopLossPercent && (
                            <span className="flex items-center gap-1">
                              <TrendingDown className="w-3 h-3 text-destructive" />
                              -{rule.stopLossPercent}%
                            </span>
                          )}
                          {rule.takeProfitPercent && (
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-green-500" />
                              +{rule.takeProfitPercent}%
                            </span>
                          )}
                          <span>to {rule.targetToken}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === "creating" && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground">Creating auto-trade rule...</p>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold">Rule Created</h3>
                <p className="text-muted-foreground text-center">
                  Your auto-trade rule for {tokenSymbol} is now active
                </p>
                <Button onClick={handleClose} className="mt-4" data-testid="button-done-autotrade">
                  Done
                </Button>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-xl font-semibold">Failed to Create Rule</h3>
                <p className="text-muted-foreground text-center text-sm">{errorMessage}</p>
                <Button onClick={() => setStep("form")} variant="outline" className="mt-4">
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
