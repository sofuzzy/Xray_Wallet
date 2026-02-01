import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getRpcService } from "./rpcService";
import { broadcastAndConfirmTransaction, isHeliusSenderEnabled } from "./heliusSender";

const TOKEN_PROGRAM_STR = TOKEN_PROGRAM_ID.toString();
const TOKEN_2022_PROGRAM_STR = TOKEN_2022_PROGRAM_ID.toString();

export interface CloseableTokenAccount {
  tokenAccount: string;
  mint: string;
  programId: string;
  lamports: number;
  estimatedReclaimLamports: number;
}

export interface BuildCloseResult {
  transactionsBase64: string[];
  totalAccounts: number;
  estimatedReclaimLamports: number;
}

export interface SendCloseResult {
  signatures: string[];
  accountsClosed: number;
  reclaimedLamports: number;
  reclaimedSol: number;
}

export async function getCloseableTokenAccounts(owner: string): Promise<CloseableTokenAccount[]> {
  const rpc = getRpcService();
  const ownerPubkey = new PublicKey(owner);
  
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    rpc.getParsedTokenAccountsByOwner(ownerPubkey, { programId: TOKEN_PROGRAM_ID }),
    rpc.getParsedTokenAccountsByOwner(ownerPubkey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  
  const closeableAccounts: CloseableTokenAccount[] = [];
  
  for (const acct of tokenAccounts.value) {
    const parsed = acct.account.data.parsed;
    const info = parsed?.info;
    if (!info) continue;
    
    const amount = info.tokenAmount?.amount || "0";
    if (amount !== "0") continue;
    
    closeableAccounts.push({
      tokenAccount: acct.pubkey.toString(),
      mint: info.mint,
      programId: TOKEN_PROGRAM_STR,
      lamports: acct.account.lamports,
      estimatedReclaimLamports: acct.account.lamports,
    });
  }
  
  for (const acct of token2022Accounts.value) {
    const parsed = acct.account.data.parsed;
    const info = parsed?.info;
    if (!info) continue;
    
    const amount = info.tokenAmount?.amount || "0";
    if (amount !== "0") continue;
    
    closeableAccounts.push({
      tokenAccount: acct.pubkey.toString(),
      mint: info.mint,
      programId: TOKEN_2022_PROGRAM_STR,
      lamports: acct.account.lamports,
      estimatedReclaimLamports: acct.account.lamports,
    });
  }
  
  console.log(`[cleanup] Found ${closeableAccounts.length} closeable token accounts for ${owner}`);
  return closeableAccounts;
}

export async function buildCloseTransactions(
  owner: string,
  tokenAccounts: string[]
): Promise<BuildCloseResult> {
  if (tokenAccounts.length === 0) {
    return { transactionsBase64: [], totalAccounts: 0, estimatedReclaimLamports: 0 };
  }
  
  const rpc = getRpcService();
  const ownerPubkey = new PublicKey(owner);
  
  const closeableMap = new Map<string, CloseableTokenAccount>();
  const allCloseable = await getCloseableTokenAccounts(owner);
  for (const acct of allCloseable) {
    closeableMap.set(acct.tokenAccount, acct);
  }
  
  const validAccounts: CloseableTokenAccount[] = [];
  for (const addr of tokenAccounts) {
    const acct = closeableMap.get(addr);
    if (!acct) {
      throw new Error(`Token account ${addr} is not closeable (either has balance or doesn't belong to owner)`);
    }
    validAccounts.push(acct);
  }
  
  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash("finalized");
  
  const MAX_ACCOUNTS_PER_TX = 20;
  const transactionsBase64: string[] = [];
  let totalEstimatedReclaim = 0;
  
  for (let i = 0; i < validAccounts.length; i += MAX_ACCOUNTS_PER_TX) {
    const batch = validAccounts.slice(i, i + MAX_ACCOUNTS_PER_TX);
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    
    for (const acct of batch) {
      const tokenAccountPubkey = new PublicKey(acct.tokenAccount);
      const programId = acct.programId === TOKEN_2022_PROGRAM_STR ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      
      const closeIx = createCloseAccountInstruction(
        tokenAccountPubkey,
        ownerPubkey,
        ownerPubkey,
        [],
        programId
      );
      tx.add(closeIx);
      totalEstimatedReclaim += acct.estimatedReclaimLamports;
    }
    
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    transactionsBase64.push(serialized.toString("base64"));
  }
  
  console.log(`[cleanup] Built ${transactionsBase64.length} transaction(s) to close ${validAccounts.length} accounts`);
  
  return {
    transactionsBase64,
    totalAccounts: validAccounts.length,
    estimatedReclaimLamports: totalEstimatedReclaim,
  };
}

export async function sendCloseTransactions(
  owner: string,
  signedTxsBase64: string[]
): Promise<SendCloseResult> {
  if (signedTxsBase64.length === 0) {
    return { signatures: [], accountsClosed: 0, reclaimedLamports: 0, reclaimedSol: 0 };
  }
  
  const rpc = getRpcService();
  const signatures: string[] = [];
  let accountsClosed = 0;
  let reclaimedLamports = 0;
  
  for (const txBase64 of signedTxsBase64) {
    try {
      let signature: string;
      
      if (isHeliusSenderEnabled()) {
        const result = await broadcastAndConfirmTransaction(txBase64);
        signature = result.signature;
      } else {
        const buffer = Buffer.from(txBase64, "base64");
        signature = await rpc.sendRawTransaction(buffer, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        
        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
          const statuses = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true });
          const status = statuses?.value?.[0];
          
          if (status) {
            if (status.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
              break;
            }
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      signatures.push(signature);
      
      const parsedTx = Transaction.from(Buffer.from(txBase64, "base64"));
      accountsClosed += parsedTx.instructions.length;
      
      console.log(`[cleanup] Confirmed close tx: ${signature}`);
    } catch (error) {
      console.error(`[cleanup] Failed to send close transaction:`, error);
      throw error;
    }
  }
  
  const ownerPubkey = new PublicKey(owner);
  try {
    const balanceAfter = await rpc.getBalance(ownerPubkey);
    console.log(`[cleanup] Owner balance after cleanup: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
  } catch (e) {
  }
  
  reclaimedLamports = accountsClosed * 2039280;
  
  return {
    signatures,
    accountsClosed,
    reclaimedLamports,
    reclaimedSol: reclaimedLamports / LAMPORTS_PER_SOL,
  };
}
