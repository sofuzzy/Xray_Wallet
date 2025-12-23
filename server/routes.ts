import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated as authMiddleware } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote, getAvailableTokens } from "./services/pumpfun";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Replit Auth FIRST (before any routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get(api.users.me.path, authMiddleware, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    
    // Get user from auth database
    let user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not initialized" });
    }

    const wallet = await storage.getWallet(userId);
    res.json({ user, wallet: wallet || null });
  });

  app.get(api.users.lookup.path, async (req, res) => {
    const { username } = req.params;
    // Looking up by email/username
    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).json({ message: "User not found" });
    
    const wallet = await storage.getWallet(user.id);
    res.json({
      username: user.email || "Unknown",
      walletPublicKey: wallet?.publicKey || null
    });
  });

  app.post(api.wallets.create.path, authMiddleware, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    // Check if already has wallet
    const existing = await storage.getWallet(userId);
    if (existing) return res.status(400).json({ message: "Wallet already exists" });

    try {
      const { publicKey } = api.wallets.create.input.parse(req.body);
      const wallet = await storage.createWallet({
        userId,
        publicKey,
      });
      res.status(201).json(wallet);
    } catch (err) {
       res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.transactions.list.path, authMiddleware, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const txs = await storage.getTransactions(userId);
    res.json(txs);
  });

  app.post(api.transactions.create.path, authMiddleware, async (req, res) => {
    const userId = (req.user as any).claims.sub;

    try {
      const input = api.transactions.create.input.parse(req.body);
      const tx = await storage.createTransaction({
        ...input,
        userId, // Force userId to current user
      });
      res.status(201).json(tx);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      }
    }
  });

  // Swap routes
  app.get(api.swaps.tokens.path, authMiddleware, async (req, res) => {
    try {
      const tokens = await getAvailableTokens();
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tokens" });
    }
  });

  app.get(api.swaps.quote.path, authMiddleware, async (req, res) => {
    try {
      const { inputMint, outputMint, amount } = req.query;
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      const quote = await getSwapQuote(
        inputMint as string,
        outputMint as string,
        parseInt(amount as string)
      );
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Failed to get quote" });
    }
  });

  app.post(api.swaps.execute.path, authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.swaps.execute.input.parse(req.body);
      
      // Get user's keypair from wallet
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        return res.status(400).json({ message: "Wallet not found" });
      }

      // Perform swap (simplified for devnet)
      const result = await swapTokens({
        inputMint: input.inputMint,
        outputMint: input.outputMint,
        amount: input.amount,
        slippage: input.slippage,
        signer: null as any, // In production, get from secure key storage
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Swap failed" });
    }
  });

  return httpServer;
}
