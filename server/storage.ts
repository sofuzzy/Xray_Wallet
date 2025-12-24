import { db } from "./db";
import {
  users,
  wallets,
  transactions,
  tokenLaunches,
  type User,
  type Wallet,
  type InsertWallet,
  type Transaction,
  type InsertTransaction,
  type TokenLaunch,
  type InsertTokenLaunch,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  
  getWallet(userId: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  getWalletByPublicKey(publicKey: string): Promise<Wallet | undefined>;

  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(tx: InsertTransaction): Promise<Transaction>;

  getTokenLaunches(userId: string): Promise<TokenLaunch[]>;
  createTokenLaunch(launch: InsertTokenLaunch): Promise<TokenLaunch>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // Replit Auth users might not have username set in `users` table exactly as we expect if we don't sync it?
    // But `users` table has `email`. Replit auth usually uses email or `sub` as ID.
    // The blueprint provided `users` table with `email`.
    // We can try to look up by email if username is not present, or maybe just by ID.
    // But for "sending to username", we need a way to look up.
    // Replit Auth doesn't guarantee a "username" field is unique/publicly searchable in the way we want.
    // But let's assume `email` or `firstName` is used?
    // The blueprint has `email`.
    // I'll search by email for now as "username".
    const [user] = await db.select().from(users).where(eq(users.email, username));
    return user;
  }

  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet;
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const [wallet] = await db.insert(wallets).values(insertWallet).returning();
    return wallet;
  }

  async getWalletByPublicKey(publicKey: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.publicKey, publicKey));
    return wallet;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.timestamp));
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(tx).returning();
    return transaction;
  }

  async getTokenLaunches(userId: string): Promise<TokenLaunch[]> {
    return await db
      .select()
      .from(tokenLaunches)
      .where(eq(tokenLaunches.userId, userId))
      .orderBy(desc(tokenLaunches.createdAt));
  }

  async createTokenLaunch(launch: InsertTokenLaunch): Promise<TokenLaunch> {
    const [tokenLaunch] = await db.insert(tokenLaunches).values(launch).returning();
    return tokenLaunch;
  }
}

export const storage = new DatabaseStorage();
