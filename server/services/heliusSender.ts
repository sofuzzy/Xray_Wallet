import { getRpcService } from "./rpcService";

export interface HeliusSenderConfig {
  enabled: boolean;
  senderUrl: string;
}

export interface HeliusSenderResult {
  signature: string;
  usedSender: boolean;
}

// Jito tip accounts for Helius Sender (pick one randomly per transaction)
export const JITO_TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfEGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
];

// Default tip amount: 0.0002 SOL (minimum required)
export const DEFAULT_JITO_TIP_LAMPORTS = 200_000;

function getHeliusSenderConfig(): HeliusSenderConfig {
  const enabled = process.env.ENABLE_HELIUS_SENDER === "true";
  const senderUrl = process.env.HELIUS_SENDER_URL || "https://sender.helius-rpc.com/fast";
  
  return { enabled, senderUrl };
}

export function getRandomTipAccount(): string {
  return JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
}

export async function sendTransactionViaSender(signedTxBase64: string): Promise<string> {
  const config = getHeliusSenderConfig();
  
  // Helius Sender doesn't require API key - it's free for all users
  const url = config.senderUrl;
  
  const payload = {
    jsonrpc: "2.0",
    id: Date.now().toString(),
    method: "sendTransaction",
    params: [
      signedTxBase64,
      {
        encoding: "base64",
        skipPreflight: true,
        maxRetries: 0,
      },
    ],
  };
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`[helius-sender] HTTP error ${response.status}: ${text}`);
    throw new Error(`Helius Sender HTTP error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (result.error) {
    const errorMessage = result.error.message || JSON.stringify(result.error);
    console.error(`[helius-sender] RPC error:`, result.error);
    throw new Error(`Helius Sender RPC error: ${errorMessage}`);
  }
  
  if (!result.result) {
    throw new Error("Helius Sender returned no signature");
  }
  
  return result.result as string;
}

export async function broadcastTransaction(
  signedTxBase64: string,
  userRpc?: string
): Promise<HeliusSenderResult> {
  const config = getHeliusSenderConfig();
  const rpc = getRpcService();
  
  if (config.enabled) {
    try {
      console.log(`[broadcast] Attempting Helius Sender...`);
      const signature = await sendTransactionViaSender(signedTxBase64);
      console.log(`[broadcast] Helius Sender success: ${signature}`);
      return { signature, usedSender: true };
    } catch (senderError) {
      console.warn(`[broadcast] Helius Sender failed, falling back to RPC:`, senderError);
    }
  }
  
  console.log(`[broadcast] Using standard RPC broadcast`);
  const buffer = Buffer.from(signedTxBase64, "base64");
  const signature = await rpc.sendRawTransaction(buffer, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  console.log(`[broadcast] RPC broadcast success: ${signature}`);
  
  return { signature, usedSender: false };
}

export async function broadcastAndConfirmTransaction(
  signedTxBase64: string,
  userRpc?: string
): Promise<{ signature: string; usedSender: boolean }> {
  const rpc = getRpcService();
  
  const { signature, usedSender } = await broadcastTransaction(signedTxBase64, userRpc);
  
  // Use getSignatureStatuses polling instead of confirmTransaction with new blockhash
  // This avoids the bug where we confirm with a blockhash different from the tx's own
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const statuses = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const status = statuses?.value?.[0];
      
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          console.log(`[broadcast] Transaction confirmed (${status.confirmationStatus}): ${signature}`);
          return { signature, usedSender };
        }
      }
    } catch (err: any) {
      if (err.message?.includes("Transaction failed")) {
        throw err;
      }
      console.warn(`[broadcast] Status check error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  throw new Error("Transaction confirmation timeout");
}

export function isHeliusSenderEnabled(): boolean {
  const config = getHeliusSenderConfig();
  return config.enabled;
}

export function logHeliusSenderStatus(): void {
  const config = getHeliusSenderConfig();
  if (config.enabled) {
    console.log(`[config] Helius Sender: enabled (${config.senderUrl})`);
  } else {
    console.log(`[config] Helius Sender: disabled`);
  }
}
