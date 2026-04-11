const BIRDEYE_API = "https://public-api.birdeye.so";
const GECKOTERMINAL_API = "https://api.geckoterminal.com/api/v2";
const PROVIDER_TIMEOUT = 5000;
const CACHE_TTL = 7 * 60 * 1000;

export interface OHLCPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartResponse {
  mint: string;
  interval: string;
  points: OHLCPoint[];
}

interface ChartCache {
  data: ChartResponse;
  fetchedAt: number;
}

const chartCache = new Map<string, ChartCache>();

const INTERVAL_TO_BIRDEYE: Record<string, string> = {
  "1m":  "1m",
  "5m":  "5m",
  "15m": "15m",
  "1h":  "1H",
  "4h":  "4H",
  "1d":  "1D",
};

const INTERVAL_TO_SECONDS: Record<string, number> = {
  "1m":  60,
  "5m":  300,
  "15m": 900,
  "1h":  3600,
  "4h":  14400,
  "1d":  86400,
};

const INTERVAL_TO_LOOKBACK_SECONDS: Record<string, number> = {
  "1m":  2 * 60 * 60,
  "5m":  6 * 60 * 60,
  "15m": 24 * 60 * 60,
  "1h":  7 * 24 * 60 * 60,
  "4h":  30 * 24 * 60 * 60,
  "1d":  365 * 24 * 60 * 60,
};

const GECKO_TIMEFRAME: Record<string, { tf: string; agg: number }> = {
  "1m":  { tf: "minute", agg: 1 },
  "5m":  { tf: "minute", agg: 5 },
  "15m": { tf: "minute", agg: 15 },
  "1h":  { tf: "hour",   agg: 1 },
  "4h":  { tf: "hour",   agg: 4 },
  "1d":  { tf: "day",    agg: 1 },
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === "AbortError") throw new Error(`Timeout after ${ms}ms`);
    throw err;
  }
}

async function fetchFromBirdeye(mint: string, interval: string): Promise<OHLCPoint[] | null> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;

  const birdeyeType = INTERVAL_TO_BIRDEYE[interval];
  if (!birdeyeType) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const lookback = INTERVAL_TO_LOOKBACK_SECONDS[interval] ?? 24 * 60 * 60;
  const fromSec = nowSec - lookback;

  const headers: Record<string, string> = {
    "x-chain": "solana",
    "X-API-KEY": apiKey,
  };

  const url = `${BIRDEYE_API}/defi/ohlcv?address=${encodeURIComponent(mint)}&type=${birdeyeType}&time_from=${fromSec}&time_to=${nowSec}`;

  try {
    const res = await fetchWithTimeout(url, { headers }, PROVIDER_TIMEOUT);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data?.items)) return null;

    const points: OHLCPoint[] = json.data.items.map((item: any) => ({
      time:   Math.floor(item.unixTime),
      open:   Number(item.o),
      high:   Number(item.h),
      low:    Number(item.l),
      close:  Number(item.c),
      volume: Number(item.v) || 0,
    })).filter((p: OHLCPoint) => p.time > 0 && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

async function fetchFromGeckoTerminal(mint: string, interval: string): Promise<OHLCPoint[] | null> {
  const cfg = GECKO_TIMEFRAME[interval];
  if (!cfg) return null;

  try {
    const poolsRes = await fetchWithTimeout(
      `${GECKOTERMINAL_API}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`,
      { headers: { "Accept": "application/json;version=20230302" } },
      PROVIDER_TIMEOUT,
    );
    if (!poolsRes.ok) return null;
    const poolsJson = await poolsRes.json();

    const pools = poolsJson?.data;
    if (!Array.isArray(pools) || pools.length === 0) return null;

    const poolAddr: string = pools[0]?.attributes?.address;
    if (!poolAddr) return null;

    const limit = cfg.tf === "minute" ? 1000 : cfg.tf === "hour" ? 1000 : 365;
    const ohlcUrl = `${GECKOTERMINAL_API}/networks/solana/pools/${encodeURIComponent(poolAddr)}/ohlcv/${cfg.tf}?aggregate=${cfg.agg}&limit=${limit}&currency=usd`;

    const ohlcRes = await fetchWithTimeout(
      ohlcUrl,
      { headers: { "Accept": "application/json;version=20230302" } },
      PROVIDER_TIMEOUT,
    );
    if (!ohlcRes.ok) return null;
    const ohlcJson = await ohlcRes.json();

    const raw: any[] = ohlcJson?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const points: OHLCPoint[] = raw.map((item: any[]) => ({
      time:   Math.floor(Number(item[0])),
      open:   Number(item[1]),
      high:   Number(item[2]),
      low:    Number(item[3]),
      close:  Number(item[4]),
      volume: Number(item[5]) || 0,
    })).filter((p: OHLCPoint) => p.time > 0 && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch (err) {
    return null;
  }
}

export async function getChartData(mint: string, interval: string): Promise<ChartResponse> {
  const validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
  const safeInterval = validIntervals.includes(interval) ? interval : "15m";
  const cacheKey = `${mint}:${safeInterval}`;

  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  let points: OHLCPoint[] | null = null;

  points = await fetchFromBirdeye(mint, safeInterval);

  if (!points) {
    points = await fetchFromGeckoTerminal(mint, safeInterval);
  }

  const result: ChartResponse = {
    mint,
    interval: safeInterval,
    points: points ?? [],
  };

  chartCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}
