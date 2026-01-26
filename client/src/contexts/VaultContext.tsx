import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import bs58 from "bs58";
import {
  hasLocalVault,
  hasLegacyPlaintextWallets,
  getLegacyWalletData,
  clearLegacyPlaintextData,
  createLocalVault,
  unlockVault,
  updateVaultData,
  deleteLocalVault,
  getActiveWalletId,
  setActiveWalletId,
  clearActiveWalletId,
} from "@/lib/localVault";

export interface StoredWallet {
  id: string;
  name: string;
  mnemonic: string;
  publicKey: string;
  createdAt: number;
}

export type VaultStatus = 
  | "loading"
  | "no_vault"
  | "needs_migration"
  | "locked"
  | "unlocked";

interface WalletSetupData {
  type: "create" | "import" | "restore";
  mnemonic?: string;
  privateKey?: string;
  backupData?: string;
}

interface VaultContextValue {
  status: VaultStatus;
  wallets: StoredWallet[];
  activeWallet: StoredWallet | null;
  keypair: Keypair | null;
  error: string | null;
  pin: string | null;
  setupVault: (pin: string) => Promise<void>;
  setupWithWalletData: (pin: string, walletData: WalletSetupData) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  resetVault: () => void;
  addWallet: (name: string) => Promise<StoredWallet>;
  importWallet: (mnemonic: string, name: string) => Promise<StoredWallet | null>;
  importFromPrivateKey: (privateKey: string, name: string) => Promise<StoredWallet | null>;
  switchWallet: (id: string) => Promise<void>;
  removeWallet: (id: string) => Promise<boolean>;
  renameWallet: (id: string, newName: string) => Promise<boolean>;
  isUnlocking: boolean;
  isSettingUp: boolean;
}

const VaultContext = createContext<VaultContextValue | null>(null);

async function keypairFromMnemonic(mnemonic: string): Promise<Keypair> {
  const seed = await bip39.mnemonicToSeed(mnemonic.trim().toLowerCase());
  return Keypair.fromSeed(seed.slice(0, 32));
}

function generateMnemonic(): string {
  return bip39.generateMnemonic(128);
}

