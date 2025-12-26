const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const BIRDEYE_API = "https://public-api.birdeye.so";

export interface PricePoint {
  timestamp: number;
  price: number;
  volume?: number;
}

export interface TokenPriceHistory {
  mint: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  history: PricePoint[];
  timeframe: string;
  isEstimated: boolean;
}

interface PriceCache {
  data: TokenPriceHistory;
  expiry: number;
}

const priceCache = new Map<string, PriceCache>();
const CACHE_TTL = 60 * 1000;

export async function getTokenPriceHistory(
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d" = "24h"
): Promise<TokenPriceHistory | null> {
  const cacheKey = `${mint}:${timeframe}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const response = await fetch(`${DEXSCREENER_API}/tokens/${mint}`);
    if (!response.ok) {
      console.error(`DexScreener API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    const pair = data.pairs[0];
    const baseToken = pair.baseToken;
    const currentPrice = parseFloat(pair.priceUsd) || 0;
    const priceChange24h = pair.priceChange?.h24 || 0;

    const history = generatePriceHistory(currentPrice, priceChange24h, timeframe);

    const result: TokenPriceHistory = {
      mint: baseToken.address,
      symbol: baseToken.symbol || "???",
      name: baseToken.name || "Unknown",
      currentPrice,
      priceChange24h,
      history,
      timeframe,
      isEstimated: true,
    };

    priceCache.set(cacheKey, {
      data: result,
      expiry: Date.now() + CACHE_TTL,
    });

    return result;
  } catch (error) {
    console.error("Failed to fetch token price history:", error);
    return null;
  }
}

function generatePriceHistory(
  currentPrice: number,
  priceChange24h: number,
  timeframe: "1h" | "24h" | "7d" | "30d"
): PricePoint[] {
  const now = Date.now();
  const points: PricePoint[] = [];
  
  let duration: number;
  let interval: number;
  
  switch (timeframe) {
    case "1h":
      duration = 60 * 60 * 1000;
      interval = 60 * 1000;
      break;
    case "24h":
      duration = 24 * 60 * 60 * 1000;
      interval = 15 * 60 * 1000;
      break;
    case "7d":
      duration = 7 * 24 * 60 * 60 * 1000;
      interval = 60 * 60 * 1000;
      break;
    case "30d":
      duration = 30 * 24 * 60 * 60 * 1000;
      interval = 4 * 60 * 60 * 1000;
      break;
  }

  const numPoints = Math.floor(duration / interval);
  const scaledChange = (priceChange24h / 100) * (duration / (24 * 60 * 60 * 1000));
  const startPrice = currentPrice / (1 + scaledChange);

  for (let i = 0; i <= numPoints; i++) {
    const timestamp = now - duration + (i * interval);
    const progress = i / numPoints;
    
    const trendPrice = startPrice + (currentPrice - startPrice) * progress;
    
    const volatility = 0.02 * Math.sin(i * 0.5) + 0.01 * Math.sin(i * 1.3);
    const noise = (Math.random() - 0.5) * 0.01;
    
    const price = trendPrice * (1 + volatility + noise);
    
    points.push({
      timestamp,
      price: Math.max(0.000001, price),
      volume: Math.random() * 100000,
    });
  }

  if (points.length > 0) {
    points[points.length - 1].price = currentPrice;
  }

  return points;
}

export async function getMultiTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  
  const fetchPromises = mints.map(async (mint) => {
    try {
      const history = await getTokenPriceHistory(mint, "1h");
      if (history) {
        prices.set(mint, history.currentPrice);
      }
    } catch {
      // Skip failed fetches
    }
  });

  await Promise.all(fetchPromises);
  return prices;
}
