import { 
  Connection,
  Keypair, 
  PublicKey, 
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as bip39 from "bip39";

// Use Mainnet for production - RPC calls should go through server when possible
export const SOLANA_NETWORK = "mainnet-beta";

// EXCEPTION: SPL Token operations (createMint, mintTo, etc.) require a Connection object
// because the @solana/spl-token library functions need it internally.
// This connection is ONLY used for SPL token write operations where the user
// signs locally (non-custodial). All other reads should use server endpoints.
// Use multiple fallback RPCs for reliability (free public endpoints)
const SPL_TOKEN_RPC_URLS = [
  "https://rpc.ankr.com/solana",
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];

// Try each RPC until one works
let splTokenConnectionIndex = 0;
export let splTokenConnection = new Connection(SPL_TOKEN_RPC_URLS[splTokenConnectionIndex], {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

// Function to switch to next RPC on failure
export function switchToNextRpc(): boolean {
  splTokenConnectionIndex = (splTokenConnectionIndex + 1) % SPL_TOKEN_RPC_URLS.length;
  splTokenConnection = new Connection(SPL_TOKEN_RPC_URLS[splTokenConnectionIndex], {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
  console.log(`Switched to RPC: ${SPL_TOKEN_RPC_URLS[splTokenConnectionIndex]}`);
  return true;
}

// Send transaction through server (uses Helius RPC)
export async function sendTransactionViaServer(serializedTx: Uint8Array): Promise<string> {
  const base64Tx = btoa(String.fromCharCode.apply(null, Array.from(serializedTx)));
  const response = await fetch("/api/solana/send-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ serializedTransaction: base64Tx }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to send transaction");
  }
  const result = await response.json();
  return result.signature;
}

// NOTE: For general RPC operations, use server endpoints (/api/solana/*)
// The splTokenConnection above is ONLY for SPL token operations that need
// direct Connection access for non-custodial signing.

// Constants
export const LOCAL_STORAGE_KEY = "solana_wallet_secret_key";
export const LOCAL_STORAGE_MNEMONIC_KEY = "solana_wallet_mnemonic";
export const LOCAL_STORAGE_WALLETS_KEY = "solana_wallets";
export const LOCAL_STORAGE_ACTIVE_WALLET_KEY = "solana_active_wallet";
export { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Wallet interface for multi-wallet support
export interface StoredWallet {
  id: string;
  name: string;
  mnemonic: string;
  publicKey: string;
  createdAt: number;
}

export const getStoredWallets = (): StoredWallet[] => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_WALLETS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

export const saveWallets = (wallets: StoredWallet[]): void => {
  localStorage.setItem(LOCAL_STORAGE_WALLETS_KEY, JSON.stringify(wallets));
};

export const getActiveWalletId = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_ACTIVE_WALLET_KEY);
};

export const setActiveWalletId = (id: string): void => {
  localStorage.setItem(LOCAL_STORAGE_ACTIVE_WALLET_KEY, id);
};

export const createWallet = async (name: string): Promise<StoredWallet> => {
  const mnemonic = generateMnemonic();
  const keypair = await keypairFromMnemonic(mnemonic);
  const wallet: StoredWallet = {
    id: crypto.randomUUID(),
    name,
    mnemonic,
    publicKey: keypair.publicKey.toString(),
    createdAt: Date.now(),
  };
  const wallets = getStoredWallets();
  wallets.push(wallet);
  saveWallets(wallets);
  return wallet;
};

export const importWalletWithName = async (mnemonic: string, name: string): Promise<StoredWallet | null> => {
  if (!validateMnemonic(mnemonic)) return null;
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const keypair = await keypairFromMnemonic(normalizedMnemonic);
  const publicKeyStr = keypair.publicKey.toString();
  const wallets = getStoredWallets();
  const existing = wallets.find(w => w.publicKey === publicKeyStr);
  if (existing) {
    return existing;
  }
  const wallet: StoredWallet = {
    id: crypto.randomUUID(),
    name,
    mnemonic: normalizedMnemonic,
    publicKey: publicKeyStr,
    createdAt: Date.now(),
  };
  wallets.push(wallet);
  saveWallets(wallets);
  return wallet;
};

export const deleteWallet = (id: string): boolean => {
  const wallets = getStoredWallets();
  const filtered = wallets.filter(w => w.id !== id);
  if (filtered.length === wallets.length) return false;
  saveWallets(filtered);
  if (getActiveWalletId() === id && filtered.length > 0) {
    setActiveWalletId(filtered[0].id);
  }
  return true;
};

export const renameWallet = (id: string, newName: string): boolean => {
  const wallets = getStoredWallets();
  const wallet = wallets.find(w => w.id === id);
  if (!wallet) return false;
  wallet.name = newName;
  saveWallets(wallets);
  return true;
};

export const getActiveWallet = (): StoredWallet | null => {
  const wallets = getStoredWallets();
  if (wallets.length === 0) return null;
  const activeId = getActiveWalletId();
  if (activeId) {
    const active = wallets.find(w => w.id === activeId);
    if (active) return active;
  }
  return wallets[0];
};

export const getKeypairForWallet = async (wallet: StoredWallet): Promise<Keypair> => {
  if (wallet.mnemonic.startsWith('pk:')) {
    const privateKey = wallet.mnemonic.slice(3);
    const secretKey = bs58.decode(privateKey);
    return Keypair.fromSecretKey(secretKey);
  }
  return keypairFromMnemonic(wallet.mnemonic);
};

export const getPrivateKeyForWallet = async (wallet: StoredWallet): Promise<string> => {
  const keypair = await getKeypairForWallet(wallet);
  return bs58.encode(keypair.secretKey);
};

export const importWalletFromPrivateKey = async (privateKey: string, name: string): Promise<StoredWallet | null> => {
  try {
    const secretKey = bs58.decode(privateKey.trim());
    if (secretKey.length !== 64) return null;
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKeyStr = keypair.publicKey.toString();
    const wallets = getStoredWallets();
    const existing = wallets.find(w => w.publicKey === publicKeyStr);
    if (existing) {
      return existing;
    }
    const wallet: StoredWallet = {
      id: crypto.randomUUID(),
      name,
      mnemonic: `pk:${privateKey.trim()}`,
      publicKey: publicKeyStr,
      createdAt: Date.now(),
    };
    wallets.push(wallet);
    saveWallets(wallets);
    return wallet;
  } catch {
    return null;
  }
};

export const keypairFromStoredWallet = async (wallet: StoredWallet): Promise<Keypair> => {
  if (wallet.mnemonic.startsWith('pk:')) {
    const privateKey = wallet.mnemonic.slice(3);
    const secretKey = bs58.decode(privateKey);
    return Keypair.fromSecretKey(secretKey);
  }
  return keypairFromMnemonic(wallet.mnemonic);
};

// Migrate from legacy single wallet to multi-wallet system
export const migrateLegacyWallet = async (): Promise<void> => {
  const wallets = getStoredWallets();
  if (wallets.length > 0) return; // Already migrated
  
  const legacyMnemonic = localStorage.getItem(LOCAL_STORAGE_MNEMONIC_KEY);
  if (legacyMnemonic && validateMnemonic(legacyMnemonic)) {
    const keypair = await keypairFromMnemonic(legacyMnemonic);
    const wallet: StoredWallet = {
      id: crypto.randomUUID(),
      name: "Main Wallet",
      mnemonic: legacyMnemonic,
      publicKey: keypair.publicKey.toString(),
      createdAt: Date.now(),
    };
    saveWallets([wallet]);
    setActiveWalletId(wallet.id);
  }
};

export const generateMnemonic = (): string => {
  return bip39.generateMnemonic(128); // 12 words
};

export const validateMnemonic = (mnemonic: string): boolean => {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
};

export const keypairFromMnemonic = async (mnemonic: string): Promise<Keypair> => {
  const seed = await bip39.mnemonicToSeed(mnemonic.trim().toLowerCase());
  // Use first 32 bytes for Ed25519 seed (simple derivation)
  return Keypair.fromSeed(seed.slice(0, 32));
};

export const getStoredMnemonic = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_MNEMONIC_KEY);
};

export const getLocalKeypair = async (): Promise<Keypair | null> => {
  try {
    // First try to get from mnemonic
    const mnemonic = getStoredMnemonic();
    if (mnemonic && validateMnemonic(mnemonic)) {
      return await keypairFromMnemonic(mnemonic);
    }
    // Fallback to legacy secret key storage
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return null;
    const secretKey = bs58.decode(stored);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("Failed to load keypair", e);
    return null;
  }
};

export const createNewKeypair = async (): Promise<Keypair> => {
  const mnemonic = generateMnemonic();
  const keypair = await keypairFromMnemonic(mnemonic);
  localStorage.setItem(LOCAL_STORAGE_MNEMONIC_KEY, mnemonic);
  localStorage.setItem(LOCAL_STORAGE_KEY, bs58.encode(keypair.secretKey));
  return keypair;
};

export const importFromMnemonic = async (mnemonic: string): Promise<Keypair | null> => {
  if (!validateMnemonic(mnemonic)) {
    return null;
  }
  const keypair = await keypairFromMnemonic(mnemonic);
  localStorage.setItem(LOCAL_STORAGE_MNEMONIC_KEY, mnemonic.trim().toLowerCase());
  localStorage.setItem(LOCAL_STORAGE_KEY, bs58.encode(keypair.secretKey));
  return keypair;
};

export const clearWallet = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  localStorage.removeItem(LOCAL_STORAGE_MNEMONIC_KEY);
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

export interface StakeAccountInfo {
  pubkey: string;
  lamports: number;
  state: 'inactive' | 'activating' | 'active' | 'deactivating';
  validator?: string;
}

// Fetch stake accounts via server endpoint (uses Helius RPC)
export async function getStakeAccounts(walletAddress: string): Promise<StakeAccountInfo[]> {
  try {
    const response = await fetch(`/api/solana/stake-accounts/${walletAddress}`);
    if (!response.ok) throw new Error("Failed to fetch stake accounts");
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch stake accounts:", e);
    return [];
  }
}

// Fetch validators via server endpoint (uses Helius RPC)
export async function getValidators(): Promise<{ votePubkey: string; activatedStake: number; commission: number }[]> {
  try {
    const response = await fetch("/api/solana/validators");
    if (!response.ok) throw new Error("Failed to fetch validators");
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch validators:", e);
    return [];
  }
}

// Fetch rent exemption via server endpoint (uses Helius RPC)
export async function getRentExemption(dataLength: number = 200): Promise<number> {
  try {
    const response = await fetch(`/api/solana/rent-exemption?dataLength=${dataLength}`);
    if (!response.ok) throw new Error("Failed to fetch rent exemption");
    const data = await response.json();
    return data.lamports;
  } catch (e) {
    console.error("Failed to fetch rent exemption:", e);
    throw e;
  }
}

// Fetch latest blockhash via server endpoint (uses Helius RPC)
export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  try {
    const response = await fetch("/api/solana/blockhash");
    if (!response.ok) throw new Error("Failed to fetch blockhash");
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch blockhash:", e);
    throw e;
  }
}

