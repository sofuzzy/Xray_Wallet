const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const BIRDEYE_API = "https://public-api.birdeye.so";
const PROVIDER_TIMEOUT = 3000;
const CACHE_TTL = 10 * 60 * 1000;
const STALE_TTL = 60 * 1000;

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
  provider?: string;
  cachedAt?: number;
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  marketCap: number | null;
  price: number;
  priceChange24h: number;
  sparkline: number[];
  createdAt: number | null;
}

interface PriceCache {
  data: TokenPriceHistory;
  fetchedAt: number;
  isRefreshing?: boolean;
}

const priceCache = new Map<string, PriceCache>();
const providerLatencyLog: { provider: string; latency: number; success: boolean; timestamp: number }[] = [];

function logProviderLatency(provider: string, latency: number, success: boolean) {
  const entry = { provider, latency, success, timestamp: Date.now() };
  providerLatencyLog.push(entry);
  if (providerLatencyLog.length > 100) {
    providerLatencyLog.shift();
  }
  console.log(`[chart] ${provider}: ${latency}ms ${success ? "OK" : "FAIL"}`);
}

export function getProviderStats() {
  const recent = providerLatencyLog.filter(e => Date.now() - e.timestamp < 5 * 60 * 1000);
  const byProvider = new Map<string, { total: number; success: number; avgLatency: number }>();
  
  for (const entry of recent) {
    const stats = byProvider.get(entry.provider) || { total: 0, success: 0, avgLatency: 0 };
    stats.total++;
    if (entry.success) stats.success++;
    stats.avgLatency = (stats.avgLatency * (stats.total - 1) + entry.latency) / stats.total;
    byProvider.set(entry.provider, stats);
  }
  
  return Object.fromEntries(byProvider);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function fetchFromDexScreener(
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d"
): Promise<TokenPriceHistory | null> {
  const start = Date.now();
  
  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_API}/tokens/${mint}`,
      {},
      PROVIDER_TIMEOUT
    );
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      logProviderLatency("DexScreener", latency, false);
      console.error(`DexScreener API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    logProviderLatency("DexScreener", latency, true);
    
    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    const pair = data.pairs[0];
    const baseToken = pair.baseToken;
    const currentPrice = parseFloat(pair.priceUsd) || 0;
    const priceChange24h = pair.priceChange?.h24 || 0;

    const history = generatePriceHistory(currentPrice, priceChange24h, timeframe);

    return {
      mint: baseToken.address,
      symbol: baseToken.symbol || "???",
      name: baseToken.name || "Unknown",
      currentPrice,
      priceChange24h,
      history,
      timeframe,
      isEstimated: true,
      provider: "DexScreener",
      cachedAt: Date.now(),
    };
  } catch (error: any) {
    const latency = Date.now() - start;
    logProviderLatency("DexScreener", latency, false);
    console.error("DexScreener fetch failed:", error.message);
    return null;
  }
}

