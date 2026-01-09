import { Link } from "wouter";
import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 px-6 py-6 mt-auto">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
          <Shield className="w-3 h-3 text-primary" />
          <span>NON_CUSTODIAL: Your keys never leave your device</span>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono">
          <Link 
            href="/terms" 
            className="text-muted-foreground hover:text-primary transition-colors"
            data-testid="footer-link-terms"
          >
            Terms of Service
          </Link>
          <span className="text-border">|</span>
          <Link 
            href="/privacy" 
            className="text-muted-foreground hover:text-primary transition-colors"
            data-testid="footer-link-privacy"
          >
            Privacy Policy
          </Link>
          <span className="text-border">|</span>
          <Link 
            href="/disclaimer" 
            className="text-muted-foreground hover:text-primary transition-colors"
            data-testid="footer-link-disclaimer"
          >
            Risk Disclaimer
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 font-mono">
          &gt; XRAY Wallet | Solana Mainnet | v.0.9.9
        </p>
      </div>
    </footer>
  );
}
