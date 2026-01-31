import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Loader2, Search, X, Plus, TrendingUp, Zap, Check, AlertCircle, HelpCircle, AlertTriangle, Clock, Info, ShieldAlert, Wallet, Lock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tokenManager } from "@/lib/tokenManager";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useRiskShieldSettings } from "@/hooks/use-risk-shield-settings";
import { useBetaStatus } from "@/components/BetaStatusBanner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";
import { RiskShieldModal, type RiskShieldDecision } from "@/components/RiskShieldModal";
import { RiskChecksModal } from "@/components/RiskChecksModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasAcknowledgedLegal } from "@/components/LegalAcknowledgmentModal";
import { verifyVersionedTransactionIntegrity, serializeTransactionToBase64, parseTransactionError } from "@/lib/transactionIntegrity";
import bs58 from "bs58";

type RiskLevel = "low" | "medium" | "high" | "critical";

const SLIPPAGE_DEFAULTS: Record<RiskLevel, number> = {
  low: 2,
  medium: 3.5,
  high: 6,
  critical: 10,
};

function getSlippageForRiskLevel(level?: RiskLevel): number {
  return level ? SLIPPAGE_DEFAULTS[level] : 2;
}

function friendlyFlagMessage(code: string, message: string): string {
  const friendlyMessages: Record<string, string> = {
    VERY_LOW_LIQUIDITY: "Very little money in the trading pool - your trade could move the price a lot",
    LOW_LIQUIDITY: "Limited trading pool size - larger trades may affect the price",
    VERY_NEW_MARKET: "This token just launched - extra caution recommended",
    LOW_VOLUME: "Few people are trading this token right now",
    HIGH_HOLDER_CONCENTRATION: "A small group of wallets owns most of this token",
    MINT_AUTHORITY_PRESENT: "The token creator can still make more tokens (diluting your holdings)",
    FREEZE_AUTHORITY_PRESENT: "The token creator can freeze your tokens",
    TOP_HOLDER_DOMINANCE: "One wallet owns a very large share of this token",
    UNVERIFIED_METADATA: "Token details haven't been verified - could be a copycat",
    HONEYPOT_RISK: "You might not be able to sell this token after buying",
  };
  return friendlyMessages[code] || message;
}

