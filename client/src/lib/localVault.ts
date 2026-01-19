import { encryptWalletData, decryptWalletData, type EncryptedVaultData } from "./vaultCrypto";

const LOCAL_VAULT_KEY = "xray_encrypted_vault";
const ACTIVE_WALLET_KEY = "xray_active_wallet_id";

export interface LocalVaultState {
  isLocked: boolean;
  hasVault: boolean;
  walletData: string | null;
}

export function hasLocalVault(): boolean {
  return localStorage.getItem(LOCAL_VAULT_KEY) !== null;
}

export function getEncryptedVault(): EncryptedVaultData | null {
  try {
    const stored = localStorage.getItem(LOCAL_VAULT_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveEncryptedVault(vault: EncryptedVaultData): void {
  localStorage.setItem(LOCAL_VAULT_KEY, JSON.stringify(vault));
}

export function deleteLocalVault(): void {
  localStorage.removeItem(LOCAL_VAULT_KEY);
  sessionStorage.removeItem(ACTIVE_WALLET_KEY);
}

export async function createLocalVault(walletData: string, pin: string): Promise<string> {
  const encrypted = await encryptWalletData(walletData, pin);
  saveEncryptedVault(encrypted);
  return walletData;
}

export async function unlockVault(pin: string): Promise<string> {
  const vault = getEncryptedVault();
  if (!vault) {
    throw new Error("NO_VAULT");
  }
  
  try {
    const decrypted = await decryptWalletData(vault, pin);
    return decrypted;
  } catch (error: any) {
    if (error.message === "DECRYPTION_FAILED") {
      throw new Error("WRONG_PIN");
    }
    throw error;
  }
}

export async function updateVaultData(walletData: string, pin: string): Promise<void> {
  const encrypted = await encryptWalletData(walletData, pin);
  saveEncryptedVault(encrypted);
}

export async function changeVaultPin(currentPin: string, newPin: string): Promise<void> {
  const walletData = await unlockVault(currentPin);
  const encrypted = await encryptWalletData(walletData, newPin);
  saveEncryptedVault(encrypted);
}

const LEGACY_KEYS = [
  "solana_wallet_secret_key",
  "solana_wallet_mnemonic", 
  "solana_wallets",
  "solana_active_wallet",
  "xray_wallets",
];

export function hasLegacyPlaintextWallets(): boolean {
  return LEGACY_KEYS.some(key => localStorage.getItem(key) !== null);
}

export function getLegacyWalletData(): string | null {
  const walletsJson = localStorage.getItem("solana_wallets") || localStorage.getItem("xray_wallets");
  if (walletsJson) {
    return walletsJson;
  }
  
  const legacyMnemonic = localStorage.getItem("solana_wallet_mnemonic");
  if (legacyMnemonic) {
    const wallet = {
      id: crypto.randomUUID(),
      name: "Main Wallet",
      mnemonic: legacyMnemonic,
      publicKey: "",
      createdAt: Date.now(),
    };
    return JSON.stringify([wallet]);
  }
  
  return null;
}

export function clearLegacyPlaintextData(): void {
  LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
}

export function getActiveWalletId(): string | null {
  return sessionStorage.getItem(ACTIVE_WALLET_KEY);
}

export function setActiveWalletId(id: string): void {
  sessionStorage.setItem(ACTIVE_WALLET_KEY, id);
}

export function clearActiveWalletId(): void {
  sessionStorage.removeItem(ACTIVE_WALLET_KEY);
}
