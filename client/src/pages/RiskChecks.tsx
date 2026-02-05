import { Link } from "wouter";
import { ArrowLeft, Shield, AlertTriangle, ShieldCheck, Droplets, TrendingUp, Clock, Users, Lock, Coins, Activity, Eye, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import xrayLogo from "@/assets/xray-logo.png";

export default function RiskChecks() {
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
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-mono font-bold text-foreground">Risk Shield</h1>
              <p className="text-muted-foreground text-sm">Token Safety Analysis Explained</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
          <p className="text-sm">
            Risk Shield automatically analyzes tokens before you swap to help protect you from scams and risky trades. Here's what we check for.
          </p>
        </div>

        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Risk Levels
            </h2>
            <div className="grid gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">Low</Badge>
                <span className="text-sm">Token appears relatively safe based on available data</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Medium</Badge>
                <span className="text-sm">Some concerns detected - review before trading</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">High</Badge>
                <span className="text-sm">Multiple risk factors found - requires acknowledgement</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">Critical</Badge>
                <span className="text-sm">Severe risks detected - swap may be blocked</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-500" />
              Liquidity Analysis
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>We check how much money is available in the trading pool:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Very Low Liquidity (&lt;$2K)</strong> - Your trade could significantly move the price. Easy for manipulators to control.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Low Liquidity (&lt;$10K)</strong> - Higher slippage and manipulation risk.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Modest Liquidity (&lt;$50K)</strong> - Moderate risk for larger trades.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-500" />
              Volume Anomalies
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>We compare trading volume to liquidity to detect suspicious activity:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Volume Spike (&gt;25x liquidity)</strong> - May indicate wash trading or artificial volume to attract buyers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">High Volume Ratio (&gt;10x)</strong> - Unusual trading patterns that warrant caution.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Price Volatility
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>We monitor 24-hour price changes for extreme movements:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Extreme Volatility (&gt;200%)</strong> - Possible pump & dump scheme. Price may crash suddenly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">High Volatility (&gt;80%)</strong> - Elevated risk of sudden price swings.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-500" />
              Market Age
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Newer tokens carry higher risks because there's less history to evaluate:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Very New (&lt;2 hours)</strong> - Just launched. Highest rug-pull risk period.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">New (&lt;24 hours)</strong> - Still in early volatile phase.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-500" />
              Holder Concentration
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>We analyze how token supply is distributed among holders:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Top Holder &gt;35%</strong> - One wallet controls too much. They can crash the price by selling.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Top Holder &gt;20%</strong> - Significant concentration risk.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Top 5 Holders &gt;70%</strong> - A small group controls most of the supply.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Token Authorities
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>We check if the token creator still has special permissions:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Mint Authority Present</strong> - Creator can create unlimited new tokens, diluting your holdings.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Freeze Authority Present</strong> - Creator can freeze your tokens, preventing you from selling.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-500" />
              Liquidity Lock Status
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Locked liquidity means the creator can't suddenly remove trading funds:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">LP Not Locked (&lt;5%)</strong> - High rug-pull risk. Creator can drain liquidity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Partially Locked (&lt;25%)</strong> - Some protection but not ideal.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Lock Unverified</strong> - We couldn't confirm lock status from available data.</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-mono font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Other Checks
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <ul className="space-y-2 pl-4">
                <li className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Token Program</strong> - We verify the token uses legitimate SPL Token or Token-2022 programs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">FDV/Liquidity Ratio</strong> - Extremely high valuations relative to liquidity may indicate inflated prices.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span><strong className="text-foreground">Supply Validation</strong> - We check for tokens with zero or abnormally small supplies.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">Important Disclaimer</p>
              <p className="text-muted-foreground">
                Risk Shield provides automated analysis based on publicly available data. It is <strong className="text-foreground">not financial advice</strong> and cannot guarantee token safety. Always do your own research (DYOR) before trading. Even tokens that pass all checks can still be risky investments.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Link 
            href="/disclaimer" 
            className="text-sm text-primary hover:underline"
            data-testid="link-full-disclaimer"
          >
            Read full Risk Disclaimer →
          </Link>
        </div>
      </main>
    </div>
  );
}
