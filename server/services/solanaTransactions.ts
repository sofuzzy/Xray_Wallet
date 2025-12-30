import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Try multiple RPC endpoints - some may be blocked on Replit
const SOLANA_RPC_URL = process.env.HELIUS_RPC_URL || process.env.QUICKNODE_RPC_URL || "https://solana-mainnet.g.alchemy.com/v2/demo";
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

console.log("Solana RPC URL:", SOLANA_RPC_URL);

export async function getWalletBalance(walletAddress: string): Promise<{ balance: number; lamports: number }> {
  try {
    const publicKey = new PublicKey(walletAddress);
    const lamports = await connection.getBalance(publicKey);
    return {
      balance: lamports / LAMPORTS_PER_SOL,
      lamports,
    };
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    throw error;
  }
}

export async function getTokenAccounts(walletAddress: string): Promise<Array<{ mint: string; balance: number; decimals: number }>> {
  try {
    console.log("Fetching token accounts for:", walletAddress);
    const publicKey = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    console.log("Found", tokenAccounts.value.length, "token accounts");

    const tokens = tokenAccounts.value
      .map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed?.info;
        if (!info) return null;

        const balance = parseFloat(info.tokenAmount?.uiAmountString || "0");
        console.log("Token:", info.mint, "balance:", balance);
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

export async function sendRawTransaction(serializedTransaction: string): Promise<string> {
  try {
    const buffer = Buffer.from(serializedTransaction, "base64");
    const signature = await connection.sendRawTransaction(buffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, "confirmed");
    
    return signature;
  } catch (error) {
    console.error("Error sending transaction:", error);
    throw error;
  }
}

export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const result = await connection.getLatestBlockhash("confirmed");
  return {
    blockhash: result.blockhash,
    lastValidBlockHeight: result.lastValidBlockHeight,
  };
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

export async function getOnChainTransactions(walletAddress: string, limit: number = 10): Promise<OnChainTransaction[]> {
  try {
    const publicKey = new PublicKey(walletAddress);
    
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit });
    
    const transactions: OnChainTransaction[] = [];
    
    for (const sigInfo of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sigInfo.signature, {
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
          status: sigInfo.err ? "failed" : "confirmed",
          timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000) : null,
          userId: null,
          inputToken: null,
          outputToken: null,
          outputAmount: null,
        });
      } catch (e) {
        console.error("Error parsing transaction:", sigInfo.signature, e);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error("Error fetching on-chain transactions:", error);
    return [];
  }
}
