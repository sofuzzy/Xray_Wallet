import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ShieldAlert, ShieldCheck, Info, Skull } from "lucide-react";
import { RiskChecksModal } from "./RiskChecksModal";
import { useRiskShieldSettings } from "@/hooks/use-risk-shield-settings";

type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFlag {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, any>;
}

export interface TokenRiskAssessment {
  mint: string;
  score: number;
  level: RiskLevel;
  flags: RiskFlag[];
  updatedAt?: number;
  inputs?: Record<string, any>;
}

export interface RiskShieldDecision {
  mint: string;
  action: string;
  allowed: boolean;
  blocked: boolean;
  requiresAcknowledgement: boolean;
  reason?: string;
  policy?: any;
  assessment?: TokenRiskAssessment;
}

function levelIcon(level: RiskLevel) {
  if (level === "critical") return <ShieldAlert className="h-5 w-5 text-destructive" />;
  if (level === "high") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <ShieldCheck className="h-5 w-5 text-muted-foreground" />;
}

function friendlyRiskLevel(level: RiskLevel): string {
  switch (level) {
    case "critical": return "Very High Risk";
    case "high": return "High Risk";
    case "medium": return "Moderate Risk";
    case "low": return "Lower Risk";
    default: return level;
  }
}

function friendlyFlagMessage(code: string, message: string): string {
  const friendlyMessages: Record<string, string> = {
    VERY_LOW_LIQUIDITY: "Very little money in the trading pool - your trade could move the price significantly",
    LOW_LIQUIDITY: "Limited trading pool size - larger trades may affect the price",
    VERY_NEW_MARKET: "This token just launched recently - extra caution recommended",
    LOW_VOLUME: "Few people are actively trading this token right now",
    HIGH_HOLDER_CONCENTRATION: "A small group of wallets owns most of this token's supply",
    MINT_AUTHORITY_PRESENT: "The token creator can still create more tokens (this could dilute your holdings)",
    FREEZE_AUTHORITY_PRESENT: "The token creator has the ability to freeze your tokens",
    TOP_HOLDER_DOMINANCE: "One wallet owns a very large share of this token",
    UNVERIFIED_METADATA: "Token details haven't been verified - could be a copycat of another token",
    HONEYPOT_RISK: "Warning: You might not be able to sell this token after buying",
    HIGH_PRICE_IMPACT: "Your trade size is large relative to the pool - you may get a worse price",
    RECENT_MAJOR_SELL: "Large sell-offs detected recently - price may be volatile",
  };
  return friendlyMessages[code] || message;
}

const SHAME_MODE_MESSAGES: Record<string, string> = {
  TOP_HOLDER_CONCENTRATION_CRITICAL: "One wallet owns enough to dump this into oblivion. You're exit liquidity.",
  TOP_HOLDER_CONCENTRATION: "A few wallets hold most of the supply. Guess who's selling to you?",
  TOP5_CONCENTRATION_HIGH: "Top 5 wallets own this token. They coordinated the pump. You're the exit.",
  HONEYPOT_RISK: "This is a trap. You can buy, but you can't sell. Your money dies here.",
  NO_SELL_HISTORY: "Nobody has ever sold this token. Think about why that might be.",
  VERY_LOW_LIQUIDITY: "There's barely any money in this pool. You'll move the price just by looking at it.",
  LOW_LIQUIDITY_CRITICAL: "Liquidity so thin you could sneeze and crash it. Perfect for rugging you.",
  MINT_AUTHORITY_PRESENT: "The dev can print infinite tokens whenever they want. They will.",
  FREEZE_AUTHORITY_PRESENT: "The dev can freeze your tokens. As in, your money just... stops working.",
  VERY_NEW_MARKET: "This token is hours old. 99% of tokens this age are scams. You know this.",
  LP_NOT_LOCKED: "Liquidity isn't locked. The dev can pull it and disappear. Classic rug setup.",
  EXTREME_VOLATILITY_24H: "Price went parabolic. This is a pump. Guess what comes next?",
  VOLUME_LIQUIDITY_SPIKE: "Trading volume is fake. Bots washing trades to lure you in.",
};

