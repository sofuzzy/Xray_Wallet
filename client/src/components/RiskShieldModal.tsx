import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFlag {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
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
  if (level === "critical") return <ShieldAlert className="h-5 w-5" />;
  if (level === "high") return <AlertTriangle className="h-5 w-5" />;
  return <ShieldCheck className="h-5 w-5" />;
}

export function RiskShieldModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: RiskShieldDecision | null;
  onAcknowledge: () => void;
}) {
  const decision = props.decision;
  const assessment = decision?.assessment;

  const level = (assessment?.level || (decision?.blocked ? "critical" : "high")) as RiskLevel;
  const score = assessment?.score;

  const title = decision?.blocked
    ? "Xray Shield blocked this token"
    : decision?.requiresAcknowledgement
      ? "Xray Shield warning"
      : "Xray Shield";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {levelIcon(level)}
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {decision?.reason && (
            <div className="text-sm text-muted-foreground">
              {decision.reason}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={decision?.blocked ? "destructive" : "secondary"} className="capitalize">
              Risk: {assessment?.level || level}
            </Badge>
            {typeof score === "number" && (
              <Badge variant="outline">
                Score: {score}/100
              </Badge>
            )}
            {decision?.mint && (
              <Badge variant="outline" className="font-mono">
                {decision.mint.slice(0, 4)}…{decision.mint.slice(-4)}
              </Badge>
            )}
          </div>

          {assessment?.flags?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Reasons</div>
              <ScrollArea className="h-44 rounded-md border p-2">
                <div className="space-y-2">
                  {assessment.flags.map((f, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Badge variant={f.severity === "critical" || f.severity === "high" ? "destructive" : "secondary"} className="capitalize">
                        {f.severity}
                      </Badge>
                      <div className="text-sm">
                        <div className="font-medium">{f.code}</div>
                        <div className="text-muted-foreground">{f.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No detailed flags were provided for this decision.
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Always verify the mint address and liquidity before swapping. Xray Shield provides heuristics, not guarantees.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Close
          </Button>
          {!decision?.blocked && decision?.requiresAcknowledgement && (
            <Button onClick={props.onAcknowledge}>
              I understand, proceed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
