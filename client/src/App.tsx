import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VaultProvider, useVaultContext } from "@/contexts/VaultContext";
import { VaultUnlockModal } from "@/components/VaultUnlockModal";
import { CursorGlow } from "@/components/CursorGlow";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import TokenExplorer from "@/pages/TokenExplorer";
import Transactions from "@/pages/Transactions";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Disclaimer from "@/pages/Disclaimer";
import RiskChecks from "@/pages/RiskChecks";
import BetaExit from "@/pages/BetaExit";
import { Loader2 } from "lucide-react";

const PUBLIC_ROUTES = ["/terms", "/privacy", "/disclaimer", "/risk-checks", "/beta-exit"];

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/explore" component={TokenExplorer} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/disclaimer" component={Disclaimer} />
      <Route path="/risk-checks" component={RiskChecks} />
      <Route path="/beta-exit" component={BetaExit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function VaultGate({ children }: { children: React.ReactNode }) {
  const vault = useVaultContext();
  const [location] = useLocation();

  // Skip vault gate for public routes
  if (PUBLIC_ROUTES.includes(location)) {
    return <>{children}</>;
  }

  if (vault.status === "loading") {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (vault.status === "locked") {
    return (
      <VaultUnlockModal
        mode="unlock"
        onUnlock={vault.unlock}
        onSetup={vault.setupVault}
        onReset={vault.resetVault}
        error={vault.error}
        isLoading={vault.isUnlocking}
      />
    );
  }

  if (vault.status === "needs_migration" || vault.status === "no_vault") {
    return (
      <VaultUnlockModal
        mode={vault.status === "needs_migration" ? "migrate" : "setup"}
        onUnlock={vault.unlock}
        onSetup={vault.setupVault}
        error={vault.error}
        isLoading={vault.isSettingUp}
      />
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CursorGlow />
        <VaultProvider>
          <VaultGate>
            <Toaster />
            <Router />
          </VaultGate>
        </VaultProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
