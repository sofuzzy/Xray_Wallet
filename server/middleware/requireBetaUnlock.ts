import { Request, Response, NextFunction } from "express";
import { PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import { getRpcService } from "../services/rpcService";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";

const BETA_UNLOCK_TOKEN = process.env.BETA_UNLOCK_TOKEN;
const REQUIRED_UI_BALANCE = 5000;

interface CacheEntry {
  unlocked: boolean;
  balanceRaw: string;
  decimals: number;
  timestamp: number;
}

const balanceCache = new Map<string, CacheEntry>();
let tokenDecimalsCache: number | null = null;
const CACHE_TTL_MS = 90_000;

function extractSignerFromTransaction(serialized: string): string | null {
  try {
    const buffer = Buffer.from(serialized, "base64");
    
    try {
      const versionedTx = VersionedTransaction.deserialize(buffer);
      if (versionedTx.message.staticAccountKeys.length > 0) {
        return versionedTx.message.staticAccountKeys[0].toBase58();
      }
    } catch {
      // Not a versioned transaction, try legacy
    }
    
    try {
      const legacyTx = Transaction.from(buffer);
      if (legacyTx.feePayer) {
        return legacyTx.feePayer.toBase58();
      }
      if (legacyTx.signatures.length > 0 && legacyTx.signatures[0].publicKey) {
        return legacyTx.signatures[0].publicKey.toBase58();
      }
    } catch {
      // Not a legacy transaction either
    }
    
    return null;
  } catch {
    return null;
  }
}

function extractWalletFromRequest(req: Request): string | null {
  const body = req.body;
  if (!body) return null;
  
  const wallet = body.owner || body.wallet || body.publicKey || body.userPublicKey || body.walletAddress || body.creatorAddress;
  if (typeof wallet === "string" && wallet.length >= 32 && wallet.length <= 44) {
    try {
      new PublicKey(wallet);
      return wallet;
    } catch {
      return null;
    }
  }
  
  const serializedTx = body.signedTransaction || body.serializedTransaction;
  if (typeof serializedTx === "string" && serializedTx.length > 100) {
    const signer = extractSignerFromTransaction(serializedTx);
    if (signer) return signer;
  }
  
  return null;
}

async function getTokenDecimals(): Promise<number> {
  if (tokenDecimalsCache !== null) {
    return tokenDecimalsCache;
  }
  
  if (!BETA_UNLOCK_TOKEN) {
    return 9;
  }
  
  try {
    const rpcService = getRpcService();
    const connection = rpcService.getConnection();
    const mintPubkey = new PublicKey(BETA_UNLOCK_TOKEN);
    const mintInfo = await getMint(connection, mintPubkey);
    tokenDecimalsCache = mintInfo.decimals;
    console.log(`[beta] Token decimals fetched: ${tokenDecimalsCache}`);
    return tokenDecimalsCache;
  } catch (error) {
    console.error("[beta] Failed to fetch token decimals, defaulting to 6:", error);
    return 6;
  }
}

export async function checkBetaUnlock(walletAddress: string): Promise<{
  unlocked: boolean;
  balanceRaw: string;
  balanceUi: number;
  requiredUi: number;
}> {
  if (!BETA_UNLOCK_TOKEN) {
    return { unlocked: true, balanceRaw: "0", balanceUi: 0, requiredUi: REQUIRED_UI_BALANCE };
  }

  const decimals = await getTokenDecimals();
  const divisor = BigInt(10 ** decimals);
  const requiredRaw = BigInt(REQUIRED_UI_BALANCE) * divisor;

  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.decimals === decimals) {
    const balanceUi = Number(BigInt(cached.balanceRaw)) / Number(divisor);
    return {
      unlocked: cached.unlocked,
      balanceRaw: cached.balanceRaw,
      balanceUi,
      requiredUi: REQUIRED_UI_BALANCE,
    };
  }

  try {
    const rpcService = getRpcService();
    const connection = rpcService.getConnection();
    const ownerPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(BETA_UNLOCK_TOKEN);

    const tokenAccounts = await connection.getTokenAccountsByOwner(ownerPubkey, {
      mint: mintPubkey,
      programId: TOKEN_PROGRAM_ID,
    });

    let totalRaw = BigInt(0);
    for (const { account } of tokenAccounts.value) {
      const data = account.data;
      if (data.length >= 72) {
        const amountBytes = data.slice(64, 72);
        const amount = amountBytes.readBigUInt64LE(0);
        totalRaw += amount;
      }
    }

    const unlocked = totalRaw >= requiredRaw;
    const balanceRaw = totalRaw.toString();

    balanceCache.set(walletAddress, {
      unlocked,
      balanceRaw,
      decimals,
      timestamp: Date.now(),
    });

    return {
      unlocked,
      balanceRaw,
      balanceUi: Number(totalRaw) / Number(divisor),
      requiredUi: REQUIRED_UI_BALANCE,
    };
  } catch (error) {
    console.error("[beta-unlock] Error checking token balance:", error);
    return {
      unlocked: false,
      balanceRaw: "0",
      balanceUi: 0,
      requiredUi: REQUIRED_UI_BALANCE,
    };
  }
}

export function requireBetaUnlock(req: Request, res: Response, next: NextFunction) {
  if (!BETA_UNLOCK_TOKEN) {
    return next();
  }

  const wallet = extractWalletFromRequest(req);
  if (!wallet) {
    return res.status(400).json({
      error: "MISSING_WALLET",
      message: "Wallet address is required for beta-gated operations.",
    });
  }

  checkBetaUnlock(wallet)
    .then((result) => {
      if (result.unlocked) {
        return next();
      }

      return res.status(403).json({
        error: "BETA_LOCKED",
        message: `Beta is locked. Hold >= ${REQUIRED_UI_BALANCE.toLocaleString()} XRAY to enable transactions.`,
        balanceUi: result.balanceUi,
        requiredUi: result.requiredUi,
      });
    })
    .catch((error) => {
      console.error("[beta-unlock] Middleware error:", error);
      return res.status(403).json({
        error: "BETA_LOCKED",
        message: `Beta is locked. Hold >= ${REQUIRED_UI_BALANCE.toLocaleString()} XRAY to enable transactions.`,
        balanceUi: 0,
        requiredUi: REQUIRED_UI_BALANCE,
      });
    });
}

export function clearBetaCache(wallet?: string) {
  if (wallet) {
    balanceCache.delete(wallet);
  } else {
    balanceCache.clear();
  }
}
