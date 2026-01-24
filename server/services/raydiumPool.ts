import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const CPMM_PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export interface CreatePoolParams {
  tokenMint: string;
  tokenDecimals: number;
  tokenAmount: string;
  solAmount: string;
  creatorAddress: string;
}

export interface CreatePoolResult {
  success: boolean;
  error?: string;
  transaction?: string;
  poolId?: string;
  message?: string;
}

async function fetchRaydiumPoolConfig(): Promise<{
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  fundFeeRate: number;
  createPoolFee: string;
} | null> {
  try {
    const response = await fetch("https://api-v3.raydium.io/main/cpmm/config");
    const data = await response.json();
    if (data.success && data.data?.length > 0) {
      return data.data[0];
    }
  } catch (error) {
    console.error("[raydiumPool] Failed to fetch config:", error);
  }
  return null;
}

export async function buildCreatePoolTransaction(params: CreatePoolParams): Promise<CreatePoolResult> {
  try {
    const { tokenMint, tokenDecimals, tokenAmount, solAmount, creatorAddress } = params;
    
    const tokenAmountBN = new BN(Math.floor(parseFloat(tokenAmount) * Math.pow(10, tokenDecimals)));
    const solAmountBN = new BN(Math.floor(parseFloat(solAmount) * 1e9));
    
    if (tokenAmountBN.lte(new BN(0)) || solAmountBN.lte(new BN(0))) {
      return { success: false, error: "Token and SOL amounts must be greater than 0" };
    }

    const config = await fetchRaydiumPoolConfig();
    if (!config) {
      return { success: false, error: "Failed to fetch Raydium pool configuration" };
    }

    const apiUrl = `https://api-v3.raydium.io/main/cpmm/createPool`;
    const apiPayload = {
      programId: CPMM_PROGRAM_ID.toBase58(),
      configId: new PublicKey(config.id).toBase58(),
      mintA: tokenMint,
      mintB: NATIVE_SOL_MINT.toBase58(),
      mintAAmount: tokenAmountBN.toString(),
      mintBAmount: solAmountBN.toString(),
      startTime: "0",
      ownerInfo: {
        feePayer: creatorAddress,
        useSOLBalance: true,
      },
      txVersion: "V0",
    };

    console.log("[raydiumPool] Calling Raydium API to build pool transaction");
    
    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[raydiumPool] API error:", errorText);
      return { success: false, error: `Raydium API error: ${apiResponse.status}` };
    }

    const apiData = await apiResponse.json();
    
    if (!apiData.success) {
      return { success: false, error: apiData.msg || "Failed to build pool transaction" };
    }

    const { data } = apiData;
    
    if (data.transaction) {
      return {
        success: true,
        transaction: data.transaction,
        poolId: data.poolId,
        message: "Pool transaction ready for signing",
      };
    }

    return {
      success: false,
      error: "Raydium API did not return a transaction. The API may have changed.",
      message: "Please try creating the pool directly on raydium.io for now.",
    };

  } catch (error: any) {
    console.error("[raydiumPool] Error building transaction:", error);
    return {
      success: false,
      error: error.message || "Failed to build pool creation transaction",
    };
  }
}

export async function getEstimatedPoolCost(): Promise<{ solCost: number; breakdown: string }> {
  try {
    const config = await fetchRaydiumPoolConfig();
    if (config) {
      const createFee = parseFloat(config.createPoolFee) / 1e9;
      return {
        solCost: createFee + 0.01,
        breakdown: `Pool creation fee: ${createFee.toFixed(3)} SOL + ~0.01 SOL for transaction fees`,
      };
    }
  } catch (error) {
    console.error("[raydiumPool] Error fetching pool cost:", error);
  }
  
  return {
    solCost: 0.35,
    breakdown: "Pool creation fee: ~0.3 SOL + ~0.05 SOL for transaction fees",
  };
}
