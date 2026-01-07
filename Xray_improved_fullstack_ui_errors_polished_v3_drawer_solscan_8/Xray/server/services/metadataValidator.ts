import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getRpcService } from "./rpcService";
import { env } from "../config/env";

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  volume24h?: number;
  liquidity?: number;
  priceUsd?: number | string;
  priceChange24h?: number;
  marketCap?: number;
  fdv?: number;
  pairAge?: number;
  verified: boolean;
  riskFlags: string[];
}

export interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
  };
  liquidity?: { usd: number };
  volume?: { h24: number };
  priceUsd?: string;
  priceChange?: { h24: number };
  fdv?: number;
  pairCreatedAt?: number;
}

interface CacheEntry {
  data: TokenMetadata;
  expiresAt: number;
}

const metadataCache = new Map<string, CacheEntry>();

function isValidSymbol(symbol: string): boolean {
  return /^[A-Za-z0-9_\-$]+$/.test(symbol);
}

function normalizeSymbol(symbol: string): string {
  return symbol
    .replace(/[^A-Za-z0-9_\-$]/g, "")
    .slice(0, 10)
    .toUpperCase();
}

function isValidDecimals(decimals: number): boolean {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}

export async function verifyMintOwner(mint: string): Promise<"spl-token" | "token-2022" | "unknown"> {
  try {
    const rpc = getRpcService();
    const pubkey = new PublicKey(mint);
    const accountInfo = await rpc.getAccountInfo(pubkey);

    if (!accountInfo) {
      return "unknown";
    }

    const owner = accountInfo.owner.toBase58();

    if (owner === TOKEN_PROGRAM_ID.toBase58()) {
      return "spl-token";
    }
    if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
      return "token-2022";
    }

    return "unknown";
  } catch (error) {
    console.error(`[metadata] Failed to verify mint owner for ${mint}:`, error);
    return "unknown";
  }
}

export function selectBestPair(pairs: DexPair[]): DexPair | null {
  if (!pairs || pairs.length === 0) {
    return null;
  }

  const solanaPairs = pairs.filter((p) => p.chainId === "solana");
  if (solanaPairs.length === 0) {
    return null;
  }

  solanaPairs.sort((a, b) => {
    const liqA = a.liquidity?.usd || 0;
    const liqB = b.liquidity?.usd || 0;
    return liqB - liqA;
  });

  return solanaPairs[0];
}

export function assessPairRisks(pair: DexPair): string[] {
  const flags: string[] = [];

  const liquidity = pair.liquidity?.usd || 0;
  const fdv = pair.fdv || 0;

  if (fdv > 0 && liquidity > 0) {
    const liquidityRatio = liquidity / fdv;
    if (liquidityRatio < 0.5) {
      flags.push("FDV_LIQUIDITY_DISCONNECT");
    }
  }

  if (pair.pairCreatedAt) {
    const ageHours = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
    if (ageHours < 24) {
      flags.push("VERY_NEW_MARKET");
    }
  }

  if (liquidity < 1000) {
    flags.push("VERY_LOW_LIQUIDITY");
  } else if (liquidity < 10000) {
    flags.push("LOW_LIQUIDITY");
  }

  const volume = pair.volume?.h24 || 0;
  if (volume < 100) {
    flags.push("VERY_LOW_VOLUME");
  }

  return flags;
}

export function validateAndNormalizeMetadata(
  raw: Partial<TokenMetadata>,
  pair?: DexPair | null
): TokenMetadata {
  const riskFlags: string[] = [];

  let symbol = raw.symbol || "UNKNOWN";
  if (!isValidSymbol(symbol)) {
    symbol = normalizeSymbol(symbol);
    riskFlags.push("SYMBOL_NORMALIZED");
  }

  let decimals = raw.decimals ?? 9;
  if (!isValidDecimals(decimals)) {
    decimals = Math.min(Math.max(Math.floor(decimals), 0), 18);
    riskFlags.push("DECIMALS_CORRECTED");
  }

  if (pair) {
    riskFlags.push(...assessPairRisks(pair));
  }

  return {
    mint: raw.mint || "",
    name: raw.name?.slice(0, 50) || symbol,
    symbol,
    decimals,
    logoURI: raw.logoURI,
    volume24h: raw.volume24h,
    liquidity: raw.liquidity,
    priceUsd: raw.priceUsd,
    priceChange24h: raw.priceChange24h,
    marketCap: raw.marketCap,
    fdv: raw.fdv,
    pairAge: raw.pairAge,
    verified: riskFlags.length === 0,
    riskFlags,
  };
}

export function getCachedMetadata(mint: string): TokenMetadata | null {
  const cached = metadataCache.get(mint);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  if (cached) {
    metadataCache.delete(mint);
  }
  return null;
}

export function setCachedMetadata(mint: string, data: TokenMetadata): void {
  metadataCache.set(mint, {
    data,
    expiresAt: Date.now() + env.metadataCacheTtlMs,
  });
}

export function createUnverifiedMetadata(mint: string): TokenMetadata {
  return {
    mint,
    name: "Unverified Token",
    symbol: "???",
    decimals: 9,
    verified: false,
    riskFlags: ["METADATA_UNAVAILABLE"],
  };
}

export function clearMetadataCache(): void {
  metadataCache.clear();
}

export function getMetadataCacheSize(): number {
  return metadataCache.size;
}
