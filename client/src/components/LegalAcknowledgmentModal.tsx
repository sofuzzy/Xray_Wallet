import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, AlertTriangle, FileText, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const LEGAL_ACKNOWLEDGMENT_KEY = "xray_legal_acknowledged";

export function hasAcknowledgedLegal(): boolean {
  return localStorage.getItem(LEGAL_ACKNOWLEDGMENT_KEY) === "true";
}

export function setLegalAcknowledged(): void {
  localStorage.setItem(LEGAL_ACKNOWLEDGMENT_KEY, "true");
}

interface LegalAcknowledgmentModalProps {
  open: boolean;
  onAcknowledge: () => void;
}

export function LegalAcknowledgmentModal({ open, onAcknowledge }: LegalAcknowledgmentModalProps) {
  const [checked, setChecked] = useState(false);

  const handleAcknowledge = () => {
    if (checked) {
      setLegalAcknowledged();
      onAcknowledge();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Welcome to Xray Wallet
          </DialogTitle>
          <DialogDescription>
            Before you continue, please review and acknowledge the following important information.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[350px] pr-4">
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Lock className="w-4 h-4 text-primary" />
                Non-Custodial Wallet
              </div>
              <p className="text-sm text-muted-foreground">
                Xray is a <strong className="text-foreground">non-custodial wallet</strong>. Your private keys and seed phrase are stored only on your device. We cannot access, recover, or reset your wallet. If you lose your seed phrase, your funds are permanently inaccessible.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Trading Risks
              </div>
              <p className="text-sm text-muted-foreground">
                Cryptocurrency trading involves <strong className="text-foreground">substantial risk of loss</strong>. Token values can drop to zero. Only trade with funds you can afford to lose completely. Past performance does not guarantee future results.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <FileText className="w-4 h-4 text-muted-foreground" />
                No Financial Advice
              </div>
              <p className="text-sm text-muted-foreground">
                Xray does not provide financial, investment, or trading advice. Risk assessments and market data are informational only. Always do your own research before making trading decisions.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
              <p className="text-sm text-muted-foreground">
                Swaps are executed through third-party protocols. Xray does not execute, control, or guarantee swap outcomes. Transaction fees are paid to network validators, not to Xray.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs font-mono">
              <Link 
                href="/terms" 
                className="text-primary hover:underline"
                data-testid="modal-link-terms"
              >
                Terms of Service
              </Link>
              <Link 
                href="/privacy" 
                className="text-primary hover:underline"
                data-testid="modal-link-privacy"
              >
                Privacy Policy
              </Link>
              <Link 
                href="/disclaimer" 
                className="text-primary hover:underline"
                data-testid="modal-link-disclaimer"
              >
                Risk Disclaimer
              </Link>
            </div>
          </div>
        </ScrollArea>

        <div className="pt-4 border-t border-border space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox 
              checked={checked} 
              onCheckedChange={(val) => setChecked(!!val)} 
              className="mt-0.5"
              data-testid="checkbox-acknowledge"
            />
            <span className="text-sm text-muted-foreground">
              I have read and agree to the{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>,{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, and{" "}
              <Link href="/disclaimer" className="text-primary hover:underline">Risk Disclaimer</Link>.
              I understand the risks of cryptocurrency trading and that Xray is a non-custodial wallet.
            </span>
          </label>

          <DialogFooter>
            <Button 
              onClick={handleAcknowledge} 
              disabled={!checked}
              className="w-full"
              data-testid="button-acknowledge-legal"
            >
              Continue to Xray
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
