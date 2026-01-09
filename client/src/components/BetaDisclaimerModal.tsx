import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, FlaskConical, ShieldAlert, Wallet, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const BETA_ACK_KEY = "XRAY_BETA_ACK";
const BETA_ACK_TIMESTAMP_KEY = "XRAY_BETA_ACK_AT";

export function hasBetaAcknowledged(): boolean {
  return localStorage.getItem(BETA_ACK_KEY) === "true";
}

export function setBetaAcknowledged(): void {
  localStorage.setItem(BETA_ACK_KEY, "true");
  localStorage.setItem(BETA_ACK_TIMESTAMP_KEY, Date.now().toString());
}

interface BetaDisclaimerModalProps {
  open: boolean;
  onAccept: () => void;
}

export function BetaDisclaimerModal({ open, onAccept }: BetaDisclaimerModalProps) {
  const [checked, setChecked] = useState(false);
  const [, navigate] = useLocation();

  const handleAccept = () => {
    if (checked) {
      setBetaAcknowledged();
      onAccept();
    }
  };

  const handleExit = () => {
    navigate("/beta-exit");
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-amber-500" />
            Xray is in Beta
          </DialogTitle>
          <DialogDescription>
            Please read this before continuing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              This is a <strong className="text-foreground">beta release</strong> and may contain bugs, outages, or inaccurate data.
            </p>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <ArrowRightLeft className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Swaps and blockchain transactions are <strong className="text-foreground">irreversible</strong>. Once confirmed, they cannot be undone.
            </p>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Risk Shield scores and warnings are <strong className="text-foreground">informational only</strong> and may be wrong or outdated.
            </p>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Wallet className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Xray is <strong className="text-foreground">non-custodial</strong>. We do not store your private keys or seed phrases.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Use at your own risk.</strong> We recommend starting with small amounts while the app is in beta.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-border space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox 
              checked={checked} 
              onCheckedChange={(val) => setChecked(!!val)} 
              className="mt-0.5"
              data-testid="checkbox-beta-accept"
            />
            <span className="text-sm text-muted-foreground">
              I understand this is beta software and I accept the risks.
            </span>
          </label>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button 
              onClick={handleAccept} 
              disabled={!checked}
              className="w-full"
              data-testid="button-beta-continue"
            >
              I Understand — Continue
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleExit}
              className="w-full"
              data-testid="button-beta-exit"
            >
              Exit
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
