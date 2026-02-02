import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Copy, Eye, EyeOff, Download, Upload, AlertTriangle, Check, Loader2, Fingerprint, Shield, Trash2, Key, ShieldAlert, ShieldCheck, RotateCcw, Cloud, CloudUpload, CloudDownload, Lock, User, Skull, Coins, Zap } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { useBiometric } from "@/hooks/use-biometric";
import { useRiskShieldSettings } from "@/hooks/use-risk-shield-settings";
import { useTurboMode } from "@/hooks/use-turbo-mode";
import { useVault } from "@/hooks/use-vault";
import { useVaultContext } from "@/contexts/VaultContext";
import { useCurrentUser, useUpdateUser } from "@/hooks/use-users";
import { validateMnemonic } from "@/lib/solana";
import { validatePassphrase, getPassphraseStrength } from "@/lib/vaultCrypto";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenCleanup } from "./TokenCleanup";

interface SeedPhraseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function RiskCheckItem({ 
  label, 
  description, 
  checked, 
  onChange, 
  testId 
}: { 
  label: string; 
  description: string; 
  checked: boolean; 
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover-elevate">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}

export function SeedPhraseModal({ isOpen, onClose }: SeedPhraseModalProps) {
  const { getSeedPhrase, getPrivateKey, isPrivateKeyWallet, importWallet, importFromPrivateKey, resetWallet, wallets } = useWallet();
  const { toast } = useToast();
  const biometric = useBiometric();
  const riskShield = useRiskShieldSettings();
  const turboMode = useTurboMode();
  const vault = useVault();
  const localVault = useVaultContext();
  const [tab, setTab] = useState<"backup" | "restore" | "security" | "cloud" | "profile" | "cleanup">("backup");
  const [showPhrase, setShowPhrase] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [importPhrase, setImportPhrase] = useState("");
  const [importPrivateKeyValue, setImportPrivateKeyValue] = useState("");
  const [importMode, setImportMode] = useState<"seed" | "key">("seed");
  const [isImporting, setIsImporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [cloudPassphrase, setCloudPassphrase] = useState("");
  const [cloudPassphraseConfirm, setCloudPassphraseConfirm] = useState("");
  const [showCloudPassphrase, setShowCloudPassphrase] = useState(false);
  const [cloudMode, setCloudMode] = useState<"backup" | "restore">("backup");
  const [confirmDeleteVault, setConfirmDeleteVault] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const { data: currentUser } = useCurrentUser();
  const updateUserMutation = useUpdateUser();

  const seedPhrase = getSeedPhrase();
  const words = seedPhrase?.split(" ") || [];
  const isPKWallet = isPrivateKeyWallet();

  useEffect(() => {
    if (showPrivateKey && !privateKey) {
      getPrivateKey().then(setPrivateKey);
    }
  }, [showPrivateKey, privateKey, getPrivateKey]);

  const handleCopySeed = () => {
    if (seedPhrase) {
      navigator.clipboard.writeText(seedPhrase);
      toast({ title: "Copied", description: "Seed phrase copied to clipboard. Keep it safe!" });
    }
  };

  const handleCopyPrivateKey = () => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      toast({ title: "Copied", description: "Private key copied to clipboard. Keep it safe!" });
    }
  };

  const handleImport = async () => {
    if (importMode === "seed") {
      const trimmed = importPhrase.trim().toLowerCase();
      if (!validateMnemonic(trimmed)) {
        toast({ title: "Invalid Seed Phrase", description: "Please enter a valid 12-word seed phrase.", variant: "destructive" });
        return;
      }
      setIsImporting(true);
      try {
        const success = await importWallet(trimmed);
        if (success) {
          toast({ title: "Wallet Imported", description: "Reloading to apply changes..." });
          setImportPhrase("");
          setTimeout(() => window.location.reload(), 500);
        } else {
          toast({ title: "Import Failed", description: "Could not import wallet.", variant: "destructive" });
          setIsImporting(false);
        }
      } catch {
        setIsImporting(false);
      }
    } else {
      const trimmed = importPrivateKeyValue.trim();
      if (!trimmed || trimmed.length < 32) {
        toast({ title: "Invalid Private Key", description: "Please enter a valid base58 encoded private key.", variant: "destructive" });
        return;
      }
      setIsImporting(true);
      try {
        const success = await importFromPrivateKey(trimmed);
        if (success) {
          toast({ title: "Wallet Imported", description: "Reloading to apply changes..." });
          setImportPrivateKeyValue("");
          setTimeout(() => window.location.reload(), 500);
        } else {
          toast({ title: "Import Failed", description: "Invalid private key format.", variant: "destructive" });
          setIsImporting(false);
        }
      } catch {
        setIsImporting(false);
      }
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await resetWallet();
    toast({ title: "New Wallet Created", description: "Reloading to apply changes..." });
    setTimeout(() => window.location.reload(), 500);
  };

  const handleEnableBiometric = async () => {
    setIsEnabling(true);
    try {
      const success = await biometric.register();
      if (success) {
        toast({ title: "Face ID Enabled", description: "You can now unlock with Face ID" });
      } else {
        toast({ title: "Setup Failed", description: biometric.error || "Could not enable Face ID", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Setup Failed", description: e.message || "Could not enable Face ID", variant: "destructive" });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleRemoveBiometric = async (id: number) => {
    const success = await biometric.remove(id);
    if (success) {
      toast({ title: "Face ID Removed", description: "Biometric unlock has been disabled" });
    } else {
      toast({ title: "Remove Failed", description: "Could not remove Face ID", variant: "destructive" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 text-muted-foreground hover:text-foreground"
          data-testid="button-close-seed-modal"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold font-display">Wallet Settings</h2>
            <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "backup" | "restore" | "security" | "cloud" | "profile" | "cleanup")}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="backup" data-testid="tab-backup">
                <Download className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Export</span>
              </TabsTrigger>
              <TabsTrigger value="restore" data-testid="tab-restore">
                <Upload className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Import</span>
              </TabsTrigger>
              <TabsTrigger value="cloud" data-testid="tab-cloud">
                <Cloud className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Cloud</span>
              </TabsTrigger>
              <TabsTrigger value="security" data-testid="tab-security">
                <Shield className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
              <TabsTrigger value="cleanup" data-testid="tab-cleanup">
                <Coins className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Cleanup</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Current Username</label>
                  <div className="p-3 rounded-lg bg-muted border border-border">
                    <p className="text-sm font-mono">{currentUser?.user?.username || currentUser?.user?.firstName || "Not set"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">New Username</label>
                  <Input
                    type="text"
                    placeholder="Enter new username (3-30 characters)"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    data-testid="input-new-username"
                  />
                  <p className="text-xs text-muted-foreground">
                    Username must be 3-30 characters long.
                  </p>
                </div>

                <Button
                  onClick={async () => {
                    if (newUsername.length < 3 || newUsername.length > 30) {
                      toast({ title: "Invalid Username", description: "Username must be 3-30 characters.", variant: "destructive" });
                      return;
                    }
                    try {
                      await updateUserMutation.mutateAsync({ username: newUsername });
                      toast({ title: "Username Updated", description: "Your username has been changed successfully." });
                      setNewUsername("");
                    } catch {
                      toast({ title: "Update Failed", description: "Could not update username.", variant: "destructive" });
                    }
                  }}
                  disabled={!newUsername.trim() || newUsername.length < 3 || updateUserMutation.isPending}
                  className="w-full"
                  data-testid="button-update-username"
                >
                  {updateUserMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Update Username
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="backup" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200/80">
                  <p className="font-medium text-amber-200">Never share your keys!</p>
                  <p className="mt-1">Anyone with your seed phrase or private key can access your wallet and steal your funds.</p>
                </div>
              </div>

              {/* Seed Phrase Section */}
              {!isPKWallet && seedPhrase && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Seed Phrase (12 words)
                  </h3>
                  <div className="relative">
                    <div 
                      className={`grid grid-cols-3 gap-2 p-4 rounded-xl bg-muted border border-border ${!showPhrase ? 'blur-md select-none' : ''}`}
                    >
                      {words.map((word, index) => (
                        <div 
                          key={index} 
                          className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                          data-testid={`seed-word-${index}`}
                        >
                          <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                          <span className="font-mono text-sm">{word}</span>
                        </div>
                      ))}
                    </div>
                    
                    {!showPhrase && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Button
                          variant="outline"
                          onClick={() => setShowPhrase(true)}
                          data-testid="button-reveal-seed"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Reveal Seed Phrase
                        </Button>
                      </div>
                    )}
                  </div>

                  {showPhrase && (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowPhrase(false)}>
                        <EyeOff className="w-4 h-4 mr-2" />
                        Hide
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={handleCopySeed} data-testid="button-copy-seed">
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Private Key Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Private Key (Base58)
                </h3>
                <div className="relative">
                  <div 
                    className={`p-4 rounded-xl bg-muted border border-border font-mono text-xs break-all ${!showPrivateKey ? 'blur-md select-none' : ''}`}
                  >
                    {privateKey || "Loading..."}
                  </div>
                  
                  {!showPrivateKey && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Button
                        variant="outline"
                        onClick={() => setShowPrivateKey(true)}
                        data-testid="button-reveal-private-key"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Reveal Private Key
                      </Button>
                    </div>
                  )}
                </div>

                {showPrivateKey && privateKey && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowPrivateKey(false)}>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Hide
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleCopyPrivateKey} data-testid="button-copy-private-key">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                )}
              </div>

              {isPKWallet && (
                <div className="text-sm text-muted-foreground text-center py-2">
                  This wallet was imported from a private key (no seed phrase available).
                </div>
              )}
            </TabsContent>

            <TabsContent value="restore" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200/80">
                  Import a wallet using either a 12-word seed phrase or a private key.
                </p>
              </div>

              {/* Import Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={importMode === "seed" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setImportMode("seed")}
                  data-testid="button-import-mode-seed"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Seed Phrase
                </Button>
                <Button
                  variant={importMode === "key" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setImportMode("key")}
                  data-testid="button-import-mode-key"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Private Key
                </Button>
              </div>

              {importMode === "seed" ? (
                <textarea
                  className="w-full h-32 bg-muted border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm resize-none"
                  placeholder="Enter your 12-word seed phrase separated by spaces..."
                  value={importPhrase}
                  onChange={(e) => setImportPhrase(e.target.value)}
                  data-testid="input-import-seed"
                />
              ) : (
                <textarea
                  className="w-full h-32 bg-muted border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm resize-none"
                  placeholder="Enter your base58 encoded private key..."
                  value={importPrivateKeyValue}
                  onChange={(e) => setImportPrivateKeyValue(e.target.value)}
                  data-testid="input-import-private-key"
                />
              )}

              <Button
                onClick={handleImport}
                disabled={isImporting || (importMode === "seed" ? !importPhrase.trim() : !importPrivateKeyValue.trim())}
                className="w-full"
                data-testid="button-import-wallet"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Wallet
                  </>
                )}
              </Button>

              <div className="border-t border-border pt-4 mt-4">
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  className="w-full"
                  data-testid="button-reset-wallet"
                >
                  {confirmReset ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Confirm: Create New Wallet
                    </>
                  ) : (
                    "Create New Wallet"
                  )}
                </Button>
                {confirmReset && (
                  <p className="text-xs text-destructive text-center mt-2">
                    This will delete your current wallet. Make sure you have backed up your seed phrase!
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="cloud" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-3">
                <Cloud className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-foreground/80">
                  <p className="font-medium text-foreground">Encrypted Cloud Backup</p>
                  <p className="mt-1">Back up your wallet to the cloud with end-to-end encryption. Only you can decrypt it with your passphrase.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-destructive/80">
                  <p className="font-bold text-destructive">Warning: If you lose your passphrase, your wallet CANNOT be recovered.</p>
                  <p className="mt-1">We do not store your passphrase and cannot help you recover it.</p>
                </div>
              </div>

              {vault.hasVault && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-500" />
                  <div className="text-sm">
                    <span className="text-green-200 font-medium">Cloud backup exists</span>
                    {vault.vaultUpdatedAt && (
                      <span className="text-muted-foreground ml-2">
                        Last updated: {new Date(vault.vaultUpdatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant={cloudMode === "backup" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCloudMode("backup")}
                  data-testid="button-cloud-backup-tab"
                >
                  <CloudUpload className="w-4 h-4 mr-2" />
                  Backup
                </Button>
                <Button
                  variant={cloudMode === "restore" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCloudMode("restore")}
                  disabled={!vault.hasVault}
                  data-testid="button-cloud-restore-tab"
                >
                  <CloudDownload className="w-4 h-4 mr-2" />
                  Restore
                </Button>
              </div>

              {cloudMode === "backup" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Create Encryption Passphrase</label>
                    <div className="relative">
                      <Input
                        type={showCloudPassphrase ? "text" : "password"}
                        placeholder="Enter a strong passphrase"
                        value={cloudPassphrase}
                        onChange={(e) => setCloudPassphrase(e.target.value)}
                        className="pr-10"
                        data-testid="input-cloud-passphrase"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCloudPassphrase(!showCloudPassphrase)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCloudPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {cloudPassphrase && (
                      <div className="flex items-center gap-2">
                        <div className={`h-2 flex-1 rounded-full ${
                          getPassphraseStrength(cloudPassphrase) === "strong" ? "bg-green-500" :
                          getPassphraseStrength(cloudPassphrase) === "medium" ? "bg-amber-500" : "bg-destructive"
                        }`} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {getPassphraseStrength(cloudPassphrase)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Confirm Passphrase</label>
                    <Input
                      type={showCloudPassphrase ? "text" : "password"}
                      placeholder="Confirm your passphrase"
                      value={cloudPassphraseConfirm}
                      onChange={(e) => setCloudPassphraseConfirm(e.target.value)}
                      data-testid="input-cloud-passphrase-confirm"
                    />
                    {cloudPassphraseConfirm && cloudPassphrase !== cloudPassphraseConfirm && (
                      <p className="text-xs text-destructive">Passphrases do not match</p>
                    )}
                  </div>

                  <Button
                    onClick={async () => {
                      const validation = validatePassphrase(cloudPassphrase);
                      if (!validation.valid) {
                        toast({ title: "Invalid Passphrase", description: validation.message, variant: "destructive" });
                        return;
                      }
                      if (cloudPassphrase !== cloudPassphraseConfirm) {
                        toast({ title: "Passphrase Mismatch", description: "Passphrases do not match", variant: "destructive" });
                        return;
                      }
                      const walletData = JSON.stringify(wallets);
                      await vault.backup({ walletData, passphrase: cloudPassphrase });
                      setCloudPassphrase("");
                      setCloudPassphraseConfirm("");
                    }}
                    disabled={vault.isBackingUp || !cloudPassphrase || cloudPassphrase !== cloudPassphraseConfirm}
                    className="w-full"
                    data-testid="button-cloud-backup"
                  >
                    {vault.isBackingUp ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Encrypting & Uploading...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        {vault.hasVault ? "Update Cloud Backup" : "Create Cloud Backup"}
                      </>
                    )}
                  </Button>

                  {vault.hasVault && (
                    <div className="border-t border-border pt-4 mt-4">
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!confirmDeleteVault) {
                            setConfirmDeleteVault(true);
                            setTimeout(() => setConfirmDeleteVault(false), 3000);
                            return;
                          }
                          await vault.deleteVault();
                          setConfirmDeleteVault(false);
                        }}
                        disabled={vault.isDeleting}
                        className="w-full"
                        data-testid="button-delete-vault"
                      >
                        {vault.isDeleting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : confirmDeleteVault ? (
                          "Click again to confirm deletion"
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Cloud Backup
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {cloudMode === "restore" && (
                <div className="space-y-4">
                  {!localVault.pin ? (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                      <p className="text-sm text-destructive font-medium">Vault Locked</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Please unlock your vault first to restore from cloud backup. Close this modal and enter your PIN.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Enter Your Passphrase</label>
                        <div className="relative">
                          <Input
                            type={showCloudPassphrase ? "text" : "password"}
                            placeholder="Enter your backup passphrase"
                            value={cloudPassphrase}
                            onChange={(e) => setCloudPassphrase(e.target.value)}
                            className="pr-10"
                            data-testid="input-cloud-restore-passphrase"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCloudPassphrase(!showCloudPassphrase)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showCloudPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <Button
                        onClick={async () => {
                          try {
                            const decryptedData = await vault.restore({ passphrase: cloudPassphrase });
                            const restoredWallets = JSON.parse(decryptedData);
                            if (Array.isArray(restoredWallets) && restoredWallets.length > 0) {
                              const { updateVaultData } = await import("@/lib/localVault");
                              await updateVaultData(decryptedData, localVault.pin!);
                              toast({ title: "Restore Successful", description: "Reloading to apply changes..." });
                              setTimeout(() => window.location.reload(), 500);
                            } else {
                              toast({ title: "Invalid Data", description: "Backup data is corrupted", variant: "destructive" });
                            }
                          } catch (error: any) {
                            console.error("Restore failed:", error);
                          }
                          setCloudPassphrase("");
                        }}
                        disabled={vault.isRestoring || !cloudPassphrase}
                        className="w-full"
                        data-testid="button-cloud-restore"
                      >
                        {vault.isRestoring ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Decrypting...
                          </>
                        ) : (
                          <>
                            <CloudDownload className="w-4 h-4 mr-2" />
                            Restore Wallet from Cloud
                          </>
                        )}
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        This will replace your current wallet with the backed-up version.
                      </p>
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="security" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex gap-3">
                <Fingerprint className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm text-foreground/80">
                  <p className="font-medium text-foreground">Face ID / Biometric Unlock</p>
                  <p className="mt-1">Use Face ID or Touch ID to quickly unlock your wallet.</p>
                </div>
              </div>

              {!biometric.isSupported ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Biometric authentication is not available on this device.</p>
                  <p className="text-sm mt-2">Try using Safari on an iPhone or Mac with Touch ID.</p>
                </div>
              ) : biometric.isLoading ? (
                <div className="text-center py-6">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                </div>
              ) : biometric.isEnabled ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500" />
                    <span className="text-green-200">Face ID is enabled</span>
                  </div>
                  
                  {biometric.credentials.map((cred) => (
                    <div 
                      key={cred.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Fingerprint className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{cred.deviceType || "Face ID"}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(cred.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveBiometric(cred.id)}
                        data-testid={`button-remove-biometric-${cred.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Button
                  onClick={handleEnableBiometric}
                  disabled={isEnabling}
                  className="w-full"
                  data-testid="button-enable-faceid"
                >
                  {isEnabling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4 mr-2" />
                      Enable Face ID
                    </>
                  )}
                </Button>
              )}

              {/* Turbo Mode Section */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex gap-3 mb-4">
                  <Zap className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground/80">
                    <p className="font-medium text-foreground">Turbo Mode</p>
                    <p className="mt-1">Ultra-fast transactions via Helius Sender with Jito tips. Adds a small tip ({turboMode.tipAmountSol} SOL) to each transaction for priority processing.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border mb-4">
                  <div className="flex items-center gap-3">
                    {turboMode.enabled ? (
                      <Zap className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <Zap className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Enable Turbo Mode</p>
                      <p className="text-xs text-muted-foreground">
                        {turboMode.enabled ? `Active (+${turboMode.tipAmountSol} SOL per tx)` : "Disabled"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={turboMode.enabled}
                    onCheckedChange={turboMode.setEnabled}
                    data-testid="switch-turbo-mode"
                  />
                </div>

                {turboMode.enabled && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border mb-4">
                    <label className="text-xs text-muted-foreground mb-2 block">Jito Tip Amount (SOL)</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={turboMode.tipAmountSol === 0.0002 ? "default" : "outline"}
                        onClick={() => turboMode.setTipAmount(0.0002)}
                        data-testid="button-tip-low"
                      >
                        0.0002 (Min)
                      </Button>
                      <Button
                        size="sm"
                        variant={turboMode.tipAmountSol === 0.0005 ? "default" : "outline"}
                        onClick={() => turboMode.setTipAmount(0.0005)}
                        data-testid="button-tip-medium"
                      >
                        0.0005
                      </Button>
                      <Button
                        size="sm"
                        variant={turboMode.tipAmountSol === 0.001 ? "default" : "outline"}
                        onClick={() => turboMode.setTipAmount(0.001)}
                        data-testid="button-tip-high"
                      >
                        0.001
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* X-Ray Shield Section */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-3 mb-4">
                  <ShieldAlert className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground/80">
                    <p className="font-medium text-foreground">X-Ray Shield</p>
                    <p className="mt-1">Protect your swaps by analyzing tokens for risks before trading.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border mb-4">
                  <div className="flex items-center gap-3">
                    {riskShield.settings.enabled ? (
                      <ShieldCheck className="w-5 h-5 text-green-500" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Enable X-Ray Shield</p>
                      <p className="text-xs text-muted-foreground">
                        {riskShield.settings.enabled ? "Protection active" : "Protection disabled"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={riskShield.settings.enabled}
                    onCheckedChange={riskShield.setEnabled}
                    data-testid="switch-risk-shield"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border mb-4">
                  <div className="flex items-center gap-3">
                    <Skull className={`w-5 h-5 ${riskShield.settings.shameMode ? "text-destructive" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">Shame Mode</p>
                      <p className="text-xs text-muted-foreground">
                        {riskShield.settings.shameMode ? "Brutally honest warnings" : "Standard warnings"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={riskShield.settings.shameMode}
                    onCheckedChange={riskShield.setShameMode}
                    data-testid="switch-shame-mode-settings"
                  />
                </div>

                {riskShield.settings.enabled && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Risk Checks</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={riskShield.resetToDefaults}
                        data-testid="button-reset-risk-checks"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    </div>

                    <RiskCheckItem
                      label="Low Liquidity"
                      description="Warn when token has low trading liquidity"
                      checked={riskShield.settings.checks.lowLiquidity}
                      onChange={(v) => riskShield.setCheck("lowLiquidity", v)}
                      testId="check-low-liquidity"
                    />
                    <RiskCheckItem
                      label="Volume Anomaly"
                      description="Detect suspicious volume vs liquidity"
                      checked={riskShield.settings.checks.volumeAnomaly}
                      onChange={(v) => riskShield.setCheck("volumeAnomaly", v)}
                      testId="check-volume-anomaly"
                    />
                    <RiskCheckItem
                      label="High Volatility"
                      description="Flag extreme price movements"
                      checked={riskShield.settings.checks.highVolatility}
                      onChange={(v) => riskShield.setCheck("highVolatility", v)}
                      testId="check-high-volatility"
                    />
                    <RiskCheckItem
                      label="New Market"
                      description="Warn about newly created tokens"
                      checked={riskShield.settings.checks.newMarket}
                      onChange={(v) => riskShield.setCheck("newMarket", v)}
                      testId="check-new-market"
                    />
                    <RiskCheckItem
                      label="FDV Disconnect"
                      description="Detect inflated valuations"
                      checked={riskShield.settings.checks.fdvDisconnect}
                      onChange={(v) => riskShield.setCheck("fdvDisconnect", v)}
                      testId="check-fdv-disconnect"
                    />
                    <RiskCheckItem
                      label="LP Not Locked"
                      description="Warn if liquidity is not locked"
                      checked={riskShield.settings.checks.lpNotLocked}
                      onChange={(v) => riskShield.setCheck("lpNotLocked", v)}
                      testId="check-lp-not-locked"
                    />
                    <RiskCheckItem
                      label="Mint Authority"
                      description="Warn if supply can be increased"
                      checked={riskShield.settings.checks.mintAuthority}
                      onChange={(v) => riskShield.setCheck("mintAuthority", v)}
                      testId="check-mint-authority"
                    />
                    <RiskCheckItem
                      label="Freeze Authority"
                      description="Warn if accounts can be frozen"
                      checked={riskShield.settings.checks.freezeAuthority}
                      onChange={(v) => riskShield.setCheck("freezeAuthority", v)}
                      testId="check-freeze-authority"
                    />
                    <RiskCheckItem
                      label="Holder Concentration"
                      description="Detect whale concentration risk"
                      checked={riskShield.settings.checks.topHolderConcentration}
                      onChange={(v) => riskShield.setCheck("topHolderConcentration", v)}
                      testId="check-holder-concentration"
                    />
                    <RiskCheckItem
                      label="Unknown Program"
                      description="Flag non-standard token programs"
                      checked={riskShield.settings.checks.unknownProgram}
                      onChange={(v) => riskShield.setCheck("unknownProgram", v)}
                      testId="check-unknown-program"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="cleanup" className="space-y-4 mt-4">
              <TokenCleanup />
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
}
