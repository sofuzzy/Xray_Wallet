import { Connection, PublicKey, Transaction, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { getRpcService } from "./rpcService";

const JUPITER_API_BASE = "https://lite-api.jup.ag/swap/v1";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

// Cache for token decimals fetched from chain
const decimalsCache: Map<string, number> = new Map();

// Fetch token decimals directly from Solana blockchain
export async function getTokenDecimals(mint: string): Promise<number> {
  if (decimalsCache.has(mint)) {
    return decimalsCache.get(mint)!;
  }
  
  try {
    const mintPubkey = new PublicKey(mint);
    const rpc = getRpcService();
    const mintInfo = await rpc.execute(
      (connection) => connection.getParsedAccountInfo(mintPubkey),
      "getTokenDecimals"
    );
    
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const decimals = mintInfo.value.data.parsed.info.decimals;
      decimalsCache.set(mint, decimals);
      return decimals;
    }
  } catch (error) {
    console.error(`Failed to fetch decimals for ${mint}:`, error);
  }
  
  return 9;
}

export interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  // 24h metrics
  volume24h?: number;
  priceChange24h?: number;
  buys24h?: number;
  sells24h?: number;
  // 1h metrics
  volume1h?: number;
  priceChange1h?: number;
  buys1h?: number;
  sells1h?: number;
  // 5m metrics
  volume5m?: number;
  priceChange5m?: number;
  buys5m?: number;
  sells5m?: number;
  // Other
  liquidity?: number;
  isTrending?: boolean;
  priceUsd?: number;
  marketCap?: number;
  pairCreatedAt?: number; // unix ms
}

interface TokenCache {
  tokens: Token[];
  trendingTokens: Token[];
  lastUpdated: number;
}

let tokenCache: TokenCache = {
  tokens: [],
  trendingTokens: [],
  lastUpdated: 0,
};

const CACHE_TTL = 30 * 1000;

export async function fetchPopularTokens(): Promise<Token[]> {
  try {
    // Use DexScreener to fetch popular Solana tokens
    const searches = ["usdc", "usdt", "sol", "jup", "bonk"];
    const tokenMap = new Map<string, Token>();
    
    for (const query of searches) {
      try {
        const response = await fetch(`${DEXSCREENER_API}/search?q=${query}`);
        if (!response.ok) continue;
        const data = await response.json();
        
        if (!data.pairs || !Array.isArray(data.pairs)) continue;
        
        for (const pair of data.pairs.filter((p: any) => p.chainId === "solana").slice(0, 10)) {
          const baseToken = pair.baseToken;
          if (!baseToken?.address || tokenMap.has(baseToken.address)) continue;
          
          tokenMap.set(baseToken.address, {
            mint: baseToken.address,
            name: baseToken.name || "Unknown",
            symbol: baseToken.symbol || "???",
            decimals: 9,
            logoURI: pair.info?.imageUrl,
            volume24h: pair.volume?.h24 || 0,
            liquidity: pair.liquidity?.usd || 0,
            priceUsd: parseFloat(pair.priceUsd) || undefined,
          });
        }
      } catch (e) {
        console.error(`Failed to search DexScreener for ${query}:`, e);
      }
    }
    
    // Add fallback tokens that might not be in search results
    const fallbacks = getFallbackTokens();
    for (const token of fallbacks) {
      if (!tokenMap.has(token.mint)) {
        tokenMap.set(token.mint, token);
      }
    }
    
    return Array.from(tokenMap.values());
  } catch (error) {
    console.error("Failed to fetch popular tokens from DexScreener:", error);
    return getFallbackTokens();
  }
}

// Check if a string looks like a Solana address (base58, 32-44 chars)
function isSolanaAddress(query: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(query);
}

