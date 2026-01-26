import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Download, CloudDownload, Eye, EyeOff, KeyRound, Shield, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { validatePassphrase, getPassphraseStrength } from "@/lib/vaultCrypto";
import { Link } from "wouter";
import { SiX, SiGithub } from "react-icons/si";
import * as bip39 from "bip39";

type OnboardingStep = "welcome" | "setup" | "create" | "import" | "restore" | "pin";

interface WalletOnboardingProps {
  onComplete: (pin: string, walletData: { type: "create" | "import" | "restore"; mnemonic?: string; privateKey?: string; backupData?: string }) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function WalletOnboarding({ onComplete, isLoading, error }: WalletOnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [walletType, setWalletType] = useState<"create" | "import" | "restore" | null>(null);
  const [importMethod, setImportMethod] = useState<"seed" | "privateKey">("seed");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [backupData, setBackupData] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const strength = getPassphraseStrength(pin);
  const strengthColors = {
    weak: "bg-red-500",
    medium: "bg-yellow-500",
    strong: "bg-green-500",
  };

  const validateSeedPhrase = (phrase: string): boolean => {
    const words = phrase.trim().toLowerCase().split(/\s+/);
    return words.length === 12 && bip39.validateMnemonic(phrase.trim().toLowerCase());
  };

  const handleContinueToSetup = () => {
    setStep("setup");
  };

  const handleSelectCreate = () => {
    setWalletType("create");
    setStep("pin");
  };

  const handleSelectImport = () => {
    setWalletType("import");
    setStep("import");
  };

  const handleSelectRestore = () => {
    setWalletType("restore");
    setStep("restore");
  };

  const handleImportContinue = () => {
    setLocalError(null);
    if (importMethod === "seed") {
      if (!validateSeedPhrase(seedPhrase)) {
        setLocalError("Please enter a valid 12-word seed phrase");
        return;
      }
    } else {
      if (!privateKey.trim() || privateKey.trim().length < 32) {
        setLocalError("Please enter a valid private key");
        return;
      }
    }
    setStep("pin");
  };

  const handleRestoreContinue = () => {
    setLocalError(null);
    if (!backupData.trim()) {
      setLocalError("Please paste your encrypted backup data");
      return;
    }
    try {
      JSON.parse(backupData);
    } catch {
      setLocalError("Invalid backup format. Please paste the complete backup data.");
      return;
    }
    setStep("pin");
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

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
      await onComplete(pin, {
        type: walletType!,
        mnemonic: importMethod === "seed" ? seedPhrase.trim().toLowerCase() : undefined,
        privateKey: importMethod === "privateKey" ? privateKey.trim() : undefined,
        backupData: walletType === "restore" ? backupData : undefined,
      });
    } catch (err: any) {
      setLocalError(err.message || "Failed to create wallet. Please try again.");
    }
  };

