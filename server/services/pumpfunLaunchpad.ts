const PUMPPORTAL_API = "https://pumpportal.fun/api";

export interface PumpIPFSParams {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  imageBase64: string;
  imageMimeType: string;
  imageFileName: string;
}

export interface PumpIPFSResult {
  metadataUri: string;
  imageUri?: string;
}

export async function uploadMetadataToPumpIPFS(params: PumpIPFSParams): Promise<PumpIPFSResult> {
  const imageBuffer = Buffer.from(params.imageBase64, "base64");
  const blob = new Blob([imageBuffer], { type: params.imageMimeType });

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("symbol", params.symbol);
  formData.append("description", params.description || "");
  formData.append("showName", "true");
  if (params.twitter) formData.append("twitter", params.twitter);
  if (params.telegram) formData.append("telegram", params.telegram);
  if (params.website) formData.append("website", params.website);
  formData.append("file", blob, params.imageFileName);

  const response = await fetch(`${PUMPPORTAL_API}/ipfs`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`PumpPortal IPFS upload failed: ${response.status} — ${errText}`);
  }

  const result = await response.json();
  if (!result.metadataUri) {
    throw new Error("PumpPortal IPFS returned no metadataUri");
  }

  return {
    metadataUri: result.metadataUri,
    imageUri: result.metadata?.image,
  };
}

export interface PumpBuildTxParams {
  creatorPublicKey: string;
  mintPublicKey: string;
  name: string;
  symbol: string;
  metadataUri: string;
  devBuySol: number;
  priorityFee?: number;
  slippage?: number;
}

export async function buildPumpCreateTransaction(params: PumpBuildTxParams): Promise<{ transaction: string }> {
  const response = await fetch(`${PUMPPORTAL_API}/create-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: params.creatorPublicKey,
      action: "create",
      tokenMetadata: {
        name: params.name,
        symbol: params.symbol,
        uri: params.metadataUri,
      },
      mint: params.mintPublicKey,
      denominatedInSol: "true",
      amount: params.devBuySol,
      slippage: params.slippage ?? 10,
      priorityFee: params.priorityFee ?? 0.0005,
      pool: "pump",
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`PumpPortal create-local failed: ${response.status} — ${errText}`);
  }

  const txBytes = await response.arrayBuffer();
  if (txBytes.byteLength < 100) {
    const text = Buffer.from(txBytes).toString("utf-8");
    throw new Error(`PumpPortal returned unexpected response: ${text}`);
  }

  return { transaction: Buffer.from(txBytes).toString("base64") };
}
