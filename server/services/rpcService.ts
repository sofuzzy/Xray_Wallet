import { Connection, PublicKey, Commitment, GetVersionedTransactionConfig } from "@solana/web3.js";
import { env } from "../config/env";

export interface RpcServiceOptions {
  commitment?: Commitment;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Builds a Helius RPC URL with rebate-address query param for post-trade rebates.
 * Only appends the param if:
 * 1. ENABLE_HELIUS_REBATES is true
 * 2. HELIUS_REBATE_ADDRESS is set
 * 3. The base URL is a Helius RPC endpoint
 */
function buildRebateRpcUrl(baseUrl: string): string | null {
  if (!env.enableHeliusRebates || !env.heliusRebateAddress) {
    return null;
  }
  
  // Only apply to Helius endpoints
  if (!baseUrl.includes("helius")) {
    return null;
  }
  
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("rebate-address", env.heliusRebateAddress);
    return url.toString();
  } catch {
    return null;
  }
}

const DEFAULT_OPTIONS: Required<RpcServiceOptions> = {
  commitment: "confirmed",
  maxRetries: 5,
  initialDelayMs: 300,
  maxDelayMs: 5000,
  timeoutMs: 15000,
};

const PUBLIC_RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
];

interface RpcEndpointState {
  url: string;
  name: string;
  failureCount: number;
  lastFailure: number;
  latencyMs: number;
  connection: Connection;
}

class RpcService {
  private endpoints: RpcEndpointState[];
  private currentIndex: number = 0;
  private options: Required<RpcServiceOptions>;
  private bestEndpointUrl: string | null = null;
  private rebateConnection: Connection | null = null;

  constructor(rpcs: string[], options: RpcServiceOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const seen = new Set<string>();
    const allRpcs: string[] = [];
    
    for (const url of [...rpcs, ...PUBLIC_RPC_ENDPOINTS]) {
      const normalized = normalizeUrl(url);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        allRpcs.push(url);
      }
    }
    
    if (allRpcs.length === 0) {
      throw new Error("RpcService requires at least one RPC endpoint");
    }

    this.endpoints = allRpcs.map((url) => ({
      url,
      name: this.getEndpointName(url),
      failureCount: 0,
      lastFailure: 0,
      latencyMs: 1000,
      connection: new Connection(url, {
        commitment: this.options.commitment,
        confirmTransactionInitialTimeout: this.options.timeoutMs,
        disableRetryOnRateLimit: true,
      }),
    }));
    
    // Initialize rebate-enabled connection for Helius if configured
    this.initializeRebateConnection(rpcs);
    
