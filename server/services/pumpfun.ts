// PumpFun service for token swaps
// Simplified implementation for devnet

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
    // Fetch from Jupiter's verified token list (includes meme coins)
    const response = await fetch("https://token.jup.ag/strict");
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const tokens = await response.json();
    
    // Map to our format and cache
    const mappedTokens = tokens.map((token: any) => ({
      mint: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      logoURI: token.logoURI,
    }));
    cachedTokens = mappedTokens;
    cacheTimestamp = now;
    
    return mappedTokens;
  } catch (error) {
    console.error("Failed to fetch tokens from Jupiter:", error);
    
    // Return fallback tokens if API fails
    return [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
      },
      {
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenErt",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
      },
      {
        mint: "mSoLzYCxHdYgqP47TZGU2rPfV7jAmWjthzbiXc3czJ8m",
        name: "Marinade staked SOL",
        symbol: "mSOL",
        decimals: 9,
      },
      {
        mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        name: "Bonk",
        symbol: "BONK",
        decimals: 5,
      },
      {
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        name: "Jupiter",
        symbol: "JUP",
        decimals: 6,
      },
    ];
  }
}
