import { PublicKey, LAMPORTS_PER_SOL, StakeProgram } from "@solana/web3.js";
import { getRpcService, createUserRpcService, RpcService } from "./rpcService";
import { broadcastAndConfirmTransaction, isHeliusSenderEnabled } from "./heliusSender";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export async function getWalletBalance(
  walletAddress: string,
  userRpc?: string
): Promise<{ balance: number; lamports: number }> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const publicKey = new PublicKey(walletAddress);
    const lamports = await rpc.getBalance(publicKey);
    return {
      balance: lamports / LAMPORTS_PER_SOL,
      lamports,
    };
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    throw error;
  }
}

export async function getTokenAccounts(
  walletAddress: string,
  userRpc?: string
): Promise<Array<{ mint: string; balance: number; decimals: number; tokenProgram: string }>> {
  try {
    console.log("Fetching token accounts for:", walletAddress);
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const publicKey = new PublicKey(walletAddress);
    
    // Fetch both SPL Token and Token-2022 accounts in parallel
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      rpc.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      rpc.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    console.log("Found", tokenAccounts.value.length, "SPL token accounts");
    console.log("Found", token2022Accounts.value.length, "Token-2022 accounts");

    // Process SPL Token accounts
    const splTokens = tokenAccounts.value
      .map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed?.info;
        if (!info) return null;

        const balance = parseFloat(info.tokenAmount?.uiAmountString || "0");
        if (balance === 0) return null;

        return {
          mint: info.mint,
          balance,
          decimals: info.tokenAmount?.decimals || 0,
          tokenProgram: TOKEN_PROGRAM_ID.toString(),
        };
      })
      .filter((t) => t !== null);
    
    // Process Token-2022 accounts
    const token2022Tokens = token2022Accounts.value
      .map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed?.info;
        if (!info) return null;

        const balance = parseFloat(info.tokenAmount?.uiAmountString || "0");
        if (balance === 0) return null;

        return {
          mint: info.mint,
          balance,
          decimals: info.tokenAmount?.decimals || 0,
          tokenProgram: TOKEN_2022_PROGRAM_ID.toString(),
        };
      })
      .filter((t) => t !== null);
    
    const tokens = [...splTokens, ...token2022Tokens] as { mint: string; balance: number; decimals: number; tokenProgram: string }[];
    
    console.log("Returning", tokens.length, "tokens with non-zero balance");
    return tokens;
  } catch (error) {
    console.error("Error fetching token accounts:", error);
    return [];
  }
}

