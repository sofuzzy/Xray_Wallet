const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface KdfParams {
  algorithm: "PBKDF2";
  iterations: number;
  hash: "SHA-256";
  keyLength: number;
}

export interface EncryptedVaultData {
  ciphertext: string; // Base64
  salt: string; // Base64
  iv: string; // Base64
  kdfParams: string; // JSON
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWalletData(
  walletData: string,
  passphrase: string
): Promise<EncryptedVaultData> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(passphrase, salt, ITERATIONS);

  const encoder = new TextEncoder();
  const encodedData = encoder.encode(walletData);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    encodedData
  );

  const kdfParams: KdfParams = {
    algorithm: "PBKDF2",
    iterations: ITERATIONS,
    hash: "SHA-256",
    keyLength: KEY_LENGTH,
  };

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    kdfParams: JSON.stringify(kdfParams),
  };
}

export async function decryptWalletData(
  encryptedData: EncryptedVaultData,
  passphrase: string
): Promise<string> {
  const salt = new Uint8Array(base64ToArrayBuffer(encryptedData.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv));
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);

  const kdfParams: KdfParams = JSON.parse(encryptedData.kdfParams);

  const key = await deriveKey(passphrase, salt, kdfParams.iterations);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error("DECRYPTION_FAILED");
  }
}

export function validatePassphrase(passphrase: string): { valid: boolean; message?: string } {
  if (passphrase.length < 8) {
    return { valid: false, message: "Passphrase must be at least 8 characters" };
  }
  if (passphrase.length > 128) {
    return { valid: false, message: "Passphrase must be less than 128 characters" };
  }
  return { valid: true };
}

export function getPassphraseStrength(passphrase: string): "weak" | "medium" | "strong" {
  if (passphrase.length < 8) return "weak";
  
  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasNumber = /[0-9]/.test(passphrase);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passphrase);
  
  const score = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  
  if (passphrase.length >= 12 && score >= 3) return "strong";
  if (passphrase.length >= 8 && score >= 2) return "medium";
  return "weak";
}
