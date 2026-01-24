import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getRpcService } from "./rpcService";
import { sendTransactionViaSender, isHeliusSenderEnabled } from "./heliusSender";

export interface BuildMintTxRequest {
  walletAddress: string;
  decimals: number;
  totalSupply: string;
}

export interface BuildMintTxResponse {
  transaction: string;
  mintAddress: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

export async function buildCreateMintTransaction(
  request: BuildMintTxRequest
): Promise<BuildMintTxResponse> {
  const rpc = getRpcService();
  const connection = (rpc as any).connection as Connection;
  
  const walletPubkey = new PublicKey(request.walletAddress);
  const mintKeypair = Keypair.generate();
  const mintPubkey = mintKeypair.publicKey;
  
  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();
  
  const lamportsForMint = await getMinimumBalanceForRentExemptMint(connection);
  
  const supplyBigInt = BigInt(request.totalSupply);
  let multiplier = BigInt(1);
  for (let i = 0; i < request.decimals; i++) {
    multiplier = multiplier * BigInt(10);
  }
  const supplyWithDecimals = supplyBigInt * multiplier;
  
  const ataAddress = getAssociatedTokenAddressSync(mintPubkey, walletPubkey);
  
  const instructions: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: walletPubkey,
      newAccountPubkey: mintPubkey,
      lamports: lamportsForMint,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintPubkey,
      request.decimals,
      walletPubkey,
      walletPubkey,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      walletPubkey,
      ataAddress,
      walletPubkey,
      mintPubkey,
      TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintPubkey,
      ataAddress,
      walletPubkey,
      supplyWithDecimals,
      [],
      TOKEN_PROGRAM_ID
    ),
  ];
  
  const transaction = new Transaction();
  transaction.add(...instructions);
  transaction.feePayer = walletPubkey;
  transaction.recentBlockhash = blockhash;
  
  transaction.partialSign(mintKeypair);
  
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  
  return {
    transaction: serialized.toString("base64"),
    mintAddress: mintPubkey.toBase58(),
    blockhash,
    lastValidBlockHeight,
  };
}

export interface SendSignedTxRequest {
  signedTransaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface SendSignedTxResponse {
  signature: string;
  confirmed: boolean;
}

export async function sendAndConfirmLaunchpadTx(
  request: SendSignedTxRequest
): Promise<SendSignedTxResponse> {
  const rpc = getRpcService();
  const txBuffer = Buffer.from(request.signedTransaction, "base64");
  
  let signature: string;
  let usedSender = false;
  
  if (isHeliusSenderEnabled()) {
    try {
      console.log(`[launchpad] Broadcasting via Helius Sender...`);
      signature = await sendTransactionViaSender(request.signedTransaction);
      usedSender = true;
      console.log(`[launchpad] Helius Sender broadcast: ${signature}`);
    } catch (senderError) {
      console.warn(`[launchpad] Helius Sender failed, falling back to RPC:`, senderError);
      signature = await rpc.sendRawTransaction(txBuffer, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
      });
      console.log(`[launchpad] Standard RPC broadcast: ${signature}`);
    }
  } else {
    signature = await rpc.sendRawTransaction(txBuffer, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });
    console.log(`[launchpad] Standard RPC broadcast: ${signature}`);
  }
  
  const confirmed = await confirmWithResend(
    rpc,
    signature,
    txBuffer,
    request.blockhash,
    request.lastValidBlockHeight,
    usedSender
  );
  
  return { signature, confirmed };
}

async function confirmWithResend(
  rpc: ReturnType<typeof getRpcService>,
  signature: string,
  txBuffer: Buffer,
  blockhash: string,
  lastValidBlockHeight: number,
  usedSender: boolean
): Promise<boolean> {
  const startTime = Date.now();
  const maxWaitMs = 60000;
  const resendIntervalMs = 3000;
  let lastResendTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const currentBlockHeight = await rpc.getBlockHeight();
    
    if (currentBlockHeight > lastValidBlockHeight) {
      console.log(`[launchpad] Block height ${currentBlockHeight} exceeded lastValid ${lastValidBlockHeight}`);
      throw new Error("Transaction expired: block height exceeded");
    }
    
    try {
      const statuses = await rpc.getSignatureStatuses([signature]);
      const status = statuses?.value?.[0];
      
      if (status) {
        if (status.err) {
          console.error(`[launchpad] Transaction failed:`, status.err);
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          console.log(`[launchpad] Transaction confirmed (${status.confirmationStatus}): ${signature}`);
          return true;
        }
      }
    } catch (statusError: any) {
      if (statusError.message?.includes("Transaction failed")) {
        throw statusError;
      }
      console.warn(`[launchpad] Status check error:`, statusError.message);
    }
    
    if (!usedSender && Date.now() - lastResendTime > resendIntervalMs) {
      try {
        console.log(`[launchpad] Resending transaction...`);
        await rpc.sendRawTransaction(txBuffer, {
          skipPreflight: true,
          preflightCommitment: "confirmed",
        });
        lastResendTime = Date.now();
      } catch (resendError: any) {
        if (!resendError.message?.includes("AlreadyProcessed")) {
          console.warn(`[launchpad] Resend error:`, resendError.message);
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  throw new Error("Transaction confirmation timeout");
}
