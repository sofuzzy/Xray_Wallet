import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOLANA_RPC_URL = process.env.HELIUS_RPC_URL || process.env.QUICKNODE_RPC_URL || clusterApiUrl("mainnet-beta");
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

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
