import { Connection, PublicKey, Transaction, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";

const JUPITER_API_BASE = "https://lite-api.jup.ag/swap/v1";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.QUICKNODE_RPC_URL || "https://api.mainnet-beta.solana.com";

// Cache for token decimals fetched from chain
const decimalsCache: Map<string, number> = new Map();

// Fetch token decimals directly from Solana blockchain
async function getTokenDecimals(mint: string): Promise<number> {
  // Check cache first
  if (decimalsCache.has(mint)) {
    return decimalsCache.get(mint)!;
  }
  
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mint);
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const decimals = mintInfo.value.data.parsed.info.decimals;
      decimalsCache.set(mint, decimals);
      return decimals;
    }
  } catch (error) {
    console.error(`Failed to fetch decimals for ${mint}:`, error);
  }
  
  return 9; // Default fallback
}

export interface Token {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  volume24h?: number;
  liquidity?: number;
  priceChange24h?: number;
  isTrending?: boolean;
  priceUsd?: number;
  marketCap?: number;
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

// Search tokens by name/symbol using DexScreener API
export async function searchTokens(query: string, limit: number = 20): Promise<Token[]> {
  try {
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

export async function fetchTrendingTokens(): Promise<Token[]> {
  try {
    // Use DexScreener search API with popular search terms to get trending tokens
    const searches = ["pump", "sol", "meme"];
    const tokenMap = new Map<string, Token>();
    
    for (const query of searches) {
      try {
        const response = await fetch(`${DEXSCREENER_API}/search?q=${query}`);
        if (!response.ok) continue;
        const data = await response.json();
        
        if (!data.pairs || !Array.isArray(data.pairs)) continue;
        
        for (const pair of data.pairs.filter((p: any) => p.chainId === "solana").slice(0, 30)) {
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
            isTrending: true,
          });
        }
      } catch (e) {
        console.error(`Failed to search for ${query}:`, e);
      }
    }

    const result = Array.from(tokenMap.values())
      .filter(t => (t.volume24h || 0) > 5000 && (t.liquidity || 0) > 1000)
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, 30);
    
    return result.length > 0 ? result : getTrendingFallback();
  } catch (error) {
    console.error("Failed to fetch trending tokens:", error);
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

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
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
      onlyDirectRoutes: "false",
      asLegacyTransaction: "false",
    });

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

export async function sendTransaction(
  signedTransaction: string,
  skipPreflight: boolean = true,
  lastValidBlockHeight?: number
): Promise<string | null> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const txBuffer = Buffer.from(signedTransaction, "base64");
    
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });

    const blockhashInfo = await connection.getLatestBlockhash("confirmed");
    const confirmBlockHeight = lastValidBlockHeight || blockhashInfo.lastValidBlockHeight;
    
    const confirmPromise = connection.confirmTransaction({
      signature,
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: confirmBlockHeight,
    }, "confirmed");

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
    
    const result = await Promise.race([confirmPromise, timeoutPromise]);
    
    if (result === null) {
      console.log("Transaction confirmation timed out, but tx may still succeed:", signature);
    }

    return signature;
  } catch (error) {
    console.error("Failed to send transaction:", error);
    return null;
  }
}

startTokenCacheRefresh();

function startTokenCacheRefresh() {
  refreshTokenCache();
  setInterval(() => {
    refreshTokenCache();
  }, CACHE_TTL);
}
