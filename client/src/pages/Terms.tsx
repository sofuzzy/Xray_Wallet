import { Link } from "wouter";
import { ArrowLeft, Shield, AlertTriangle, Scale } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import xrayLogo from "@/assets/xray-logo.png";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono text-sm">Back</span>
          </Link>
          <img src={xrayLogo} alt="XRAY" className="h-7 mix-blend-screen" />
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-mono font-bold text-foreground">Terms of Service</h1>
          <p className="text-muted-foreground font-mono text-sm">Last updated: January 2025</p>
        </div>

        <div className="p-4 rounded border border-primary/30 bg-primary/5 flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm font-mono">
            <span className="text-primary font-bold">IMPORTANT:</span> Xray is a non-custodial wallet. We never have access to your private keys or seed phrase.
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" />
              1. Agreement to Terms
            </h2>
            <p className="text-muted-foreground">
              By accessing or using Xray ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">2. Non-Custodial Nature</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>Xray is a <strong className="text-foreground">non-custodial wallet</strong>. This means:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Your private keys and seed phrases are stored <strong className="text-foreground">only on your device</strong></li>
                <li>We <strong className="text-foreground">never store, transmit, or have access</strong> to your private keys or seed phrases</li>
                <li>You are solely responsible for the security and backup of your wallet credentials</li>
                <li>If you lose your seed phrase, we cannot help you recover your wallet</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">3. No Financial Advice</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>
                Xray does <strong className="text-foreground">not provide financial, investment, or trading advice</strong>. Any information displayed within the Service, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Token prices and market data</li>
                <li>Risk assessments and safety scores</li>
                <li>Trending tokens and market indicators</li>
              </ul>
              <p>
                ...is for <strong className="text-foreground">informational purposes only</strong>. You should conduct your own research and consult with qualified professionals before making any financial decisions.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">4. Token Swaps and Transactions</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>When you perform token swaps or other transactions through Xray:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Swaps are executed through <strong className="text-foreground">third-party protocols</strong> (such as Jupiter)</li>
                <li>Xray does <strong className="text-foreground">not execute, control, or guarantee</strong> the outcome of any swap</li>
                <li>Transaction fees, slippage, and price impact are determined by the Solana network and liquidity providers</li>
                <li>Failed or pending transactions are subject to blockchain network conditions</li>
                <li>You are responsible for verifying transaction details before signing</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              5. Limitation of Liability
            </h2>
            <div className="space-y-2 text-muted-foreground">
              <p>
                <strong className="text-foreground">Xray is not liable for any losses you may incur while using the Service.</strong> You use Xray entirely at your own risk. To the maximum extent permitted by law, Xray and its operators shall <strong className="text-foreground">not be liable</strong> for:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Loss of funds due to user error, including sending to wrong addresses</li>
                <li>Loss of funds due to smart contract vulnerabilities or exploits</li>
                <li>Token behavior, including but not limited to rug pulls, honey pots, or malicious code</li>
                <li>Blockchain network issues, including failed transactions or delays</li>
                <li>Third-party service failures (RPC providers, DEX aggregators, price feeds)</li>
                <li>Inaccurate or delayed market data</li>
                <li>Loss of access to your wallet due to lost seed phrases or credentials</li>
                <li>Any indirect, incidental, special, or consequential damages</li>
              </ul>
              <p className="pt-2">
                <strong className="text-foreground">Use at your own risk:</strong> By using Xray, you accept full responsibility for any and all losses that may result from your use of the Service. Our total liability, if any, is limited to the amount you paid us (which is zero for free users).
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">6. Risk Acknowledgment</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>By using Xray, you acknowledge that:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Cryptocurrency trading involves significant risk of financial loss</li>
                <li>You should only trade with funds you can afford to lose</li>
                <li>Past performance does not guarantee future results</li>
                <li>Token values can go to zero</li>
                <li>The Risk Shield feature provides automated assessments that may not catch all risks</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">7. Prohibited Uses</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>You agree not to use Xray for:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Any unlawful purpose or in violation of any applicable laws</li>
                <li>Market manipulation or fraudulent activities</li>
                <li>Circumventing any security features of the Service</li>
                <li>Attempting to interfere with the proper operation of the Service</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">8. Encrypted Cloud Backup</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>Xray offers an optional <strong className="text-foreground">encrypted cloud backup</strong> feature. By using this feature, you acknowledge:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Your wallet data is encrypted <strong className="text-foreground">entirely on your device</strong> using AES-256-GCM encryption</li>
                <li>The encryption key is derived from your passphrase using PBKDF2 - <strong className="text-foreground">we never see your passphrase</strong></li>
                <li>We store only the encrypted ciphertext, salt, and KDF parameters - never plaintext keys</li>
                <li><strong className="text-destructive">If you lose your passphrase, we cannot recover your backup</strong></li>
                <li>You are solely responsible for remembering your passphrase</li>
                <li>Deleting your backup permanently removes the encrypted data from our servers</li>
              </ul>
              <p className="pt-2">
                <strong className="text-foreground">Important:</strong> The cloud backup is designed for convenience in restoring your wallet across devices. It does not replace the need to securely store your seed phrase offline.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">9. Service Modifications</h2>
            <p className="text-muted-foreground">
              We reserve the right to modify, suspend, or discontinue the Service at any time without prior notice. We are not liable for any modification, suspension, or discontinuation of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">10. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Xray operates, without regard to conflict of law principles. Any disputes arising from these Terms or your use of the Service shall be resolved in the appropriate courts of that jurisdiction.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">11. Contact</h2>
            <p className="text-muted-foreground">
              If you have questions about these Terms, please contact us through the appropriate channels provided within the Service.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-border flex flex-wrap gap-4 text-sm font-mono">
          <Link href="/privacy" className="text-primary hover:underline" data-testid="link-privacy">
            Privacy Policy
          </Link>
          <Link href="/disclaimer" className="text-primary hover:underline" data-testid="link-disclaimer">
            Risk Disclaimer
          </Link>
        </div>
      </main>
    </div>
  );
}
