import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getRpcService, createUserRpcService } from "./rpcService";

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
): Promise<Array<{ mint: string; balance: number; decimals: number }>> {
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

    const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
    
    const tokens = allAccounts
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
        };
      })
      .filter((t): t is { mint: string; balance: number; decimals: number } => t !== null);
    
    console.log("Returning", tokens.length, "tokens with non-zero balance");
    return tokens;
  } catch (error) {
    console.error("Error fetching token accounts:", error);
    return [];
  }
}

export async function sendRawTransaction(
  serializedTransaction: string,
  userRpc?: string
): Promise<string> {
  try {
    const rpc = userRpc ? createUserRpcService(userRpc) || getRpcService() : getRpcService();
    const buffer = Buffer.from(serializedTransaction, "base64");
    const signature = await rpc.sendRawTransaction(buffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    const latestBlockhash = await rpc.getLatestBlockhash();
    await rpc.confirmTransaction(
      signature,
      latestBlockhash.blockhash,
      latestBlockhash.lastValidBlockHeight
    );
    
    return signature;
  } catch (error) {
    console.error("Error sending transaction:", error);
    throw error;
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
