import { PublicKey } from "@solana/web3.js";
import { getRpcService } from "./rpcService";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";

export type BalanceStatus = "fresh" | "stale" | "error" | "zero";

export interface CachedBalance {
  balance: number;
  lamports: number;
  status: BalanceStatus;
  timestamp: number;
  error?: string;
}

export interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
}

interface CacheEntry {
  data: CachedBalance;
  expiresAt: number;
}

interface TokenCacheEntry {
  data: TokenBalance[];
  expiresAt: number;
}

const CACHE_TTL_MS = 7000;
const STALE_THRESHOLD_MS = 10000;

class BalanceCacheService {
  private solCache: Map<string, CacheEntry> = new Map();
  private tokenCache: Map<string, TokenCacheEntry> = new Map();
  private pendingRequests: Map<string, Promise<CachedBalance>> = new Map();
  private pendingTokenRequests: Map<string, Promise<TokenBalance[]>> = new Map();

  async getSolBalance(address: string, forceRefresh = false): Promise<CachedBalance> {
    const now = Date.now();
    const cacheKey = address;

    if (!forceRefresh) {
      const cached = this.solCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        const isStale = now - cached.data.timestamp > STALE_THRESHOLD_MS;
        return {
          ...cached.data,
          status: isStale ? "stale" : cached.data.status,
        };
      }
    }

    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchSolBalance(address);
    this.pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      this.solCache.set(cacheKey, {
        data: result,
        expiresAt: now + CACHE_TTL_MS,
      });
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async fetchSolBalance(address: string): Promise<CachedBalance> {
    const now = Date.now();
    try {
      const rpc = getRpcService();
      const publicKey = new PublicKey(address);
      const lamports = await rpc.getBalance(publicKey);
      const balance = lamports / 1e9;

      return {
        balance,
        lamports,
        status: balance === 0 ? "zero" : "fresh",
        timestamp: now,
      };
    } catch (error) {
      console.error(`[balance-cache] Failed to fetch SOL balance for ${address}:`, error);
      return {
        balance: 0,
        lamports: 0,
        status: "error",
        timestamp: now,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getTokenBalance(address: string, mint: string): Promise<TokenBalance | null> {
    const tokens = await this.getTokenBalances(address);
    return tokens.find(t => t.mint === mint) || null;
  }

  async getTokenBalances(address: string, forceRefresh = false): Promise<TokenBalance[]> {
    const now = Date.now();
    const cacheKey = address;

    if (!forceRefresh) {
      const cached = this.tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
    }

    const pending = this.pendingTokenRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const fetchPromise = this.fetchTokenBalances(address);
    this.pendingTokenRequests.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      this.tokenCache.set(cacheKey, {
        data: result,
        expiresAt: now + CACHE_TTL_MS,
      });
      return result;
    } finally {
      this.pendingTokenRequests.delete(cacheKey);
    }
  }

  private async fetchTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      const rpc = getRpcService();
      const publicKey = new PublicKey(address);
      
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        rpc.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID }).catch(() => ({ value: [] })),
        rpc.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] })),
      ]);

      const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
      const tokens: TokenBalance[] = [];

      for (const account of allAccounts) {
        const parsed = account.account.data.parsed?.info;
        if (parsed && parsed.tokenAmount && parsed.tokenAmount.uiAmount > 0) {
          tokens.push({
            mint: parsed.mint,
            balance: parsed.tokenAmount.uiAmount,
            decimals: parsed.tokenAmount.decimals,
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error(`[balance-cache] Failed to fetch token balances for ${address}:`, error);
      return [];
    }
  }

  validateSwapBalance(
    solBalance: CachedBalance,
    inputMint: string,
    requestedAmount: number,
    tokenBalances: TokenBalance[]
  ): { valid: boolean; reason: string; code: string } {
    const isSolInput = inputMint === "SOL" || inputMint === "So11111111111111111111111111111111111111112";
    const minSolForFees = 0.005;

    if (solBalance.status === "error") {
      return { valid: false, reason: "Could not check your balance. Please try again.", code: "BALANCE_FETCH_FAILED" };
    }

    if (isSolInput) {
      const requiredSol = requestedAmount + minSolForFees;
      if (solBalance.balance === 0) {
        return { valid: false, reason: "Your wallet has no SOL. Please add funds first.", code: "BALANCE_ZERO" };
      }
      if (solBalance.balance < requiredSol) {
        return { 
          valid: false, 
          reason: `Insufficient SOL. You need ${requiredSol.toFixed(4)} SOL (including fees) but have ${solBalance.balance.toFixed(4)} SOL.`, 
          code: "BALANCE_INSUFFICIENT" 
        };
      }
    } else {
      if (solBalance.balance < minSolForFees) {
        return { valid: false, reason: "Not enough SOL for transaction fees. Please add at least 0.005 SOL.", code: "BALANCE_INSUFFICIENT_FEES" };
      }

      const tokenBalance = tokenBalances.find(t => t.mint === inputMint);
      if (!tokenBalance || tokenBalance.balance === 0) {
        return { valid: false, reason: "You don't have any of this token in your wallet.", code: "BALANCE_ZERO" };
      }
      if (tokenBalance.balance < requestedAmount) {
        return { 
          valid: false, 
          reason: `Insufficient balance. You need ${requestedAmount} but have ${tokenBalance.balance.toFixed(6)}.`, 
          code: "BALANCE_INSUFFICIENT" 
        };
      }
    }

    if (solBalance.status === "stale") {
      return { valid: true, reason: "Balance may be outdated. Proceeding with last known balance.", code: "BALANCE_STALE" };
    }

    return { valid: true, reason: "", code: "OK" };
  }

  invalidate(address: string): void {
    this.solCache.delete(address);
    this.tokenCache.delete(address);
  }

  clearAll(): void {
    this.solCache.clear();
    this.tokenCache.clear();
  }
}

export const balanceCache = new BalanceCacheService();
