import { db } from "./db";
import {
  users,
  wallets,
  transactions,
  tokenLaunches,
  autoTradeRules,
  webauthnCredentials,
  type User,
  type Wallet,
  type InsertWallet,
  type Transaction,
  type InsertTransaction,
  type TokenLaunch,
  type InsertTokenLaunch,
  type AutoTradeRule,
  type InsertAutoTradeRule,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface WebAuthnCredential {
  id: number;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: string | null;
  transports: string | null;
  createdAt: Date;
}

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

  getAutoTradeRules(userId: string): Promise<AutoTradeRule[]>;
  createAutoTradeRule(rule: InsertAutoTradeRule): Promise<AutoTradeRule>;
  updateAutoTradeRule(id: number, userId: string, updates: Partial<InsertAutoTradeRule>): Promise<AutoTradeRule | undefined>;
  deleteAutoTradeRule(id: number, userId: string): Promise<boolean>;

  getWebAuthnCredentials(userId: string): Promise<WebAuthnCredential[]>;
  getWebAuthnCredentialById(credentialId: string): Promise<WebAuthnCredential | undefined>;
  createWebAuthnCredential(credential: Omit<WebAuthnCredential, 'id' | 'createdAt'>): Promise<WebAuthnCredential>;
  updateWebAuthnCounter(credentialId: string, counter: number): Promise<void>;
  deleteWebAuthnCredential(id: number, userId: string): Promise<boolean>;
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

  async getAutoTradeRules(userId: string): Promise<AutoTradeRule[]> {
    return await db
      .select()
      .from(autoTradeRules)
      .where(eq(autoTradeRules.userId, userId))
      .orderBy(desc(autoTradeRules.createdAt));
  }

  async createAutoTradeRule(rule: InsertAutoTradeRule): Promise<AutoTradeRule> {
    const [autoTradeRule] = await db.insert(autoTradeRules).values(rule).returning();
    return autoTradeRule;
  }

  async updateAutoTradeRule(id: number, userId: string, updates: Partial<InsertAutoTradeRule>): Promise<AutoTradeRule | undefined> {
    const [updated] = await db
      .update(autoTradeRules)
      .set(updates)
      .where(and(eq(autoTradeRules.id, id), eq(autoTradeRules.userId, userId)))
      .returning();
    return updated;
  }

  async deleteAutoTradeRule(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(autoTradeRules)
      .where(and(eq(autoTradeRules.id, id), eq(autoTradeRules.userId, userId)));
    return true;
  }

  async getWebAuthnCredentials(userId: string): Promise<WebAuthnCredential[]> {
    return await db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId));
  }

  async getWebAuthnCredentialById(credentialId: string): Promise<WebAuthnCredential | undefined> {
    const [credential] = await db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.credentialId, credentialId));
    return credential;
  }

  async createWebAuthnCredential(credential: Omit<WebAuthnCredential, 'id' | 'createdAt'>): Promise<WebAuthnCredential> {
    const [created] = await db.insert(webauthnCredentials).values(credential).returning();
    return created;
  }

  async updateWebAuthnCounter(credentialId: string, counter: number): Promise<void> {
    await db
      .update(webauthnCredentials)
      .set({ counter })
      .where(eq(webauthnCredentials.credentialId, credentialId));
  }

  async deleteWebAuthnCredential(id: number, userId: string): Promise<boolean> {
    await db
      .delete(webauthnCredentials)
      .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)));
    return true;
  }
}

export const storage = new DatabaseStorage();
