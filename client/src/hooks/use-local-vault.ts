import { useState, useCallback, useEffect } from "react";
import {
  hasLocalVault,
  hasLegacyPlaintextWallets,
  getLegacyWalletData,
  clearLegacyPlaintextData,
  createLocalVault,
  unlockVault,
  lockVault as lockVaultStorage,
  isVaultUnlocked,
  getSessionUnlock,
  updateVaultData,
  deleteLocalVault,
} from "@/lib/localVault";
import type { StoredWallet } from "@/lib/solana";

export type VaultStatus = 
  | "loading"
  | "no_vault"
  | "needs_migration"
  | "locked"
  | "unlocked";

interface UseLocalVaultReturn {
  status: VaultStatus;
  wallets: StoredWallet[];
  error: string | null;
  setupVault: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  saveWallets: (wallets: StoredWallet[], pin: string) => Promise<void>;
  deleteVaultAndData: () => void;
  isUnlocking: boolean;
  isSettingUp: boolean;
}

export function useLocalVault(): UseLocalVaultReturn {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    const initVault = () => {
      if (isVaultUnlocked()) {
        const data = getSessionUnlock();
        if (data) {
          try {
            const parsed = JSON.parse(data);
            setWallets(Array.isArray(parsed) ? parsed : []);
            setStatus("unlocked");
            return;
          } catch {
            setStatus("locked");
            return;
          }
        }
      }

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

  const setupVault = useCallback(async (pin: string) => {
    setIsSettingUp(true);
    setError(null);
    try {
      let walletData = getLegacyWalletData();
      
      if (!walletData) {
        walletData = JSON.stringify([]);
      }
      
      await createLocalVault(walletData, pin);
      clearLegacyPlaintextData();
      
      const parsed = JSON.parse(walletData);
      setWallets(Array.isArray(parsed) ? parsed : []);
      setStatus("unlocked");
    } catch (err: any) {
      setError(err.message || "Failed to set up vault");
      throw err;
    } finally {
      setIsSettingUp(false);
    }
  }, []);

  const unlock = useCallback(async (pin: string) => {
    setIsUnlocking(true);
    setError(null);
    try {
      const data = await unlockVault(pin);
      const parsed = JSON.parse(data);
      setWallets(Array.isArray(parsed) ? parsed : []);
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
  }, []);

  const lock = useCallback(() => {
    lockVaultStorage();
    setWallets([]);
    setStatus("locked");
    setError(null);
  }, []);

  const saveWallets = useCallback(async (newWallets: StoredWallet[], pin: string) => {
    const data = JSON.stringify(newWallets);
    await updateVaultData(data, pin);
    setWallets(newWallets);
  }, []);

  const deleteVaultAndData = useCallback(() => {
    deleteLocalVault();
    clearLegacyPlaintextData();
    setWallets([]);
    setStatus("no_vault");
    setError(null);
  }, []);

  return {
    status,
    wallets,
    error,
    setupVault,
    unlock,
    lock,
    saveWallets,
    deleteVaultAndData,
    isUnlocking,
    isSettingUp,
  };
}
