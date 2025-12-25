import { useState } from "react";
import { motion } from "framer-motion";
import { X, Copy, Eye, EyeOff, Download, Upload, AlertTriangle, Check, Loader2, Fingerprint, Shield, Trash2 } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { useBiometric } from "@/hooks/use-biometric";
import { validateMnemonic } from "@/lib/solana";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SeedPhraseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SeedPhraseModal({ isOpen, onClose }: SeedPhraseModalProps) {
  const { getSeedPhrase, importWallet, resetWallet } = useWallet();
  const { toast } = useToast();
  const biometric = useBiometric();
  const [tab, setTab] = useState<"backup" | "restore" | "security">("backup");
  const [showPhrase, setShowPhrase] = useState(false);
  const [importPhrase, setImportPhrase] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const seedPhrase = getSeedPhrase();
  const words = seedPhrase?.split(" ") || [];

  const handleCopy = () => {
    if (seedPhrase) {
      navigator.clipboard.writeText(seedPhrase);
      toast({ title: "Copied", description: "Seed phrase copied to clipboard. Keep it safe!" });
    }
  };

  const handleImport = async () => {
    const trimmed = importPhrase.trim().toLowerCase();
    
    if (!validateMnemonic(trimmed)) {
      toast({ 
        title: "Invalid Seed Phrase", 
        description: "Please enter a valid 12-word seed phrase.", 
        variant: "destructive" 
      });
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
        className="relative w-full max-w-lg bg-card border border-white/10 rounded-t-3xl md:rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 text-white/50 hover:text-white"
          data-testid="button-close-seed-modal"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold font-display">Wallet Settings</h2>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "backup" | "restore" | "security")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="backup" data-testid="tab-backup">
                <Download className="w-4 h-4 mr-2" />
                Backup
              </TabsTrigger>
              <TabsTrigger value="restore" data-testid="tab-restore">
                <Upload className="w-4 h-4 mr-2" />
                Restore
              </TabsTrigger>
              <TabsTrigger value="security" data-testid="tab-security">
                <Shield className="w-4 h-4 mr-2" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="backup" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200/80">
                  <p className="font-medium text-amber-200">Never share your seed phrase!</p>
                  <p className="mt-1">Anyone with these words can access your wallet and steal your funds.</p>
                </div>
              </div>

              {seedPhrase ? (
                <>
                  <div className="relative">
                    <div 
                      className={`grid grid-cols-3 gap-2 p-4 rounded-xl bg-white/5 border border-white/10 ${!showPhrase ? 'blur-md select-none' : ''}`}
                    >
                      {words.map((word, index) => (
                        <div 
                          key={index} 
                          className="flex items-center gap-2 p-2 rounded-lg bg-white/5"
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
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => setShowPhrase(false)}
                      >
                        <EyeOff className="w-4 h-4 mr-2" />
                        Hide
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={handleCopy}
                        data-testid="button-copy-seed"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No seed phrase found.</p>
                  <p className="text-sm mt-2">Your wallet may have been created with an older version.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="restore" className="space-y-4 mt-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-200/80">
                  Enter your 12-word seed phrase to restore your wallet. This will replace your current wallet.
                </p>
              </div>

              <textarea
                className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm resize-none"
                placeholder="Enter your 12-word seed phrase separated by spaces..."
                value={importPhrase}
                onChange={(e) => setImportPhrase(e.target.value)}
                data-testid="input-import-seed"
              />

              <Button
                onClick={handleImport}
                disabled={isImporting || !importPhrase.trim()}
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

              <div className="border-t border-white/10 pt-4 mt-4">
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
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
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
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
}
