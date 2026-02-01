import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, Loader2, Shield, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validatePassphrase, getPassphraseStrength } from "@/lib/vaultCrypto";
import { Link } from "wouter";
import { SiX, SiGithub } from "react-icons/si";
import xrayLogo from "@/assets/xray-logo.png";

interface VaultUnlockModalProps {
  mode: "unlock" | "setup" | "migrate";
  onUnlock: (pin: string) => Promise<void>;
  onSetup: (pin: string) => Promise<void>;
  onReset?: () => void;
  error: string | null;
  isLoading: boolean;
}

export function VaultUnlockModal({
  mode,
  onUnlock,
  onSetup,
  onReset,
  error,
  isLoading,
}: VaultUnlockModalProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (error) {
      setLocalError(error);
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === "unlock") {
      if (!pin) {
        setLocalError("Please enter your PIN");
        return;
      }
      try {
        await onUnlock(pin);
      } catch {
      }
    } else {
      const validation = validatePassphrase(pin);
      if (!validation.valid) {
        setLocalError(validation.message || "Invalid PIN");
        return;
      }
      if (pin !== confirmPin) {
        setLocalError("PINs do not match");
        return;
      }
      try {
        await onSetup(pin);
      } catch {
      }
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    onReset?.();
  };

  const strength = getPassphraseStrength(pin);
  const strengthColors = {
    weak: "bg-red-500",
    medium: "bg-yellow-500",
    strong: "bg-green-500",
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={xrayLogo} alt="XRAY" className="h-10 mx-auto mb-4 mix-blend-screen" />
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            {mode === "unlock" ? (
              <Lock className="w-8 h-8 text-primary" />
            ) : (
              <Shield className="w-8 h-8 text-primary" />
            )}
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {mode === "unlock"
              ? "Unlock Your Wallet"
              : mode === "migrate"
              ? "Secure Your Wallet"
              : "Create a PIN"}
          </h2>
          <p className="text-muted-foreground">
            {mode === "unlock"
              ? "Enter your PIN to access your wallet"
              : mode === "migrate"
              ? "Your wallet will be encrypted with a PIN for security"
              : "Create a PIN to protect your wallet"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {mode === "unlock" ? "Enter PIN" : "Create PIN"}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showPin ? "text" : "password"}
                placeholder={mode === "unlock" ? "Enter your PIN" : "At least 8 characters"}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setLocalError(null);
                }}
                className="pl-10 pr-10"
                autoFocus
                data-testid="input-vault-pin"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode !== "unlock" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm PIN</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPin ? "text" : "password"}
                    placeholder="Confirm your PIN"
                    value={confirmPin}
                    onChange={(e) => {
                      setConfirmPin(e.target.value);
                      setLocalError(null);
                    }}
                    className="pl-10"
                    data-testid="input-vault-pin-confirm"
                  />
                </div>
              </div>

              {pin.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <div className={`h-1 flex-1 rounded ${strength === "weak" ? strengthColors.weak : "bg-muted"}`} />
                    <div className={`h-1 flex-1 rounded ${strength === "medium" || strength === "strong" ? strengthColors.medium : "bg-muted"}`} />
                    <div className={`h-1 flex-1 rounded ${strength === "strong" ? strengthColors.strong : "bg-muted"}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Strength: <span className="capitalize">{strength}</span>
                  </p>
                </div>
              )}
            </>
          )}

          <AnimatePresence>
            {localError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                {localError}
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
            data-testid="button-vault-submit"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === "unlock" ? "Unlocking..." : "Setting up..."}
              </>
            ) : mode === "unlock" ? (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Unlock Wallet
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                {mode === "migrate" ? "Encrypt & Continue" : "Create PIN"}
              </>
            )}
          </Button>

          {mode === "unlock" && onReset && (
            <div className="pt-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleReset}
                data-testid="button-vault-reset"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {confirmReset ? "Click again to confirm reset" : "Forgot PIN? Reset Wallet"}
              </Button>
              {confirmReset && (
                <p className="text-xs text-destructive text-center mt-2">
                  This will delete your encrypted wallet. You'll need your seed phrase to recover.
                </p>
              )}
            </div>
          )}
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Your wallet is encrypted locally. Your PIN never leaves this device.
        </p>

        {/* Footer links */}
        <div className="space-y-4 pt-6 mt-6 border-t border-border/30">
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://x.com/xraythewallet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="vault-link-x"
            >
              <SiX className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/sofuzzy/Xray_Wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="vault-link-github"
            >
              <SiGithub className="w-4 h-4" />
            </a>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <Link 
              href="/terms" 
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="vault-link-terms"
            >
              Terms
            </Link>
            <span className="text-border">•</span>
            <Link 
              href="/privacy" 
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="vault-link-privacy"
            >
              Privacy
            </Link>
            <span className="text-border">•</span>
            <Link 
              href="/disclaimer" 
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="vault-link-disclaimer"
            >
              Risk Disclaimer
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground/50">
            XRAY Wallet v0.9.9
          </p>
        </div>
      </motion.div>
    </div>
  );
}
