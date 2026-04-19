const GECKOTERMINAL_API = "https://api.geckoterminal.com/api/v2";
const PROVIDER_TIMEOUT = 5000;
const CACHE_TTL          = 7 * 60 * 1000;   // 7 min for OHLCV data
const POOL_CACHE_TTL     = 30 * 60 * 1000;  // 30 min for pool address lookup
const MAX_POINTS         = 300;              // max candles sent to client

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

interface ChartCache  { data: ChartResponse; fetchedAt: number; }
interface PoolCache   { poolAddr: string;    fetchedAt: number; }

const chartCache = new Map<string, ChartCache>();
const poolCache  = new Map<string, PoolCache>();

// In-flight dedup: key → pending Promise so concurrent callers share one request
const inFlight  = new Map<string, Promise<ChartResponse>>();

const GECKO_TIMEFRAME: Record<string, { tf: string; agg: number }> = {
  "1m":  { tf: "minute", agg: 1  },
  "5m":  { tf: "minute", agg: 5  },
  "15m": { tf: "minute", agg: 15 },
  "1h":  { tf: "hour",   agg: 1  },
  "4h":  { tf: "hour",   agg: 4  },
  "1d":  { tf: "day",    agg: 1  },
};

// Birdeye mapping (only used if BIRDEYE_API_KEY present)
const INTERVAL_TO_BIRDEYE: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D",
};
const INTERVAL_TO_LOOKBACK: Record<string, number> = {
  "1m":  2  * 3600,
  "5m":  6  * 3600,
  "15m": 24 * 3600,
  "1h":  7  * 86400,
  "4h":  30 * 86400,
  "1d":  365* 86400,
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = PROVIDER_TIMEOUT): Promise<Response> {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === "AbortError") throw new Error(`Timeout after ${ms}ms`);
    throw err;
  }
}

/**
 * Larsson-style max-point downsampling: keeps first, last, and evenly-spaced
 * interior samples so chart still looks accurate.
 */
function downsample(points: OHLCPoint[], max: number): OHLCPoint[] {
  if (points.length <= max) return points;
  const result: OHLCPoint[] = [points[0]];
  const step = (points.length - 2) / (max - 2);
  for (let i = 1; i < max - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

async function getPoolAddress(mint: string): Promise<string | null> {
  const cached = poolCache.get(mint);
  if (cached && Date.now() - cached.fetchedAt < POOL_CACHE_TTL) {
    return cached.poolAddr;
  }

  try {
    const res = await fetchWithTimeout(
      `${GECKOTERMINAL_API}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`,
      { headers: { Accept: "application/json;version=20230302" } },
    );
    if (!res.ok) return null;
    const json  = await res.json();
    const pools = json?.data;
    if (!Array.isArray(pools) || !pools.length) return null;
    const poolAddr: string = pools[0]?.attributes?.address;
    if (!poolAddr) return null;
    poolCache.set(mint, { poolAddr, fetchedAt: Date.now() });
    return poolAddr;
  } catch {
    return null;
  }
}

async function fetchFromBirdeye(mint: string, interval: string): Promise<OHLCPoint[] | null> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;

  const birdeyeType = INTERVAL_TO_BIRDEYE[interval];
  if (!birdeyeType) return null;

  const nowSec  = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - (INTERVAL_TO_LOOKBACK[interval] ?? 86400);
  const url     = `https://public-api.birdeye.so/defi/ohlcv?address=${encodeURIComponent(mint)}&type=${birdeyeType}&time_from=${fromSec}&time_to=${nowSec}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { "x-chain": "solana", "X-API-KEY": apiKey },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data?.items)) return null;

    const points: OHLCPoint[] = json.data.items
      .map((item: any) => ({
        time:   Math.floor(item.unixTime),
        open:   Number(item.o),
        high:   Number(item.h),
        low:    Number(item.l),
        close:  Number(item.c),
        volume: Number(item.v) || 0,
      }))
      .filter((p: OHLCPoint) => p.time > 0 && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

async function fetchFromGeckoTerminal(mint: string, interval: string): Promise<OHLCPoint[] | null> {
  const cfg = GECKO_TIMEFRAME[interval];
  if (!cfg) return null;

  try {
    const poolAddr = await getPoolAddress(mint);
    if (!poolAddr) return null;

    // Cap limit per interval type — we only need MAX_POINTS * small buffer
    const limit = Math.min(cfg.tf === "day" ? 365 : 500, MAX_POINTS + 50);
    const url   = `${GECKOTERMINAL_API}/networks/solana/pools/${encodeURIComponent(poolAddr)}/ohlcv/${cfg.tf}?aggregate=${cfg.agg}&limit=${limit}&currency=usd`;

    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json;version=20230302" },
    });
    if (!res.ok) return null;
    const json = await res.json();

    const raw: any[] = json?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(raw) || !raw.length) return null;

    const points: OHLCPoint[] = raw
      .map((item: any[]) => ({
        time:   Math.floor(Number(item[0])),
        open:   Number(item[1]),
        high:   Number(item[2]),
        low:    Number(item[3]),
        close:  Number(item[4]),
        volume: Number(item[5]) || 0,
      }))
      .filter((p: OHLCPoint) => p.time > 0 && p.close > 0);

    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

async function _fetchChartData(mint: string, interval: string): Promise<ChartResponse> {
  // Race Birdeye vs GeckoTerminal if Birdeye key is present,
  // otherwise go straight to GeckoTerminal (no wasted timeout)
  let points: OHLCPoint[] | null = null;

  const hasBirdeye = !!process.env.BIRDEYE_API_KEY;
  if (hasBirdeye) {
    // Race both providers — use whichever responds first with data
    const race = await Promise.race([
      fetchFromBirdeye(mint, interval),
      fetchFromGeckoTerminal(mint, interval),
    ]);
    points = race;
    // If winner returned null, try the other one (best-effort)
    if (!points) {
      const [be, gt] = await Promise.allSettled([
        fetchFromBirdeye(mint, interval),
        fetchFromGeckoTerminal(mint, interval),
      ]);
      points = (be.status === "fulfilled" && be.value) ||
               (gt.status === "fulfilled" && gt.value) ||
               null;
    }
  } else {
    points = await fetchFromGeckoTerminal(mint, interval);
  }

  // Downsample before sending to client
  const downsampled = points ? downsample(points, MAX_POINTS) : [];

  const result: ChartResponse = { mint, interval, points: downsampled };
  chartCache.set(`${mint}:${interval}`, { data: result, fetchedAt: Date.now() });
  return result;
}

export async function getChartData(mint: string, interval: string): Promise<ChartResponse> {
  const validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
  const safeInterval   = validIntervals.includes(interval) ? interval : "15m";
  const cacheKey       = `${mint}:${safeInterval}`;

  // 1. Serve from cache if fresh
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // 2. Deduplicate concurrent requests for the same key
  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey)!;
  }

  // 3. Kick off fetch, store promise for dedup, clean up when done
  const promise = _fetchChartData(mint, safeInterval).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}
