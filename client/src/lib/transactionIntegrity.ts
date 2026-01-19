import { VersionedTransaction, Transaction } from "@solana/web3.js";

export interface TransactionIntegrityResult {
  valid: boolean;
  preSignHash: string;
  postSignHash: string;
  errorCode?: "TX_MUTATED_AFTER_SIGN" | "ENCODING_ERROR" | "SERIALIZATION_ERROR";
  errorMessage?: string;
}

export interface TransactionErrorResult {
  code: string;
  message: string;
  details?: any;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getVersionedMessageHash(tx: VersionedTransaction): Promise<string> {
  const messageBytes = tx.message.serialize();
  return sha256Hex(messageBytes);
}

export async function getLegacyMessageHash(tx: Transaction): Promise<string> {
  const messageBytes = tx.serializeMessage();
  return sha256Hex(messageBytes);
}

export async function verifyVersionedTransactionIntegrity(
  originalBase64: string,
  signedTx: VersionedTransaction
): Promise<TransactionIntegrityResult> {
  try {
    const originalBuffer = Buffer.from(originalBase64, "base64");
    const originalTx = VersionedTransaction.deserialize(originalBuffer);
    
    const preSignHash = await getVersionedMessageHash(originalTx);
    const postSignHash = await getVersionedMessageHash(signedTx);
    
    if (preSignHash !== postSignHash) {
      console.error("[tx-integrity] Message mutated after signing!", {
        preSignHash,
        postSignHash,
      });
      return {
        valid: false,
        preSignHash,
        postSignHash,
        errorCode: "TX_MUTATED_AFTER_SIGN",
        errorMessage: "Transaction message was modified after signing. This would cause an invalid signature.",
      };
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[tx-integrity] Message hash verified:", preSignHash.slice(0, 16) + "...");
    }
    
    return {
      valid: true,
      preSignHash,
      postSignHash,
    };
  } catch (error: any) {
    console.error("[tx-integrity] Verification failed:", error);
    return {
      valid: false,
      preSignHash: "",
      postSignHash: "",
      errorCode: "SERIALIZATION_ERROR",
      errorMessage: error.message || "Failed to verify transaction integrity",
    };
  }
}

export async function verifyLegacyTransactionIntegrity(
  tx: Transaction,
  preSignMessageBytes: Uint8Array
): Promise<TransactionIntegrityResult> {
  try {
    const preSignHash = await sha256Hex(preSignMessageBytes);
    const postSignHash = await getLegacyMessageHash(tx);
    
    if (preSignHash !== postSignHash) {
      console.error("[tx-integrity] Legacy message mutated after signing!", {
        preSignHash,
        postSignHash,
      });
      return {
        valid: false,
        preSignHash,
        postSignHash,
        errorCode: "TX_MUTATED_AFTER_SIGN",
        errorMessage: "Transaction message was modified after signing. This would cause an invalid signature.",
      };
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[tx-integrity] Legacy message hash verified:", preSignHash.slice(0, 16) + "...");
    }
    
    return {
      valid: true,
      preSignHash,
      postSignHash,
    };
  } catch (error: any) {
    console.error("[tx-integrity] Legacy verification failed:", error);
    return {
      valid: false,
      preSignHash: "",
      postSignHash: "",
      errorCode: "SERIALIZATION_ERROR",
      errorMessage: error.message || "Failed to verify transaction integrity",
    };
  }
}

export function parseTransactionError(error: any): TransactionErrorResult {
  const message = error?.message || String(error);
  
  if (message.includes("TX_MUTATED_AFTER_SIGN")) {
    return {
      code: "TX_MUTATED_AFTER_SIGN",
      message: "Transaction was modified after signing. Please try again.",
    };
  }
  
  if (message.includes("blockhash") && (message.includes("expired") || message.includes("not found"))) {
    return {
      code: "BLOCKHASH_EXPIRED",
      message: "Transaction blockhash has expired. Please try again with a fresh transaction.",
    };
  }
  
  if (message.includes("signature verification") || message.includes("invalid signature") || message.includes("INVALID")) {
    return {
      code: "INVALID_SIGNATURE",
      message: "Transaction signature is invalid. The transaction may have been modified after signing.",
    };
  }
  
  if (message.includes("insufficient") || message.includes("0x1")) {
    return {
      code: "INSUFFICIENT_FUNDS",
      message: "Insufficient funds to complete the transaction.",
    };
  }
  
  if (message.includes("429") || message.includes("rate limit") || message.includes("Too Many")) {
    return {
      code: "RATE_LIMITED",
      message: "Network is busy. Please try again in a few seconds.",
    };
  }
  
  if (message.includes("slippage") || message.includes("Slippage")) {
    return {
      code: "SLIPPAGE_EXCEEDED",
      message: "Price moved too much. Try increasing slippage tolerance.",
    };
  }
  
  return {
    code: "TRANSACTION_FAILED",
    message: message || "Transaction failed. Please try again.",
    details: error,
  };
}

export function serializeTransactionToBase64(tx: VersionedTransaction | Transaction): string {
  try {
    const serialized = tx.serialize();
    return Buffer.from(serialized).toString("base64");
  } catch (error: any) {
    console.error("[tx-integrity] Serialization failed:", error);
    throw new Error(`Failed to serialize transaction: ${error.message}`);
  }
}
