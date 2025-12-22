import { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

// Use Devnet for this demo
export const SOLANA_NETWORK = "devnet";
export const SOLANA_RPC_URL = clusterApiUrl(SOLANA_NETWORK);
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// Constants
export const LOCAL_STORAGE_KEY = "solana_wallet_secret_key";

export const getLocalKeypair = (): Keypair | null => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return null;
    const secretKey = bs58.decode(stored);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("Failed to load keypair", e);
    return null;
  }
};

export const createNewKeypair = (): Keypair => {
  const keypair = Keypair.generate();
  localStorage.setItem(LOCAL_STORAGE_KEY, bs58.encode(keypair.secretKey));
  return keypair;
};

export const shortenAddress = (address: string, chars = 4) => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const formatSol = (lamports: number) => {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};
