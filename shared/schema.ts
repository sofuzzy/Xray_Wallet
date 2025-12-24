import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  publicKey: text("public_key").notNull(),
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

export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, timestamp: true });
export const insertTokenLaunchSchema = createInsertSchema(tokenLaunches).omit({ id: true, createdAt: true });

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type TokenLaunch = typeof tokenLaunches.$inferSelect;
export type InsertTokenLaunch = z.infer<typeof insertTokenLaunchSchema>;
