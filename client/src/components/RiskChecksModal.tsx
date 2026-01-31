import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Shield, AlertTriangle, ShieldCheck, Droplets, TrendingUp, Clock, Users, Lock, Coins, Activity, Eye, Database, Skull } from "lucide-react";
import { useRiskShieldSettings } from "@/hooks/use-risk-shield-settings";

export function RiskChecksModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, setShameMode } = useRiskShieldSettings();
  
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Risk Shield - What We Check
          </DialogTitle>
          <DialogDescription>
            Automated token safety analysis explained
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-sm">
                Risk Shield automatically analyzes tokens before you swap to help protect you from scams and risky trades.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Skull className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Shame Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Get brutally honest warnings for high-risk tokens. No sugar-coating.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.shameMode}
                  onCheckedChange={setShameMode}
                  data-testid="switch-shame-mode"
                />
              </div>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Risk Levels
              </h3>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border">
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Low</Badge>
                  <span className="text-xs">Token appears relatively safe based on available data</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border">
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-xs">Medium</Badge>
                  <span className="text-xs">Some concerns detected - review before trading</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">High</Badge>
                  <span className="text-xs">Multiple risk factors found - requires acknowledgement</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border">
                  <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">Critical</Badge>
                  <span className="text-xs">Severe risks detected - swap may be blocked</span>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-500" />
                Liquidity Analysis
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>We check how much money is available in the trading pool:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Very Low (&lt;$2K)</strong> - Easy for manipulators to control price.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Low (&lt;$10K)</strong> - Higher slippage and manipulation risk.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Eye className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Modest (&lt;$50K)</strong> - Moderate risk for larger trades.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                Volume Anomalies
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>We compare trading volume to liquidity to detect suspicious activity:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Volume Spike (&gt;25x)</strong> - May indicate wash trading.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">High Ratio (&gt;10x)</strong> - Unusual trading patterns.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Price Volatility
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>We monitor 24-hour price changes for extreme movements:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Extreme (&gt;200%)</strong> - Possible pump & dump scheme.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">High (&gt;80%)</strong> - Elevated risk of sudden swings.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-500" />
                Market Age
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Newer tokens carry higher risks:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Very New (&lt;2h)</strong> - Highest rug-pull risk period.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">New (&lt;24h)</strong> - Still in early volatile phase.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-500" />
                Holder Concentration
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>We analyze how token supply is distributed:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Top Holder &gt;35%</strong> - One wallet can crash price.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Top 5 &gt;70%</strong> - Small group controls supply.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-yellow-500" />
                Token Authorities
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>We check if the creator still has special permissions:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Mint Authority</strong> - Can create unlimited tokens.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Freeze Authority</strong> - Can freeze your tokens.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500" />
                Liquidity Lock Status
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Locked liquidity means the creator can't drain trading funds:</p>
                <ul className="space-y-1.5 pl-4">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Not Locked (&lt;5%)</strong> - High rug-pull risk.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Eye className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span><strong className="text-foreground">Unverified</strong> - Couldn't confirm lock status.</span>
                  </li>
                </ul>
              </div>
            </section>

            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-foreground">Disclaimer</p>
                  <p className="text-muted-foreground">
                    Risk Shield provides automated analysis and is <strong className="text-foreground">not financial advice</strong>. Always do your own research before trading.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center pt-2 border-t border-border">
          <a 
            href="/disclaimer" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
            data-testid="link-full-disclaimer-modal"
          >
            Full Risk Disclaimer →
          </a>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