// Direct token lookup by address using DexScreener
async function lookupTokenByAddress(address: string): Promise<Token | null> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/tokens/${address}`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      console.error("DexScreener token lookup failed:", response.status);
      return null;
    }
    
    const data = await response.json();
    if (!data.pairs || !Array.isArray(data.pairs) || data.pairs.length === 0) {
      return null;
    }
    
    // Find the Solana pair with highest liquidity
    const solanaPairs = data.pairs.filter((p: any) => p.chainId === "solana");
    if (solanaPairs.length === 0) return null;
    
    // Sort by liquidity to get the best pair
    solanaPairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const bestPair = solanaPairs[0];
    
    const baseToken = bestPair.baseToken;
    if (!baseToken?.address) return null;
    
    return {
      mint: baseToken.address,
      name: baseToken.name || "Unknown",
      symbol: baseToken.symbol || "???",
      decimals: 9,
      logoURI: bestPair.info?.imageUrl,
      volume24h: bestPair.volume?.h24 || 0,
      liquidity: bestPair.liquidity?.usd || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      priceUsd: parseFloat(bestPair.priceUsd) || undefined,
      marketCap: bestPair.marketCap || bestPair.fdv || undefined,
    };
  } catch (error) {
    console.error("DexScreener token lookup error:", error);
    return null;
  }
}

// Search tokens by name/symbol using DexScreener API
export async function searchTokens(query: string, limit: number = 20): Promise<Token[]> {
  try {
    // If query looks like a Solana address, try direct lookup first
    if (isSolanaAddress(query)) {
      const token = await lookupTokenByAddress(query);
      if (token) {
        return [token];
      }
      // If direct lookup fails, fall through to search
    }
    
    const response = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      console.error("DexScreener search failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    if (!data.pairs || !Array.isArray(data.pairs)) return [];
    
    const tokenMap = new Map<string, Token>();
    
    for (const pair of data.pairs.filter((p: any) => p.chainId === "solana").slice(0, limit * 2)) {
      const baseToken = pair.baseToken;
      if (!baseToken?.address || tokenMap.has(baseToken.address)) continue;
      
      tokenMap.set(baseToken.address, {
        mint: baseToken.address,
        name: baseToken.name || "Unknown",
        symbol: baseToken.symbol || "???",
        decimals: 9,
        logoURI: pair.info?.imageUrl,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        priceUsd: parseFloat(pair.priceUsd) || undefined,
        marketCap: pair.marketCap || pair.fdv || undefined,
      });
      
      if (tokenMap.size >= limit) break;
    }
    
    return Array.from(tokenMap.values());
  } catch (error) {
    console.error("DexScreener search error:", error);
    return [];
  }
}

function getFallbackTokens(): Token[] {
  return [
    { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt", name: "Tether USD", symbol: "USDT", decimals: 6 },
    { mint: "mSoLzYCxHdYgP47TZGU2rPfV7jAmWjthzbiXc3czJ8m", name: "Marinade staked SOL", symbol: "mSOL", decimals: 9 },
    { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", name: "Jupiter", symbol: "JUP", decimals: 6 },
    { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", name: "JITO", symbol: "JTO", decimals: 9 },
    { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "Bonk", symbol: "BONK", decimals: 5 },
    { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", name: "dogwifhat", symbol: "WIF", decimals: 6 },
    { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", name: "Popcat", symbol: "POPCAT", decimals: 9 },
    { mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump", name: "Goatseus Maximus", symbol: "GOAT", decimals: 6 },
    { mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", name: "cat in a dogs world", symbol: "MEW", decimals: 5 },
    { mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", name: "Pyth Network", symbol: "PYTH", decimals: 6 },
    { mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", name: "Render Token", symbol: "RNDR", decimals: 8 },
  ];
}

// Dedicated trending cache with longer TTL (90 seconds)
let trendingCache: { tokens: Token[]; lastUpdated: number } = {
  tokens: [],
  lastUpdated: 0,
};
const TRENDING_CACHE_TTL = 90 * 1000;

export async function fetchTrendingTokens(): Promise<Token[]> {
  const now = Date.now();
  
  // Return cached data if still fresh
  if (now - trendingCache.lastUpdated < TRENDING_CACHE_TTL && trendingCache.tokens.length > 0) {
    return trendingCache.tokens;
  }

  try {
    // Use DexScreener's token-boosts endpoint for actual trending data
    const response = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      console.error("[trending] DexScreener boosts API failed:", response.status);
      if (trendingCache.tokens.length > 0) return trendingCache.tokens;
      return getTrendingFallback();
    }
    
    const boostedTokens = await response.json();
    if (!Array.isArray(boostedTokens) || boostedTokens.length === 0) {
      if (trendingCache.tokens.length > 0) return trendingCache.tokens;
      return getTrendingFallback();
    }
    
    // Filter to Solana tokens only
    const solanaMints = boostedTokens
      .filter((t: any) => t.chainId === "solana" && t.tokenAddress)
      .map((t: any) => t.tokenAddress)
      .slice(0, 30);
    
    if (solanaMints.length === 0) {
      if (trendingCache.tokens.length > 0) return trendingCache.tokens;
      return getTrendingFallback();
    }
    
    // Fetch token details from DexScreener tokens endpoint (max 30 per batch)
    const tokenMap = new Map<string, Token>();
    const BATCH_SIZE = 30;
    
    for (let i = 0; i < solanaMints.length; i += BATCH_SIZE) {
      const batch = solanaMints.slice(i, i + BATCH_SIZE);
      try {
        const tokenResponse = await fetch(`${DEXSCREENER_API}/tokens/${batch.join(",")}`, {
          signal: AbortSignal.timeout(5000),
        });
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          if (tokenData.pairs && Array.isArray(tokenData.pairs)) {
            for (const pair of tokenData.pairs.filter((p: any) => p.chainId === "solana")) {
              const baseToken = pair.baseToken;
              if (!baseToken?.address || tokenMap.has(baseToken.address)) continue;
              
              tokenMap.set(baseToken.address, {
                mint: baseToken.address,
                name: baseToken.name || "Unknown",
                symbol: baseToken.symbol || "???",
                decimals: 9,
                logoURI: pair.info?.imageUrl,
                // 24h
                volume24h:      pair.volume?.h24 || 0,
                priceChange24h: pair.priceChange?.h24 || 0,
                buys24h:        pair.txns?.h24?.buys  || 0,
                sells24h:       pair.txns?.h24?.sells || 0,
                // 1h
                volume1h:       pair.volume?.h1 || 0,
                priceChange1h:  pair.priceChange?.h1 || 0,
                buys1h:         pair.txns?.h1?.buys  || 0,
                sells1h:        pair.txns?.h1?.sells || 0,
                // 5m
                volume5m:       pair.volume?.m5 || 0,
                priceChange5m:  pair.priceChange?.m5 || 0,
                buys5m:         pair.txns?.m5?.buys  || 0,
                sells5m:        pair.txns?.m5?.sells || 0,
                // other
                liquidity:      pair.liquidity?.usd || 0,
                priceUsd:       parseFloat(pair.priceUsd) || undefined,
                marketCap:      pair.marketCap || pair.fdv || undefined,
                pairCreatedAt:  pair.pairCreatedAt || undefined,
                isTrending:     true,
              });
            }
          }
        }
      } catch (e) {
        console.error("[trending] Batch fetch failed:", e);
      }
    }
    
    // Preserve order from boosted list
    const result: Token[] = [];
    for (const mint of solanaMints) {
      const token = tokenMap.get(mint);
      if (token) result.push(token);
    }
    
    if (result.length > 0) {
      trendingCache = { tokens: result, lastUpdated: now };
      console.log(`[trending] Updated cache with ${result.length} tokens from DexScreener boosts`);
      return result;
    }
    
    if (trendingCache.tokens.length > 0) return trendingCache.tokens;
    return getTrendingFallback();
  } catch (error) {
    console.error("[trending] Failed to fetch:", error);
    if (trendingCache.tokens.length > 0) {
      console.log("[trending] Returning stale cache");
      return trendingCache.tokens;
    }
    return getTrendingFallback();
  }
}

function getTrendingFallback(): Token[] {
  return getFallbackTokens().map(t => ({ ...t, isTrending: true }));
}

export async function refreshTokenCache(): Promise<void> {
  const now = Date.now();
  if (now - tokenCache.lastUpdated < CACHE_TTL) {
    return;
  }

  try {
    const [popularTokens, trendingTokens] = await Promise.all([
      fetchPopularTokens(),
      fetchTrendingTokens(),
    ]);

    const trendingMints = new Set(trendingTokens.map(t => t.mint));
    
    const enrichedTokens = popularTokens.map(token => {
      const trending = trendingTokens.find(t => t.mint === token.mint);
      if (trending) {
        return { ...token, ...trending, isTrending: true };
      }
      return token;
    });

    for (const trending of trendingTokens) {
      if (!enrichedTokens.some(t => t.mint === trending.mint)) {
        enrichedTokens.push(trending);
      }
    }

    tokenCache = {
      tokens: enrichedTokens,
      trendingTokens,
      lastUpdated: now,
    };
  } catch (error) {
    console.error("Failed to refresh token cache:", error);
  }
}

export async function getTokens(options?: { search?: string; limit?: number; trending?: boolean }): Promise<Token[]> {
  await refreshTokenCache();
  
  let tokens = options?.trending ? tokenCache.trendingTokens : tokenCache.tokens;
  
  if (options?.search) {
    const query = options.search.toLowerCase();
    tokens = tokens.filter(t =>
      t.symbol.toLowerCase().includes(query) ||
      t.name.toLowerCase().includes(query) ||
      t.mint.toLowerCase() === query
    );
  }
  
  if (options?.limit) {
    tokens = tokens.slice(0, options.limit);
  }
  
  return tokens;
}

export async function getTokenByMint(mint: string): Promise<Token | null> {
  await refreshTokenCache();
  
  const cached = tokenCache.tokens.find(t => t.mint === mint);
  
  try {
    // Fetch decimals from blockchain (most reliable source)
    const decimals = await getTokenDecimals(mint);
    
    const response = await fetch(`${DEXSCREENER_API}/tokens/${mint}`);
    if (!response.ok) {
      if (cached) {
        return { ...cached, decimals };
      }
      return null;
    }
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      const baseToken = pair.baseToken;
      return {
        mint: baseToken.address,
        name: baseToken.name || "Unknown Token",
        symbol: baseToken.symbol || mint.slice(0, 6),
        decimals, // Use actual decimals from chain
        logoURI: pair.info?.imageUrl,
        volume24h: pair.volume?.h24,
        liquidity: pair.liquidity?.usd,
        priceChange24h: pair.priceChange?.h24,
        priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
        marketCap: pair.marketCap || pair.fdv,
      };
    }
    
    if (cached) {
      return { ...cached, decimals };
    }
    
    return {
      mint,
      name: `Token ${mint.slice(0, 6)}...`,
      symbol: mint.slice(0, 6).toUpperCase(),
      decimals,
    };
  } catch (error) {
    console.error("Failed to fetch token by mint:", error);
    if (cached) {
      return cached;
    }
    return null;
  }
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: any[];
  swapMode: string;
}

// DEX identifiers for Jupiter API filtering
// Labels verified from: https://lite-api.jup.ag/swap/v1/program-id-to-label
export type DexOption = "auto" | "orca" | "raydium";

const DEX_AMM_KEYS: Record<string, string[]> = {
  orca: ["Orca V1", "Orca V2", "Whirlpool"],
  raydium: ["Raydium", "Raydium CLMM", "Raydium CP"],
};

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50,
  dex: DexOption = "auto"
): Promise<JupiterQuote | null> {
  try {
    const solMint = "So11111111111111111111111111111111111111112";
    const actualInputMint = inputMint === "SOL" ? solMint : inputMint;
    const actualOutputMint = outputMint === "SOL" ? solMint : outputMint;

    const params = new URLSearchParams({
      inputMint: actualInputMint,
      outputMint: actualOutputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: dex !== "auto" ? "true" : "false",
      asLegacyTransaction: "false",
    });

    // Filter to specific DEX if requested
    if (dex !== "auto" && DEX_AMM_KEYS[dex]) {
      params.set("dexes", DEX_AMM_KEYS[dex].join(","));
    }

    const response = await fetch(`${JUPITER_API_BASE}/quote?${params}`);
    if (!response.ok) {
      const error = await response.text();
      console.error("Jupiter quote error:", error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to get Jupiter quote:", error);
    return null;
  }
}

export interface SwapTransaction {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export async function getJupiterSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  priorityFeeLamports: number = 10000
): Promise<SwapTransaction | null> {
  try {
    const estimatedComputeUnits = 200000;
    const microLamportsPerCU = Math.max(1, Math.floor((priorityFeeLamports * 1_000_000) / estimatedComputeUnits));

    const response = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: microLamportsPerCU,
        asLegacyTransaction: false,
        dynamicComputeUnitLimit: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Jupiter swap error:", error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to get Jupiter swap transaction:", error);
    return null;
  }
}

export interface SendTransactionResult {
  signature: string | null;
  success: boolean;
  error?: string;
  timedOut?: boolean;
}

export async function sendTransaction(
  signedTransaction: string,
  skipPreflight: boolean = true,
  lastValidBlockHeight?: number
): Promise<SendTransactionResult> {
  const txBuffer = Buffer.from(signedTransaction, "base64");
  const rpc = getRpcService();
  
  try {
    const signature = await rpc.execute(
      async (connection) => {
        return connection.sendRawTransaction(txBuffer, {
          skipPreflight,
          maxRetries: 2,
          preflightCommitment: "confirmed",
        });
      },
      "sendTransaction"
    );

    let blockhashInfo;
    try {
      blockhashInfo = await rpc.execute(
        (connection) => connection.getLatestBlockhash("confirmed"),
        "getLatestBlockhash"
      );
    } catch (bErr: any) {
      console.log("Failed to get blockhash for confirmation, but tx was sent:", signature);
      return { signature, success: true, timedOut: true };
    }
    
    const confirmBlockHeight = lastValidBlockHeight || blockhashInfo.lastValidBlockHeight;
    
    try {
      const confirmPromise = rpc.execute(
        (connection) => connection.confirmTransaction({
          signature,
          blockhash: blockhashInfo.blockhash,
          lastValidBlockHeight: confirmBlockHeight,
        }, "confirmed"),
        "confirmTransaction"
      );

      const timeoutPromise = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 25000));
      
      const result = await Promise.race([confirmPromise, timeoutPromise]);
      
      if (result === "timeout") {
        console.log("Transaction confirmation timed out, but tx may still succeed:", signature);
        return { signature, success: true, timedOut: true };
      }

      if (result.value.err) {
        console.error("Transaction failed on-chain:", result.value.err);
        return { signature, success: false, error: "Transaction failed on-chain. Check your balance and try again." };
      }

      return { signature, success: true };
    } catch (confirmErr: any) {
      console.log("Confirmation check failed, but tx was sent:", signature);
      return { signature, success: true, timedOut: true };
    }
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error("Failed to send transaction:", error);
    
    if (errMsg.includes("blockhash") && (errMsg.includes("expired") || errMsg.includes("not found"))) {
      return { signature: null, success: false, error: "BLOCKHASH_EXPIRED: Transaction blockhash has expired. Please try again." };
    }
    if (errMsg.includes("signature verification") || errMsg.includes("invalid signature") || errMsg.includes("INVALID")) {
      return { signature: null, success: false, error: "INVALID_SIGNATURE: Transaction signature is invalid. The transaction may have been modified." };
    }
    if (errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("failed after")) {
      return { signature: null, success: false, error: "RATE_LIMITED: Network is busy. Please try again in a few seconds." };
    }
    if (errMsg.includes("insufficient funds") || errMsg.includes("Insufficient") || errMsg.includes("0x1")) {
      return { signature: null, success: false, error: "INSUFFICIENT_FUNDS: Insufficient SOL balance to complete this swap." };
    }
    if (errMsg.includes("slippage") || errMsg.includes("Slippage")) {
      return { signature: null, success: false, error: "SLIPPAGE_EXCEEDED: Price moved too much. Try increasing slippage tolerance." };
    }
    
    return { signature: null, success: false, error: "TRANSACTION_FAILED: Transaction failed. Please try again." };
  }
}

startTokenCacheRefresh();

function startTokenCacheRefresh() {
  refreshTokenCache();
  setInterval(() => {
    refreshTokenCache();
  }, CACHE_TTL);
}
