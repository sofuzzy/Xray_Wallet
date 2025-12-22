import { useState, useEffect, useCallback } from "react";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, getLocalKeypair, createNewKeypair } from "@/lib/solana";
import { useQuery } from "@tanstack/react-query";

export function useWallet() {
  const [keypair, setKeypair] = useState<Keypair | null>(null);

  // Initialize wallet on mount
  useEffect(() => {
    let kp = getLocalKeypair();
    if (!kp) {
      kp = createNewKeypair();
    }
    setKeypair(kp);
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

  return {
    keypair,
    publicKey: keypair?.publicKey,
    address: keypair?.publicKey.toString(),
    balance: balance || 0,
    refreshBalance,
    requestAirdrop,
  };
}
