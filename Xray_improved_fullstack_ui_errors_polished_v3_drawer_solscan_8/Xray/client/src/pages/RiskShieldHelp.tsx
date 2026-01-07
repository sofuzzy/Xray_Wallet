import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function RiskShieldHelp() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Xray Shield</h1>
            <p className="text-sm text-muted-foreground">
              What the warnings mean, and how to trade safer.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">Back</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How Risk Shield works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Xray Shield combines public market data (like liquidity and volume) with on-chain checks
              (like mint authority, freeze authority, and holder concentration). It assigns a risk level
              and shows the reasons.
            </p>
            <p>
              Shield is designed to help you avoid common scams and low-liquidity traps, but it cannot
              guarantee safety. Always verify the token mint address and only trade what you can afford
              to lose.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Common warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Low liquidity</Badge>
                <span className="text-muted-foreground">Trades can move price heavily (high slippage / bad fills).</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Very new market</Badge>
                <span className="text-muted-foreground">New tokens are more likely to rug or break liquidity.</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Holder concentration</Badge>
                <span className="text-muted-foreground">A few wallets can dump and crash price quickly.</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Mint authority active</Badge>
                <span className="text-muted-foreground">Creator can mint more tokens (dilution risk).</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Freeze authority active</Badge>
                <span className="text-muted-foreground">Tokens could potentially be frozen (depends on program rules).</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Unverified metadata</Badge>
                <span className="text-muted-foreground">Name/symbol may be spoofed—verify the mint address.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slippage tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Slippage is the maximum price movement you accept. Higher slippage can make trades succeed
              in thin markets, but also increases the chance of getting a terrible price.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Liquid tokens: 1–3% is usually reasonable.</li>
              <li>New / pump.fun tokens: expect higher slippage or failed swaps.</li>
              <li>If Shield shows low liquidity, consider reducing trade size.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
