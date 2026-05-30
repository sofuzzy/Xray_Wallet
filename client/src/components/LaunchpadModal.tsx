import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Rocket, Loader2, CheckCircle, AlertCircle, ImageIcon,
  ExternalLink, Lock, Copy, ChevronDown, ChevronUp, Droplets, Info, Coins
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useBetaStatus } from "@/components/BetaStatusBanner";
import { sendTransactionViaServer } from "@/lib/solana";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { LAMPORTS_PER_SOL, VersionedTransaction, Transaction, Keypair } from "@solana/web3.js";
import { useUpload } from "@/hooks/use-upload";

interface LaunchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LaunchMode = "pump" | "custom";

type PumpStep = "form" | "uploading" | "building" | "signing" | "confirming" | "success" | "error";

interface PumpFormData {
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  devBuySol: string;
}

interface CustomFormData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  imageUrl: string;
  addLiquidity: boolean;
  liquiditySol: string;
  liquidityPercent: string;
}

export function LaunchpadModal({ isOpen, onClose }: LaunchpadModalProps) {
  const { address, balance, keypair } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const { data: betaStatus } = useBetaStatus();
  const isBetaLocked = betaStatus && !betaStatus.unlocked;

  // Mode
  const [mode, setMode] = useState<LaunchMode>("pump");
  const [showSocials, setShowSocials] = useState(false);

  // Pump.fun state
  const [pumpStep, setPumpStep] = useState<PumpStep>("form");
  const [pumpImageFile, setPumpImageFile] = useState<File | null>(null);
  const [pumpImagePreview, setPumpImagePreview] = useState<string | null>(null);
  const [pumpForm, setPumpForm] = useState<PumpFormData>({
    name: "", symbol: "", description: "", twitter: "", telegram: "", website: "", devBuySol: "0",
  });
  const [pumpMintAddress, setPumpMintAddress] = useState("");
  const [pumpError, setPumpError] = useState("");

  // Custom SPL state
  const [customStep, setCustomStep] = useState<"form" | "creating" | "addingLiquidity" | "success" | "error">("form");
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [poolStatus, setPoolStatus] = useState<"idle" | "building" | "signing" | "confirming" | "success" | "error">("idle");
  const [poolError, setPoolError] = useState("");
  const [customForm, setCustomForm] = useState<CustomFormData>({
    name: "", symbol: "", decimals: 9, totalSupply: "1000000", imageUrl: "", addLiquidity: false, liquiditySol: "1", liquidityPercent: "50",
  });
  const [createdToken, setCreatedToken] = useState<{ mintAddress: string; name: string; symbol: string; imageUrl?: string; poolId?: string } | null>(null);
  const [customError, setCustomError] = useState("");

  const { data: poolCost } = useQuery({
    queryKey: ["/api/liquidity-pool/cost"],
    queryFn: async () => {
      const res = await fetch("/api/liquidity-pool/cost");
      if (!res.ok) return { solCost: 0.35, breakdown: "~0.35 SOL for pool creation" };
      return res.json();
    },
    staleTime: 60000,
  });

  const saveLaunchMutation = useMutation({
    mutationFn: async (data: { name: string; symbol: string; mintAddress: string; decimals: number; totalSupply: string; creatorAddress: string; imageUrl?: string }) =>
      apiRequest("POST", "/api/token-launches", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/token-launches"] }),
  });

  // ---- Pump.fun handlers ----
  const handlePumpImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setPumpImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPumpImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const createPumpToken = async () => {
    if (!address || !keypair) {
      toast({ title: "Error", description: "Wallet not connected or locked", variant: "destructive" });
      return;
    }
    if (!pumpForm.name.trim() || !pumpForm.symbol.trim()) {
      toast({ title: "Error", description: "Name and symbol are required", variant: "destructive" });
      return;
    }
    if (!pumpImageFile) {
      toast({ title: "Error", description: "Please upload a token image", variant: "destructive" });
      return;
    }
    const devBuy = parseFloat(pumpForm.devBuySol) || 0;
    if (devBuy > 0 && balance < devBuy + 0.01) {
      toast({ title: "Insufficient Balance", description: `You need at least ${(devBuy + 0.01).toFixed(3)} SOL`, variant: "destructive" });
      return;
    }

    const authHeaders = await getAuthHeaders();

    try {
      // Step 1: Upload image + metadata to pump.fun IPFS
      setPumpStep("uploading");
      const arrayBuffer = await pumpImageFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const base64 = btoa(binary);

      const ipfsRes = await fetch("/api/launchpad/pump/upload-ipfs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({
          name: pumpForm.name,
          symbol: pumpForm.symbol.toUpperCase(),
          description: pumpForm.description,
          twitter: pumpForm.twitter || undefined,
          telegram: pumpForm.telegram || undefined,
          website: pumpForm.website || undefined,
          imageBase64: base64,
          imageMimeType: pumpImageFile.type,
          imageFileName: pumpImageFile.name,
        }),
      });

      if (!ipfsRes.ok) {
        const err = await ipfsRes.json().catch(() => ({ error: "IPFS upload failed" }));
        throw new Error(err.error || "Failed to upload metadata");
      }
      const { metadataUri } = await ipfsRes.json();

      // Step 2: Generate mint keypair client-side
      setPumpStep("building");
      const mintKeypair = Keypair.generate();
      const mintPublicKey = mintKeypair.publicKey.toBase58();

      const buildRes = await fetch("/api/launchpad/pump/build-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({
          creatorPublicKey: address,
          mintPublicKey,
          name: pumpForm.name,
          symbol: pumpForm.symbol.toUpperCase(),
          metadataUri,
          devBuySol: devBuy,
        }),
      });

      if (!buildRes.ok) {
        const err = await buildRes.json().catch(() => ({ error: "Transaction build failed" }));
        throw new Error(err.error || "Failed to build transaction");
      }
      const { transaction: txBase64 } = await buildRes.json();

      // Step 3: Deserialize and sign with wallet + mint keypair
      setPumpStep("signing");
      const txBytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      tx.sign([keypair, mintKeypair]);

      // Step 4: Submit
      setPumpStep("confirming");
      await sendTransactionViaServer(tx.serialize());

      // Save to DB (best-effort — token is already on-chain if this fails)
      try {
        await saveLaunchMutation.mutateAsync({
          name: pumpForm.name,
          symbol: pumpForm.symbol.toUpperCase(),
          mintAddress: mintPublicKey,
          decimals: 6,
          totalSupply: "1000000000",
          creatorAddress: address,
        });
      } catch (dbErr) {
        console.warn("[pump-launch] DB save failed (token is still live):", dbErr);
      }

      setPumpMintAddress(mintPublicKey);
      setPumpStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/token-balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] });

    } catch (err: any) {
      console.error("[pump-launch] Error:", err);
      setPumpError(err.message || "Failed to launch token");
      setPumpStep("error");
    }
  };

  // ---- Custom SPL handlers ----
  const handleCustomImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    reader.onload = (ev) => setCustomImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    const result = await uploadFile(file);
    if (result) {
      setCustomForm((p) => ({ ...p, imageUrl: result.objectPath }));
      toast({ title: "Success", description: "Image uploaded successfully" });
    }
  };

  const createCustomToken = async () => {
    if (!address || !keypair) {
      toast({ title: "Error", description: "Wallet not connected or locked", variant: "destructive" });
      return;
    }
    const liquidityCost = customForm.addLiquidity ? (poolCost?.solCost || 0.35) + parseFloat(customForm.liquiditySol || "0") : 0;
    const requiredSol = 0.05 + liquidityCost;
    if (balance < requiredSol) {
      toast({ title: "Insufficient Balance", description: `You need at least ${requiredSol.toFixed(2)} SOL`, variant: "destructive" });
      return;
    }
    if (!customForm.name.trim() || !customForm.symbol.trim()) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (!customForm.totalSupply || !/^\d+$/.test(customForm.totalSupply) || BigInt(customForm.totalSupply) <= 0) {
      toast({ title: "Error", description: "Please enter a valid total supply", variant: "destructive" });
      return;
    }
    if (customForm.addLiquidity) {
      const solAmount = parseFloat(customForm.liquiditySol || "0");
      const percentAmount = parseInt(customForm.liquidityPercent || "0");
      if (solAmount < 0.1) {
        toast({ title: "Error", description: "Minimum 0.1 SOL required for liquidity", variant: "destructive" });
        return;
      }
      if (percentAmount < 1 || percentAmount > 100) {
        toast({ title: "Error", description: "Supply percentage must be between 1-100%", variant: "destructive" });
        return;
      }
    }

    setCustomStep("creating");
    try {
      const authHeaders = await getAuthHeaders();
      const buildResponse = await fetch("/api/launchpad/build-create-mint-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ walletAddress: address, decimals: customForm.decimals, totalSupply: customForm.totalSupply }),
      });
      if (!buildResponse.ok) {
        const err = await buildResponse.json();
        throw new Error(err.error || "Failed to build transaction");
      }
      const { transaction: unsignedTxBase64, mintAddress, blockhash, lastValidBlockHeight } = await buildResponse.json();
      const txBuffer = Buffer.from(unsignedTxBase64, "base64");
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(keypair);
      const signedTxBase64 = transaction.serialize().toString("base64");

      const sendResponse = await fetch("/api/launchpad/send-signed-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ signedTransaction: signedTxBase64, blockhash, lastValidBlockHeight }),
      });
      if (!sendResponse.ok) {
        const err = await sendResponse.json();
        throw new Error(err.error || "Failed to send transaction");
      }
      const sendResult = await sendResponse.json();
      if (!sendResult.confirmed) throw new Error("Transaction was not confirmed");

      await saveLaunchMutation.mutateAsync({
        name: customForm.name,
        symbol: customForm.symbol.toUpperCase(),
        mintAddress,
        decimals: customForm.decimals,
        totalSupply: customForm.totalSupply,
        creatorAddress: address,
        imageUrl: customForm.imageUrl || undefined,
      });

      const tokenInfo = { mintAddress, name: customForm.name, symbol: customForm.symbol.toUpperCase(), imageUrl: customForm.imageUrl || undefined, poolId: undefined as string | undefined };

      if (customForm.addLiquidity) {
        setCustomStep("addingLiquidity");
        setPoolStatus("building");
        try {
          const tokenAmountForPool = Math.floor(Number(customForm.totalSupply) * (Number(customForm.liquidityPercent) / 100));
          const poolResult = await apiRequest("POST", "/api/liquidity-pool/build", {
            tokenMint: mintAddress, tokenDecimals: customForm.decimals,
            tokenAmount: tokenAmountForPool.toString(), solAmount: customForm.liquiditySol, creatorAddress: address,
          });
          if (poolResult.success && poolResult.transaction) {
            setPoolStatus("signing");
            const base64Tx = poolResult.transaction as string;
            const normalizedB64 = base64Tx.replace(/-/g, "+").replace(/_/g, "/");
            const paddedB64 = normalizedB64.padEnd(normalizedB64.length + (4 - normalizedB64.length % 4) % 4, "=");
            const txBytes = Uint8Array.from(atob(paddedB64), (c) => c.charCodeAt(0));
            const poolTx = VersionedTransaction.deserialize(txBytes);
            poolTx.sign([keypair]);
            setPoolStatus("confirming");
            const sig = await sendTransactionViaServer(poolTx.serialize());
            tokenInfo.poolId = poolResult.poolId || sig;
            setPoolStatus("success");
            toast({ title: "Success", description: "Liquidity pool created on Raydium!" });
          } else {
            setPoolStatus("error");
            setPoolError(poolResult.message || "Pool creation is currently unavailable");
          }
        } catch (poolErr: any) {
          setPoolStatus("error");
          setPoolError(poolErr.message || "Pool creation failed");
          toast({ title: "Token Created", description: "Token launched! Add liquidity later on raydium.io" });
        }
      }

      setCreatedToken(tokenInfo);
      setCustomStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/token-balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] });
    } catch (error: unknown) {
      console.error("Token creation failed:", error);
      setCustomError(error instanceof Error ? error.message : "Failed to create token");
      setCustomStep("error");
    }
  };

  const handleClose = () => {
    setMode("pump");
    setPumpStep("form");
    setPumpForm({ name: "", symbol: "", description: "", twitter: "", telegram: "", website: "", devBuySol: "0" });
    setPumpImageFile(null);
    setPumpImagePreview(null);
    setPumpMintAddress("");
    setPumpError("");
    setShowSocials(false);
    setCustomStep("form");
    setCustomForm({ name: "", symbol: "", decimals: 9, totalSupply: "1000000", imageUrl: "", addLiquidity: false, liquiditySol: "1", liquidityPercent: "50" });
    setCreatedToken(null);
    setCustomError("");
    setCustomImagePreview(null);
    setPoolStatus("idle");
    setPoolError("");
    onClose();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Address copied to clipboard" });
  };

  if (!isOpen) return null;

  const pumpStepLabel: Record<PumpStep, string> = {
    form: "",
    uploading: "Uploading metadata to IPFS...",
    building: "Building transaction...",
    signing: "Signing...",
    confirming: "Submitting to Solana...",
    success: "",
    error: "",
  };

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
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Token Launchpad</h2>
                <p className="text-xs text-muted-foreground">Launch your token on Solana</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-muted transition-colors" data-testid="button-close-launchpad">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Mode tabs */}
          {(pumpStep === "form" || customStep === "form") && (
            <div className="flex bg-muted rounded-xl p-1 mb-5">
              <button
                onClick={() => setMode("pump")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${mode === "pump" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                data-testid="tab-pump-mode"
              >
                🚀 Pump.fun
              </button>
              <button
                onClick={() => setMode("custom")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${mode === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                data-testid="tab-custom-mode"
              >
                ⚙️ Custom SPL
              </button>
            </div>
          )}

          {/* ============ PUMP.FUN MODE ============ */}
          {mode === "pump" && (
            <>
              {pumpStep === "form" && (
                <div className="space-y-4">
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Launches directly on <span className="text-purple-400 font-medium">pump.fun</span> with a bonding curve. Instantly tradeable. Graduates to Raydium at ~$69K market cap.
                    </p>
                  </div>

                  {/* Image upload */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Token Image <span className="text-red-400">*</span></Label>
                    <input type="file" ref={fileInputRef} accept="image/*" onChange={handlePumpImageSelect} className="hidden" data-testid="input-pump-image" />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-28 bg-muted border border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
                      data-testid="button-upload-pump-image"
                    >
                      {pumpImagePreview ? (
                        <img src={pumpImagePreview} alt="Token" className="w-20 h-20 object-cover rounded-lg" />
                      ) : (
                        <>
                          <ImageIcon className="w-7 h-7 text-muted-foreground mb-1.5" />
                          <span className="text-sm text-muted-foreground">Click to upload image</span>
                          <span className="text-xs text-muted-foreground/60">PNG, JPG up to 5MB</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Name + Symbol */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm text-muted-foreground">Name <span className="text-red-400">*</span></Label>
                      <Input
                        placeholder="My Token"
                        value={pumpForm.name}
                        onChange={(e) => setPumpForm((p) => ({ ...p, name: e.target.value }))}
                        className="bg-muted border-border"
                        data-testid="input-pump-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-muted-foreground">Ticker <span className="text-red-400">*</span></Label>
                      <Input
                        placeholder="MYTKN"
                        value={pumpForm.symbol}
                        onChange={(e) => setPumpForm((p) => ({ ...p, symbol: e.target.value.toUpperCase().slice(0, 10) }))}
                        className="bg-muted border-border uppercase"
                        data-testid="input-pump-symbol"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Description</Label>
                    <textarea
                      placeholder="Tell people about your token..."
                      value={pumpForm.description}
                      onChange={(e) => setPumpForm((p) => ({ ...p, description: e.target.value.slice(0, 500) }))}
                      rows={2}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="input-pump-description"
                    />
                  </div>

                  {/* Socials toggle */}
                  <button
                    onClick={() => setShowSocials((s) => !s)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSocials ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Social links (optional)
                  </button>

                  {showSocials && (
                    <div className="space-y-2">
                      <Input placeholder="https://twitter.com/..." value={pumpForm.twitter} onChange={(e) => setPumpForm((p) => ({ ...p, twitter: e.target.value }))} className="bg-muted border-border text-sm" data-testid="input-pump-twitter" />
                      <Input placeholder="https://t.me/..." value={pumpForm.telegram} onChange={(e) => setPumpForm((p) => ({ ...p, telegram: e.target.value }))} className="bg-muted border-border text-sm" data-testid="input-pump-telegram" />
                      <Input placeholder="https://yoursite.com" value={pumpForm.website} onChange={(e) => setPumpForm((p) => ({ ...p, website: e.target.value }))} className="bg-muted border-border text-sm" data-testid="input-pump-website" />
                    </div>
                  )}

                  {/* Cost */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-muted-foreground">Estimated cost</span>
                    <span className="text-sm font-bold text-foreground">~0.002 SOL</span>
                  </div>

                  <Button
                    onClick={createPumpToken}
                    disabled={isBetaLocked || !pumpForm.name || !pumpForm.symbol || !pumpImageFile}
                    className="w-full py-6 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                    data-testid="button-launch-pump-token"
                  >
                    {isBetaLocked ? (
                      <><Lock className="w-5 h-5 mr-2" />Beta Locked</>
                    ) : (
                      <><Rocket className="w-5 h-5 mr-2" />Launch on Pump.fun</>
                    )}
                  </Button>
                </div>
              )}

              {/* Pump loading states */}
              {["uploading", "building", "signing", "confirming"].includes(pumpStep) && (
                <div className="py-14 text-center space-y-4">
                  <div className="relative mx-auto w-16 h-16">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Rocket className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Launching your token...</p>
                    <p className="text-sm text-muted-foreground mt-1">{pumpStepLabel[pumpStep]}</p>
                  </div>
                  <div className="flex justify-center gap-2 pt-2">
                    {(["uploading", "building", "signing", "confirming"] as PumpStep[]).map((s, i) => (
                      <div
                        key={s}
                        className={`h-1.5 rounded-full transition-all ${
                          ["uploading", "building", "signing", "confirming"].indexOf(pumpStep) >= i
                            ? "w-8 bg-purple-500"
                            : "w-3 bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Pump success */}
              {pumpStep === "success" && (
                <div className="py-8 text-center space-y-5">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-9 h-9 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">Token Launched! 🎉</p>
                    <p className="text-sm text-muted-foreground mt-1">Your token is live on pump.fun</p>
                  </div>
                  <div className="bg-muted rounded-xl p-4 space-y-2 text-left">
                    <p className="text-xs text-muted-foreground">Mint Address</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono text-foreground truncate flex-1">{pumpMintAddress}</p>
                      <button onClick={() => copyToClipboard(pumpMintAddress)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <a
                    href={`https://pump.fun/${pumpMintAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 transition-all"
                    data-testid="link-view-on-pumpfun"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Pump.fun
                  </a>
                  <Button variant="outline" onClick={handleClose} className="w-full">Done</Button>
                </div>
              )}

              {/* Pump error */}
              {pumpStep === "error" && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-9 h-9 text-red-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Launch Failed</p>
                    <p className="text-sm text-muted-foreground mt-1 px-4">{pumpError}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setPumpStep("form")} className="flex-1">Try Again</Button>
                    <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ============ CUSTOM SPL MODE ============ */}
          {mode === "custom" && (
            <>
              {customStep === "form" && (
                <div className="space-y-5">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Create a <span className="text-amber-400 font-medium">custom SPL token</span> with your own supply and decimals. Optionally add a Raydium liquidity pool.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Token Image</Label>
                    <input type="file" ref={customFileInputRef} accept="image/*" onChange={handleCustomImageSelect} className="hidden" data-testid="input-token-image" />
                    <div
                      onClick={() => customFileInputRef.current?.click()}
                      className="w-full h-28 bg-muted border border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
                      data-testid="button-upload-image"
                    >
                      {isUploading ? (
                        <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
                      ) : customImagePreview ? (
                        <img src={customImagePreview} alt="Token" className="w-20 h-20 object-cover rounded-lg" />
                      ) : (
                        <>
                          <ImageIcon className="w-7 h-7 text-muted-foreground mb-1.5" />
                          <span className="text-sm text-muted-foreground">Click to upload image</span>
                          <span className="text-xs text-muted-foreground/60">PNG, JPG up to 5MB</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Token Name</Label>
                    <Input placeholder="e.g., My Awesome Token" value={customForm.name} onChange={(e) => setCustomForm((p) => ({ ...p, name: e.target.value }))} className="bg-muted border-border" data-testid="input-token-name" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Token Symbol</Label>
                    <Input placeholder="e.g., MAT" value={customForm.symbol} onChange={(e) => setCustomForm((p) => ({ ...p, symbol: e.target.value.toUpperCase().slice(0, 10) }))} className="bg-muted border-border uppercase" data-testid="input-token-symbol" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Decimals</Label>
                      <Input type="number" min="0" max="9" value={customForm.decimals} onChange={(e) => setCustomForm((p) => ({ ...p, decimals: parseInt(e.target.value) || 0 }))} className="bg-muted border-border" data-testid="input-token-decimals" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Total Supply</Label>
                      <Input type="text" placeholder="1000000" value={customForm.totalSupply} onChange={(e) => setCustomForm((p) => ({ ...p, totalSupply: e.target.value.replace(/[^0-9]/g, "") }))} className="bg-muted border-border" data-testid="input-token-supply" />
                    </div>
                  </div>

                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">Add Initial Liquidity</span>
                      </div>
                      <Switch checked={customForm.addLiquidity} onCheckedChange={(c) => setCustomForm((p) => ({ ...p, addLiquidity: c }))} data-testid="toggle-add-liquidity" />
                    </div>
                    {customForm.addLiquidity ? (
                      <div className="space-y-3 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">Create a Raydium CPMM pool so others can trade your token</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">SOL Amount</Label>
                            <Input type="text" value={customForm.liquiditySol} onChange={(e) => setCustomForm((p) => ({ ...p, liquiditySol: e.target.value.replace(/[^0-9.]/g, "") }))} className="bg-background border-border" placeholder="1" data-testid="input-liquidity-sol" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">% of Supply</Label>
                            <Input type="text" value={customForm.liquidityPercent} onChange={(e) => setCustomForm((p) => ({ ...p, liquidityPercent: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) }))} className="bg-background border-border" placeholder="50" data-testid="input-liquidity-percent" />
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <p>Pool: {Math.floor(Number(customForm.totalSupply) * (Number(customForm.liquidityPercent) / 100)).toLocaleString()} {customForm.symbol || "tokens"} + {customForm.liquiditySol || "0"} SOL</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="w-3 h-3" /> Enable to create a Raydium trading pool
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-muted-foreground">Estimated cost</span>
                    <span className="text-sm font-bold text-foreground">
                      ~{customForm.addLiquidity ? (0.05 + (poolCost?.solCost || 0.35) + parseFloat(customForm.liquiditySol || "0")).toFixed(2) : "0.05"} SOL
                    </span>
                  </div>

                  <Button
                    onClick={createCustomToken}
                    disabled={isBetaLocked}
                    className="w-full py-6 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    data-testid="button-launch-token"
                  >
                    {isBetaLocked ? (
                      <><Lock className="w-5 h-5 mr-2" />Beta Locked</>
                    ) : (
                      <><Coins className="w-5 h-5 mr-2" />Create Token</>
                    )}
                  </Button>
                </div>
              )}

              {customStep === "creating" && (
                <div className="py-14 text-center space-y-4">
                  <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-foreground">Creating your token...</p>
                    <p className="text-sm text-muted-foreground">This may take a moment</p>
                  </div>
                </div>
              )}

              {customStep === "addingLiquidity" && (
                <div className="py-14 text-center space-y-4">
                  <Droplets className="w-12 h-12 text-blue-400 mx-auto animate-pulse" />
                  <div>
                    <p className="text-lg font-medium text-foreground">Adding Liquidity Pool...</p>
                    <p className="text-sm text-muted-foreground">
                      {poolStatus === "building" && "Building pool transaction..."}
                      {poolStatus === "signing" && "Please sign the transaction..."}
                      {poolStatus === "confirming" && "Confirming on-chain..."}
                    </p>
                  </div>
                </div>
              )}

              {customStep === "success" && createdToken && (
                <div className="py-8 text-center space-y-5">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-9 h-9 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">Token Created! 🎉</p>
                    <p className="text-sm text-muted-foreground">{createdToken.name} ({createdToken.symbol})</p>
                  </div>
                  {poolStatus === "error" && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <p className="text-xs text-amber-400">Token created, but pool creation failed: {poolError}</p>
                      <p className="text-xs text-muted-foreground mt-1">Add liquidity manually on raydium.io</p>
                    </div>
                  )}
                  <div className="bg-muted rounded-xl p-4 text-left space-y-2">
                    <p className="text-xs text-muted-foreground">Mint Address</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono text-foreground truncate flex-1">{createdToken.mintAddress}</p>
                      <button onClick={() => copyToClipboard(createdToken.mintAddress)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <a
                    href={`https://solscan.io/token/${createdToken.mintAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                    data-testid="link-view-on-solscan"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Solscan
                  </a>
                  <Button variant="outline" onClick={handleClose} className="w-full">Done</Button>
                </div>
              )}

              {customStep === "error" && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-9 h-9 text-red-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Creation Failed</p>
                    <p className="text-sm text-muted-foreground mt-1 px-4">{customError}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setCustomStep("form")} className="flex-1">Try Again</Button>
                    <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
