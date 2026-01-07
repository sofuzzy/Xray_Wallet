import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { useState } from "react";
import InlineError from "@/components/InlineError";
import { AlertTriangle, ShieldAlert, ShieldCheck, Info } from "lucide-react";

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

function formatLiquidityUsd(value?: number): string {
  if (!value) return "Unknown";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function RiskShieldModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: RiskShieldDecision | null;
  onAcknowledge: () => void;
}) {
  const decision = props.decision;
  const assessment = decision?.assessment;

  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  const level = (assessment?.level || (decision?.blocked ? "critical" : "high")) as RiskLevel;
  const score = assessment?.score;

  const title = decision?.blocked
    ? "This token is blocked"
    : decision?.requiresAcknowledgement
      ? "Review before swapping"
      : "Token Safety Check";

  const description = decision?.blocked
    ? "Risk Shield has blocked this swap to protect your funds."
    : "We found some potential concerns with this token. Please review before proceeding.";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {levelIcon(level)}
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {description}
          </DialogDescription>
        </DialogHeader>

        <InlineError
          title="Why you’re seeing this"
          message="Xray Shield flagged this token. Review the details below before you continue."
          variant="warning"
          className="mt-3"
        />


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
              <div className="text-sm font-medium">What we found:</div>
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
                      <p className="text-sm text-muted-foreground">
                        {friendlyFlagMessage(f.code, f.message)}
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

          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
            Risk Shield provides automated safety checks but cannot guarantee token safety. Always do your own research and only invest what you can afford to lose.
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                className="text-xs underline underline-offset-4"
                onClick={() => setShowHelp((v) => !v)}
              >
                {showHelp ? "Hide Xray Shield details" : "Learn more about Xray Shield"}
              </button>

              {decision?.mint && (
                <button
                  type="button"
                  className="text-xs underline underline-offset-4"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(decision.mint);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1200);
                    } catch {
                      // If clipboard isn't available, fall back to no-op.
                    }
                  }}
                  title="Copy mint address"
                >
                  {copied ? "Copied" : "Copy mint"}
                </button>
              )}

              {decision?.mint && (
                <a
                  href={`https://solscan.io/token/${decision.mint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                  title="View token on Solscan"
                >
                  View on Solscan
                </a>
              )}

              {decision?.mint && assessment?.inputs?.liquidity !== undefined && (
                <a
                  href={`https://dexscreener.com/solana?query=${encodeURIComponent(decision.mint)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                  title="Search this token on DexScreener"
                >
                  View on DexScreener
                </a>
              )}
            </div>
            {showHelp && (
              <div className="mt-3 text-xs text-muted-foreground bg-muted/40 p-3 rounded border">
                <div className="font-medium text-foreground mb-1">How Xray Shield decides</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li><span className="font-medium text-foreground">Low/Medium:</span> informational warnings only.</li>
                  <li><span className="font-medium text-foreground">High:</span> may require confirmation before swapping.</li>
                  <li><span className="font-medium text-foreground">Critical:</span> can be blocked by policy (liquidity, concentration, mint authority, etc.).</li>
                  <li>Scores and flags are heuristic and not financial advice.</li>
                </ul>
                <div className="mt-2">
                  <Link href="/help/risk-shield" className="underline underline-offset-4">
                    Open full guide
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          {!decision?.blocked && decision?.requiresAcknowledgement && (
            <Button 
              onClick={props.onAcknowledge}
              variant={level === "critical" || level === "high" ? "destructive" : "default"}
              data-testid="button-acknowledge-risk"
            >
              I understand the risks, proceed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}