  const renderFooter = () => (
    <div className="space-y-4 pt-6 mt-6 border-t border-border/30">
      <div className="flex items-center justify-center gap-4">
        <a
          href="https://x.com/xraythewallet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="onboarding-link-x"
        >
          <SiX className="w-4 h-4" />
        </a>
        <a
          href="https://github.com/sofuzzy/Xray_Wallet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="onboarding-link-github"
        >
          <SiGithub className="w-4 h-4" />
        </a>
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
        <Link 
          href="/terms" 
          className="text-muted-foreground hover:text-primary transition-colors"
          data-testid="onboarding-link-terms"
        >
          Terms
        </Link>
        <span className="text-border">•</span>
        <Link 
          href="/privacy" 
          className="text-muted-foreground hover:text-primary transition-colors"
          data-testid="onboarding-link-privacy"
        >
          Privacy
        </Link>
        <span className="text-border">•</span>
        <Link 
          href="/disclaimer" 
          className="text-muted-foreground hover:text-primary transition-colors"
          data-testid="onboarding-link-disclaimer"
        >
          Risk Disclaimer
        </Link>
      </div>

      <p className="text-center text-xs text-muted-foreground/50">
        XRAY Wallet v0.9.9
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md text-center"
          >
            <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">XRAY</h1>
            <p className="text-muted-foreground mb-8">Your non-custodial Solana wallet</p>
            
            <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            
            <h2 className="text-xl font-semibold mb-2">Welcome to XRAY</h2>
            <p className="text-muted-foreground mb-8">
              A secure, non-custodial wallet for Solana. Your keys, your crypto.
            </p>
            
            <Button
              size="lg"
              className="w-full"
              onClick={handleContinueToSetup}
              data-testid="button-onboarding-continue"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
            
            {renderFooter()}
          </motion.div>
        )}

        {step === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-primary mb-2 tracking-tight">XRAY</h1>
              <h2 className="text-xl font-semibold mb-2">Set Up Your Wallet</h2>
              <p className="text-muted-foreground">
                Choose how you want to get started
              </p>
            </div>
            
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4"
                onClick={handleSelectCreate}
                data-testid="button-create-wallet"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Create a new wallet</div>
                  <div className="text-sm text-muted-foreground">Generate a fresh wallet with a new seed phrase</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4"
                onClick={handleSelectImport}
                data-testid="button-import-wallet"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Import wallet</div>
                  <div className="text-sm text-muted-foreground">Use your seed phrase or private key</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4 px-4"
                onClick={handleSelectRestore}
                data-testid="button-restore-backup"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                  <CloudDownload className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Restore from encrypted backup</div>
                  <div className="text-sm text-muted-foreground">Restore from a previous XRAY backup</div>
                </div>
              </Button>
            </div>
            
            <button
              className="w-full mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setStep("welcome")}
              data-testid="button-back-welcome"
            >
              Back
            </button>
            
            {renderFooter()}
          </motion.div>
        )}

        {step === "import" && (
          <motion.div
            key="import"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-primary mb-2 tracking-tight">XRAY</h1>
              <h2 className="text-xl font-semibold mb-2">Import Wallet</h2>
              <p className="text-muted-foreground">
                Enter your seed phrase or private key
              </p>
            </div>
            
            <div className="flex gap-2 mb-4">
              <Button
                variant={importMethod === "seed" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportMethod("seed")}
                data-testid="button-import-seed"
              >
                Seed Phrase
              </Button>
              <Button
                variant={importMethod === "privateKey" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportMethod("privateKey")}
                data-testid="button-import-privatekey"
              >
                Private Key
              </Button>
            </div>
            
            {importMethod === "seed" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">12-Word Seed Phrase</label>
                <Textarea
                  placeholder="Enter your 12-word seed phrase, separated by spaces"
                  value={seedPhrase}
                  onChange={(e) => {
                    setSeedPhrase(e.target.value);
                    setLocalError(null);
                  }}
                  className="min-h-[100px]"
                  data-testid="input-seed-phrase"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Private Key</label>
                <Input
                  type="password"
                  placeholder="Enter your base58-encoded private key"
                  value={privateKey}
                  onChange={(e) => {
                    setPrivateKey(e.target.value);
                    setLocalError(null);
                  }}
                  data-testid="input-private-key"
                />
              </div>
            )}
            
            <div className="flex items-start gap-2 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Never share your seed phrase or private key. Anyone with access can steal your funds.
              </p>
            </div>
            
            <AnimatePresence>
              {localError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  {localError}
                </motion.div>
              )}
            </AnimatePresence>
            
            <Button
              className="w-full mt-6"
              onClick={handleImportContinue}
              data-testid="button-import-continue"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
            
            <button
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setStep("setup")}
              data-testid="button-back-setup"
            >
              Back
            </button>
            
            {renderFooter()}
          </motion.div>
        )}

        {step === "restore" && (
          <motion.div
            key="restore"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-primary mb-2 tracking-tight">XRAY</h1>
              <h2 className="text-xl font-semibold mb-2">Restore from Backup</h2>
              <p className="text-muted-foreground">
                Paste your encrypted backup data
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Encrypted Backup</label>
              <Textarea
                placeholder="Paste your encrypted backup JSON here"
                value={backupData}
                onChange={(e) => {
                  setBackupData(e.target.value);
                  setLocalError(null);
                }}
                className="min-h-[120px] font-mono text-xs"
                data-testid="input-backup-data"
              />
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              You'll need your original PIN to decrypt the backup.
            </p>
            
            <AnimatePresence>
              {localError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  {localError}
                </motion.div>
              )}
            </AnimatePresence>
            
            <Button
              className="w-full mt-6"
              onClick={handleRestoreContinue}
              data-testid="button-restore-continue"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
            
            <button
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setStep("setup")}
              data-testid="button-back-setup-restore"
            >
              Back
            </button>
            
            {renderFooter()}
          </motion.div>
        )}

        {step === "pin" && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-primary mb-4 tracking-tight">XRAY</h1>
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Create a PIN</h2>
              <p className="text-muted-foreground">
                Protect your wallet with a PIN
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Create PIN</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPin ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      setLocalError(null);
                    }}
                    className="pl-10 pr-10"
                    autoFocus
                    data-testid="input-create-pin"
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
                    data-testid="input-confirm-pin"
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

              <AnimatePresence>
                {(localError || error) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                  >
                    {localError || error}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-create-pin-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up wallet...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Create Wallet
                  </>
                )}
              </Button>
            </form>

            <button
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setStep("setup")}
              data-testid="button-back-setup-pin"
            >
              Back
            </button>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Your wallet is encrypted locally. Your PIN never leaves this device.
            </p>
            
            {renderFooter()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
