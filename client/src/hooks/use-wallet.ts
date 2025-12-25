import { useState, useEffect, useCallback } from "react";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  connection, 
  getLocalKeypair, 
  createNewKeypair, 
  getStoredMnemonic,
  importFromMnemonic,
  clearWallet
} from "@/lib/solana";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useWallet() {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Initialize wallet on mount
  useEffect(() => {
    const initWallet = async () => {
      setIsLoading(true);
      try {
        let kp = await getLocalKeypair();
        if (!kp) {
          kp = await createNewKeypair();
        }
        setKeypair(kp);
      } catch (e) {
        console.error("Failed to initialize wallet:", e);
      } finally {
        setIsLoading(false);
      }
    };
    initWallet();
  }, []);

  // Poll for balance
  const { data: balance, refetch: refreshBalance } = useQuery({
    queryKey: ["wallet-balance", keypair?.publicKey.toString()],
    queryFn: async () => {
      if (!keypair) return 0;
      const bal = await connection.getBalance(keypair.publicKey);
      return bal / LAMPORTS_PER_SOL;
    },
    enabled: !!keypair,
    refetchInterval: 10000, // Poll every 10s
  });

  // Airdrop function for devnet
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

  // Get current seed phrase
  const getSeedPhrase = useCallback((): string | null => {
    return getStoredMnemonic();
  }, []);

  // Import wallet from seed phrase
  const importWallet = useCallback(async (mnemonic: string): Promise<boolean> => {
    const newKeypair = await importFromMnemonic(mnemonic);
    if (newKeypair) {
      setKeypair(newKeypair);
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      return true;
    }
    return false;
  }, [queryClient]);

  // Reset wallet (create new one)
  const resetWallet = useCallback(async () => {
    clearWallet();
    const newKeypair = await createNewKeypair();
    setKeypair(newKeypair);
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
  }, [queryClient]);

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
  };
}
