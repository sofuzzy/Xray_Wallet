import { clusterApiUrl } from "@solana/web3.js";

export interface EnvConfig {
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  solanaRpcs: string[];
  webauthnOrigins: string[];
  webauthnRpId: string;
  metadataCacheTtlMs: number;
}

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildSolanaRpcs(): string[] {
  const rpcs: string[] = [];

  if (process.env.SOLANA_RPCS) {
    rpcs.push(...parseCommaSeparated(process.env.SOLANA_RPCS));
  }

  if (process.env.HELIUS_RPC_URL) {
    rpcs.push(process.env.HELIUS_RPC_URL);
  }
  if (process.env.QUICKNODE_RPC_URL) {
    rpcs.push(process.env.QUICKNODE_RPC_URL);
  }
  if (process.env.SOLANA_RPC_URL) {
    rpcs.push(process.env.SOLANA_RPC_URL);
  }

  const unique = Array.from(new Set(rpcs));

  if (unique.length === 0) {
    unique.push(clusterApiUrl("mainnet-beta"));
  }

  return unique;
}

function buildWebauthnOrigins(): string[] {
  const origins: string[] = [];

  if (process.env.XRAY_WEBAUTHN_ORIGINS) {
    origins.push(...parseCommaSeparated(process.env.XRAY_WEBAUTHN_ORIGINS));
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }

  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    const domain = `${process.env.REPL_SLUG}.${process.env.REPL_OWNER.toLowerCase()}.repl.co`;
    origins.push(`https://${domain}`);
  }

  if (origins.length === 0) {
    origins.push("http://localhost:5000");
  }

  return Array.from(new Set(origins));
}

function buildWebauthnRpId(): string {
  if (process.env.XRAY_WEBAUTHN_RPID) {
    return process.env.XRAY_WEBAUTHN_RPID;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return process.env.REPLIT_DEV_DOMAIN;
  }
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `${process.env.REPL_SLUG}.${process.env.REPL_OWNER.toLowerCase()}.repl.co`;
  }
  return "localhost";
}

function loadConfig(): EnvConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as EnvConfig["nodeEnv"];
  const isProduction = nodeEnv === "production";

  const config: EnvConfig = {
    nodeEnv,
    isProduction,
    solanaRpcs: buildSolanaRpcs(),
    webauthnOrigins: buildWebauthnOrigins(),
    webauthnRpId: buildWebauthnRpId(),
    metadataCacheTtlMs: 60_000,
  };

  return config;
}

export const env = loadConfig();

export function validateStartupConfig(): void {
  if (env.solanaRpcs.length === 0) {
    throw new Error("STARTUP GUARD FAILED: No Solana RPC endpoints configured. Set SOLANA_RPCS or HELIUS_RPC_URL.");
  }

  if (env.isProduction && env.webauthnOrigins.length === 0) {
    throw new Error("STARTUP GUARD FAILED: No WebAuthn origins configured in production. Set XRAY_WEBAUTHN_ORIGINS.");
  }

  console.log(`[config] Environment: ${env.nodeEnv}`);
  console.log(`[config] Solana RPCs configured: ${env.solanaRpcs.length}`);
  console.log(`[config] WebAuthn origins: ${env.webauthnOrigins.join(", ")}`);
  console.log(`[config] WebAuthn RP ID: ${env.webauthnRpId}`);
}
