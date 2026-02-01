import { Link } from "wouter";
import { Shield } from "lucide-react";
import { SiX, SiGithub } from "react-icons/si";
import xrayLogo from "@/assets/xray-logo.png";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 px-6 py-6 mt-auto">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
          <Shield className="w-3 h-3 text-primary" />
          <span>NON_CUSTODIAL: Your keys never leave your device</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <a
            href="https://x.com/xraythewallet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="footer-link-x"
          >
            <SiX className="w-4 h-4" />
            <span className="text-xs font-mono">@xraythewallet</span>
          </a>
          <a
            href="https://github.com/sofuzzy/Xray_Wallet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="footer-link-github"
          >
            <SiGithub className="w-4 h-4" />
            <span className="text-xs font-mono">GitHub</span>
          </a>
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

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60 font-mono">
          <span>&gt;</span>
          <img src={xrayLogo} alt="XRAY" className="h-4 mix-blend-screen inline-block" />
          <span>Wallet | Solana Mainnet | v.0.9.9</span>
        </div>
      </div>
    </footer>
  );
}