function formatLiquidityUsd(value?: number): string {
  if (!value) return "Unknown";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

type TransactionStep = "idle" | "building" | "signing" | "sending" | "confirming" | "success" | "error";

function TransactionProgress({ step, errorMessage }: { step: TransactionStep; errorMessage?: string }) {
  const steps = [
    { key: "building", label: "Building transaction" },
    { key: "signing", label: "Signing transaction" },
    { key: "sending", label: "Sending to network" },
    { key: "confirming", label: "Confirming on chain" },
  ];
  
  const stepOrder = ["building", "signing", "sending", "confirming", "success"];
  const currentIndex = stepOrder.indexOf(step);
  
  if (step === "idle") return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 rounded-lg"
    >
      {step === "success" ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <span className="text-lg font-medium">Swap Complete!</span>
        </motion.div>
      ) : step === "error" ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <span className="text-lg font-medium">Transaction Failed</span>
          {errorMessage && <span className="text-sm text-muted-foreground max-w-[250px]">{errorMessage}</span>}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-6 w-full max-w-[280px]">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
          </div>
          
          <div className="space-y-3 w-full">
            {steps.map((s, i) => {
              const isActive = s.key === step;
              const isComplete = currentIndex > stepOrder.indexOf(s.key);
              
              return (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-3 ${isActive ? "text-foreground" : isComplete ? "text-muted-foreground" : "text-muted-foreground/50"}`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isComplete ? "bg-primary" : isActive ? "bg-primary/20" : "bg-muted"}`}>
                    {isComplete ? (
                      <Check className="w-3 h-3 text-primary-foreground" />
                    ) : isActive ? (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-primary"
                      />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{s.label}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOutputToken?: Token;
  initialInputToken?: Token;
}

interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  volume24h?: number;
  liquidity?: number;
  priceChange24h?: number;
  isTrending?: boolean;
  priceUsd?: number;
  marketCap?: number;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "N/A";
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
  if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}K`;
  return `$${cap.toFixed(0)}`;
}

function formatPrice(price?: number): string {
  if (!price) return "N/A";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

function formatVolume(volume?: number): string {
  if (!volume) return "";
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

type DexOption = "auto" | "orca" | "raydium";

export function SwapModal({ isOpen, onClose, initialOutputToken, initialInputToken }: SwapModalProps) {
  const { balance, keypair, address } = useWallet();
  const { toast } = useToast();
  const { settings: riskShieldSettings, getEnabledCheckCodes } = useRiskShieldSettings();
  const { data: betaStatus } = useBetaStatus();
  const [inputAmount, setInputAmount] = useState("");
  const [debouncedInputAmount, setDebouncedInputAmount] = useState("");
  const [inputMint, setInputMint] = useState(initialInputToken?.mint || "SOL");
  const [outputMint, setOutputMint] = useState(initialInputToken ? "SOL" : (initialOutputToken?.mint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"));
  
  // Allow buying the XRAY token even when beta is locked
  const unlockTokenMint = betaStatus?.unlockTokenMint;
  const normalizedOutputForBeta = outputMint === "SOL" ? "So11111111111111111111111111111111111111112" : outputMint;
  const isBuyingUnlockToken = unlockTokenMint && normalizedOutputForBeta === unlockTokenMint;
  const isBetaLocked = betaStatus && !betaStatus.unlocked && !isBuyingUnlockToken;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);
  const [priorityFee, setPriorityFee] = useState<"low" | "medium" | "high" | "custom">(() => {
    try {
      const stored = localStorage.getItem("xray_priority_fee");
      if (stored && ["low", "medium", "high", "custom"].includes(stored)) {
        return stored as "low" | "medium" | "high" | "custom";
      }
    } catch {}
    return "medium";
  });
  const [customPriorityFee, setCustomPriorityFee] = useState(() => {
    try {
      return localStorage.getItem("xray_custom_priority_fee") || "";
    } catch {
      return "";
    }
  });
  const [customTokens, setCustomTokens] = useState<Token[]>(() => {
    const tokens: Token[] = [];
    if (initialOutputToken) tokens.push(initialOutputToken);
    if (initialInputToken) tokens.push(initialInputToken);
    return tokens;
  });
  const [txStep, setTxStep] = useState<TransactionStep>("idle");
  const [txError, setTxError] = useState<string>("");
  const [dexOption, setDexOption] = useState<DexOption>("auto");
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [riskChecksModalOpen, setRiskChecksModalOpen] = useState(false);
  const [riskDecision, setRiskDecision] = useState<RiskShieldDecision | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [riskAckedMints, setRiskAckedMints] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem("xray_risk_acked_mints");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [riskPendingStage, setRiskPendingStage] = useState<"quote" | "transaction" | null>(null);
  
  // Slippage state
  const [slippageMode, setSlippageMode] = useState<"auto" | "custom">("auto");
  const [customSlippage, setCustomSlippage] = useState("");
  const [showHighSlippageConfirm, setShowHighSlippageConfirm] = useState(false);
  const [highSlippageConfirmed, setHighSlippageConfirmed] = useState(false);
  
  // Quote freshness tracking
  const [quoteTimestamp, setQuoteTimestamp] = useState<number | null>(null);
  const [isQuoteStale, setIsQuoteStale] = useState(false);
  
  // Blocked token state for Why Blocked tooltip
  const [blockedReason, setBlockedReason] = useState<RiskShieldDecision | null>(null);

  // Debounce input amount to avoid spamming quote requests on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputAmount(inputAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount]);
  
  // Persist priority fee settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("xray_priority_fee", priorityFee);
    } catch {}
  }, [priorityFee]);
  
  useEffect(() => {
    try {
      localStorage.setItem("xray_custom_priority_fee", customPriorityFee);
    } catch {}
  }, [customPriorityFee]);
  
  // Check quote staleness every second
  useEffect(() => {
    if (!quoteTimestamp) {
      setIsQuoteStale(false);
      return;
    }
    
    const checkStaleness = () => {
      const age = Date.now() - quoteTimestamp;
      setIsQuoteStale(age > 15000); // 15 seconds
    };
    
    checkStaleness();
    const interval = setInterval(checkStaleness, 1000);
    return () => clearInterval(interval);
  }, [quoteTimestamp]);
  
  // Compute the token's risk level from the last risk decision or quote response
  const tokenRiskLevel = useMemo((): RiskLevel | undefined => {
    if (riskDecision?.assessment?.level) return riskDecision.assessment.level;
    if (blockedReason?.assessment?.level) return blockedReason.assessment.level;
    return undefined;
  }, [riskDecision, blockedReason]);
  
  // Compute effective slippage in basis points
  const effectiveSlippageBps = useMemo(() => {
    if (slippageMode === "custom" && customSlippage) {
      const pct = parseFloat(customSlippage);
      return Math.max(1, Math.min(5000, Math.round(pct * 100))); // 0.01% to 50%
    }
    const defaultPct = getSlippageForRiskLevel(tokenRiskLevel);
    return Math.round(defaultPct * 100);
  }, [slippageMode, customSlippage, tokenRiskLevel]);
  
  const effectiveSlippagePct = effectiveSlippageBps / 100;
  
  // Check if slippage is dangerously high
  const isHighSlippage = effectiveSlippagePct > 10;
  const needsHighSlippageConfirm = isHighSlippage && !highSlippageConfirmed;
  
  // Reset high slippage confirmation when slippage changes
  useEffect(() => {
    if (!isHighSlippage) {
      setHighSlippageConfirmed(false);
      setShowHighSlippageConfirm(false);
    }
  }, [isHighSlippage]);

  useEffect(() => {
    if (initialOutputToken && isOpen) {
      setOutputMint(initialOutputToken.mint);
      setCustomTokens(prev => {
        if (prev.some(t => t.mint === initialOutputToken.mint)) return prev;
        return [...prev, initialOutputToken];
      });
    }
  }, [initialOutputToken, isOpen]);
  
  useEffect(() => {
    if (initialInputToken && isOpen) {
      setInputMint(initialInputToken.mint);
      setOutputMint("SOL");
      setCustomTokens(prev => {
        if (prev.some(t => t.mint === initialInputToken.mint)) return prev;
        return [...prev, initialInputToken];
      });
    }
  }, [initialInputToken, isOpen]);

  const priorityFeeAmounts = { low: 5000, medium: 25000, high: 100000, custom: 0 };
  
  const getActivePriorityFee = () => {
    if (priorityFee === "custom") {
      const customLamports = Math.floor(parseFloat(customPriorityFee || "0") * 1_000_000_000);
      return Math.max(0, customLamports);
    }
    return priorityFeeAmounts[priorityFee];
  };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await tokenManager.getValidAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { data: tokens = [], isLoading: tokensLoading } = useQuery<Token[]>({
    queryKey: ["/api/swaps/tokens", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "100");
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/swaps/tokens?${params}`, { credentials: "include", headers });
      if (!response.ok) throw new Error("Failed to fetch tokens");
      return response.json();
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const { data: trendingTokens = [] } = useQuery<Token[]>({
    queryKey: ["/api/swaps/trending"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/swaps/trending", { credentials: "include", headers });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isOpen && !searchQuery,
    staleTime: 30000,
  });

  const isSearchingMintAddress = useMemo(() => {
    const query = searchQuery.trim();
    if (!isValidSolanaAddress(query)) return false;
    return !tokens.some((t) => t.mint.toLowerCase() === query.toLowerCase());
  }, [searchQuery, tokens]);

  const { mutate: lookupMint, isPending: isLookingUp } = useMutation({
    mutationFn: async (mint: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/swaps/tokens/${mint}`, { credentials: "include", headers });
      if (!response.ok) throw new Error("Token not found");
      return response.json();
    },
    onSuccess: (token: Token) => {
      setCustomTokens(prev => {
        if (prev.some(t => t.mint === token.mint)) return prev;
        return [...prev, token];
      });
      handleSelectToken(token);
      toast({ title: "Token Found", description: `Added ${token.symbol} to your list` });
    },
    onError: () => {
      toast({ title: "Token Not Found", description: "Could not find token information", variant: "destructive" });
    },
  });

  interface TokenBalance {
    mint: string;
    balance: number;
    decimals?: number;
    name?: string;
    symbol?: string;
    logoURI?: string;
  }
  
  const { data: walletTokens = [] } = useQuery<TokenBalance[]>({
    queryKey: ["wallet-tokens-balances", address],
    queryFn: async () => {
      if (!address) return [];
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/wallet/tokens/${address}`, { credentials: "include", headers });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isOpen && !!address,
    staleTime: 10000,
  });

  const getTokenByMint = (mint: string): Token | undefined => {
    if (mint === "SOL") return { mint: "SOL", name: "Solana", symbol: "SOL", decimals: 9 };
    const fromTokens = tokens.find((t) => t.mint === mint);
    if (fromTokens) return fromTokens;
    const fromCustom = customTokens.find((t) => t.mint === mint);
    if (fromCustom) return fromCustom;
    // Also check wallet tokens (held tokens)
    const fromWallet = walletTokens.find((t) => t.mint === mint);
    if (fromWallet) {
      return {
        mint: fromWallet.mint,
        name: fromWallet.name || fromWallet.symbol || "Unknown",
        symbol: fromWallet.symbol || "???",
        decimals: fromWallet.decimals || 9,
        logoURI: fromWallet.logoURI,
      };
    }
    return undefined;
  };

  const inputToken = getTokenByMint(inputMint);
  const outputToken = getTokenByMint(outputMint);

  const handleSelectToken = async (token: Token) => {
    if (selectingFor === "input") {
      setInputMint(token.mint);
    } else if (selectingFor === "output") {
      setOutputMint(token.mint);
      if (token.mint !== "SOL" && !token.priceUsd) {
        try {
          const headers = await getAuthHeaders();
          const response = await fetch(`/api/swaps/tokens/${token.mint}`, { credentials: "include", headers });
          if (response.ok) {
            const enrichedToken = await response.json();
            setCustomTokens(prev => {
              const filtered = prev.filter(t => t.mint !== enrichedToken.mint);
              return [...filtered, enrichedToken];
            });
          }
        } catch (e) {
          console.error("Failed to fetch token details:", e);
        }
      }
      if (token.mint !== "SOL" && riskShieldSettings.enabled) {
        fetch(`/api/risk-assessment/${token.mint}`, { credentials: "include" }).catch(() => {});
      }
    }
    setSelectingFor(null);
    setSearchQuery("");
  };

  const handleAddCustomToken = () => {
    const mintAddress = searchQuery.trim();
    if (isValidSolanaAddress(mintAddress)) {
      lookupMint(mintAddress);
    }
  };

  const enabledCheckCodesKey = useMemo(() => {
    if (!riskShieldSettings.enabled) return "disabled";
    // Create stable key from settings.checks object directly
    return JSON.stringify(riskShieldSettings.checks);
  }, [riskShieldSettings.enabled, riskShieldSettings.checks]);

  // Get the balance for the selected input token
  const inputTokenBalance = useMemo(() => {
    if (inputMint === "SOL") {
      return balance;
    }
    const normalizedMint = inputMint === "SOL" ? "So11111111111111111111111111111111111111112" : inputMint;
    const tokenData = walletTokens.find(t => t.mint === normalizedMint);
    return tokenData?.balance ?? 0;
  }, [inputMint, balance, walletTokens]);

  const handleMaxClick = () => {
    if (inputMint === "SOL") {
      // Leave some SOL for transaction fees (0.01 SOL)
      const maxAmount = Math.max(0, balance - 0.01);
      setInputAmount(maxAmount > 0 ? maxAmount.toFixed(9).replace(/\.?0+$/, '') : "0");
    } else {
      setInputAmount(inputTokenBalance.toString());
    }
  };

  interface BalanceValidation {
    valid: boolean;
    reason: string;
    code: string;
    solBalance: number;
    solStatus: string;
    tokenBalances: { mint: string; balance: number; decimals: number }[];
  }

  const { data: balanceValidation, isLoading: balanceLoading } = useQuery<BalanceValidation | null>({
    queryKey: ["/api/swaps/validate-balance", address, inputMint, debouncedInputAmount],
    queryFn: async () => {
      if (!address || !debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0) return null;
      
      const params = new URLSearchParams({
        walletAddress: address,
        inputMint: inputMint === "SOL" ? "So11111111111111111111111111111111111111112" : inputMint,
        amount: debouncedInputAmount,
      });
      
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/swaps/validate-balance?${params}`, { credentials: "include", headers });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isOpen && !!address && !!debouncedInputAmount && parseFloat(debouncedInputAmount) > 0,
    staleTime: 5000,
  });

  useEffect(() => {
    if (balanceValidation && !balanceValidation.valid) {
      setBalanceError(balanceValidation.reason);
    } else {
      setBalanceError(null);
    }
  }, [balanceValidation]);

  const isBalanceInsufficient = balanceValidation && !balanceValidation.valid;

  const normalizedOutputMint = outputMint === "SOL" ? "So11111111111111111111111111111111111111112" : outputMint;
  const isRiskAcked = riskAckedMints.has(normalizedOutputMint);
  
  const { data: quote, isLoading: quoteLoading, error: quoteError, refetch: refetchQuote } = useQuery({
    queryKey: ["/api/swaps/quote", inputMint, outputMint, debouncedInputAmount, dexOption, effectiveSlippageBps, enabledCheckCodesKey, isRiskAcked],
    queryFn: async () => {
      if (!debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0) return null;
      const inputDecimals = inputToken?.decimals || 9;
      const amount = Math.floor(parseFloat(debouncedInputAmount) * Math.pow(10, inputDecimals));
      
      const params = new URLSearchParams({
        inputMint: inputMint === "SOL" ? "So11111111111111111111111111111111111111112" : inputMint,
        outputMint: outputMint === "SOL" ? "So11111111111111111111111111111111111111112" : outputMint,
        amount: amount.toString(),
        slippage: effectiveSlippageBps.toString(),
        dex: dexOption,
      });
      
      // Add risk acknowledgement if needed
      if (isRiskAcked) {
        params.set("ack", "true");
      }
      
      // Pass Risk Shield settings
      if (!riskShieldSettings.enabled) {
        params.set("riskShieldDisabled", "true");
      } else {
        const enabledCodes = getEnabledCheckCodes();
        if (enabledCodes.length > 0) {
          params.set("enabledCheckCodes", enabledCodes.join(","));
        }
      }
      
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/swaps/quote?${params}`, { 
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        let errorData: any = {};
        try { errorData = await response.json(); } catch {}
        const err: any = new Error(errorData?.message || "Failed to get quote");
        err.status = response.status;
        err.data = errorData;
        // Surface Risk Shield decisions to the UI
        if (response.status === 428 || response.status === 403) {
          err.decision = errorData?.decision;
          // Store blocked reason for Why Blocked tooltip
          if (response.status === 403) {
            setBlockedReason(errorData?.decision || null);
          }
        }
        throw err;
      }
      
      // Clear blocked reason on success and track timestamp
      setBlockedReason(null);
      setQuoteTimestamp(Date.now());
      return response.json();
    },
    enabled: isOpen && !!debouncedInputAmount && parseFloat(debouncedInputAmount) > 0 && inputMint !== outputMint,
    retry: false,
  });

  useEffect(() => {
    const err: any = quoteError;
    if (err?.decision) {
      setRiskDecision(err.decision);
      setRiskPendingStage("quote");
      setRiskModalOpen(true);
    }
  }, [quoteError]);

  const { mutate: executeSwap, isPending: isSwapping } = useMutation({
    mutationFn: async () => {
      if (!quote?.quote || !keypair || !address) {
        throw new Error("Missing quote or wallet");
      }

      setTxStep("building");
      setTxError("");
      
      let txResponse: any;
      try {
        txResponse = await apiRequest("POST", "/api/swaps/transaction", {
        quote: quote.quote,
        userPublicKey: address,
        priorityFee: getActivePriorityFee(),
        acknowledgeRisk: isRiskAcked,
        riskShieldDisabled: !riskShieldSettings.enabled,
        enabledCheckCodes: riskShieldSettings.enabled ? getEnabledCheckCodes() : [],
      });
      } catch (e: any) {
        const decision = e?.data?.decision || e?.decision;
        if (decision && (e?.status === 428 || e?.status === 403)) {
          setRiskDecision(decision);
          setRiskPendingStage("transaction");
          setRiskModalOpen(true);
          throw new Error("Risk acknowledgement required");
        }
        throw e;
      }

      if (!txResponse.swapTransaction) {
        throw new Error("Failed to get swap transaction");
      }

      setTxStep("signing");
      
      const originalBase64 = txResponse.swapTransaction;
      const swapTransactionBuf = Buffer.from(originalBase64, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      transaction.sign([keypair]);
      
      const integrityCheck = await verifyVersionedTransactionIntegrity(originalBase64, transaction);
      if (!integrityCheck.valid) {
        const errorCode = integrityCheck.errorCode || "TX_MUTATED_AFTER_SIGN";
        throw new Error(`${errorCode}: ${integrityCheck.errorMessage || "Transaction integrity check failed"}`);
      }
      
      const signedTx = serializeTransactionToBase64(transaction);

      setTxStep("sending");
      const result = await apiRequest("POST", "/api/swaps/send", {
        signedTransaction: signedTx,
        skipPreflight: true,
        lastValidBlockHeight: txResponse.lastValidBlockHeight,
        outputMint: normalizedOutputMint,
      });

      setTxStep("confirming");
      // Brief delay to show confirming state
      await new Promise(resolve => setTimeout(resolve, 500));

      return result;
    },
    onSuccess: async (data: any) => {
      setTxStep("success");
      
      // Save swap transaction to database
      try {
        const decimals = quote?.outputDecimals ?? outputToken?.decimals ?? 9;
        const calculatedOutputAmount = quote ? (parseInt(quote.outAmount) / Math.pow(10, decimals)).toString() : "0";
        
        await apiRequest("POST", "/api/transactions", {
          fromAddr: address,
          toAddr: address,
          amount: inputAmount,
          signature: data.signature,
          type: "swap",
          inputToken: inputToken?.symbol || "?",
          outputToken: outputToken?.symbol || "?",
          outputAmount: calculatedOutputAmount,
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      } catch (e) {
        console.error("Failed to save swap transaction:", e);
      }
      
      toast({
        title: "Swap Successful!",
        description: `Transaction: ${data.signature.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] });
      // Show success state briefly before closing
      setTimeout(() => {
        setInputAmount("");
        setTxStep("idle");
        onClose();
      }, 1500);
    },
    onError: (error: any) => {
      setTxStep("error");
      const parsedError = parseTransactionError(error);
      setTxError(parsedError.message);
      toast({
        title: "Swap Failed",
        description: parsedError.message,
        variant: "destructive",
      });
      console.error("[swap] Transaction failed:", parsedError.code, parsedError.message);
      setTimeout(() => {
        setTxStep("idle");
      }, 3000);
    },
  });

  const handleSwapTokens = () => {
    const temp = inputMint;
    setInputMint(outputMint);
    setOutputMint(temp);
  };

  const handleSwap = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    if (inputMint === outputMint) {
      toast({ title: "Invalid Swap", description: "Input and output tokens must be different", variant: "destructive" });
      return;
    }
    if (!quote) {
      toast({ title: "No Quote", description: "Please wait for a quote", variant: "destructive" });
      return;
    }
    
    if (isBalanceInsufficient) {
      toast({ 
        title: "Insufficient Balance", 
        description: balanceError || "You don't have enough funds for this swap.", 
        variant: "destructive" 
      });
      return;
    }
    
    // Check legal acknowledgment before first swap
    if (!hasAcknowledgedLegal()) {
      toast({ 
        title: "Acknowledgment Required", 
        description: "Please acknowledge the Terms of Service and Risk Disclaimer before swapping.", 
        variant: "destructive" 
      });
      return;
    }
    
    // Check high slippage confirmation
    if (needsHighSlippageConfirm) {
      setShowHighSlippageConfirm(true);
      return;
    }
    
    // Re-quote if stale (older than 15 seconds)
    if (isQuoteStale) {
      toast({ title: "Refreshing Quote", description: "Getting a fresh price before swapping..." });
      try {
        const result = await refetchQuote();
        if (result.error) {
          toast({ title: "Quote Failed", description: "Could not get a fresh price. Please try again.", variant: "destructive" });
          return;
        }
        // Update quote timestamp after successful refetch
        setQuoteTimestamp(Date.now());
        // Continue to executeSwap with fresh quote
      } catch (err) {
        toast({ title: "Quote Failed", description: "Could not get a fresh price. Please try again.", variant: "destructive" });
        return;
      }
    }
    
    executeSwap();
  };
  
  const confirmHighSlippage = () => {
    setHighSlippageConfirmed(true);
    setShowHighSlippageConfirm(false);
    // Continue with swap
    handleSwap();
  };

  const outputDecimals = quote?.outputDecimals ?? outputToken?.decimals ?? 9;
  // Format output amount with appropriate decimal places based on value
  const rawOutputAmount = quote ? parseInt(quote.outAmount) / Math.pow(10, outputDecimals) : 0;
  const outputAmount = quote ? (
    rawOutputAmount >= 1000 ? rawOutputAmount.toFixed(2) :
    rawOutputAmount >= 1 ? rawOutputAmount.toFixed(4) :
    rawOutputAmount.toFixed(6)
  ) : "0";

  if (selectingFor) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setSelectingFor(null); setSearchQuery(""); onClose(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search or paste token address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                  autoFocus
                  data-testid="input-token-search"
                />
                {searchQuery && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                <span>
                  A <strong>token address</strong> (or "mint") is the unique ID for each token on Solana. You can find it on the token's page or from the sender.
                </span>
              </div>
            </div>

            <ScrollArea className="h-[350px]">
              <div className="space-y-1">
                {isSearchingMintAddress && (
                  <button
                    className="flex items-center gap-3 w-full p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-left border border-primary/30"
                    onClick={handleAddCustomToken}
                    disabled={isLookingUp}
                    data-testid="button-add-custom-token"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-primary">Add Token by Address</div>
                      <div className="text-sm text-muted-foreground truncate">{searchQuery.slice(0, 20)}...</div>
                    </div>
                  </button>
                )}

                <button
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                  onClick={() => handleSelectToken({ mint: "SOL", name: "Solana", symbol: "SOL", decimals: 9 })}
                  data-testid="token-option-SOL"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
                  <div className="flex-1">
                    <div className="font-medium">Solana</div>
                    <div className="text-sm text-muted-foreground">SOL</div>
                  </div>
                </button>

                {!searchQuery && walletTokens.filter(t => t.balance > 0).length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Wallet className="w-4 h-4 text-primary" />
                      Your Tokens
                    </div>
                    {walletTokens.filter(t => t.balance > 0).slice(0, 10).map((token) => (
                      <button
                        key={`held-${token.mint}`}
                        className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                        onClick={() => handleSelectToken({ 
                          mint: token.mint, 
                          name: token.name || token.symbol || "Unknown", 
                          symbol: token.symbol || "???", 
                          decimals: token.decimals || 9,
                          logoURI: token.logoURI 
                        })}
                        data-testid={`token-held-${token.mint.slice(0, 8)}`}
                      >
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold">
                            {token.symbol?.slice(0, 2) || "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{token.name || token.symbol || "Unknown"}</div>
                          <div className="text-sm text-muted-foreground">{token.symbol}</div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          {token.balance?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-border my-2" />
                  </>
                )}

                {!searchQuery && trendingTokens.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <TrendingUp className="w-4 h-4" />
                      Trending
                    </div>
                    {trendingTokens.slice(0, 5).map((token) => (
                      <button
                        key={token.mint}
                        className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                        onClick={() => handleSelectToken(token)}
                        data-testid={`token-trending-${token.mint.slice(0, 8)}`}
                      >
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{token.symbol.slice(0, 2)}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {token.name}
                            <Badge variant="secondary" className="text-xs">
                              <TrendingUp className="w-3 h-3 mr-1" />
                              {token.priceChange24h?.toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {token.symbol}
                            {token.volume24h && <span className="text-xs">{formatVolume(token.volume24h)} vol</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-border my-2" />
                  </>
                )}

                {tokensLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  tokens.slice(0, 50).map((token) => (
                    <button
                      key={token.mint}
                      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/70 transition-colors text-left"
                      onClick={() => handleSelectToken(token)}
                      data-testid={`token-option-${token.mint.slice(0, 8)}`}
                    >
                      {token.logoURI ? (
                        <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{token.symbol.slice(0, 2)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{token.name}</div>
                        <div className="text-sm text-muted-foreground">{token.symbol}</div>
                      </div>
                      {token.isTrending && <Badge variant="secondary"><TrendingUp className="w-3 h-3" /></Badge>}
                    </button>
                  ))
                )}

                {!tokensLoading && tokens.length === 0 && searchQuery && !isSearchingMintAddress && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No tokens found for "{searchQuery}"</p>
                    <p className="text-xs mt-2">Try pasting a token mint address</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Button variant="outline" className="w-full" onClick={() => { setSelectingFor(null); setSearchQuery(""); }}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <div className="relative">
          <AnimatePresence>
            {txStep !== "idle" && <TransactionProgress step={txStep} errorMessage={txError} />}
          </AnimatePresence>
          
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Swap Tokens
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Jupiter
              </Badge>
              <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">You send</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-primary hover:text-primary"
                onClick={handleMaxClick}
                disabled={isSwapping || inputTokenBalance <= 0}
                data-testid="button-max-amount"
              >
                MAX
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0.0"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                className="flex-1"
                disabled={isSwapping}
                data-testid="input-swap-amount"
              />
              <Button
                variant="outline"
                className="w-36 justify-between"
                onClick={() => setSelectingFor("input")}
                disabled={isSwapping}
                data-testid="select-input-token"
              >
                <span className="flex items-center gap-2">
                  {inputToken?.logoURI ? (
                    <img src={inputToken.logoURI} alt={inputToken.symbol} className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : inputToken?.symbol === "SOL" ? (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">S</div>
                  ) : inputToken ? (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{inputToken.symbol.slice(0, 2)}</div>
                  ) : null}
                  {inputToken?.symbol || "Select"}
                </span>
                <Search className="w-3 h-3 opacity-50" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Balance: {inputTokenBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} {inputToken?.symbol || "SOL"}
            </p>
          </div>

          <div className="flex justify-center">
            <Button size="icon" variant="outline" onClick={handleSwapTokens} disabled={isSwapping} data-testid="button-swap-reverse">
              <ArrowDownUp className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">You receive</label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="0.0"
                value={quoteLoading ? "Loading..." : quoteError ? "No route" : outputAmount}
                readOnly
                className="flex-1"
                data-testid="output-swap-amount"
              />
              <Button
                variant="outline"
                className="w-36 justify-between"
                onClick={() => setSelectingFor("output")}
                disabled={isSwapping}
                data-testid="select-output-token"
              >
                <span className="flex items-center gap-2">
                  {outputToken?.logoURI ? (
                    <img src={outputToken.logoURI} alt={outputToken.symbol} className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : outputToken?.symbol === "SOL" ? (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold">S</div>
                  ) : outputToken ? (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{outputToken.symbol.slice(0, 2)}</div>
                  ) : null}
                  {outputToken?.symbol || "Select"}
                </span>
                <Search className="w-3 h-3 opacity-50" />
              </Button>
            </div>
          </div>

          {outputToken && (outputToken.priceUsd || outputToken.marketCap) && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token Price</span>
                <span>{formatPrice(outputToken.priceUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Cap</span>
                <span>{formatMarketCap(outputToken.marketCap)}</span>
              </div>
              {outputToken.priceChange24h !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">24h Change</span>
                  <span className={outputToken.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}>
                    {outputToken.priceChange24h >= 0 ? "+" : ""}{outputToken.priceChange24h.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {quote && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price Impact</span>
                <span className={quote.priceImpact > 0.05 ? "text-destructive" : "text-foreground"}>
                  {(quote.priceImpact * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route</span>
                <span>{quote.routePlan?.length || 1} hop{(quote.routePlan?.length || 1) > 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slippage</span>
                <span className={effectiveSlippagePct > 10 ? "text-destructive" : "text-foreground"}>
                  {effectiveSlippagePct}%
                </span>
              </div>
              {quote.dex && quote.dex !== "auto" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DEX</span>
                  <span className="capitalize">{quote.dex}</span>
                </div>
              )}
            </div>
          )}
          
          {isQuoteStale && quote && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600 dark:text-amber-400 text-xs">
                Quote is over 15 seconds old. A fresh quote will be fetched when you swap.
              </AlertDescription>
            </Alert>
          )}

          {isBalanceInsufficient && balanceError && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive text-xs">
                {balanceError}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Slippage Tolerance</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] p-3">
                  <p className="text-xs">
                    <strong>Slippage</strong> is the maximum price change you'll accept between when you request a swap and when it executes.
                  </p>
                  <p className="text-xs mt-2 text-muted-foreground">
                    For popular tokens (USDC, SOL), 1-2% is usually safe. For newer or less liquid tokens (like pump.fun coins), you may need 5-10% or higher.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <Button
                variant={slippageMode === "auto" ? "default" : "outline"}
                size="sm"
                className="flex-col h-auto py-1.5 px-2"
                onClick={() => { setSlippageMode("auto"); setCustomSlippage(""); }}
                disabled={isSwapping}
                data-testid="button-slippage-auto"
              >
                <span className="text-xs">Auto</span>
                <span className="text-[10px] opacity-70">{getSlippageForRiskLevel(tokenRiskLevel)}%</span>
              </Button>
              {[1, 3, 5].map((pct) => (
                <Button
                  key={pct}
                  variant={slippageMode === "custom" && customSlippage === pct.toString() ? "default" : "outline"}
                  size="sm"
                  className="flex-col h-auto py-1.5 px-2"
                  onClick={() => { setSlippageMode("custom"); setCustomSlippage(pct.toString()); }}
                  disabled={isSwapping}
                  data-testid={`button-slippage-${pct}`}
                >
                  <span className="text-xs">{pct}%</span>
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Custom %"
                value={slippageMode === "custom" && !["1", "3", "5"].includes(customSlippage) ? customSlippage : ""}
                onChange={(e) => { setSlippageMode("custom"); setCustomSlippage(e.target.value); }}
                className="flex-1"
                step="0.1"
                min="0.1"
                max="50"
                disabled={isSwapping}
                data-testid="input-custom-slippage"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            {isHighSlippage && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                High slippage increases risk of unfavorable trade execution
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Routing</label>
            <div className="grid grid-cols-3 gap-1">
              {(["auto", "orca", "raydium"] as const).map((dex) => (
                <Button
                  key={dex}
                  variant={dexOption === dex ? "default" : "outline"}
                  size="sm"
                  className="flex-col h-auto py-1.5 px-2"
                  onClick={() => setDexOption(dex)}
                  disabled={isSwapping}
                  data-testid={`button-dex-${dex}`}
                >
                  <span className="capitalize text-xs">{dex === "auto" ? "Best Route" : dex}</span>
                  <span className="text-[10px] opacity-70">
                    {dex === "auto" ? "Jupiter" : "Direct"}
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {dexOption === "auto" 
                ? "Jupiter finds the best price across all DEXes" 
                : `Swap directly on ${dexOption.charAt(0).toUpperCase() + dexOption.slice(1)} - faster for small trades`}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Priority Fee</label>
            <div className="grid grid-cols-4 gap-1">
              {(["low", "medium", "high"] as const).map((level) => {
                const feeInSol = priorityFeeAmounts[level] / 1_000_000_000;
                return (
                  <Button
                    key={level}
                    variant={priorityFee === level ? "default" : "outline"}
                    size="sm"
                    className="flex-col h-auto py-1.5 px-1"
                    onClick={() => setPriorityFee(level)}
                    disabled={isSwapping}
                  >
                    <span className="capitalize text-xs">{level}</span>
                    <span className="text-[10px] opacity-70">{feeInSol.toFixed(5)}</span>
                  </Button>
                );
              })}
              <Button
                variant={priorityFee === "custom" ? "default" : "outline"}
                size="sm"
                className="flex-col h-auto py-1.5 px-1"
                onClick={() => setPriorityFee("custom")}
                disabled={isSwapping}
              >
                <span className="text-xs">Custom</span>
                <span className="text-[10px] opacity-70">Set own</span>
              </Button>
            </div>
            {priorityFee === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  placeholder="0.0001"
                  value={customPriorityFee}
                  onChange={(e) => setCustomPriorityFee(e.target.value)}
                  className="flex-1"
                  step="0.000001"
                  min="0"
                  disabled={isSwapping}
                  data-testid="input-custom-priority-fee"
                />
                <span className="text-sm text-muted-foreground">SOL</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <span className="text-sm">Risk Shield</span>
              {riskShieldSettings.shameMode && (
                <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                  Shame Mode
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRiskChecksModalOpen(true)}
              className="text-xs h-7"
              data-testid="button-risk-shield-settings"
            >
              Settings
            </Button>
          </div>

          {showHighSlippageConfirm && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-xs">
                <p className="font-medium text-destructive mb-1">Confirm High Slippage ({effectiveSlippagePct}%)</p>
                <p className="text-muted-foreground mb-2">
                  With slippage over 10%, you may receive significantly less than quoted. Only proceed if you understand the risks.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={confirmHighSlippage} data-testid="button-confirm-high-slippage">
                    I understand, proceed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowHighSlippageConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {blockedReason && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-destructive">Swap Blocked by Risk Shield</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-muted-foreground underline text-xs" data-testid="button-why-blocked">
                        Why blocked?
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-[320px] p-3" side="top" align="end">
                      <p className="text-xs font-medium mb-2">Risk Analysis Details</p>
                      {blockedReason.assessment?.inputs && (
                        <div className="space-y-1 text-xs mb-2">
                          {blockedReason.assessment.inputs.liquidity !== undefined && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Liquidity:</span>
                              <span>{formatLiquidityUsd(blockedReason.assessment.inputs.liquidity)}</span>
                            </div>
                          )}
                          {blockedReason.assessment.inputs.top1HolderPct !== undefined && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Top holder owns:</span>
                              <span>{blockedReason.assessment.inputs.top1HolderPct.toFixed(1)}%</span>
                            </div>
                          )}
                          {blockedReason.assessment.inputs.mintAuthorityPresent !== undefined && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Mint authority:</span>
                              <span>{blockedReason.assessment.inputs.mintAuthorityPresent ? "Active" : "Revoked"}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {blockedReason.assessment?.flags && blockedReason.assessment.flags.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Issues found:</p>
                          {blockedReason.assessment.flags.map((flag, idx) => (
                            <p key={idx} className="text-xs text-destructive">
                              {friendlyFlagMessage(flag.code, flag.message)}
                            </p>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-muted-foreground">
                  {blockedReason.reason || "This token has been flagged as potentially risky."}
                </p>
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSwap}
            disabled={isSwapping || !inputAmount || parseFloat(inputAmount) <= 0 || !quote || !!blockedReason || !!isBalanceInsufficient || isBetaLocked}
            className="w-full"
            data-testid="button-execute-swap"
          >
            {isBetaLocked ? (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Beta Locked
              </>
            ) : isSwapping ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping...
              </>
            ) : isBalanceInsufficient ? (
              <>
                <AlertCircle className="w-4 h-4 mr-2" />
                Insufficient Balance
              </>
            ) : blockedReason ? (
              <>
                <ShieldAlert className="w-4 h-4 mr-2" />
                Blocked by Risk Shield
              </>
            ) : isQuoteStale ? (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Refresh & Swap
              </>
            ) : (
              "Swap"
            )}
          </Button>
          </div>
        </div>
      </DialogContent>
    
      <RiskShieldModal
        open={riskModalOpen}
        onOpenChange={setRiskModalOpen}
        decision={riskDecision}
        onAcknowledge={() => {
          setRiskAckedMints(prev => {
            const updated = new Set(prev);
            updated.add(normalizedOutputMint);
            try { sessionStorage.setItem("xray_risk_acked_mints", JSON.stringify(Array.from(updated))); } catch {}
            return updated;
          });
          setRiskModalOpen(false);
          setRiskDecision(null);
          // For transaction stage, retry swap after a brief delay to ensure state is updated
          if (riskPendingStage === "transaction") {
            setTimeout(() => executeSwap(), 100);
          }
          // For quote stage, the query will auto-refetch because isRiskAcked is in the queryKey
          setRiskPendingStage(null);
        }}
      />
      <RiskChecksModal 
        open={riskChecksModalOpen} 
        onOpenChange={setRiskChecksModalOpen} 
      />
</Dialog>
  );
}