// Send serialized transaction via server endpoint (uses Helius RPC)
export async function sendTransaction(serializedTransaction: string): Promise<string> {
  const response = await fetch("/api/solana/send-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serializedTransaction }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to send transaction");
  }
  
  const data = await response.json();
  return data.signature;
}

// Get transaction status via server endpoint
export async function getTransactionStatus(signature: string): Promise<{ status: string; confirmations: number | null; err: any | null }> {
  try {
    const response = await fetch(`/api/solana/tx-status/${signature}`);
    if (!response.ok) throw new Error("Failed to fetch transaction status");
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch transaction status:", e);
    throw e;
  }
}

// Token account interface
export interface TokenAccountInfo {
  mint: string;
  balance: number;
  decimals: number;
  name?: string;
  symbol?: string;
}

// Fetch all SPL token accounts for a wallet via backend proxy
export async function getTokenAccounts(walletAddress: string): Promise<TokenAccountInfo[]> {
  try {
    const response = await fetch(`/api/wallet/tokens/${walletAddress}`);
    if (!response.ok) throw new Error("Failed to fetch token accounts");
    const tokens = await response.json();
    return tokens as TokenAccountInfo[];
  } catch (e) {
    console.error("Failed to fetch token accounts:", e);
    return [];
  }
}
