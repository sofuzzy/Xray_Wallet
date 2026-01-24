import { useCallback } from "react";
import { useVaultContext, type StoredWallet } from "@/contexts/VaultContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";

// NOTE: All Solana RPC calls are now routed through server endpoints
// No direct client-side Connection usage on mainnet

export function useWallet() {
  const vault = useVaultContext();
  const queryClient = useQueryClient();

  const { data: balance, refetch: refreshBalance } = useQuery({
    queryKey: ["wallet-balance", vault.keypair?.publicKey.toString()],
    queryFn: async () => {
      if (!vault.keypair) return 0;
      try {
        const response = await fetch(`/api/wallet/balance/${vault.keypair.publicKey.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch balance");
        const data = await response.json();
        return data.balance as number;
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        throw error;
      }
    },
    enabled: !!vault.keypair,
    refetchInterval: 15000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 5000,
  });

  const getSeedPhrase = useCallback((): string | null => {
    if (!vault.activeWallet) return null;
    if (vault.activeWallet.mnemonic.startsWith('pk:')) return null;
    return vault.activeWallet.mnemonic;
  }, [vault.activeWallet]);

  const getPrivateKey = useCallback(async (): Promise<string | null> => {
    if (!vault.keypair) return null;
    return bs58.encode(vault.keypair.secretKey);
  }, [vault.keypair]);

  const isPrivateKeyWallet = useCallback((): boolean => {
    return vault.activeWallet?.mnemonic.startsWith('pk:') || false;
  }, [vault.activeWallet]);

  const switchWallet = useCallback(async (walletId: string) => {
    await vault.switchWallet(walletId);
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    return true;
  }, [vault, queryClient]);

  const addWallet = useCallback(async (name: string): Promise<StoredWallet> => {
    const newWallet = await vault.addWallet(name);
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    return newWallet;
  }, [vault, queryClient]);

  const importWallet = useCallback(async (mnemonic: string, name?: string): Promise<boolean> => {
    const walletName = name || `Wallet ${vault.wallets.length + 1}`;
    const newWallet = await vault.importWallet(mnemonic, walletName);
    if (newWallet) {
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      return true;
    }
    return false;
  }, [vault, queryClient]);

  const importFromPrivateKey = useCallback(async (privateKey: string, name?: string): Promise<boolean> => {
    const walletName = name || `Imported Wallet ${vault.wallets.length + 1}`;
    const newWallet = await vault.importFromPrivateKey(privateKey, walletName);
    if (newWallet) {
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      return true;
    }
    return false;
  }, [vault, queryClient]);

  const removeWallet = useCallback(async (walletId: string): Promise<boolean> => {
    const success = await vault.removeWallet(walletId);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    }
    return success;
  }, [vault, queryClient]);

  const editWalletName = useCallback(async (walletId: string, newName: string): Promise<boolean> => {
    return await vault.renameWallet(walletId, newName);
  }, [vault]);

  const resetWallet = useCallback(async () => {
    const newWallet = await vault.addWallet("New Wallet");
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
  }, [vault, queryClient]);

  return {
    keypair: vault.keypair,
    publicKey: vault.keypair?.publicKey,
    address: vault.keypair?.publicKey.toString(),
    balance: balance || 0,
    isLoading: vault.status === "loading",
    refreshBalance,
    getSeedPhrase,
    getPrivateKey,
    isPrivateKeyWallet,
    importWallet,
    importFromPrivateKey,
    resetWallet,
    wallets: vault.wallets,
    activeWallet: vault.activeWallet,
    switchWallet,
    addWallet,
    removeWallet,
    editWalletName,
    lockVault: vault.lock,
  };
}
