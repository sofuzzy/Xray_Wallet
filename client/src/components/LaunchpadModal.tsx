import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Rocket, Loader2, CheckCircle, AlertCircle, Coins, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { splTokenConnection, getLocalKeypair } from "@/lib/solana";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useUpload } from "@/hooks/use-upload";

interface LaunchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TokenFormData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  imageUrl: string;
}

export function LaunchpadModal({ isOpen, onClose }: LaunchpadModalProps) {
  const { address, balance } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<TokenFormData>({
    name: "",
    symbol: "",
    decimals: 9,
    totalSupply: "1000000",
    imageUrl: "",
  });
  const [step, setStep] = useState<"form" | "creating" | "success" | "error">("form");
  const [createdToken, setCreatedToken] = useState<{ mintAddress: string; name: string; symbol: string; imageUrl?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const saveLaunchMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      symbol: string;
      mintAddress: string;
      decimals: number;
      totalSupply: string;
      creatorAddress: string;
      imageUrl?: string;
    }) => {
      return apiRequest("POST", "/api/token-launches", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/token-launches"] });
    },
  });

  const handleInputChange = (field: keyof TokenFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    const result = await uploadFile(file);
    if (result) {
      setFormData(prev => ({ ...prev, imageUrl: result.objectPath }));
      toast({ title: "Success", description: "Image uploaded successfully" });
    }
  };

  const createToken = async () => {
    if (!address) {
      toast({ title: "Error", description: "Wallet not connected", variant: "destructive" });
      return;
    }

    const keypair = await getLocalKeypair();
    if (!keypair) {
      toast({ title: "Error", description: "No keypair found", variant: "destructive" });
      return;
    }

    const requiredLamports = Math.floor(0.05 * LAMPORTS_PER_SOL);
    if (balance < requiredLamports) {
      toast({ 
        title: "Insufficient Balance", 
        description: `You need at least 0.05 SOL to create a token. Current balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`, 
        variant: "destructive" 
      });
      return;
    }

    if (!formData.name.trim() || !formData.symbol.trim()) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (!formData.totalSupply || !/^\d+$/.test(formData.totalSupply) || BigInt(formData.totalSupply) <= 0) {
      toast({ title: "Error", description: "Please enter a valid total supply", variant: "destructive" });
      return;
    }

    setStep("creating");

    try {
      const mintKeypair = Keypair.generate();
      
      const mint = await createMint(
        splTokenConnection,
        keypair,
        keypair.publicKey,
        keypair.publicKey,
        formData.decimals,
        mintKeypair
      );

      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        splTokenConnection,
        keypair,
        mint,
        keypair.publicKey
      );

      const supplyBigInt = BigInt(formData.totalSupply);
      let multiplier = BigInt(1);
      for (let i = 0; i < formData.decimals; i++) {
        multiplier = multiplier * BigInt(10);
      }
      const supplyWithDecimals = supplyBigInt * multiplier;
      
      await mintTo(
        splTokenConnection,
        keypair,
        mint,
        tokenAccount.address,
        keypair,
        supplyWithDecimals
      );

      await saveLaunchMutation.mutateAsync({
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        mintAddress: mint.toBase58(),
        decimals: formData.decimals,
        totalSupply: formData.totalSupply,
        creatorAddress: address,
        imageUrl: formData.imageUrl || undefined,
      });

      setCreatedToken({
        mintAddress: mint.toBase58(),
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        imageUrl: formData.imageUrl || undefined,
      });
      setStep("success");
      
      queryClient.invalidateQueries({ queryKey: ["/api/token-balances"] });
      
    } catch (error: unknown) {
      console.error("Token creation failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to create token");
      setStep("error");
    }
  };

  const handleClose = () => {
    setStep("form");
    setFormData({ name: "", symbol: "", decimals: 9, totalSupply: "1000000", imageUrl: "" });
    setCreatedToken(null);
    setErrorMessage("");
    setImagePreview(null);
    onClose();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Token address copied to clipboard" });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
        
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground">Token Launchpad</h2>
                  <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
                </div>
                <p className="text-sm text-muted-foreground">Create your own SPL token</p>
              </div>
            </div>
            <button 
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              data-testid="button-close-launchpad"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {step === "form" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Token Image</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  data-testid="input-token-image"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 bg-muted border border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
                  data-testid="button-upload-image"
                >
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  ) : imagePreview ? (
                    <img src={imagePreview} alt="Token preview" className="w-20 h-20 object-cover rounded-lg" />
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click to upload image</span>
                      <span className="text-xs text-muted-foreground/60">PNG, JPG up to 5MB</span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-name" className="text-sm text-muted-foreground">Token Name</Label>
                <Input
                  id="token-name"
                  placeholder="e.g., My Awesome Token"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-token-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-symbol" className="text-sm text-muted-foreground">Token Symbol</Label>
                <Input
                  id="token-symbol"
                  placeholder="e.g., MAT"
                  value={formData.symbol}
                  onChange={(e) => handleInputChange("symbol", e.target.value.toUpperCase().slice(0, 10))}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground uppercase"
                  data-testid="input-token-symbol"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="token-decimals" className="text-sm text-muted-foreground">Decimals</Label>
                  <Input
                    id="token-decimals"
                    type="number"
                    min="0"
                    max="9"
                    value={formData.decimals}
                    onChange={(e) => handleInputChange("decimals", parseInt(e.target.value) || 0)}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-token-decimals"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token-supply" className="text-sm text-muted-foreground">Total Supply</Label>
                  <Input
                    id="token-supply"
                    type="text"
                    placeholder="1000000"
                    value={formData.totalSupply}
                    onChange={(e) => handleInputChange("totalSupply", e.target.value.replace(/[^0-9]/g, ""))}
                    className="bg-muted border-border text-foreground"
                    data-testid="input-token-supply"
                  />
                </div>
              </div>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <p className="text-xs text-muted-foreground">Estimated Cost</p>
                <p className="text-lg font-bold text-foreground">~0.05 SOL</p>
                <p className="text-xs text-muted-foreground">
                  Covers account rent and transaction fees
                </p>
              </div>

              <Button
                onClick={createToken}
                className="w-full py-6 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                data-testid="button-launch-token"
              >
                <Rocket className="w-5 h-5 mr-2" />
                Launch Token
              </Button>
            </div>
          )}

          {step === "creating" && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto" />
              <div>
                <p className="text-lg font-medium text-foreground">Creating your token...</p>
                <p className="text-sm text-muted-foreground">This may take a moment</p>
              </div>
            </div>
          )}

          {step === "success" && createdToken && (
            <div className="py-8 text-center space-y-6">
              {createdToken.imageUrl ? (
                <img 
                  src={createdToken.imageUrl} 
                  alt={createdToken.name} 
                  className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-green-500/50"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
              )}
              <div>
                <p className="text-xl font-bold text-foreground">Token Created!</p>
                <p className="text-muted-foreground">{createdToken.name} ({createdToken.symbol})</p>
              </div>
              
              <div 
                className="bg-muted rounded-xl p-4 cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => copyToClipboard(createdToken.mintAddress)}
                data-testid="button-copy-mint-address"
              >
                <p className="text-xs text-muted-foreground mb-1">Mint Address (tap to copy)</p>
                <p className="text-sm font-mono text-foreground break-all">{createdToken.mintAddress}</p>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg p-3">
                <Coins className="w-4 h-4" />
                <span>Tokens minted to your wallet</span>
              </div>

              <Button onClick={handleClose} className="w-full" variant="outline" data-testid="button-done">
                Done
              </Button>
            </div>
          )}

          {step === "error" && (
            <div className="py-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">Launch Failed</p>
                <p className="text-sm text-muted-foreground mt-2">{errorMessage}</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setStep("form")} variant="outline" className="flex-1" data-testid="button-try-again">
                  Try Again
                </Button>
                <Button onClick={handleClose} variant="ghost" className="flex-1" data-testid="button-cancel">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
