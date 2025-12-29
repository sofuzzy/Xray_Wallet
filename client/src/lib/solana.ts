import { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL,
  StakeProgram,
  Authorized,
  Transaction,
  Lockup
} from "@solana/web3.js";
import bs58 from "bs58";
import * as bip39 from "bip39";

// Use Mainnet for production
export const SOLANA_NETWORK = "mainnet-beta";
export const SOLANA_RPC_URL = clusterApiUrl(SOLANA_NETWORK);
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

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
  pubkey: PublicKey;
  lamports: number;
  state: 'inactive' | 'activating' | 'active' | 'deactivating';
  validator?: string;
}

export async function getStakeAccounts(walletPubkey: PublicKey): Promise<StakeAccountInfo[]> {
  const stakeAccounts = await connection.getParsedProgramAccounts(
    StakeProgram.programId,
    {
      filters: [
        { dataSize: 200 },
        {
          memcmp: {
            offset: 12,
            bytes: walletPubkey.toBase58(),
          },
        },
      ],
    }
  );

  return stakeAccounts.map((account) => {
    const parsed = (account.account.data as any).parsed;
    const info = parsed?.info;
    const meta = info?.meta;
    const stake = info?.stake;
    
    let state: StakeAccountInfo['state'] = 'inactive';
    if (stake?.delegation) {
      const activationEpoch = stake.delegation.activationEpoch;
      const deactivationEpoch = stake.delegation.deactivationEpoch;
      
      if (deactivationEpoch !== '18446744073709551615') {
        state = 'deactivating';
      } else if (activationEpoch !== '18446744073709551615') {
        state = 'active';
      }
    }

    return {
      pubkey: account.pubkey,
      lamports: account.account.lamports,
      state,
      validator: stake?.delegation?.voter,
    };
  });
}

export async function getValidators(): Promise<{ votePubkey: string; activatedStake: number; commission: number }[]> {
  const { current } = await connection.getVoteAccounts();
  return current
    .filter((v) => v.commission <= 10) // Only show validators with reasonable commission (max 10%)
    .sort((a, b) => b.activatedStake - a.activatedStake)
    .slice(0, 20)
    .map((v) => ({
      votePubkey: v.votePubkey,
      activatedStake: v.activatedStake,
      commission: v.commission,
    }));
}

export async function createStakeAccount(
  wallet: Keypair,
  amountSol: number,
  validatorVotePubkey: string
): Promise<string> {
  const stakeAccount = Keypair.generate();
  
  const minimumRent = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const totalLamports = minimumRent + amountLamports;

  const createStakeAccountIx = StakeProgram.createAccount({
    fromPubkey: wallet.publicKey,
    stakePubkey: stakeAccount.publicKey,
    authorized: new Authorized(wallet.publicKey, wallet.publicKey),
    lamports: totalLamports,
    lockup: new Lockup(0, 0, wallet.publicKey),
  });

  const delegateIx = StakeProgram.delegate({
    stakePubkey: stakeAccount.publicKey,
    authorizedPubkey: wallet.publicKey,
    votePubkey: new PublicKey(validatorVotePubkey),
  });

  const transaction = new Transaction().add(createStakeAccountIx, delegateIx);
  
  const signature = await connection.sendTransaction(transaction, [wallet, stakeAccount]);
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function deactivateStake(
  wallet: Keypair,
  stakeAccountPubkey: PublicKey
): Promise<string> {
  const deactivateIx = StakeProgram.deactivate({
    stakePubkey: stakeAccountPubkey,
    authorizedPubkey: wallet.publicKey,
  });

  const transaction = new Transaction().add(deactivateIx);
  
  const signature = await connection.sendTransaction(transaction, [wallet]);
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function withdrawStake(
  wallet: Keypair,
  stakeAccountPubkey: PublicKey,
  lamports: number
): Promise<string> {
  const withdrawIx = StakeProgram.withdraw({
    stakePubkey: stakeAccountPubkey,
    authorizedPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports,
  });

  const transaction = new Transaction().add(withdrawIx);
  
  const signature = await connection.sendTransaction(transaction, [wallet]);
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

// Token account interface
export interface TokenAccountInfo {
  mint: string;
  balance: number;
  decimals: number;
  name?: string;
  symbol?: string;
}

// Fetch all SPL token accounts for a wallet
export async function getTokenAccounts(walletAddress: string): Promise<TokenAccountInfo[]> {
  try {
    const pubkey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    return tokenAccounts.value
      .map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed?.info;
        if (!info) return null;
        
        const balance = parseFloat(info.tokenAmount?.uiAmountString || "0");
        if (balance === 0) return null; // Skip zero balances
        
        return {
          mint: info.mint,
          balance,
          decimals: info.tokenAmount?.decimals || 0,
        };
      })
      .filter((t): t is TokenAccountInfo => t !== null);
  } catch (e) {
    console.error("Failed to fetch token accounts:", e);
    return [];
  }
}
