import { Link } from "wouter";
import { ArrowLeft, Shield, Eye, Server, UserCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Privacy() {
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
          <h1 className="text-3xl font-mono font-bold text-foreground">Privacy Policy</h1>
          <p className="text-muted-foreground font-mono text-sm">Last updated: January 2025</p>
        </div>

        <div className="p-4 rounded border border-primary/30 bg-primary/5 flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm font-mono">
            <span className="text-primary font-bold">YOUR KEYS, YOUR CONTROL:</span> We never store your private keys or seed phrases. They exist only on your device.
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              1. Information We Collect
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Authentication Data</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong className="text-foreground">WebAuthn/Passkey:</strong> We store only the public key portion of your passkey credential. Your private authentication key never leaves your device.</li>
                  <li><strong className="text-foreground">Credential ID:</strong> A unique identifier for your passkey, used to verify your identity during login.</li>
                  <li><strong className="text-foreground">No passwords:</strong> We do not collect or store passwords.</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Wallet Data</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong className="text-foreground">Public wallet address:</strong> Your Solana public key (visible on the blockchain anyway)</li>
                  <li><strong className="text-foreground">Never collected:</strong> Private keys, seed phrases, or any data that could be used to access your funds</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Usage Data</h3>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Basic analytics to improve service quality</li>
                  <li>Error logs for debugging and service improvement</li>
                  <li>Feature usage patterns (anonymous, aggregated)</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              2. Third-Party Services
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p>To provide our Service, we work with the following types of third-party providers:</p>
              
              <div>
                <h3 className="font-semibold text-foreground mb-2">Hosting & Infrastructure</h3>
                <p>Our service is hosted on Replit, which provides the computing infrastructure. See Replit's privacy policy for their data practices.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">RPC Providers</h3>
                <p>We connect to Solana through various RPC providers (such as Helius, public Solana endpoints) to read blockchain data and submit transactions. These providers may log IP addresses and request data according to their own policies.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">DEX Aggregators</h3>
                <p>Token swaps are routed through Jupiter or similar DEX aggregators. These services receive your swap requests and wallet address to execute trades.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Price Data Providers</h3>
                <p>We fetch token prices and market data from services like DexScreener, CoinGecko, and similar providers.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>To authenticate you securely via WebAuthn</li>
              <li>To display your wallet balance and transaction history</li>
              <li>To facilitate token swaps and other blockchain interactions</li>
              <li>To improve the Service and fix bugs</li>
              <li>To detect and prevent abuse or fraud</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">4. Data Storage</h2>
            <div className="space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Local Storage:</strong> Your private keys, seed phrases, and wallet data are stored in your browser's local storage only. We cannot access this data.</p>
              <p><strong className="text-foreground">Server Storage:</strong> Only your public authentication data (passkey public key) and public wallet address are stored on our servers.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              5. Your Rights
            </h2>
            <div className="space-y-2 text-muted-foreground">
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-foreground">Access:</strong> Request a copy of the data we hold about you</li>
                <li><strong className="text-foreground">Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong className="text-foreground">Portability:</strong> Export your wallet using your seed phrase (stored locally)</li>
                <li><strong className="text-foreground">Correction:</strong> Update any inaccurate information</li>
              </ul>
              <p className="pt-2">
                To exercise these rights, contact us through the appropriate channels. Note that deleting your server-side data does not affect your local wallet - you can continue using it with any compatible wallet app.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">6. Cookies and Tracking</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>We use minimal cookies necessary for:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Session management (authentication)</li>
                <li>User preferences (theme settings)</li>
              </ul>
              <p>We do not use third-party advertising cookies or cross-site tracking.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">7. Security</h2>
            <div className="space-y-2 text-muted-foreground">
              <p>We implement security measures including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>WebAuthn for phishing-resistant authentication</li>
                <li>HTTPS encryption for all communications</li>
                <li>Rate limiting to prevent abuse</li>
                <li>Regular security reviews</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">8. Children's Privacy</h2>
            <p className="text-muted-foreground">
              Xray is not intended for users under 18 years of age. We do not knowingly collect information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. Significant changes will be communicated through the Service. Continued use after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-mono font-semibold">10. Contact</h2>
            <p className="text-muted-foreground">
              For privacy-related questions or to exercise your data rights, please contact us through the appropriate channels provided within the Service.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-border flex flex-wrap gap-4 text-sm font-mono">
          <Link href="/terms" className="text-primary hover:underline" data-testid="link-terms">
            Terms of Service
          </Link>
          <Link href="/disclaimer" className="text-primary hover:underline" data-testid="link-disclaimer">
            Risk Disclaimer
          </Link>
        </div>
      </main>
    </div>
  );
}
