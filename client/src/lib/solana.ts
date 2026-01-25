import { 
  Keypair, 
  PublicKey, 
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as bip39 from "bip39";

// Use Mainnet for production - ALL RPC calls go through server endpoints
export const SOLANA_NETWORK = "mainnet-beta";

// Confirm transaction via server (polls Helius RPC)
export async function confirmTransactionViaServer(signature: string, maxAttempts = 60): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch("/api/solana/rpc-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[signature], { searchTransactionHistory: true }]
        }),
      });
      const result = await response.json();
      const status = result?.result?.value?.[0];
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          return true;
        }
      }
    } catch (err) {
      console.warn("Confirmation check error:", err);
    }
    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds between checks
  }
  throw new Error("Transaction confirmation timeout");
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

// NOTE: ALL RPC operations go through server endpoints (/api/solana/*)
// No client-side RPC connections are used for mainnet security.

export { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Wallet interface for multi-wallet support (used by encrypted vault system)
export interface StoredWallet {
  id: string;
  name: string;
  mnemonic: string;
  publicKey: string;
  createdAt: number;
}

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

// Create a StoredWallet from private key (in-memory only, does not persist to storage)
export const createWalletFromPrivateKey = (privateKey: string, name: string): StoredWallet | null => {
  try {
    const secretKey = bs58.decode(privateKey.trim());
    if (secretKey.length !== 64) return null;
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKeyStr = keypair.publicKey.toString();
    return {
      id: crypto.randomUUID(),
      name,
      mnemonic: `pk:${privateKey.trim()}`,
      publicKey: publicKeyStr,
      createdAt: Date.now(),
    };
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

// Pure crypto functions - no localStorage access

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

// Create a new wallet in-memory (does not persist - use vault for storage)
export const createWalletInMemory = async (name: string): Promise<StoredWallet> => {
  const mnemonic = generateMnemonic();
  const keypair = await keypairFromMnemonic(mnemonic);
  return {
    id: crypto.randomUUID(),
    name,
    mnemonic,
    publicKey: keypair.publicKey.toString(),
    createdAt: Date.now(),
  };
};

// Import wallet from mnemonic in-memory (does not persist - use vault for storage)
export const importWalletInMemory = async (mnemonic: string, name: string): Promise<StoredWallet | null> => {
  if (!validateMnemonic(mnemonic)) return null;
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const keypair = await keypairFromMnemonic(normalizedMnemonic);
  return {
    id: crypto.randomUUID(),
    name,
    mnemonic: normalizedMnemonic,
    publicKey: keypair.publicKey.toString(),
    createdAt: Date.now(),
  };
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
