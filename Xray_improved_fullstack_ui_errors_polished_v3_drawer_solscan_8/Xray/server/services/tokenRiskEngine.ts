import crypto from "crypto";
import { fetchJson } from "../utils/fetch";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { getRpcService } from "./rpcService";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

/**
 * Risk engine heuristics:
 * - Uses public DexScreener token/pair data + (optional) on-chain reads to produce a conservative risk score.
 * - Score is 0 (low risk) .. 100 (very high risk).
 *
 * NOTE: This is NOT an audit, not investment advice, and can be wrong.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFlag {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  details?: Record<string, any>;
}

export interface TokenRiskAssessment {
  mint: string;
  score: number;
  level: RiskLevel;
  flags: RiskFlag[];
  inputs?: Record<string, any>;
  updatedAt: number;
}

type CacheEntry = { expiry: number; data: TokenRiskAssessment };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 300_000; // 5 minutes - token risk doesn't change rapidly

function nowMs() {
  return Date.now();
}

function safeNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function computeLevel(score: number): RiskLevel {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function hashKey(mint: string): string {
  return crypto.createHash("sha256").update(mint).digest("hex");
}

function isProbablyMint(str: string) {
  const s = str.trim();
  return s.length >= 20 && s.length <= 60;
}

function addFlag(flags: RiskFlag[], flag: RiskFlag) {
  // de-duplicate by code to keep UX clean
  if (!flags.some((f) => f.code === flag.code)) {
    flags.push(flag);
  }
}


async function assessOnChain(mint: PublicKey): Promise<{
  tokenProgram: "spl-token" | "token-2022" | "unknown";
  mintAuthorityPresent: boolean | null;
  freezeAuthorityPresent: boolean | null;
  supplyUi: number | null;
  decimals: number | null;
  topHolders?: {
    top1Pct: number | null;
    top5Pct: number | null;
    top10Pct: number | null;
    largest: { address: string; uiAmount: number }[];
  };
}> {
  const rpc = getRpcService();
  const acct = await rpc.getAccountInfo(mint);
  if (!acct) {
    return {
      tokenProgram: "unknown",
      mintAuthorityPresent: null,
      freezeAuthorityPresent: null,
      supplyUi: null,
      decimals: null,
    };
  }

  const owner = acct.owner.toBase58();
  const tokenProgram =
    owner === TOKEN_PROGRAM_ID.toBase58()
      ? "spl-token"
      : owner === TOKEN_2022_PROGRAM_ID.toBase58()
        ? "token-2022"
        : "unknown";

  let mintInfo: any = null;
  try {
    const programId =
      tokenProgram === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    mintInfo = await getMint(rpc.getConnection(), mint, "confirmed", programId);
  } catch {
    // If parsing fails, still proceed with program classification only
  }

  const mintAuthorityPresent =
    mintInfo?.mintAuthority ? true : mintInfo === null ? null : false;
  const freezeAuthorityPresent =
    mintInfo?.freezeAuthority ? true : mintInfo === null ? null : false;
  const supplyUi =
    typeof mintInfo?.supply === "bigint" && typeof mintInfo?.decimals === "number"
      ? Number(mintInfo.supply) / 10 ** mintInfo.decimals
      : null;
  const decimals = typeof mintInfo?.decimals === "number" ? mintInfo.decimals : null;

  let topHolders: any = undefined;
  try {
    const [supplyResp, largestResp] = await Promise.all([
      rpc.getTokenSupply(mint),
      rpc.getTokenLargestAccounts(mint),
    ]);

    const supplyUi2 = safeNum(supplyResp?.value?.uiAmount);
    const largest = (largestResp?.value || [])
      .map((x: any) => ({
        address: String(x.address),
        uiAmount: safeNum(x.uiAmount) ?? 0,
      }))
      .sort((a: { uiAmount: number }, b: { uiAmount: number }) => b.uiAmount - a.uiAmount);

    const total = supplyUi2 && supplyUi2 > 0 ? supplyUi2 : supplyUi && supplyUi > 0 ? supplyUi : null;

    const sumTop = (k: number) => largest.slice(0, k).reduce((acc: number, x: { uiAmount: number }) => acc + (x.uiAmount || 0), 0);

    const pct = (x: number) => (total ? (x / total) * 100 : null);

    topHolders = {
      top1Pct: pct(sumTop(1)),
      top5Pct: pct(sumTop(5)),
      top10Pct: pct(sumTop(10)),
      largest: largest.slice(0, 10),
    };

    // prefer supply from RPC response
    if (supplyUi2 !== null) {
      return {
        tokenProgram,
        mintAuthorityPresent,
        freezeAuthorityPresent,
        supplyUi: supplyUi2,
        decimals: decimals ?? safeNum(supplyResp?.value?.decimals),
        topHolders,
      };
    }
  } catch {
    // ignore, still return what we have
  }

  return { tokenProgram, mintAuthorityPresent, freezeAuthorityPresent, supplyUi, decimals, topHolders };
}

export async function assessTokenRisk(mint: string): Promise<TokenRiskAssessment | null> {
  const key = mint.trim();

  // Basic mint sanity check
  if (!isProbablyMint(key)) return null;

  const cacheKey = `${hashKey(key)}:v2`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > nowMs()) return cached.data;

  const flags: RiskFlag[] = [];
  let score = 0;

  // Run DexScreener and on-chain assessment in PARALLEL for speed
  const disableOnchain = process.env.DISABLE_ONCHAIN_RISK === "1" || process.env.DISABLE_ONCHAIN_RISK === "true";
  
  let pk: PublicKey | null = null;
  try {
    pk = new PublicKey(key);
  } catch {
    pk = null;
  }

  const [data, onchainResult] = await Promise.all([
    fetchJson(`${DEXSCREENER_API}/tokens/${encodeURIComponent(key)}`),
    (!disableOnchain && pk) ? assessOnChain(pk).catch(() => null) : Promise.resolve(null),
  ]);
  const pairs = data?.pairs as any[] | undefined;

  if (!pairs?.length) {
    // If DexScreener has nothing, still do on-chain checks (some tokens won't be indexed).
    addFlag(flags, {
      code: "NO_DEX_DATA",
      severity: "medium",
      message: "No DEX market data found (token may be untracked, illiquid, or very new).",
    });
    score += 15;
  }

  let dexInputs: Record<string, any> = {};
  let pair: any = null;

  if (pairs?.length) {
    pairs.sort(
      (a, b) =>
        (safeNum(b?.liquidity?.usd) || 0) - (safeNum(a?.liquidity?.usd) || 0)
    );
    pair = pairs[0];

    const liquidityUsd = safeNum(pair?.liquidity?.usd);
    const volume24hUsd = safeNum(pair?.volume?.h24);
    const priceChange24hPct = safeNum(pair?.priceChange?.h24);
    const fdv = safeNum(pair?.fdv);
    const dexId = typeof pair?.dexId === "string" ? pair.dexId : null;
    const chainId = typeof pair?.chainId === "string" ? pair.chainId : null;
    const pairCreatedAt = safeNum(pair?.pairCreatedAt);

    dexInputs = {
      chainId,
      dexId,
      liquidityUsd,
      volume24hUsd,
      priceChange24hPct,
      fdv,
      pairCreatedAt,
      pairAddress: typeof pair?.pairAddress === "string" ? pair.pairAddress : null,
    };

    // Liquidity thresholds
    if (liquidityUsd !== null) {
      if (liquidityUsd < 2_000) {
        score += 55;
        addFlag(flags, {
          code: "LOW_LIQUIDITY_CRITICAL",
          severity: "high",
          message: "Very low liquidity (high slippage / easy to manipulate).",
          details: { liquidityUsd },
        });
      } else if (liquidityUsd < 10_000) {
        score += 35;
        addFlag(flags, {
          code: "LOW_LIQUIDITY",
          severity: "high",
          message: "Low liquidity (slippage and manipulation risk).",
          details: { liquidityUsd },
        });
      } else if (liquidityUsd < 50_000) {
        score += 15;
        addFlag(flags, {
          code: "MODEST_LIQUIDITY",
          severity: "medium",
          message: "Modest liquidity (moderate slippage / manipulation risk).",
          details: { liquidityUsd },
        });
      }
    } else {
      score += 10;
      addFlag(flags, {
        code: "UNKNOWN_LIQUIDITY",
        severity: "medium",
        message: "Liquidity unavailable from market data source.",
      });
    }

    // Volume vs liquidity anomaly
    if (liquidityUsd !== null && volume24hUsd !== null && liquidityUsd > 0) {
      const ratio = volume24hUsd / liquidityUsd;
      if (ratio > 25) {
        score += 25;
        addFlag(flags, {
          code: "VOLUME_LIQUIDITY_SPIKE",
          severity: "high",
          message: "Volume is extremely high relative to liquidity (wash trading or manipulation possible).",
          details: { volume24hUsd, liquidityUsd, ratio },
        });
      } else if (ratio > 10) {
        score += 15;
        addFlag(flags, {
          code: "VOLUME_LIQUIDITY_HIGH",
          severity: "medium",
          message: "Volume is high relative to liquidity (increased manipulation risk).",
          details: { volume24hUsd, liquidityUsd, ratio },
        });
      }
    }

    // Price change volatility
    if (priceChange24hPct !== null) {
      const abs = Math.abs(priceChange24hPct);
      if (abs >= 200) {
        score += 25;
        addFlag(flags, {
          code: "EXTREME_VOLATILITY_24H",
          severity: "high",
          message: "Extreme 24h price change (high volatility / possible pump & dump).",
          details: { priceChange24hPct },
        });
      } else if (abs >= 80) {
        score += 15;
        addFlag(flags, {
          code: "HIGH_VOLATILITY_24H",
          severity: "medium",
          message: "High 24h price change (elevated volatility).",
          details: { priceChange24hPct },
        });
      }
    }

    // New pair (age) heuristic
    if (pairCreatedAt !== null) {
      const ageHours = (nowMs() - pairCreatedAt) / (1000 * 60 * 60);
      if (ageHours < 2) {
        score += 30;
        addFlag(flags, {
          code: "VERY_NEW_MARKET",
          severity: "high",
          message: "Market appears very new (higher rug / manipulation risk).",
          details: { ageHours: Math.round(ageHours * 10) / 10 },
        });
      } else if (ageHours < 24) {
        score += 15;
        addFlag(flags, {
          code: "NEW_MARKET",
          severity: "medium",
          message: "Market appears new (higher risk than established tokens).",
          details: { ageHours: Math.round(ageHours * 10) / 10 },
        });
      }
    }

    // FDV sanity (if present and liquidity tiny)
    if (fdv !== null && liquidityUsd !== null && liquidityUsd > 0) {
      const fdvToLiq = fdv / liquidityUsd;
      if (fdvToLiq > 10_000) {
        score += 15;
        addFlag(flags, {
          code: "FDV_LIQ_DISCONNECT",
          severity: "medium",
          message: "FDV is extremely high relative to liquidity (valuation may be misleading).",
          details: { fdv, liquidityUsd, fdvToLiq },
        });
      }
    }

    // LP lock / burn signals (best-effort; often unavailable on Solana)
    const lockedUsd = safeNum(pair?.liquidity?.lockedUsd) ?? safeNum(pair?.liquidity?.lockedUSD);
    if (lockedUsd !== null && liquidityUsd !== null && liquidityUsd > 0) {
      const lockedRatio = lockedUsd / liquidityUsd;
      if (lockedRatio < 0.05) {
        score += 15;
        addFlag(flags, {
          code: "LP_NOT_LOCKED",
          severity: "high",
          message: "Liquidity appears mostly unlocked (higher rug-pull risk).",
          details: { lockedUsd, liquidityUsd, lockedRatio },
        });
      } else if (lockedRatio < 0.25) {
        score += 8;
        addFlag(flags, {
          code: "LP_PARTIALLY_LOCKED",
          severity: "medium",
          message: "Liquidity appears only partially locked.",
          details: { lockedUsd, liquidityUsd, lockedRatio },
        });
      }
    } else {
      addFlag(flags, {
        code: "LP_LOCK_UNVERIFIED",
        severity: "low",
        message: "Liquidity lock/burn status not verifiable from available market data.",
        details: { dexId },
      });
    }
  }

  // ---------- On-chain heuristics (from parallel fetch) ----------
  let onchainInputs: Record<string, any> = {};
  if (onchainResult) {
    const oc = onchainResult;

    onchainInputs = {
      tokenProgram: oc.tokenProgram,
      mintAuthorityPresent: oc.mintAuthorityPresent,
      freezeAuthorityPresent: oc.freezeAuthorityPresent,
      supplyUi: oc.supplyUi,
      decimals: oc.decimals,
      topHolders: oc.topHolders
        ? {
            top1Pct: oc.topHolders.top1Pct,
            top5Pct: oc.topHolders.top5Pct,
            top10Pct: oc.topHolders.top10Pct,
          }
        : undefined,
    };

    // Token program
    if (oc.tokenProgram === "unknown") {
        score += 35;
        addFlag(flags, {
          code: "UNKNOWN_TOKEN_PROGRAM",
          severity: "high",
          message: "Mint is not owned by the standard SPL Token program (unexpected token program).",
          details: { owner: "unknown" },
        });
      } else if (oc.tokenProgram === "token-2022") {
        // Token-2022 is legitimate but can have extensions; small bump for complexity
        score += 4;
        addFlag(flags, {
          code: "TOKEN_2022",
          severity: "low",
          message: "Token uses Token-2022 program (may include extensions; verify expected behavior).",
        });
      }

      // Authorities
      if (oc.mintAuthorityPresent === true) {
        score += 25;
        addFlag(flags, {
          code: "MINT_AUTHORITY_PRESENT",
          severity: "high",
          message: "Mint authority is still enabled (supply can be increased).",
        });
      } else if (oc.mintAuthorityPresent === null) {
        score += 6;
        addFlag(flags, {
          code: "MINT_AUTHORITY_UNKNOWN",
          severity: "low",
          message: "Unable to determine mint authority status on-chain.",
        });
      }

      if (oc.freezeAuthorityPresent === true) {
        score += 15;
        addFlag(flags, {
          code: "FREEZE_AUTHORITY_PRESENT",
          severity: "medium",
          message: "Freeze authority is enabled (accounts could potentially be frozen).",
        });
      } else if (oc.freezeAuthorityPresent === null) {
        score += 4;
        addFlag(flags, {
          code: "FREEZE_AUTHORITY_UNKNOWN",
          severity: "low",
          message: "Unable to determine freeze authority status on-chain.",
        });
      }

      // Supply sanity
      if (oc.supplyUi !== null) {
        if (oc.supplyUi === 0) {
          score += 20;
          addFlag(flags, {
            code: "ZERO_SUPPLY",
            severity: "high",
            message: "On-chain supply is zero (token may be unusable or incorrectly indexed).",
          });
        } else if (oc.supplyUi < 1) {
          score += 8;
          addFlag(flags, {
            code: "TINY_SUPPLY",
            severity: "medium",
            message: "On-chain supply is extremely small (check decimals and legitimacy).",
            details: { supplyUi: oc.supplyUi, decimals: oc.decimals },
          });
        }
      }

      // Concentration: top holders
      const th = oc.topHolders;
      if (th && th.top1Pct !== null) {
        if (th.top1Pct >= 35) {
          score += 25;
          addFlag(flags, {
            code: "TOP_HOLDER_CONCENTRATION_CRITICAL",
            severity: "high",
            message: "Top holder controls a very large share of supply (rug / dump risk).",
            details: { top1Pct: th.top1Pct },
          });
        } else if (th.top1Pct >= 20) {
          score += 15;
          addFlag(flags, {
            code: "TOP_HOLDER_CONCENTRATION",
            severity: "medium",
            message: "Top holder controls a large share of supply (dump risk).",
            details: { top1Pct: th.top1Pct },
          });
        }
      } else {
        score += 6;
        addFlag(flags, {
          code: "TOP_HOLDERS_UNKNOWN",
          severity: "low",
          message: "Unable to determine top-holder concentration from RPC.",
        });
      }

      if (th && th.top5Pct !== null) {
        if (th.top5Pct >= 70) {
          score += 20;
          addFlag(flags, {
            code: "TOP5_CONCENTRATION_HIGH",
            severity: "high",
            message: "Top 5 holders control most of the supply (high concentration risk).",
            details: { top5Pct: th.top5Pct },
          });
        } else if (th.top5Pct >= 50) {
          score += 12;
          addFlag(flags, {
            code: "TOP5_CONCENTRATION",
            severity: "medium",
            message: "Top 5 holders control a majority of the supply (concentration risk).",
            details: { top5Pct: th.top5Pct },
          });
        }
      }
  }

  score = clamp(score, 0, 100);
  const level = computeLevel(score);

  const assessment: TokenRiskAssessment = {
    mint: key,
    score,
    level,
    flags,
    inputs: { dex: dexInputs, onchain: onchainInputs },
    updatedAt: nowMs(),
  };

  cache.set(cacheKey, { expiry: nowMs() + CACHE_TTL_MS, data: assessment });
  return assessment;
}

/**
 * Batch assess multiple tokens for risk.
 * Returns a record of mint -> assessment (null if assessment failed).
 */
export async function assessTokenRiskBatch(
  mints: string[]
): Promise<Record<string, TokenRiskAssessment | null>> {
  const results: Record<string, TokenRiskAssessment | null> = {};
  
  // Process in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < mints.length; i += CONCURRENCY) {
    const batch = mints.slice(i, i + CONCURRENCY);
    const assessments = await Promise.all(
      batch.map((mint) => assessTokenRisk(mint).catch(() => null))
    );
    batch.forEach((mint, idx) => {
      results[mint] = assessments[idx];
    });
  }
  
  return results;
}