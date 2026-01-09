import { Link } from "wouter";
import { ArrowLeft, Shield, AlertTriangle, ShieldAlert, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Disclaimer() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono text-sm">Back</span>
          </Link>
          <h1 className="text-xl font-mono font-bold text-primary">&gt;_XRAY</h1>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-mono font-bold text-foreground">Risk & Non-Custodial Disclaimer</h1>
          <p className="text-muted-foreground font-mono text-sm">Last updated: January 2025</p>
        </div>

        <div className="p-4 rounded border border-destructive/50 bg-destructive/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm font-mono">
            <span className="text-destructive font-bold">WARNING:</span> Trading cryptocurrency involves substantial risk of loss. Only trade with funds you can afford to lose completely.
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Non-Custodial Wallet
            </h2>
            <div className="space-y-2 text-muted-foreground">
              <p>
                Xray is a <strong className="text-foreground">non-custodial wallet</strong>. This fundamental design choice means:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Your private keys and seed phrase are stored <strong className="text-foreground">only in your browser's local storage</strong></li>
                <li>We <strong className="text-foreground">cannot access, recover, or reset</strong> your wallet</li>
                <li>If you lose your seed phrase, <strong className="text-foreground">your funds are permanently inaccessible</strong></li>
                <li>We cannot reverse, cancel, or modify any transaction you sign</li>
                <li>You are solely responsible for securing your device and credentials</li>
              </ul>
              <div className="p-3 rounded bg-muted/50 border border-border mt-4">
                <p className="text-sm font-mono">
                  <strong className="text-primary">BACKUP YOUR SEED PHRASE:</strong> Write it down on paper and store it securely. Never share it with anyone. Never enter it on any website other than a trusted wallet.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Trading Risks
            </h2>
            <div className="space-y-2 text-muted-foreground">
              <p>Cryptocurrency trading carries significant risks including but not limited to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-foreground">Price Volatility:</strong> Token prices can drop to zero within minutes</li>
                <li><strong className="text-foreground">Liquidity Risk:</strong> You may not be able to sell tokens at expected prices</li>
                <li><strong className="text-foreground">Smart Contract Risk:</strong> Bugs or exploits in token contracts can result in total loss</li>
                <li><strong className="text-foreground">Rug Pulls:</strong> Token creators may abandon projects and remove liquidity</li>
                <li><strong className="text-foreground">Honey Pots:</strong> Some tokens are designed to prevent selling</li>
                <li><strong className="text-foreground">Network Congestion:</strong> Transactions may fail or be delayed during high traffic</li>
                <li><strong className="text-foreground">Slippage:</strong> Actual execution price may differ from quoted price</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3" id="risk-shield">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Risk Shield Disclaimer
            </h2>
            <div className="space-y-2 text-muted-foreground">
              <p>
                Xray's <strong className="text-foreground">Risk Shield</strong> feature provides automated safety assessments for tokens. It is important to understand:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Assessments are <strong className="text-foreground">heuristic and informational only</strong></li>
                <li>Risk scores are based on automated analysis of on-chain data</li>
                <li>A "low risk" score <strong className="text-foreground">does not guarantee safety or legitimacy</strong></li>
                <li>A "high risk" score does not necessarily mean a token is a scam</li>
                <li>New tokens may not have enough data for accurate assessment</li>
                <li>Malicious actors can design tokens to evade detection</li>
                <li>Market conditions can change rapidly after assessment</li>
              </ul>
              <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 mt-4">
                <p className="text-sm font-mono text-amber-600 dark:text-amber-400">
                  <strong>ALWAYS DO YOUR OWN RESEARCH (DYOR):</strong> Risk Shield is a tool to assist your decision-making, not a replacement for it. Verify token contracts, check social channels, and understand what you're investing in.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">Swap Transactions</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>When you execute swaps through Xray:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Swaps are routed through <strong className="text-foreground">third-party DEX aggregators</strong> (such as Jupiter)</li>
                <li>Xray acts as an interface only - we do not execute or guarantee swaps</li>
                <li>You interact directly with smart contracts on the Solana blockchain</li>
                <li>Transaction fees are paid to network validators, not to Xray</li>
                <li>Failed transactions may still incur network fees</li>
                <li>Price quotes are estimates and actual execution may vary</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">No Guarantees</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>We make <strong className="text-foreground">no guarantees</strong> regarding:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>The accuracy of price data or market information</li>
                <li>The safety or legitimacy of any token</li>
                <li>The success or profitability of any trade</li>
                <li>The availability or uptime of the Service</li>
                <li>The performance of third-party services we integrate with</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">Not Financial Advice</h2>
            <p className="text-muted-foreground">
              Nothing in Xray constitutes financial, investment, legal, or tax advice. All information is provided "as is" for informational purposes only. Consult qualified professionals before making financial decisions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">Acknowledgment</h2>
            <p className="text-muted-foreground">
              By using Xray, you acknowledge that you have read, understood, and accepted the risks described in this disclaimer. You agree that you are solely responsible for your trading decisions and any resulting gains or losses.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-border flex flex-wrap gap-4 text-sm font-mono">
          <Link href="/terms" className="text-primary hover:underline" data-testid="link-terms">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-primary hover:underline" data-testid="link-privacy">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  );
}
