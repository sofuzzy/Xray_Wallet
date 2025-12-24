import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated as authMiddleware } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote, getAvailableTokens } from "./services/pumpfun";
import { registerStripeRoutes } from "./stripeRoutes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Replit Auth FIRST (before any routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register Stripe routes for Apple Pay / card payments
  registerStripeRoutes(app);
  
  // Register Object Storage routes for file uploads
  registerObjectStorageRoutes(app);

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
      const input = api.swaps.execute.input.parse(req.body);
      
      // Perform swap (simplified for devnet)
      // Wallet exists on client-side, so we don't need to fetch from DB
      const result = await swapTokens({
        inputMint: input.inputMint,
        outputMint: input.outputMint,
        amount: input.amount,
        slippage: input.slippage,
        signer: null as any, // Client handles signing locally
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Swap failed" });
    }
  });

  // Token Launchpad routes
  app.post("/api/token-launches", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const tokenLaunchInput = z.object({
        name: z.string().min(1).max(50),
        symbol: z.string().min(1).max(10),
        mintAddress: z.string().min(32).max(64),
        decimals: z.number().int().min(0).max(9),
        totalSupply: z.string().regex(/^\d+$/).max(30),
        creatorAddress: z.string().min(32).max(64),
        imageUrl: z.string().optional(),
      });
      
      const parsed = tokenLaunchInput.parse(req.body);

      const launch = await storage.createTokenLaunch({
        userId,
        name: parsed.name,
        symbol: parsed.symbol,
        mintAddress: parsed.mintAddress,
        decimals: parsed.decimals,
        totalSupply: parsed.totalSupply,
        creatorAddress: parsed.creatorAddress,
        imageUrl: parsed.imageUrl || null,
      });
      
      res.status(201).json(launch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Failed to save token launch:", error);
      res.status(500).json({ message: "Failed to save token launch" });
    }
  });

  app.get("/api/token-launches", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const launches = await storage.getTokenLaunches(userId);
      res.json(launches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch token launches" });
    }
  });

  // Auto-trade rules routes
  app.get("/api/auto-trade-rules", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const rules = await storage.getAutoTradeRules(userId);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auto-trade rules" });
    }
  });

  app.post("/api/auto-trade-rules", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const ruleInput = z.object({
        tokenMint: z.string().min(32).max(64),
        tokenSymbol: z.string().min(1).max(10),
        entryPrice: z.string(),
        stopLossPercent: z.number().int().min(1).max(100).optional(),
        takeProfitPercent: z.number().int().min(1).max(1000).optional(),
        targetToken: z.string().default("SOL"),
        isActive: z.boolean().default(true),
      });
      
      const parsed = ruleInput.parse(req.body);
      
      if (!parsed.stopLossPercent && !parsed.takeProfitPercent) {
        return res.status(400).json({ message: "Must set at least stop loss or take profit" });
      }

      const rule = await storage.createAutoTradeRule({
        userId,
        tokenMint: parsed.tokenMint,
        tokenSymbol: parsed.tokenSymbol,
        entryPrice: parsed.entryPrice,
        stopLossPercent: parsed.stopLossPercent ?? null,
        takeProfitPercent: parsed.takeProfitPercent ?? null,
        targetToken: parsed.targetToken,
        isActive: parsed.isActive,
      });
      
      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Failed to create auto-trade rule:", error);
      res.status(500).json({ message: "Failed to create auto-trade rule" });
    }
  });

  app.patch("/api/auto-trade-rules/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const ruleId = parseInt(req.params.id);
      
      const updateInput = z.object({
        stopLossPercent: z.number().int().min(1).max(100).optional(),
        takeProfitPercent: z.number().int().min(1).max(1000).optional(),
        isActive: z.boolean().optional(),
      });
      
      const parsed = updateInput.parse(req.body);
      
      const updates: Record<string, any> = {};
      if (parsed.stopLossPercent !== undefined) updates.stopLossPercent = parsed.stopLossPercent;
      if (parsed.takeProfitPercent !== undefined) updates.takeProfitPercent = parsed.takeProfitPercent;
      if (parsed.isActive !== undefined) updates.isActive = parsed.isActive;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const updated = await storage.updateAutoTradeRule(ruleId, userId, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Rule not found" });
      }
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update auto-trade rule" });
    }
  });

  app.delete("/api/auto-trade-rules/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const ruleId = parseInt(req.params.id);
      
      await storage.deleteAutoTradeRule(ruleId, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete auto-trade rule" });
    }
  });

  return httpServer;
}