    console.log(`[rpc] Initialized with ${this.endpoints.length} endpoints:`);
    this.endpoints.forEach((ep, i) => console.log(`  ${i + 1}. ${ep.name}`));
  }
  
  /**
   * Initialize a rebate-enabled connection for sendTransaction operations.
   * This connection is only used when sending transactions to capture post-trade rebates.
   */
  private initializeRebateConnection(rpcs: string[]): void {
    // Find a Helius endpoint to use for rebates
    const heliusUrl = rpcs.find(url => url.includes("helius"));
    if (!heliusUrl) {
      return;
    }
    
    const rebateUrl = buildRebateRpcUrl(heliusUrl);
    if (rebateUrl) {
      this.rebateConnection = new Connection(rebateUrl, {
        commitment: this.options.commitment,
        confirmTransactionInitialTimeout: this.options.timeoutMs,
        disableRetryOnRateLimit: true,
      });
      console.log(`[rpc] Rebate connection initialized for Helius`);
    }
  }
  
  private getEndpointName(url: string): string {
    if (url.includes("helius")) return "Helius";
    if (url.includes("quicknode")) return "QuickNode";
    if (url.includes("alchemy")) return "Alchemy";
    if (url.includes("ankr")) return "Ankr";
    if (url.includes("mainnet-beta.solana.com")) return "Solana Mainnet";
    if (url.includes("public-rpc")) return "Public RPC";
    return url.slice(0, 30);
  }

  private getNextEndpoint(): RpcEndpointState {
    const now = Date.now();
    
    if (this.bestEndpointUrl) {
      const best = this.endpoints.find(ep => ep.url === this.bestEndpointUrl);
      if (best && best.failureCount === 0) {
        return best;
      }
    }

    const sorted = [...this.endpoints].sort((a, b) => {
      if (a.failureCount !== b.failureCount) {
        return a.failureCount - b.failureCount;
      }
      return a.latencyMs - b.latencyMs;
    });

    for (const ep of sorted) {
      if (ep.failureCount === 0) {
        this.currentIndex = this.endpoints.indexOf(ep);
        return ep;
      }

      const cooldown = Math.min(ep.failureCount * 10000, 60000);
      if (now - ep.lastFailure > cooldown) {
        ep.failureCount = 0;
        this.currentIndex = this.endpoints.indexOf(ep);
        return ep;
      }
    }

    return sorted[0];
  }

  private markFailure(ep: RpcEndpointState): void {
    ep.failureCount++;
    ep.lastFailure = Date.now();
    if (this.bestEndpointUrl === ep.url) {
      this.bestEndpointUrl = null;
    }
    console.warn(`[rpc] ${ep.name} failed (count: ${ep.failureCount})`);
  }

  private markSuccess(ep: RpcEndpointState, latencyMs: number): void {
    ep.latencyMs = ep.latencyMs * 0.7 + latencyMs * 0.3;
    if (ep.failureCount > 0) {
      ep.failureCount = 0;
      console.log(`[rpc] ${ep.name} recovered`);
    }
    if (!this.bestEndpointUrl || ep.latencyMs < (this.endpoints.find(e => e.url === this.bestEndpointUrl)?.latencyMs || Infinity)) {
      this.bestEndpointUrl = ep.url;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("enotfound")) {
        return true;
      }
      if (msg.includes("429") || msg.includes("503") || msg.includes("502") || msg.includes("500")) {
        return true;
      }
    }
    return false;
  }

  async execute<T>(
    operation: (connection: Connection) => Promise<T>,
    operationName: string = "rpc"
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.options.initialDelayMs;
    const triedEndpoints = new Set<string>();

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      const ep = this.getNextEndpoint();
      triedEndpoints.add(ep.url);
      const startTime = Date.now();

      try {
        const result = await Promise.race([
          operation(ep.connection),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Request timeout")), this.options.timeoutMs)
          ),
        ]);
        
        const latency = Date.now() - startTime;
        this.markSuccess(ep, latency);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.markFailure(ep);

        if (!this.isRetryableError(error) && attempt === 0) {
          throw lastError;
        }

        if (attempt < this.options.maxRetries - 1) {
          const jitter = Math.random() * delay * 0.1;
          await this.sleep(delay + jitter);
          delay = Math.min(delay * 2, this.options.maxDelayMs);
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.options.maxRetries} attempts`);
  }
  
  getHealthStatus(): { endpoints: Array<{ name: string; healthy: boolean; latencyMs: number; failures: number }> } {
    return {
      endpoints: this.endpoints.map(ep => ({
        name: ep.name,
        healthy: ep.failureCount < 3,
        latencyMs: Math.round(ep.latencyMs),
        failures: ep.failureCount,
      })),
    };
  }

  getConnection(): Connection {
    return this.getNextEndpoint().connection;
  }

  async getLatestBlockhash(commitment?: Commitment): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    return this.execute(
      (conn) => conn.getLatestBlockhash(commitment || this.options.commitment),
      "getLatestBlockhash"
    );
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.execute((conn) => conn.getBalance(publicKey), "getBalance");
  }

  async getAccountInfo(publicKey: PublicKey) {
    return this.execute((conn) => conn.getAccountInfo(publicKey), "getAccountInfo");
  }

  async getTokenSupply(mint: PublicKey) {
    return this.execute((conn) => conn.getTokenSupply(mint), "getTokenSupply");
  }

  async getTokenLargestAccounts(mint: PublicKey) {
    return this.execute((conn) => conn.getTokenLargestAccounts(mint), "getTokenLargestAccounts");
  }

  async getParsedTokenAccountsByOwner(owner: PublicKey, filter: { programId: PublicKey }) {
    return this.execute(
      (conn) => conn.getParsedTokenAccountsByOwner(owner, filter),
      "getParsedTokenAccountsByOwner"
    );
  }

  /**
   * Send a raw transaction, using the rebate-enabled connection if available.
   * This routes transactions through Helius with rebate-address param for post-trade rebates.
   */
  async sendRawTransaction(
    rawTransaction: Buffer,
    options?: { skipPreflight?: boolean; preflightCommitment?: Commitment }
  ): Promise<string> {
    // Use rebate connection for sendTransaction if available
    if (this.rebateConnection) {
      try {
        const signature = await this.rebateConnection.sendRawTransaction(rawTransaction, options);
        console.log(`[rpc] Transaction sent via rebate-enabled connection`);
        return signature;
      } catch (error) {
        // Fall back to regular connection on error
        console.warn(`[rpc] Rebate connection failed, falling back to regular connection:`, error);
      }
    }
    
    // Fallback to regular multi-endpoint execution
    return this.execute(
      (conn) => conn.sendRawTransaction(rawTransaction, options),
      "sendRawTransaction"
    );
  }

  async confirmTransaction(
    signature: string,
    blockhash: string,
    lastValidBlockHeight: number,
    commitment?: Commitment
  ): Promise<void> {
    await this.execute(
      (conn) =>
        conn.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          commitment || this.options.commitment
        ),
      "confirmTransaction"
    );
  }

  async getSignaturesForAddress(address: PublicKey, options?: { limit?: number }) {
    return this.execute(
      (conn) => conn.getSignaturesForAddress(address, options),
      "getSignaturesForAddress"
    );
  }

  async getParsedTransaction(signature: string, config?: GetVersionedTransactionConfig) {
    return this.execute(
      (conn) => conn.getParsedTransaction(signature, config),
      "getParsedTransaction"
    );
  }
}

let rpcServiceInstance: RpcService | null = null;

export function getRpcService(options?: RpcServiceOptions): RpcService {
  if (!rpcServiceInstance) {
    rpcServiceInstance = new RpcService(env.solanaRpcs, options);
  }
  return rpcServiceInstance;
}

export function createUserRpcService(
  userRpcUrl: string,
  options?: RpcServiceOptions
): RpcService | null {
  if (!userRpcUrl || typeof userRpcUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(userRpcUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      console.warn("[rpc] Invalid user RPC protocol:", url.protocol);
      return null;
    }

    const blockedPatterns = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];
    if (blockedPatterns.some((p) => url.hostname.includes(p))) {
      console.warn("[rpc] User RPC points to localhost, rejected");
      return null;
    }

    return new RpcService([userRpcUrl, ...env.solanaRpcs], options);
  } catch {
    console.warn("[rpc] Invalid user RPC URL:", userRpcUrl.slice(0, 50));
    return null;
  }
}

export { RpcService };