function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<StoredWallet | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const updateKeypairForWallet = useCallback(async (wallet: StoredWallet) => {
    try {
      if (wallet.mnemonic.startsWith("pk:")) {
        const privateKey = wallet.mnemonic.slice(3);
        const secretKey = bs58.decode(privateKey);
        setKeypair(Keypair.fromSecretKey(secretKey));
      } else {
        const kp = await keypairFromMnemonic(wallet.mnemonic);
        setKeypair(kp);
      }
    } catch (e) {
      console.error("Failed to derive keypair:", e);
      setKeypair(null);
    }
  }, []);

  const persistWallets = useCallback(async (newWallets: StoredWallet[], currentPin: string) => {
    const data = JSON.stringify(newWallets);
    await updateVaultData(data, currentPin);
    setWallets(newWallets);
  }, []);

  useEffect(() => {
    const initVault = () => {
      if (hasLocalVault()) {
        setStatus("locked");
        return;
      }

      if (hasLegacyPlaintextWallets()) {
        setStatus("needs_migration");
        return;
      }

      setStatus("no_vault");
    };

    initVault();
  }, []);

  const setupVault = useCallback(async (newPin: string) => {
    setIsSettingUp(true);
    setError(null);
    try {
      let walletData = getLegacyWalletData();
      let parsedWallets: StoredWallet[] = [];
      
      if (walletData) {
        try {
          parsedWallets = JSON.parse(walletData);
        } catch {
          parsedWallets = [];
        }
        
        const validWallets: StoredWallet[] = [];
        for (const wallet of parsedWallets) {
          if (!wallet.mnemonic) continue;
          
          if (wallet.mnemonic.startsWith("pk:")) {
            try {
              const privateKey = wallet.mnemonic.slice(3);
              const secretKey = bs58.decode(privateKey);
              if (secretKey.length === 64) {
                wallet.publicKey = Keypair.fromSecretKey(secretKey).publicKey.toString();
                validWallets.push(wallet);
              }
            } catch {
              continue;
            }
          } else if (validateMnemonic(wallet.mnemonic)) {
            const kp = await keypairFromMnemonic(wallet.mnemonic);
            wallet.publicKey = kp.publicKey.toString();
            validWallets.push(wallet);
          }
        }
        parsedWallets = validWallets;
        walletData = JSON.stringify(parsedWallets);
      }
      
      if (!walletData || parsedWallets.length === 0) {
        const mnemonic = generateMnemonic();
        const kp = await keypairFromMnemonic(mnemonic);
        parsedWallets = [{
          id: crypto.randomUUID(),
          name: "Main Wallet",
          mnemonic,
          publicKey: kp.publicKey.toString(),
          createdAt: Date.now(),
        }];
        walletData = JSON.stringify(parsedWallets);
      }
      
      await createLocalVault(walletData, newPin);
      clearLegacyPlaintextData();
      
      setWallets(parsedWallets);
      setPin(newPin);
      
      const active = parsedWallets[0];
      setActiveWallet(active);
      setActiveWalletId(active.id);
      await updateKeypairForWallet(active);
      
      setStatus("unlocked");
    } catch (err: any) {
      setError(err.message || "Failed to set up vault");
      throw err;
    } finally {
      setIsSettingUp(false);
    }
  }, [updateKeypairForWallet]);

  const unlock = useCallback(async (enteredPin: string) => {
    setIsUnlocking(true);
    setError(null);
    try {
      const data = await unlockVault(enteredPin);
      let parsed: StoredWallet[];
      try {
        parsed = JSON.parse(data) as StoredWallet[];
        if (!Array.isArray(parsed)) {
          throw new Error("Invalid vault data format");
        }
      } catch {
        setError("Vault data is corrupted. Please reset and restore from backup.");
        throw new Error("CORRUPTED_VAULT");
      }
      setWallets(parsed);
      setPin(enteredPin);
      
      const activeId = getActiveWalletId();
      const active = parsed.find(w => w.id === activeId) || parsed[0];
      if (active) {
        setActiveWallet(active);
        setActiveWalletId(active.id);
        await updateKeypairForWallet(active);
      }
      
      setStatus("unlocked");
    } catch (err: any) {
      if (err.message === "WRONG_PIN") {
        setError("Incorrect PIN. Please try again.");
      } else if (err.message === "NO_VAULT") {
        setError("No vault found. Please set up your wallet.");
        setStatus("no_vault");
      } else {
        setError(err.message || "Failed to unlock vault");
      }
      throw err;
    } finally {
      setIsUnlocking(false);
    }
  }, [updateKeypairForWallet]);

  const setupWithWalletData = useCallback(async (newPin: string, walletData: WalletSetupData) => {
    setIsSettingUp(true);
    setError(null);
    try {
      let parsedWallets: StoredWallet[] = [];
      
      if (walletData.type === "create") {
        const mnemonic = generateMnemonic();
        const kp = await keypairFromMnemonic(mnemonic);
        parsedWallets = [{
          id: crypto.randomUUID(),
          name: "Main Wallet",
          mnemonic,
          publicKey: kp.publicKey.toString(),
          createdAt: Date.now(),
        }];
      } else if (walletData.type === "import") {
        if (walletData.mnemonic) {
          const normalizedMnemonic = walletData.mnemonic.trim().toLowerCase();
          if (!validateMnemonic(normalizedMnemonic)) {
            throw new Error("Invalid seed phrase");
          }
          const kp = await keypairFromMnemonic(normalizedMnemonic);
          parsedWallets = [{
            id: crypto.randomUUID(),
            name: "Imported Wallet",
            mnemonic: normalizedMnemonic,
            publicKey: kp.publicKey.toString(),
            createdAt: Date.now(),
          }];
        } else if (walletData.privateKey) {
          const secretKey = bs58.decode(walletData.privateKey.trim());
          if (secretKey.length !== 64) {
            throw new Error("Invalid private key");
          }
          const kp = Keypair.fromSecretKey(secretKey);
          parsedWallets = [{
            id: crypto.randomUUID(),
            name: "Imported Wallet",
            mnemonic: `pk:${walletData.privateKey.trim()}`,
            publicKey: kp.publicKey.toString(),
            createdAt: Date.now(),
          }];
        } else {
          throw new Error("No seed phrase or private key provided");
        }
      } else if (walletData.type === "restore") {
        if (!walletData.backupData) {
          throw new Error("No backup data provided");
        }
        try {
          const rawWallets = JSON.parse(walletData.backupData) as StoredWallet[];
          if (!Array.isArray(rawWallets) || rawWallets.length === 0) {
            throw new Error("Invalid backup format");
          }
          
          const validatedWallets: StoredWallet[] = [];
          for (const wallet of rawWallets) {
            if (!wallet.mnemonic || !wallet.id || !wallet.name) {
              throw new Error("Invalid wallet data in backup");
            }
            
            if (wallet.mnemonic.startsWith("pk:")) {
              const privateKey = wallet.mnemonic.slice(3);
              const secretKey = bs58.decode(privateKey);
              if (secretKey.length !== 64) {
                throw new Error(`Invalid private key in wallet: ${wallet.name}`);
              }
              const kp = Keypair.fromSecretKey(secretKey);
              validatedWallets.push({
                ...wallet,
                publicKey: kp.publicKey.toString(),
              });
            } else if (validateMnemonic(wallet.mnemonic)) {
              const kp = await keypairFromMnemonic(wallet.mnemonic);
              validatedWallets.push({
                ...wallet,
                publicKey: kp.publicKey.toString(),
              });
            } else {
              throw new Error(`Invalid mnemonic in wallet: ${wallet.name}`);
            }
          }
          parsedWallets = validatedWallets;
        } catch (e: any) {
          throw new Error(e.message || "Failed to parse backup data");
        }
      }
      
      const walletDataStr = JSON.stringify(parsedWallets);
      await createLocalVault(walletDataStr, newPin);
      clearLegacyPlaintextData();
      
      setWallets(parsedWallets);
      setPin(newPin);
      
      const active = parsedWallets[0];
      setActiveWallet(active);
      setActiveWalletId(active.id);
      await updateKeypairForWallet(active);
      
      setStatus("unlocked");
    } catch (err: any) {
      setError(err.message || "Failed to set up wallet");
      throw err;
    } finally {
      setIsSettingUp(false);
    }
  }, [updateKeypairForWallet]);

  const lock = useCallback(() => {
    clearActiveWalletId();
    setWallets([]);
    setActiveWallet(null);
    setKeypair(null);
    setPin(null);
    setStatus("locked");
    setError(null);
  }, []);

  const resetVault = useCallback(() => {
    deleteLocalVault();
    clearLegacyPlaintextData();
    setWallets([]);
    setActiveWallet(null);
    setKeypair(null);
    setPin(null);
    setStatus("no_vault");
    setError(null);
  }, []);

  const addWallet = useCallback(async (name: string): Promise<StoredWallet> => {
    if (!pin) throw new Error("Vault is locked");
    
    const mnemonic = generateMnemonic();
    const kp = await keypairFromMnemonic(mnemonic);
    const newWallet: StoredWallet = {
      id: crypto.randomUUID(),
      name,
      mnemonic,
      publicKey: kp.publicKey.toString(),
      createdAt: Date.now(),
    };
    
    const updated = [...wallets, newWallet];
    await persistWallets(updated, pin);
    
    setActiveWallet(newWallet);
    setActiveWalletId(newWallet.id);
    setKeypair(kp);
    
    return newWallet;
  }, [wallets, pin, persistWallets]);

  const importWallet = useCallback(async (mnemonic: string, name: string): Promise<StoredWallet | null> => {
    if (!pin) throw new Error("Vault is locked");
    if (!validateMnemonic(mnemonic)) return null;
    
    const normalizedMnemonic = mnemonic.trim().toLowerCase();
    const kp = await keypairFromMnemonic(normalizedMnemonic);
    const publicKeyStr = kp.publicKey.toString();
    
    const existing = wallets.find(w => w.publicKey === publicKeyStr);
    if (existing) return existing;
    
    const newWallet: StoredWallet = {
      id: crypto.randomUUID(),
      name,
      mnemonic: normalizedMnemonic,
      publicKey: publicKeyStr,
      createdAt: Date.now(),
    };
    
    const updated = [...wallets, newWallet];
    await persistWallets(updated, pin);
    
    setActiveWallet(newWallet);
    setActiveWalletId(newWallet.id);
    setKeypair(kp);
    
    return newWallet;
  }, [wallets, pin, persistWallets]);

  const importFromPrivateKey = useCallback(async (privateKey: string, name: string): Promise<StoredWallet | null> => {
    if (!pin) throw new Error("Vault is locked");
    
    try {
      const secretKey = bs58.decode(privateKey.trim());
      if (secretKey.length !== 64) return null;
      
      const kp = Keypair.fromSecretKey(secretKey);
      const publicKeyStr = kp.publicKey.toString();
      
      const existing = wallets.find(w => w.publicKey === publicKeyStr);
      if (existing) return existing;
      
      const newWallet: StoredWallet = {
        id: crypto.randomUUID(),
        name,
        mnemonic: `pk:${privateKey.trim()}`,
        publicKey: publicKeyStr,
        createdAt: Date.now(),
      };
      
      const updated = [...wallets, newWallet];
      await persistWallets(updated, pin);
      
      setActiveWallet(newWallet);
      setActiveWalletId(newWallet.id);
      setKeypair(kp);
      
      return newWallet;
    } catch {
      return null;
    }
  }, [wallets, pin, persistWallets]);

  const switchWallet = useCallback(async (id: string) => {
    const wallet = wallets.find(w => w.id === id);
    if (!wallet) return;
    
    setActiveWallet(wallet);
    setActiveWalletId(id);
    await updateKeypairForWallet(wallet);
  }, [wallets, updateKeypairForWallet]);

  const removeWallet = useCallback(async (id: string): Promise<boolean> => {
    if (!pin) throw new Error("Vault is locked");
    if (wallets.length <= 1) return false;
    
    const filtered = wallets.filter(w => w.id !== id);
    await persistWallets(filtered, pin);
    
    if (activeWallet?.id === id) {
      const newActive = filtered[0];
      setActiveWallet(newActive);
      setActiveWalletId(newActive.id);
      await updateKeypairForWallet(newActive);
    }
    
    return true;
  }, [wallets, activeWallet, pin, persistWallets, updateKeypairForWallet]);

  const renameWallet = useCallback(async (id: string, newName: string): Promise<boolean> => {
    if (!pin) throw new Error("Vault is locked");
    
    const updated = wallets.map(w => 
      w.id === id ? { ...w, name: newName } : w
    );
    await persistWallets(updated, pin);
    
    if (activeWallet?.id === id) {
      setActiveWallet(prev => prev ? { ...prev, name: newName } : null);
    }
    
    return true;
  }, [wallets, activeWallet, pin, persistWallets]);

  return (
    <VaultContext.Provider
      value={{
        status,
        wallets,
        activeWallet,
        keypair,
        error,
        pin,
        setupVault,
        setupWithWalletData,
        unlock,
        lock,
        resetVault,
        addWallet,
        importWallet,
        importFromPrivateKey,
        switchWallet,
        removeWallet,
        renameWallet,
        isUnlocking,
        isSettingUp,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVaultContext() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVaultContext must be used within a VaultProvider");
  }
  return context;
}
