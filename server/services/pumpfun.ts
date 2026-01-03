// PumpFun service for token swaps
// Simplified implementation for devnet

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippage: number;
  signer: any;
}

export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
}

export async function swapTokens(params: SwapParams): Promise<SwapResult> {
  try {
    const { inputMint, outputMint, amount, slippage } = params;
    
    // Mock swap implementation for devnet
    const mockSignature = "mock_" + Date.now();
    
    return {
      signature: mockSignature,
      inputAmount: amount,
      outputAmount: Math.floor(amount * 0.99),
      priceImpact: 0.01,
    };
  } catch (error) {
    console.error("Swap error:", error);
    throw new Error(`Swap failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amount: number
): Promise<{ outputAmount: number; priceImpact: number }> {
  try {
    // Mock quote implementation
    return {
      outputAmount: Math.floor(amount * 0.99),
      priceImpact: 0.01,
    };
  } catch (error) {
    console.error("Quote error:", error);
    throw new Error("Failed to get swap quote");
  }
}

let cachedTokens: Array<{ mint: string; name: string; symbol: string; decimals: number; logoURI?: string }> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getAvailableTokens(): Promise<
  Array<{ mint: string; name: string; symbol: string; decimals: number; logoURI?: string }>
> {
  const now = Date.now();
  
  // Return cached tokens if still valid
  if (cachedTokens && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedTokens;
  }
  
  try {
    // Fetch popular tokens from DexScreener
    const searches = ["usdc", "sol", "bonk", "wif", "jup"];
    const tokenMap = new Map<string, { mint: string; name: string; symbol: string; decimals: number; logoURI?: string }>();
    
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
          });
        }
      } catch (e) {
        // Skip failed searches
      }
    }
    
    const mappedTokens = Array.from(tokenMap.values());
    cachedTokens = mappedTokens;
    cacheTimestamp = now;
    
    return mappedTokens.length > 0 ? mappedTokens : getDefaultTokens();
  } catch (error) {
    console.error("Failed to fetch tokens from DexScreener:", error);
    
    // Return comprehensive fallback tokens if API fails
    return getDefaultTokens();
  }
}

function getDefaultTokens() {
  return [
    // Stablecoins
      { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USD Coin", symbol: "USDC", decimals: 6 },
      { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt", name: "Tether USD", symbol: "USDT", decimals: 6 },
      // Major tokens
      { mint: "mSoLzYCxHdYgP47TZGU2rPfV7jAmWjthzbiXc3czJ8m", name: "Marinade staked SOL", symbol: "mSOL", decimals: 9 },
      { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", name: "Jupiter", symbol: "JUP", decimals: 6 },
      { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", name: "JITO", symbol: "JTO", decimals: 9 },
      { mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", name: "Render Token", symbol: "RNDR", decimals: 8 },
      { mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", name: "Pyth Network", symbol: "PYTH", decimals: 6 },
      { mint: "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk", name: "Wen", symbol: "WEN", decimals: 5 },
      // Meme coins
      { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "Bonk", symbol: "BONK", decimals: 5 },
      { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", name: "dogwifhat", symbol: "WIF", decimals: 6 },
      { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", name: "Popcat", symbol: "POPCAT", decimals: 9 },
      { mint: "A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump", name: "FARTCOIN", symbol: "FARTCOIN", decimals: 6 },
      { mint: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY", name: "MOODENG", symbol: "MOODENG", decimals: 6 },
      { mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump", name: "Goatseus Maximus", symbol: "GOAT", decimals: 6 },
      { mint: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", name: "BOOK OF MEME", symbol: "BOME", decimals: 6 },
      { mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", name: "cat in a dogs world", symbol: "MEW", decimals: 5 },
      { mint: "GJAFwWjJ3vnTsrQVabjBVK2TYB1YtRCQXRDfDgUnpump", name: "ai16z", symbol: "AI16Z", decimals: 6 },
      { mint: "Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump", name: "CHILLGUY", symbol: "CHILLGUY", decimals: 6 },
      { mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", name: "Wormhole", symbol: "W", decimals: 6 },
      { mint: "SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y", name: "Shadow Token", symbol: "SHDW", decimals: 9 },
      { mint: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7", name: "Nosana", symbol: "NOS", decimals: 6 },
      { mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", name: "Orca", symbol: "ORCA", decimals: 6 },
      { mint: "RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a", name: "Raydium", symbol: "RAY", decimals: 6 },
      { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", name: "Raydium", symbol: "RAY", decimals: 6 },
      { mint: "ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx", name: "Star Atlas", symbol: "ATLAS", decimals: 8 },
      { mint: "MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey", name: "Marinade", symbol: "MNDE", decimals: 9 },
      { mint: "kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6", name: "Kin", symbol: "KIN", decimals: 5 },
      { mint: "AFbX8oGjGpmVFywbVouvhQSRmiW2aR1mohfahi4Y2AdB", name: "GST", symbol: "GST", decimals: 9 },
      { mint: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt", name: "Serum", symbol: "SRM", decimals: 6 },
  ];
}