const SHAME_MODE_TITLES: Record<string, string> = {
  critical: "You're About to Get Wrecked",
  high: "This Looks Like a Trap",
};

const HIGH_CONFIDENCE_RISK_CODES = new Set([
  "TOP_HOLDER_CONCENTRATION_CRITICAL",
  "TOP_HOLDER_CONCENTRATION",
  "TOP5_CONCENTRATION_HIGH",
  "HONEYPOT_RISK",
  "NO_SELL_HISTORY",
  "VERY_LOW_LIQUIDITY",
  "LOW_LIQUIDITY_CRITICAL",
  "LP_NOT_LOCKED",
  "MINT_AUTHORITY_PRESENT",
  "FREEZE_AUTHORITY_PRESENT",
  "VERY_NEW_MARKET",
  "EXTREME_VOLATILITY_24H",
  "VOLUME_LIQUIDITY_SPIKE",
]);

function hasHighConfidenceRisk(flags: RiskFlag[]): boolean {
  return flags.some(f => HIGH_CONFIDENCE_RISK_CODES.has(f.code));
}

function getShameFlagMessage(code: string, message: string): string {
  return SHAME_MODE_MESSAGES[code] || friendlyFlagMessage(code, message);
}

function formatLiquidityUsd(value?: number): string {
  if (!value) return "Unknown";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// Check if the assessment is for native SOL
function isNativeSolAssessment(assessment?: TokenRiskAssessment): boolean {
  return assessment?.inputs?.isNativeSol === true;
}

export function RiskShieldModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: RiskShieldDecision | null;
  onAcknowledge: () => void;
}) {
  const [showRiskChecks, setShowRiskChecks] = useState(false);
  const [shameConfirmed, setShameConfirmed] = useState(false);
  const { settings } = useRiskShieldSettings();
  const decision = props.decision;
  const assessment = decision?.assessment;
  const isNativeSol = isNativeSolAssessment(assessment);

  const level = (assessment?.level || (decision?.blocked ? "critical" : "high")) as RiskLevel;
  const score = assessment?.score;
  
  const shameModeActive = settings.shameMode && 
    (level === "critical" || level === "high") && 
    hasHighConfidenceRisk(assessment?.flags || []);
    
  useEffect(() => {
    if (!props.open) {
      setShameConfirmed(false);
    }
  }, [props.open]);
  
  useEffect(() => {
    setShameConfirmed(false);
  }, [decision?.mint]);

  // Native SOL should never trigger this modal since it's always allowed,
  // but handle it gracefully if it does
  const title = isNativeSol
    ? "Native SOL"
    : decision?.blocked
      ? "This token is blocked"
      : shameModeActive
        ? SHAME_MODE_TITLES[level] || "This Looks Risky"
        : decision?.requiresAcknowledgement
          ? "Review before swapping"
          : "Token Safety Check";

  const description = isNativeSol
    ? "Native SOL is not subject to token-specific risk checks."
    : decision?.blocked
      ? "Risk Shield has blocked this swap to protect your funds."
      : shameModeActive
        ? "You enabled Shame Mode. Here's the brutal truth about this token."
        : "We found some potential concerns with this token. Please review before proceeding.";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shameModeActive ? <Skull className="h-5 w-5 text-destructive" /> : levelIcon(level)}
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant={level === "critical" || level === "high" ? "destructive" : "secondary"} 
              className="capitalize"
            >
              {friendlyRiskLevel(level)}
            </Badge>
            {typeof score === "number" && (
              <Badge variant="outline">
                Safety Score: {100 - score}/100
              </Badge>
            )}
            {decision?.mint && (
              <Badge variant="outline" className="font-mono text-xs">
                {decision.mint.slice(0, 6)}...{decision.mint.slice(-4)}
              </Badge>
            )}
          </div>

          {assessment?.inputs && (
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center gap-1 text-sm font-medium">
                <Info className="w-4 h-4" />
                Token Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {assessment.inputs.liquidity !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Liquidity: </span>
                    <span className={assessment.inputs.liquidity < 10000 ? "text-amber-500" : ""}>
                      {formatLiquidityUsd(assessment.inputs.liquidity)}
                    </span>
                  </div>
                )}
                {assessment.inputs.top1HolderPct !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Top holder: </span>
                    <span className={assessment.inputs.top1HolderPct > 20 ? "text-amber-500" : ""}>
                      {assessment.inputs.top1HolderPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {assessment.inputs.mintAuthorityPresent !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Mint authority: </span>
                    <span className={assessment.inputs.mintAuthorityPresent ? "text-amber-500" : "text-green-500"}>
                      {assessment.inputs.mintAuthorityPresent ? "Active" : "Revoked"}
                    </span>
                  </div>
                )}
                {assessment.inputs.freezeAuthorityPresent !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Freeze authority: </span>
                    <span className={assessment.inputs.freezeAuthorityPresent ? "text-amber-500" : "text-green-500"}>
                      {assessment.inputs.freezeAuthorityPresent ? "Active" : "Revoked"}
                    </span>
                  </div>
                )}
                {assessment.inputs.pairAgeHours !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Token age: </span>
                    <span className={assessment.inputs.pairAgeHours < 24 ? "text-amber-500" : ""}>
                      {assessment.inputs.pairAgeHours < 24 
                        ? `${Math.round(assessment.inputs.pairAgeHours)} hours`
                        : `${Math.round(assessment.inputs.pairAgeHours / 24)} days`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {assessment?.flags?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {shameModeActive ? "The brutal truth:" : "What we found:"}
              </div>
              <ScrollArea className="h-40 rounded-md border p-3">
                <div className="space-y-3">
                  {assessment.flags.map((f, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Badge 
                        variant={f.severity === "critical" || f.severity === "high" ? "destructive" : "secondary"} 
                        className="capitalize shrink-0 mt-0.5"
                      >
                        {f.severity === "critical" ? "danger" : f.severity}
                      </Badge>
                      <p className={`text-sm ${shameModeActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {shameModeActive ? getShameFlagMessage(f.code, f.message) : friendlyFlagMessage(f.code, f.message)}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
              No specific concerns were identified, but please always verify the token address before swapping.
            </div>
          )}
          
          {shameModeActive && !decision?.blocked && decision?.requiresAcknowledgement && (
            <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/5">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={shameConfirmed}
                  onCheckedChange={(checked) => setShameConfirmed(checked === true)}
                  className="mt-0.5"
                  data-testid="checkbox-shame-confirm"
                />
                <span className="text-sm text-foreground">
                  I understand I'm probably about to lose money and I'm doing it anyway.
                </span>
              </label>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded space-y-1">
            <p>Risk Shield provides automated safety checks but cannot guarantee token safety. Always do your own research and only invest what you can afford to lose.</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <button 
                onClick={() => setShowRiskChecks(true)}
                className="text-primary hover:underline"
                data-testid="button-risk-checks-info"
              >
                What do we check?
              </button>
              <a 
                href="/disclaimer" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                data-testid="link-risk-disclaimer"
              >
                Full disclaimer
              </a>
            </p>
          </div>
        </div>

        <RiskChecksModal open={showRiskChecks} onOpenChange={setShowRiskChecks} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          {!decision?.blocked && decision?.requiresAcknowledgement && (
            <Button 
              onClick={props.onAcknowledge}
              variant={level === "critical" || level === "high" ? "destructive" : "default"}
              disabled={shameModeActive && !shameConfirmed}
              data-testid="button-acknowledge-risk"
            >
              {shameModeActive ? "Proceed anyway" : "I understand the risks, proceed"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