async function fetchFromBirdeye(
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d"
): Promise<TokenPriceHistory | null> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    return null;
  }
  
  const start = Date.now();
  
  try {
    const response = await fetchWithTimeout(
      `${BIRDEYE_API}/defi/token_overview?address=${mint}`,
      {
        headers: {
          "X-API-KEY": apiKey,
          "x-chain": "solana",
        },
      },
      PROVIDER_TIMEOUT
    );
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      logProviderLatency("Birdeye", latency, false);
      console.error(`Birdeye API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    logProviderLatency("Birdeye", latency, true);
    
    if (!data.success || !data.data) {
      return null;
    }

    const token = data.data;
    const currentPrice = token.price || 0;
    const priceChange24h = token.priceChange24hPercent || 0;

    const history = generatePriceHistory(currentPrice, priceChange24h, timeframe);

    return {
      mint,
      symbol: token.symbol || "???",
      name: token.name || "Unknown",
      currentPrice,
      priceChange24h,
      history,
      timeframe,
      isEstimated: true,
      provider: "Birdeye",
      cachedAt: Date.now(),
    };
  } catch (error: any) {
    const latency = Date.now() - start;
    logProviderLatency("Birdeye", latency, false);
    console.error("Birdeye fetch failed:", error.message);
    return null;
  }
}

export async function getTokenPriceHistory(
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d" = "24h"
): Promise<TokenPriceHistory | null> {
  const cacheKey = `${mint}:${timeframe}`;
  const cached = priceCache.get(cacheKey);
  const now = Date.now();
  
  if (cached) {
    const age = now - cached.fetchedAt;
    
    if (age < STALE_TTL) {
      return cached.data;
    }
    
    if (age < CACHE_TTL) {
      if (!cached.isRefreshing) {
        cached.isRefreshing = true;
        refreshCache(cacheKey, mint, timeframe).finally(() => {
          const entry = priceCache.get(cacheKey);
          if (entry) entry.isRefreshing = false;
        });
      }
      return cached.data;
    }
  }
  
  return await fetchAndCache(cacheKey, mint, timeframe);
}

async function fetchAndCache(
  cacheKey: string,
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d"
): Promise<TokenPriceHistory | null> {
  let result = await fetchFromDexScreener(mint, timeframe);
  
  if (!result) {
    result = await fetchFromBirdeye(mint, timeframe);
  }
  
  if (result) {
    priceCache.set(cacheKey, {
      data: result,
      fetchedAt: Date.now(),
      isRefreshing: false,
    });
  }
  
  return result;
}

async function refreshCache(
  cacheKey: string,
  mint: string,
  timeframe: "1h" | "24h" | "7d" | "30d"
): Promise<void> {
  try {
    let result = await fetchFromDexScreener(mint, timeframe);
    
    if (!result) {
      result = await fetchFromBirdeye(mint, timeframe);
    }
    
    if (result) {
      priceCache.set(cacheKey, {
        data: result,
        fetchedAt: Date.now(),
        isRefreshing: false,
      });
    }
  } catch (error) {
    console.error("Background cache refresh failed:", error);
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

interface MetadataCache {
  data: TokenMetadata;
  expiry: number;
}

const metadataCache = new Map<string, MetadataCache>();
const METADATA_CACHE_TTL = 30 * 1000;

export async function getTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  const cached = metadataCache.get(mint);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_API}/tokens/${mint}`,
      {},
      PROVIDER_TIMEOUT
    );
    
    if (!response.ok) {
      console.error(`DexScreener API error for metadata: ${response.status}`);
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
    const marketCap = pair.marketCap || pair.fdv || null;
    
    const pairCreatedAt = pair.pairCreatedAt || null;

    const sparkline = generateSparkline(currentPrice, priceChange24h, 20);

    const result: TokenMetadata = {
      mint: baseToken.address,
      name: baseToken.name || "Unknown",
      symbol: baseToken.symbol || "???",
      imageUrl: pair.info?.imageUrl || null,
      marketCap,
      price: currentPrice,
      priceChange24h,
      sparkline,
      createdAt: pairCreatedAt,
    };

    metadataCache.set(mint, {
      data: result,
      expiry: Date.now() + METADATA_CACHE_TTL,
    });

    return result;
  } catch (error) {
    console.error("Failed to fetch token metadata:", error);
    return null;
  }
}

function generateSparkline(currentPrice: number, priceChange24h: number, points: number): number[] {
  const sparkline: number[] = [];
  const scaledChange = priceChange24h / 100;
  const startPrice = currentPrice / (1 + scaledChange);

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const trendPrice = startPrice + (currentPrice - startPrice) * progress;
    const volatility = 0.02 * Math.sin(i * 0.8) + 0.01 * Math.sin(i * 1.5);
    const price = trendPrice * (1 + volatility);
    sparkline.push(Math.max(0.000001, price));
  }

  if (sparkline.length > 0) {
    sparkline[sparkline.length - 1] = currentPrice;
  }

  return sparkline;
}

export async function getMultipleTokenMetadata(mints: string[]): Promise<Map<string, TokenMetadata>> {
  const results = new Map<string, TokenMetadata>();
  
  const fetchPromises = mints.map(async (mint) => {
    try {
      const metadata = await getTokenMetadata(mint);
      if (metadata) {
        results.set(mint, metadata);
      }
    } catch {
      // Skip failed fetches
    }
  });

  await Promise.all(fetchPromises);
  return results;
}
