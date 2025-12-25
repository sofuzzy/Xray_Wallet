import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated as sessionAuth } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote, getAvailableTokens } from "./services/pumpfun";
import { registerStripeRoutes } from "./stripeRoutes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { 
  extractClientInfo, 
  hybridAuth, 
  globalRateLimiter, 
  strictRateLimiter,
  authRateLimiter,
  anomalyDetection 
} from "./middleware/zeroTrust";
import { 
  generateTokenPair, 
  refreshAccessToken, 
  revokeToken, 
  revokeAllUserTokens 
} from "./services/tokenService";
import {
  generateRegistrationChallenge,
  generateAuthenticationChallenge,
  verifyRegistration,
  verifyAuthentication,
  getCredentialsForUser,
  deleteCredential
} from "./services/webauthnService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Replit Auth FIRST (before any routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // Apply global zero-trust middleware
  app.use(extractClientInfo);
  app.use(globalRateLimiter);
  app.use(anomalyDetection);

  // Token management endpoints
  app.post("/api/auth/token", authRateLimiter, sessionAuth, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      const userId = sessionUser.claims.sub;
      
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      const tokens = await generateTokenPair(
        userId,
        { email: user.email || undefined, firstName: user.firstName || undefined, lastName: user.lastName || undefined },
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      res.json({
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      });
    } catch (error) {
      console.error("Token generation failed:", error);
      res.status(500).json({ error: "TOKEN_GENERATION_FAILED", message: "Failed to generate tokens" });
    }
  });

  app.post("/api/auth/refresh", authRateLimiter, async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: "MISSING_TOKEN", message: "Refresh token required" });
      }

      const tokens = await refreshAccessToken(
        refreshToken,
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      if (!tokens) {
        return res.status(401).json({ error: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token" });
      }

      res.json(tokens);
    } catch (error) {
      console.error("Token refresh failed:", error);
      res.status(500).json({ error: "TOKEN_REFRESH_FAILED", message: "Failed to refresh tokens" });
    }
  });

  app.post("/api/auth/revoke", hybridAuth, async (req, res) => {
    try {
      const { refreshToken, revokeAll } = req.body;
      
      if (revokeAll && req.tokenUser) {
        await revokeAllUserTokens(req.tokenUser.sub);
        return res.json({ success: true, message: "All tokens revoked" });
      }

      if (!refreshToken) {
        return res.status(400).json({ error: "MISSING_TOKEN", message: "Refresh token required" });
      }

      const success = await revokeToken(refreshToken);
      if (!success) {
        return res.status(400).json({ error: "REVOKE_FAILED", message: "Failed to revoke token" });
      }

      res.json({ success: true, message: "Token revoked" });
    } catch (error) {
      console.error("Token revocation failed:", error);
      res.status(500).json({ error: "REVOKE_FAILED", message: "Failed to revoke token" });
    }
  });

  app.get("/api/webauthn/credentials", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const credentials = await getCredentialsForUser(userId);
      res.json(credentials.map(c => ({
        id: c.id,
        deviceType: c.deviceType,
        createdAt: c.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ error: "FETCH_FAILED", message: "Failed to fetch credentials" });
    }
  });

  app.post("/api/webauthn/register/options", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const options = generateRegistrationChallenge(userId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "OPTIONS_FAILED", message: "Failed to generate registration options" });
    }
  });

  app.post("/api/webauthn/register/verify", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const { id, response, transports } = req.body;

      if (!id || !response?.clientDataJSON || !response?.attestationObject) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Missing required fields" });
      }

      const success = await verifyRegistration(
        userId,
        id,
        response.clientDataJSON,
        response.attestationObject,
        transports
      );

      if (!success) {
        return res.status(400).json({ error: "VERIFICATION_FAILED", message: "Failed to verify registration" });
      }

      res.json({ success: true, message: "Face ID registered successfully" });
    } catch (error) {
      console.error("WebAuthn registration failed:", error);
      res.status(500).json({ error: "REGISTRATION_FAILED", message: "Failed to register biometric" });
    }
  });

  app.post("/api/webauthn/authenticate/options", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const credentials = await getCredentialsForUser(userId);
      
      if (credentials.length === 0) {
        return res.status(400).json({ error: "NO_CREDENTIALS", message: "No biometric credentials registered" });
      }

      const options = generateAuthenticationChallenge(userId);
      res.json({
        ...options,
        allowCredentials: credentials.map(c => ({
          type: "public-key",
          id: c.credentialId,
          transports: c.transports?.split(",") || ["internal"],
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "OPTIONS_FAILED", message: "Failed to generate authentication options" });
    }
  });

  app.post("/api/webauthn/authenticate/verify", strictRateLimiter, async (req, res) => {
    try {
      const { userId, id, response } = req.body;

      if (!userId || !id || !response?.clientDataJSON || !response?.authenticatorData || !response?.signature) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Missing required fields" });
      }

      const success = await verifyAuthentication(
        userId,
        id,
        response.clientDataJSON,
        response.authenticatorData,
        response.signature
      );

      if (!success) {
        return res.status(401).json({ error: "AUTH_FAILED", message: "Biometric authentication failed" });
      }

      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      const tokens = await generateTokenPair(
        userId,
        { email: user.email || undefined, firstName: user.firstName || undefined, lastName: user.lastName || undefined },
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      res.json({
        success: true,
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      });
    } catch (error) {
      console.error("WebAuthn authentication failed:", error);
      res.status(500).json({ error: "AUTH_FAILED", message: "Failed to authenticate" });
    }
  });

  app.delete("/api/webauthn/credentials/:id", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const credentialId = parseInt(req.params.id);
      
      await deleteCredential(credentialId, userId);
      res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      res.status(500).json({ error: "DELETE_FAILED", message: "Failed to delete credential" });
    }
  });
  
  // Register Stripe routes for Apple Pay / card payments
  registerStripeRoutes(app);
  
  // Register Object Storage routes for file uploads
  registerObjectStorageRoutes(app);

  app.get(api.users.me.path, hybridAuth, async (req, res) => {
    const userId = req.tokenUser!.sub;
    
    // Get user from auth database
    let user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not initialized" });
    }

    const wallet = await storage.getWallet(userId);
    res.json({ user, wallet: wallet || null });
  });

  app.get(api.users.lookup.path, hybridAuth, async (req, res) => {
    const { username } = req.params;
    // Looking up by email/username - now requires authentication
    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).json({ message: "User not found" });
    
    const wallet = await storage.getWallet(user.id);
    res.json({
      username: user.email || "Unknown",
      walletPublicKey: wallet?.publicKey || null
    });
  });

  app.post(api.wallets.create.path, hybridAuth, strictRateLimiter, async (req, res) => {
    const userId = req.tokenUser!.sub;
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

  app.get(api.transactions.list.path, hybridAuth, async (req, res) => {
    const userId = req.tokenUser!.sub;
    const txs = await storage.getTransactions(userId);
    res.json(txs);
  });

  app.post(api.transactions.create.path, hybridAuth, strictRateLimiter, async (req, res) => {
    const userId = req.tokenUser!.sub;

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
  app.get(api.swaps.tokens.path, hybridAuth, async (req, res) => {
    try {
      const tokens = await getAvailableTokens();
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tokens" });
    }
  });

  app.get(api.swaps.quote.path, hybridAuth, async (req, res) => {
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

  app.post(api.swaps.execute.path, hybridAuth, strictRateLimiter, async (req, res) => {
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
  app.post("/api/token-launches", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      
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

  app.get("/api/token-launches", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const launches = await storage.getTokenLaunches(userId);
      res.json(launches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch token launches" });
    }
  });

  // Auto-trade rules routes
  app.get("/api/auto-trade-rules", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const rules = await storage.getAutoTradeRules(userId);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auto-trade rules" });
    }
  });

  app.post("/api/auto-trade-rules", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      
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

  app.patch("/api/auto-trade-rules/:id", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
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

  app.delete("/api/auto-trade-rules/:id", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const ruleId = parseInt(req.params.id);
      
      await storage.deleteAutoTradeRule(ruleId, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete auto-trade rule" });
    }
  });

  return httpServer;
}
