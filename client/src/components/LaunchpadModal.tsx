import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Rocket, Loader2, CheckCircle, AlertCircle, Coins, ImageIcon, Info, Droplets, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { sendTransactionViaServer, confirmTransactionViaServer } from "@/lib/solana";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { LAMPORTS_PER_SOL, VersionedTransaction, Transaction } from "@solana/web3.js";
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
  addLiquidity: boolean;
  liquiditySol: string;
  liquidityPercent: string;
}

export function LaunchpadModal({ isOpen, onClose }: LaunchpadModalProps) {
  const { address, balance, keypair } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [poolStatus, setPoolStatus] = useState<"idle" | "building" | "signing" | "confirming" | "success" | "error">("idle");
  const [poolError, setPoolError] = useState("");
  
  const [formData, setFormData] = useState<TokenFormData>({
    name: "",
    symbol: "",
    decimals: 9,
    totalSupply: "1000000",
    imageUrl: "",
    addLiquidity: false,
    liquiditySol: "1",
    liquidityPercent: "50",
  });
  const [step, setStep] = useState<"form" | "creating" | "addingLiquidity" | "success" | "error">("form");
  const [createdToken, setCreatedToken] = useState<{ mintAddress: string; name: string; symbol: string; imageUrl?: string; poolId?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  
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

  const handleInputChange = (field: keyof TokenFormData, value: string | number | boolean) => {
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
    if (!address || !keypair) {
      toast({ title: "Error", description: "Wallet not connected or locked", variant: "destructive" });
      return;
    }

    const liquidityCost = formData.addLiquidity 
      ? (poolCost?.solCost || 0.35) + parseFloat(formData.liquiditySol || "0")
      : 0;
    const requiredSol = 0.05 + liquidityCost;
    
    // balance from useWallet is already in SOL, not lamports
    if (balance < requiredSol) {
      toast({ 
        title: "Insufficient Balance", 
        description: `You need at least ${requiredSol.toFixed(2)} SOL. Current: ${balance.toFixed(4)} SOL.`, 
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

    if (formData.addLiquidity) {
      const solAmount = parseFloat(formData.liquiditySol || "0");
      const percentAmount = parseInt(formData.liquidityPercent || "0");
      if (solAmount < 0.1) {
        toast({ title: "Error", description: "Minimum 0.1 SOL required for liquidity", variant: "destructive" });
        return;
      }
      if (percentAmount < 1 || percentAmount > 100) {
        toast({ title: "Error", description: "Supply percentage must be between 1-100%", variant: "destructive" });
        return;
      }
    }

    setStep("creating");

    try {
      const authHeaders = await getAuthHeaders();
      
      // Step 1: Build unsigned transaction on server
      const buildResponse = await fetch("/api/launchpad/build-create-mint-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({
          walletAddress: address,
          decimals: formData.decimals,
          totalSupply: formData.totalSupply,
        }),
      });
      
      if (!buildResponse.ok) {
        const err = await buildResponse.json();
        throw new Error(err.error || "Failed to build transaction");
      }
      
      const buildResult = await buildResponse.json();
      const { transaction: unsignedTxBase64, mintAddress, blockhash, lastValidBlockHeight } = buildResult;
      
      // Step 2: Deserialize and sign locally (non-custodial)
      const txBuffer = Buffer.from(unsignedTxBase64, "base64");
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(keypair);
      
      // Step 3: Send signed transaction to server for broadcast + confirmation
      const signedTxBase64 = transaction.serialize().toString("base64");
      
      const sendResponse = await fetch("/api/launchpad/send-signed-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({
          signedTransaction: signedTxBase64,
          blockhash,
          lastValidBlockHeight,
        }),
      });
      
      if (!sendResponse.ok) {
        const err = await sendResponse.json();
        throw new Error(err.error || "Failed to send transaction");
      }
      
      const sendResult = await sendResponse.json();
      if (!sendResult.confirmed) {
        throw new Error("Transaction was not confirmed");
      }

      await saveLaunchMutation.mutateAsync({
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        mintAddress: mintAddress,
        decimals: formData.decimals,
        totalSupply: formData.totalSupply,
        creatorAddress: address,
        imageUrl: formData.imageUrl || undefined,
      });

      const tokenInfo = {
        mintAddress: mintAddress,
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        imageUrl: formData.imageUrl || undefined,
        poolId: undefined as string | undefined,
      };

      if (formData.addLiquidity) {
        setStep("addingLiquidity");
        setPoolStatus("building");
        
        try {
          const tokenAmountForPool = Math.floor(Number(formData.totalSupply) * (Number(formData.liquidityPercent) / 100));
          
          const poolResult = await apiRequest("POST", "/api/liquidity-pool/build", {
            tokenMint: mintAddress,
            tokenDecimals: formData.decimals,
            tokenAmount: tokenAmountForPool.toString(),
            solAmount: formData.liquiditySol,
            creatorAddress: address,
          });

          if (poolResult.success && poolResult.transaction) {
            setPoolStatus("signing");
            
            let transaction: VersionedTransaction;
            try {
              const base64Tx = poolResult.transaction as string;
              const normalizedB64 = base64Tx.replace(/-/g, "+").replace(/_/g, "/");
              const paddedB64 = normalizedB64.padEnd(normalizedB64.length + (4 - normalizedB64.length % 4) % 4, "=");
              const txBytes = Uint8Array.from(atob(paddedB64), c => c.charCodeAt(0));
              transaction = VersionedTransaction.deserialize(txBytes);
            } catch (decodeError: any) {
              console.error("Failed to decode pool transaction:", decodeError);
              throw new Error("Invalid transaction data from Raydium API");
            }
            
            transaction.sign([keypair]);
            
            setPoolStatus("confirming");
            
            // Send through server endpoint (uses Helius RPC for reliability)
            const signature = await sendTransactionViaServer(transaction.serialize());
            
            // Wait for confirmation via server (uses Helius for reliable polling)
            await confirmTransactionViaServer(signature);
            
            tokenInfo.poolId = poolResult.poolId || signature;
            setPoolStatus("success");
            toast({ title: "Success", description: "Liquidity pool created on Raydium!" });
          } else {
            setPoolStatus("error");
            setPoolError(poolResult.message || "Pool creation is currently unavailable");
            toast({ 
              title: "Pool Creation Note", 
              description: poolResult.message || "Token created! Create pool manually on raydium.io",
            });
          }
        } catch (poolError: any) {
          console.error("Pool creation failed:", poolError);
          setPoolStatus("error");
          setPoolError(poolError.message || "Pool creation failed");
          toast({ 
            title: "Token Created", 
            description: "Token launched successfully! You can add liquidity later on raydium.io",
          });
        }
      }

      setCreatedToken(tokenInfo);
      setStep("success");
      
      queryClient.invalidateQueries({ queryKey: ["/api/token-balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-tokens", address] });
      
    } catch (error: unknown) {
      console.error("Token creation failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to create token");
      setStep("error");
    }
  };

  const handleClose = () => {
    setStep("form");
    setFormData({ name: "", symbol: "", decimals: 9, totalSupply: "1000000", imageUrl: "", addLiquidity: false, liquiditySol: "1", liquidityPercent: "50" });
    setCreatedToken(null);
    setErrorMessage("");
    setImagePreview(null);
    setPoolStatus("idle");
    setPoolError("");
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

              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">Add Initial Liquidity</span>
                  </div>
                  <Switch
                    checked={formData.addLiquidity}
                    onCheckedChange={(checked) => handleInputChange("addLiquidity", checked)}
                    data-testid="toggle-add-liquidity"
                  />
                </div>
                
                {formData.addLiquidity ? (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Create a Raydium CPMM pool so others can trade your token
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">SOL Amount</Label>
                        <Input
                          type="text"
                          value={formData.liquiditySol}
                          onChange={(e) => handleInputChange("liquiditySol", e.target.value.replace(/[^0-9.]/g, ""))}
                          className="bg-background border-border text-foreground"
                          placeholder="1"
                          data-testid="input-liquidity-sol"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">% of Supply</Label>
                        <Input
                          type="text"
                          value={formData.liquidityPercent}
                          onChange={(e) => handleInputChange("liquidityPercent", e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                          className="bg-background border-border text-foreground"
                          placeholder="50"
                          data-testid="input-liquidity-percent"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      <p>Pool will be created on Raydium with:</p>
                      <p className="font-mono mt-1">
                        {Math.floor(Number(formData.totalSupply) * (Number(formData.liquidityPercent) / 100)).toLocaleString()} {formData.symbol || "tokens"} + {formData.liquiditySol || "0"} SOL
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Enable to create a Raydium trading pool after token creation
                  </p>
                )}
              </div>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <p className="text-xs text-muted-foreground">Estimated Cost</p>
                <p className="text-lg font-bold text-foreground">
                  ~{formData.addLiquidity 
                    ? (0.05 + (poolCost?.solCost || 0.35) + parseFloat(formData.liquiditySol || "0")).toFixed(2) 
                    : "0.05"} SOL
                </p>
                <p className="text-xs text-muted-foreground">
                  {formData.addLiquidity 
                    ? `Token creation (0.05) + Pool fee (~${(poolCost?.solCost || 0.35).toFixed(2)}) + Liquidity (${formData.liquiditySol || "0"})`
                    : "Covers account rent and transaction fees"}
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

          {step === "addingLiquidity" && (
            <div className="py-12 text-center space-y-4">
              <Droplets className="w-12 h-12 text-blue-400 mx-auto animate-pulse" />
              <div>
                <p className="text-lg font-medium text-foreground">Adding Liquidity Pool...</p>
                <p className="text-sm text-muted-foreground">
                  {poolStatus === "building" && "Building pool transaction..."}
                  {poolStatus === "signing" && "Please sign the transaction..."}
                  {poolStatus === "confirming" && "Confirming on Solana..."}
                </p>
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

              {poolStatus === "error" && poolError && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs text-amber-500">
                    Pool creation unavailable: {poolError}
                  </p>
                  <a 
                    href="https://raydium.io/liquidity/create-pool/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary flex items-center justify-center gap-1 mt-2"
                  >
                    Create pool manually on Raydium <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

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
