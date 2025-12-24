import { 
  Connection, 
  Keypair, 
  PublicKey, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL,
  StakeProgram,
  Authorized,
  Transaction,
  sendAndConfirmTransaction,
  Lockup
} from "@solana/web3.js";
import bs58 from "bs58";

// Use Devnet for this demo
export const SOLANA_NETWORK = "devnet";
export const SOLANA_RPC_URL = clusterApiUrl(SOLANA_NETWORK);
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// Constants
export const LOCAL_STORAGE_KEY = "solana_wallet_secret_key";
export { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const getLocalKeypair = (): Keypair | null => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return null;
    const secretKey = bs58.decode(stored);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error("Failed to load keypair", e);
    return null;
  }
};

export const createNewKeypair = (): Keypair => {
  const keypair = Keypair.generate();
  localStorage.setItem(LOCAL_STORAGE_KEY, bs58.encode(keypair.secretKey));
  return keypair;
};

export const shortenAddress = (address: string, chars = 4) => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const formatSol = (lamports: number) => {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

export interface StakeAccountInfo {
  pubkey: PublicKey;
  lamports: number;
  state: 'inactive' | 'activating' | 'active' | 'deactivating';
  validator?: string;
}

export async function getStakeAccounts(walletPubkey: PublicKey): Promise<StakeAccountInfo[]> {
  const stakeAccounts = await connection.getParsedProgramAccounts(
    StakeProgram.programId,
    {
      filters: [
        { dataSize: 200 },
        {
          memcmp: {
            offset: 12,
            bytes: walletPubkey.toBase58(),
          },
        },
      ],
    }
  );

  return stakeAccounts.map((account) => {
    const parsed = (account.account.data as any).parsed;
    const info = parsed?.info;
    const meta = info?.meta;
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
      pubkey: account.pubkey,
      lamports: account.account.lamports,
      state,
      validator: stake?.delegation?.voter,
    };
  });
}

export async function getValidators(): Promise<{ votePubkey: string; activatedStake: number; commission: number }[]> {
  const { current } = await connection.getVoteAccounts();
  return current
    .sort((a, b) => b.activatedStake - a.activatedStake)
    .slice(0, 20)
    .map((v) => ({
      votePubkey: v.votePubkey,
      activatedStake: v.activatedStake,
      commission: v.commission,
    }));
}

export async function createStakeAccount(
  wallet: Keypair,
  amountSol: number,
  validatorVotePubkey: string
): Promise<string> {
  const stakeAccount = Keypair.generate();
  
  const minimumRent = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const totalLamports = minimumRent + amountLamports;

  const createStakeAccountIx = StakeProgram.createAccount({
    fromPubkey: wallet.publicKey,
    stakePubkey: stakeAccount.publicKey,
    authorized: new Authorized(wallet.publicKey, wallet.publicKey),
    lamports: totalLamports,
    lockup: new Lockup(0, 0, wallet.publicKey),
  });

  const delegateIx = StakeProgram.delegate({
    stakePubkey: stakeAccount.publicKey,
    authorizedPubkey: wallet.publicKey,
    votePubkey: new PublicKey(validatorVotePubkey),
  });

  const transaction = new Transaction().add(createStakeAccountIx, delegateIx);
  
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet, stakeAccount]
  );

  return signature;
}

export async function deactivateStake(
  wallet: Keypair,
  stakeAccountPubkey: PublicKey
): Promise<string> {
  const deactivateIx = StakeProgram.deactivate({
    stakePubkey: stakeAccountPubkey,
    authorizedPubkey: wallet.publicKey,
  });

  const transaction = new Transaction().add(deactivateIx);
  
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  return signature;
}

export async function withdrawStake(
  wallet: Keypair,
  stakeAccountPubkey: PublicKey,
  lamports: number
): Promise<string> {
  const withdrawIx = StakeProgram.withdraw({
    stakePubkey: stakeAccountPubkey,
    authorizedPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports,
  });

  const transaction = new Transaction().add(withdrawIx);
  
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  return signature;
}
