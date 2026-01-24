import { getRpcService } from "./rpcService";

export interface HeliusSenderConfig {
  enabled: boolean;
  senderUrl: string;
  apiKey: string | null;
}

export interface HeliusSenderResult {
  signature: string;
  usedSender: boolean;
}

function getHeliusSenderConfig(): HeliusSenderConfig {
  const enabled = process.env.ENABLE_HELIUS_SENDER === "true";
  const senderUrl = process.env.HELIUS_SENDER_URL || "https://sender.helius-rpc.com/fast";
  const apiKey = process.env.HELIUS_API_KEY || null;
  
  return { enabled, senderUrl, apiKey };
}

export async function sendTransactionViaSender(signedTxBase64: string): Promise<string> {
  const config = getHeliusSenderConfig();
  
  if (!config.apiKey) {
    throw new Error("HELIUS_API_KEY is required for Helius Sender");
  }
  
  const url = `${config.senderUrl}?api-key=${config.apiKey}`;
  
  const payload = {
    jsonrpc: "2.0",
    id: 1,
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
  
  if (config.enabled && config.apiKey) {
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
  return config.enabled && !!config.apiKey;
}

export function logHeliusSenderStatus(): void {
  const config = getHeliusSenderConfig();
  if (config.enabled) {
    if (config.apiKey) {
      console.log(`[config] Helius Sender: enabled (${config.senderUrl})`);
    } else {
      console.warn(`[config] Helius Sender: enabled but HELIUS_API_KEY not set`);
    }
  } else {
    console.log(`[config] Helius Sender: disabled`);
  }
}
