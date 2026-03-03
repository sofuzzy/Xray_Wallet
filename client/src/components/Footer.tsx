import { Link } from "wouter";
import { Shield } from "lucide-react";
import { SiX, SiGithub } from "react-icons/si";
import xrayLogo from "@/assets/xray-logo.png";

export function Footer() {
  return (
    <footer className="border-t border-border/50 px-6 py-4 mt-auto">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/50 font-mono">
          <Shield className="w-2.5 h-2.5" />
          <span>Non-custodial · Keys never leave your device</span>
        </div>

        <div className="flex items-center justify-center gap-3">
          <a
            href="https://x.com/xraythewallet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="footer-link-x"
          >
            <SiX className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://github.com/sofuzzy/Xray_Wallet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="footer-link-github"
          >
            <SiGithub className="w-3.5 h-3.5" />
          </a>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-mono">
          <Link 
            href="/terms" 
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="footer-link-terms"
          >
            Terms
          </Link>
          <span className="text-border/50">·</span>
          <Link 
            href="/privacy" 
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="footer-link-privacy"
          >
            Privacy
          </Link>
          <span className="text-border/50">·</span>
          <Link 
            href="/disclaimer" 
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="footer-link-disclaimer"
          >
            Disclaimer
          </Link>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40 font-mono">
          <img src={xrayLogo} alt="XRAY" className="h-3 mix-blend-screen inline-block opacity-60" />
          <span>Solana Mainnet</span>
        </div>
      </div>
    </footer>
  );
}
