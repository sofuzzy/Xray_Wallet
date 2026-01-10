import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  publicKey: text("public_key").notNull(),
  name: text("name").notNull().default("Main Wallet"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // Optional link to user who initiated
  fromAddr: text("from_addr").notNull(),
  toAddr: text("to_addr").notNull(),
  amount: text("amount").notNull(),
  signature: text("signature").notNull(),
  status: text("status").default("confirmed"),
  type: text("type").default("transfer"), // transfer, swap
  inputToken: text("input_token"), // For swaps: input token symbol
  outputToken: text("output_token"), // For swaps: output token symbol
  outputAmount: text("output_amount"), // For swaps: output amount
  timestamp: timestamp("timestamp").defaultNow(),
});

export const tokenLaunches = pgTable("token_launches", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  mintAddress: text("mint_address").notNull(),
  decimals: integer("decimals").notNull().default(9),
  totalSupply: text("total_supply").notNull(),
  creatorAddress: text("creator_address").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const autoTradeRules = pgTable("auto_trade_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  entryPrice: text("entry_price").notNull(),
  stopLossPercent: integer("stop_loss_percent"),
  takeProfitPercent: integer("take_profit_percent"),
  targetToken: text("target_token").notNull().default("SOL"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  triggeredAt: timestamp("triggered_at"),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  credentialId: text("credential_id").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type"),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const watchlistTokens = pgTable("watchlist_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name").notNull(),
  tokenDecimals: integer("token_decimals").notNull().default(9),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  action: text("action").notNull(), // swap_blocked, balance_check_failed, etc.
  reason: text("reason").notNull(), // BALANCE_UNAVAILABLE, BALANCE_INSUFFICIENT, BALANCE_FETCH_FAILED
  inputMint: text("input_mint"),
  outputMint: text("output_mint"),
  requestedAmount: text("requested_amount"),
  details: text("details"), // JSON string with additional context
  createdAt: timestamp("created_at").defaultNow(),
});

export const vaults = pgTable("vaults", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  ciphertext: text("ciphertext").notNull(), // Base64 encoded AES-GCM encrypted data
  salt: text("salt").notNull(), // Base64 encoded salt for key derivation
  iv: text("iv").notNull(), // Base64 encoded initialization vector
  kdfParams: text("kdf_params").notNull(), // JSON with algorithm, iterations, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vaultAudits = pgTable("vault_audits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // created, restored, deleted
  sourceIp: text("source_ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userWallets = pgTable("user_wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").notNull().default("Wallet"),
  source: text("source").notNull().default("created"), // created, imported, restored
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
});

export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, timestamp: true });
export const insertTokenLaunchSchema = createInsertSchema(tokenLaunches).omit({ id: true, createdAt: true });
export const insertAutoTradeRuleSchema = createInsertSchema(autoTradeRules).omit({ id: true, createdAt: true, triggeredAt: true });
export const insertWatchlistTokenSchema = createInsertSchema(watchlistTokens).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export const insertVaultSchema = createInsertSchema(vaults).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVaultAuditSchema = createInsertSchema(vaultAudits).omit({ id: true, createdAt: true });
export const insertUserWalletSchema = createInsertSchema(userWallets).omit({ id: true, createdAt: true, lastSeenAt: true });

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type TokenLaunch = typeof tokenLaunches.$inferSelect;
export type InsertTokenLaunch = z.infer<typeof insertTokenLaunchSchema>;
export type AutoTradeRule = typeof autoTradeRules.$inferSelect;
export type InsertAutoTradeRule = z.infer<typeof insertAutoTradeRuleSchema>;
export type WatchlistToken = typeof watchlistTokens.$inferSelect;
export type InsertWatchlistToken = z.infer<typeof insertWatchlistTokenSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type Vault = typeof vaults.$inferSelect;
export type InsertVault = z.infer<typeof insertVaultSchema>;
export type VaultAudit = typeof vaultAudits.$inferSelect;
export type InsertVaultAudit = z.infer<typeof insertVaultAuditSchema>;
export type UserWallet = typeof userWallets.$inferSelect;
export type InsertUserWallet = z.infer<typeof insertUserWalletSchema>;
