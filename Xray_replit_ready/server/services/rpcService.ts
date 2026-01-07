import { Connection, PublicKey, Commitment, GetVersionedTransactionConfig } from "@solana/web3.js";
import { env } from "../config/env";

export interface RpcServiceOptions {
  commitment?: Commitment;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RpcServiceOptions> = {
  commitment: "confirmed",
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  timeoutMs: 30000,
};

interface RpcEndpointState {
  url: string;
  failureCount: number;
  lastFailure: number;
  connection: Connection;
}

class RpcService {
  private endpoints: RpcEndpointState[];
  private currentIndex: number = 0;
  private options: Required<RpcServiceOptions>;

  constructor(rpcs: string[], options: RpcServiceOptions = {}) {
    if (rpcs.length === 0) {
      throw new Error("RpcService requires at least one RPC endpoint");
    }

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.endpoints = rpcs.map((url) => ({
      url,
      failureCount: 0,
      lastFailure: 0,
      connection: new Connection(url, {
        commitment: this.options.commitment,
        confirmTransactionInitialTimeout: this.options.timeoutMs,
      }),
    }));
  }

  private getNextEndpoint(): RpcEndpointState {
    const now = Date.now();

    for (let i = 0; i < this.endpoints.length; i++) {
      const idx = (this.currentIndex + i) % this.endpoints.length;
      const ep = this.endpoints[idx];

      if (ep.failureCount === 0) {
        this.currentIndex = idx;
        return ep;
      }

      const cooldown = Math.min(ep.failureCount * 5000, 60000);
      if (now - ep.lastFailure > cooldown) {
        ep.failureCount = 0;
        this.currentIndex = idx;
        return ep;
      }
    }

    let best = this.endpoints[0];
    for (const ep of this.endpoints) {
      if (ep.failureCount < best.failureCount) {
        best = ep;
      }
    }
    return best;
  }

  private markFailure(ep: RpcEndpointState): void {
    ep.failureCount++;
    ep.lastFailure = Date.now();
    console.warn(`[rpc] Endpoint ${ep.url.slice(0, 40)}... failed (count: ${ep.failureCount})`);
  }

  private markSuccess(ep: RpcEndpointState): void {
    if (ep.failureCount > 0) {
      ep.failureCount = 0;
      console.log(`[rpc] Endpoint ${ep.url.slice(0, 40)}... recovered`);
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

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      const ep = this.getNextEndpoint();

      try {
        const result = await operation(ep.connection);
        this.markSuccess(ep);
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

  async sendRawTransaction(
    rawTransaction: Buffer,
    options?: { skipPreflight?: boolean; preflightCommitment?: Commitment }
  ): Promise<string> {
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