export interface SendRawTransactionResult {
  signature?: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

function parseTransactionError(error: any): { code: string; message: string } {
  const errMsg = error?.message || String(error);
  
  if (errMsg.includes("blockhash") && (errMsg.includes("expired") || errMsg.includes("not found"))) {
    return { code: "BLOCKHASH_EXPIRED", message: "Transaction blockhash has expired. Please try again." };
  }
  if (errMsg.includes("signature verification") || errMsg.includes("invalid signature") || errMsg.includes("INVALID")) {
    return { code: "INVALID_SIGNATURE", message: "Transaction signature is invalid. The transaction may have been modified." };
  }
  if (errMsg.includes("429") || errMsg.includes("Too Many Requests")) {
    return { code: "RATE_LIMITED", message: "Network is busy. Please try again in a few seconds." };
  }
  if (errMsg.includes("insufficient funds") || errMsg.includes("Insufficient") || errMsg.includes("0x1")) {
    return { code: "INSUFFICIENT_FUNDS", message: "Insufficient SOL balance for this transaction." };
  }
  
  return { code: "TRANSACTION_FAILED", message: errMsg || "Transaction failed. Please try again." };
}

export async function sendRawTransaction(
  serializedTransaction: string,
  userRpc?: string
): Promise<string> {
  try {
    // Use Helius Sender for ultra-low latency if enabled
    if (isHeliusSenderEnabled() && !userRpc) {
      const { signature, usedSender } = await broadcastAndConfirmTransaction(serializedTransaction);
      console.log(`[tx] Broadcast via ${usedSender ? "Helius Sender" : "standard RPC"}: ${signature}`);
      return signature;
    }
    
    // Fallback to standard RPC broadcast
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const buffer = Buffer.from(serializedTransaction, "base64");
    const signature = await rpc.sendRawTransaction(buffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    console.log(`[tx] Broadcast via standard RPC: ${signature}`);
    
    const latestBlockhash = await rpc.getLatestBlockhash();
    await rpc.confirmTransaction(
      signature,
      latestBlockhash.blockhash,
      latestBlockhash.lastValidBlockHeight
    );
    
    return signature;
  } catch (error: any) {
    console.error("Error sending transaction:", error);
    const parsed = parseTransactionError(error);
    const enhancedError = new Error(`${parsed.code}: ${parsed.message}`);
    (enhancedError as any).code = parsed.code;
    throw enhancedError;
  }
}

export async function getLatestBlockhash(userRpc?: string): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
  return rpc.getLatestBlockhash();
}

export interface OnChainTransaction {
  id: number;
  signature: string;
  fromAddr: string;
  toAddr: string;
  amount: string;
  type: string;
  status: string;
  timestamp: Date | null;
  userId: string | null;
  inputToken: string | null;
  outputToken: string | null;
  outputAmount: string | null;
}

// ========== Staking Functions ==========

export interface StakeAccountInfo {
  pubkey: string;
  lamports: number;
  state: 'inactive' | 'activating' | 'active' | 'deactivating';
  validator?: string;
}

export async function getStakeAccounts(
  walletAddress: string,
  userRpc?: string
): Promise<StakeAccountInfo[]> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const publicKey = new PublicKey(walletAddress);
    
    const stakeAccounts = await rpc.execute(
      (connection) => connection.getParsedProgramAccounts(
        StakeProgram.programId,
        {
          filters: [
            { dataSize: 200 },
            {
              memcmp: {
                offset: 12,
                bytes: publicKey.toBase58(),
              },
            },
          ],
        }
      ),
      "getStakeAccounts"
    );

    return stakeAccounts.map((account) => {
      const parsed = (account.account.data as any).parsed;
      const info = parsed?.info;
      const stake = info?.stake;
      
      let state: StakeAccountInfo['state'] = 'inactive';
      if (stake?.delegation) {
        const activationEpoch = stake.delegation.activationEpoch;
        const deactivationEpoch = stake.delegation.deactivationEpoch;
        
        if (deactivationEpoch !== '18446744073709551615') {
          state = 'deactivating';
        } else if (activationEpoch !== '18446744073709551615') {
          state = 'active';
        }
      }

      return {
        pubkey: account.pubkey.toString(),
        lamports: account.account.lamports,
        state,
        validator: stake?.delegation?.voter,
      };
    });
  } catch (error) {
    console.error("Error fetching stake accounts:", error);
    return [];
  }
}

export interface ValidatorInfo {
  votePubkey: string;
  activatedStake: number;
  commission: number;
}

export async function getValidators(userRpc?: string): Promise<ValidatorInfo[]> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    
    const voteAccounts = await rpc.execute(
      (connection) => connection.getVoteAccounts(),
      "getVoteAccounts"
    );
    
    return voteAccounts.current
      .filter((v) => v.commission <= 10) // Only validators with max 10% commission
      .sort((a, b) => b.activatedStake - a.activatedStake)
      .slice(0, 20)
      .map((v) => ({
        votePubkey: v.votePubkey,
        activatedStake: v.activatedStake,
        commission: v.commission,
      }));
  } catch (error) {
    console.error("Error fetching validators:", error);
    return [];
  }
}

