import { useState, useEffect, useCallback } from "react";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  connection, 
  getStoredWallets,
  getActiveWallet,
  setActiveWalletId,
  getKeypairForWallet,
  createWallet,
  deleteWallet as deleteStoredWallet,
  renameWallet as renameStoredWallet,
  importWalletWithName,
  migrateLegacyWallet,
  type StoredWallet,
} from "@/lib/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useWallet() {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [activeWallet, setActiveWallet] = useState<StoredWallet | null>(null);
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const refreshWallets = useCallback(() => {
    setWallets(getStoredWallets());
  }, []);

  useEffect(() => {
    const initWallet = async () => {
      setIsLoading(true);
      try {
        await migrateLegacyWallet();
        
        let storedWallets = getStoredWallets();
        
        if (storedWallets.length === 0) {
          const newWallet = await createWallet("Main Wallet");
          setActiveWalletId(newWallet.id);
          storedWallets = [newWallet];
        }
        
        setWallets(storedWallets);
        
        const active = getActiveWallet();
        if (active) {
          setActiveWallet(active);
          const kp = await getKeypairForWallet(active);
          setKeypair(kp);
        }
      } catch (e) {
        console.error("Failed to initialize wallet:", e);
      } finally {
        setIsLoading(false);
      }
    };
    initWallet();
  }, []);

  const { data: balance, refetch: refreshBalance } = useQuery({
    queryKey: ["wallet-balance", keypair?.publicKey.toString()],
    queryFn: async () => {
      if (!keypair) return 0;
      const bal = await connection.getBalance(keypair.publicKey);
      return bal / LAMPORTS_PER_SOL;
    },
    enabled: !!keypair,
    refetchInterval: 10000,
  });

  const requestAirdrop = useCallback(async () => {
    if (!keypair) return;
    try {
      const signature = await connection.requestAirdrop(
        keypair.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      refreshBalance();
    } catch (error) {
      console.error("Airdrop failed:", error);
      throw error;
    }
  }, [keypair, refreshBalance]);

  const getSeedPhrase = useCallback((): string | null => {
    return activeWallet?.mnemonic || null;
  }, [activeWallet]);

  const switchWallet = useCallback(async (walletId: string) => {
    const currentWallets = getStoredWallets();
    const wallet = currentWallets.find(w => w.id === walletId);
    if (!wallet) return false;
    
    setActiveWalletId(walletId);
    setActiveWallet(wallet);
    setWallets(currentWallets);
    const kp = await getKeypairForWallet(wallet);
    setKeypair(kp);
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    return true;
  }, [queryClient]);

  const addWallet = useCallback(async (name: string): Promise<StoredWallet> => {
    const newWallet = await createWallet(name);
    refreshWallets();
    await switchWallet(newWallet.id);
    return newWallet;
  }, [refreshWallets, switchWallet]);

  const importWallet = useCallback(async (mnemonic: string, name?: string): Promise<boolean> => {
    const walletName = name || `Wallet ${wallets.length + 1}`;
    const newWallet = await importWalletWithName(mnemonic, walletName);
    if (newWallet) {
      refreshWallets();
      await switchWallet(newWallet.id);
      return true;
    }
    return false;
  }, [wallets.length, refreshWallets, switchWallet]);

  const removeWallet = useCallback(async (walletId: string): Promise<boolean> => {
    if (wallets.length <= 1) return false;
    
    const success = deleteStoredWallet(walletId);
    if (success) {
      const updatedWallets = getStoredWallets();
      setWallets(updatedWallets);
      
      if (activeWallet?.id === walletId && updatedWallets.length > 0) {
        await switchWallet(updatedWallets[0].id);
      }
    }
    return success;
  }, [wallets.length, activeWallet, switchWallet]);

  const editWalletName = useCallback((walletId: string, newName: string): boolean => {
    const success = renameStoredWallet(walletId, newName);
    if (success) {
      refreshWallets();
      if (activeWallet?.id === walletId) {
        setActiveWallet(prev => prev ? { ...prev, name: newName } : null);
      }
    }
    return success;
  }, [refreshWallets, activeWallet]);

  const resetWallet = useCallback(async () => {
    const newWallet = await createWallet("New Wallet");
    refreshWallets();
    await switchWallet(newWallet.id);
  }, [refreshWallets, switchWallet]);

  return {
    keypair,
    publicKey: keypair?.publicKey,
    address: keypair?.publicKey.toString(),
    balance: balance || 0,
    isLoading,
    refreshBalance,
    requestAirdrop,
    getSeedPhrase,
    importWallet,
    resetWallet,
    wallets,
    activeWallet,
    switchWallet,
    addWallet,
    removeWallet,
    editWalletName,
  };
}