export async function getMinimumBalanceForRentExemption(
  dataLength: number = StakeProgram.space,
  userRpc?: string
): Promise<number> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    
    return await rpc.execute(
      (connection) => connection.getMinimumBalanceForRentExemption(dataLength),
      "getMinimumBalanceForRentExemption"
    );
  } catch (error) {
    console.error("Error fetching rent exemption:", error);
    throw error;
  }
}

export async function getTransactionStatus(
  signature: string,
  userRpc?: string
): Promise<{ status: string; confirmations: number | null; err: any | null }> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    
    const status = await rpc.execute(
      (connection) => connection.getSignatureStatus(signature),
      "getSignatureStatus"
    );
    
    if (!status.value) {
      return { status: 'not_found', confirmations: null, err: null };
    }
    
    const confirmationStatus = status.value.confirmationStatus;
    return {
      status: confirmationStatus || 'unknown',
      confirmations: status.value.confirmations,
      err: status.value.err,
    };
  } catch (error) {
    console.error("Error fetching transaction status:", error);
    throw error;
  }
}

// Get RPC health info for dev headers
export function getRpcHealthInfo(): { host: string; tier: string } {
  const rpc = getRpcService();
  const health = rpc.getHealthStatus();
  const bestEndpoint = health.endpoints.find(ep => ep.healthy) || health.endpoints[0];
  return {
    host: bestEndpoint?.name || 'unknown',
    tier: bestEndpoint?.healthy ? 'healthy' : 'degraded',
  };
}

export async function getOnChainTransactions(
  walletAddress: string,
  limit: number = 10,
  userRpc?: string
): Promise<OnChainTransaction[]> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const publicKey = new PublicKey(walletAddress);
    
    const signatures = await rpc.getSignaturesForAddress(publicKey, { limit });
    
    const transactions: OnChainTransaction[] = [];
    
    for (const sigInfo of signatures) {
      try {
        const tx = await rpc.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx || !tx.meta) continue;
        
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;
        const accountKeys = tx.transaction.message.accountKeys;
        
        let fromAddr = "";
        let toAddr = "";
        let amount = "0";
        let isReceived = false;
        
        for (let i = 0; i < accountKeys.length; i++) {
          const pubkey = accountKeys[i].pubkey.toString();
          const preBalance = preBalances[i] || 0;
          const postBalance = postBalances[i] || 0;
          const diff = postBalance - preBalance;
          
          if (pubkey === walletAddress) {
            if (diff > 0) {
              isReceived = true;
              amount = (diff / LAMPORTS_PER_SOL).toString();
              toAddr = walletAddress;
            } else if (diff < 0) {
              const netDiff = Math.abs(diff) - (tx.meta.fee || 0);
              if (netDiff > 0) {
                amount = (netDiff / LAMPORTS_PER_SOL).toString();
                fromAddr = walletAddress;
              }
            }
          } else if (diff > 0 && !isReceived) {
            toAddr = pubkey;
          } else if (diff < 0) {
            fromAddr = pubkey;
          }
        }
        
        if (parseFloat(amount) <= 0) continue;
        
        if (isReceived && !fromAddr) {
          for (let i = 0; i < accountKeys.length; i++) {
            const pubkey = accountKeys[i].pubkey.toString();
            if (pubkey !== walletAddress && (preBalances[i] || 0) > (postBalances[i] || 0)) {
              fromAddr = pubkey;
              break;
            }
          }
        }
        
        if (!fromAddr && !toAddr) continue;
        
        transactions.push({
          id: -1 * (transactions.length + 1),
          signature: sigInfo.signature,
          fromAddr: fromAddr || "Unknown",
          toAddr: toAddr || "Unknown",
          amount,
          type: "transfer",
          status: tx.meta.err ? "failed" : "confirmed",
          timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000) : null,
          userId: null,
          inputToken: null,
          outputToken: null,
          outputAmount: null,
        });
      } catch (txError) {
        console.error("Error parsing transaction:", sigInfo.signature, txError);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error("Error fetching on-chain transactions:", error);
    return [];
  }
}
