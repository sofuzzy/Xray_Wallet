import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated as sessionAuth } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote, getAvailableTokens } from "./services/pumpfun";
import { 
  getTokens, 
  getTokenByMint, 
  getJupiterQuote, 
  getJupiterSwapTransaction,
  sendTransaction,
  type Token 
} from "./services/jupiterSwap";
import { getTokenPriceHistory } from "./services/priceHistory";
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
  deleteCredential,
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyLoginOptions,
  verifyPasskeyLogin,
  getRpId
} from "./services/webauthnService";
import { getOnChainTransactions } from "./services/solanaTransactions";

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

  // ============================================
  // PASSKEY-ONLY AUTHENTICATION ROUTES
  // NON-CUSTODIAL: These endpoints NEVER handle private keys, seed phrases, or
  // anything that can sign transactions. Only public credential data is stored.
  // ============================================

  app.post("/api/auth/passkey/register/options", authRateLimiter, async (req, res) => {
    try {
      const { username } = req.body;
      const sessionId = req.sessionID || crypto.randomUUID();
      
      const options = await generatePasskeyRegistrationOptions(sessionId, username);
      
      res.json({
        ...options,
        sessionId,
      });
    } catch (error) {
      console.error("Passkey registration options failed:", error);
      res.status(500).json({ error: "OPTIONS_FAILED", message: "Failed to generate registration options" });
    }
  });

  app.post("/api/auth/passkey/register/verify", strictRateLimiter, async (req, res) => {
    try {
      const { sessionId, id, response, transports } = req.body;

      if (!sessionId || !id || !response?.clientDataJSON || !response?.attestationObject) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Missing required fields" });
      }

      const result = await verifyPasskeyRegistration(
        sessionId,
        id,
        response.clientDataJSON,
        response.attestationObject,
        transports
      );

      if (!result.success || !result.userId) {
        return res.status(400).json({ error: "VERIFICATION_FAILED", message: result.error || "Registration failed" });
      }

      const tokens = await generateTokenPair(
        result.userId,
        {},
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      res.json({
        success: true,
        message: "Passkey registered successfully",
        userId: result.userId,
        ...tokens,
      });
    } catch (error) {
      console.error("Passkey registration failed:", error);
      res.status(500).json({ error: "REGISTRATION_FAILED", message: "Failed to register passkey" });
    }
  });

  app.post("/api/auth/passkey/login/options", authRateLimiter, async (req, res) => {
    try {
      const sessionId = req.sessionID || crypto.randomUUID();
      const options = generatePasskeyLoginOptions(sessionId);
      
      res.json({
        ...options,
        sessionId,
      });
    } catch (error) {
      console.error("Passkey login options failed:", error);
      res.status(500).json({ error: "OPTIONS_FAILED", message: "Failed to generate login options" });
    }
  });

  app.post("/api/auth/passkey/login/verify", strictRateLimiter, async (req, res) => {
    try {
      const { sessionId, id, rawId, response } = req.body;

      if (!sessionId || !id || !response?.clientDataJSON || !response?.authenticatorData || !response?.signature) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Missing required fields" });
      }

      const result = await verifyPasskeyLogin(
        sessionId,
        id,
        rawId || id,
        response.clientDataJSON,
        response.authenticatorData,
        response.signature,
        response.userHandle
      );

      if (!result.success || !result.userId) {
        return res.status(401).json({ error: "AUTH_FAILED", message: result.error || "Authentication failed" });
      }

      const tokens = await generateTokenPair(
        result.userId,
        {},
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      res.json({
        success: true,
        message: "Login successful",
        userId: result.userId,
        ...tokens,
      });
    } catch (error) {
      console.error("Passkey login failed:", error);
      res.status(500).json({ error: "AUTH_FAILED", message: "Failed to authenticate" });
    }
  });

  app.get("/api/auth/passkey/info", (req, res) => {
    res.json({
      rpId: getRpId(),
      rpName: "Xray Wallet",
      supported: true,
      nonCustodial: true,
      message: "Server cannot sign transactions - your wallet keys never touch our servers",
    });
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
    const { address } = req.query;
    
    // Get database transactions
    const dbTxs = await storage.getTransactions(userId);
    
    // If wallet address provided, also fetch on-chain transactions
    if (address && typeof address === "string") {
      try {
        const onChainTxs = await getOnChainTransactions(address, 15);
        
        // Filter out on-chain transactions that already exist in database (by signature)
        const dbSignatures = new Set(dbTxs.map(tx => tx.signature));
        const newOnChainTxs = onChainTxs.filter(tx => !dbSignatures.has(tx.signature));
        
        // Merge and sort by timestamp (newest first)
        const allTxs = [...dbTxs, ...newOnChainTxs].sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return timeB - timeA;
        });
        
        return res.json(allTxs);
      } catch (error) {
        console.error("Error fetching on-chain transactions:", error);
        // Fall back to just database transactions
      }
    }
    
    res.json(dbTxs);
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

  // Swap routes - Token Discovery
  app.get(api.swaps.tokens.path, hybridAuth, async (req, res) => {
    try {
      const { search, limit, trending } = req.query;
      const tokens = await getTokens({
        search: search as string,
        limit: limit ? parseInt(limit as string) : undefined,
        trending: trending === "true",
      });
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tokens" });
    }
  });

  // Get token by mint address (for paste-to-add)
  app.get("/api/swaps/tokens/:mint", hybridAuth, async (req, res) => {
    try {
      const { mint } = req.params;
      const token = await getTokenByMint(mint);
      if (!token) {
        return res.status(404).json({ message: "Token not found" });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch token" });
    }
  });

  // Get trending tokens
  app.get("/api/swaps/trending", hybridAuth, async (req, res) => {
    try {
      const tokens = await getTokens({ trending: true, limit: 20 });
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trending tokens" });
    }
  });

  // Jupiter Quote
  app.get(api.swaps.quote.path, hybridAuth, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippage } = req.query;
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      const quote = await getJupiterQuote(
        inputMint as string,
        outputMint as string,
        parseInt(amount as string),
        slippage ? parseInt(slippage as string) : 50
      );
      
      if (!quote) {
        return res.status(400).json({ message: "No route found for this swap" });
      }
      
      res.json({
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        outputAmount: parseInt(quote.outAmount),
        priceImpact: parseFloat(quote.priceImpactPct),
        routePlan: quote.routePlan,
        quote,
      });
    } catch (error) {
      console.error("Quote error:", error);
      res.status(500).json({ message: "Failed to get quote" });
    }
  });

  // Get swap transaction from Jupiter
  app.post("/api/swaps/transaction", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const { quote, userPublicKey, priorityFee } = req.body;
      
      if (!quote || !userPublicKey) {
        return res.status(400).json({ message: "Missing quote or userPublicKey" });
      }

      const swapTx = await getJupiterSwapTransaction(
        quote,
        userPublicKey,
        priorityFee || 10000
      );

      if (!swapTx) {
        return res.status(400).json({ message: "Failed to create swap transaction" });
      }

      res.json(swapTx);
    } catch (error) {
      console.error("Swap transaction error:", error);
      res.status(500).json({ message: "Failed to create swap transaction" });
    }
  });

  // Send signed transaction
  app.post("/api/swaps/send", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const { signedTransaction, skipPreflight, lastValidBlockHeight } = req.body;
      
      if (!signedTransaction) {
        return res.status(400).json({ message: "Missing signed transaction" });
      }

      const signature = await sendTransaction(
        signedTransaction,
        skipPreflight !== false,
        lastValidBlockHeight
      );

      if (!signature) {
        return res.status(400).json({ message: "Failed to send transaction" });
      }

      res.json({ signature, success: true });
    } catch (error) {
      console.error("Send transaction error:", error);
      res.status(500).json({ message: "Failed to send transaction" });
    }
  });

  // Legacy execute endpoint (backward compatibility)
  app.post(api.swaps.execute.path, hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const input = api.swaps.execute.input.parse(req.body);
      
      const result = await swapTokens({
        inputMint: input.inputMint,
        outputMint: input.outputMint,
        amount: input.amount,
        slippage: input.slippage,
        signer: null as any,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Swap failed" });
    }
  });

  // Price history routes
  app.get("/api/prices/:mint", hybridAuth, async (req, res) => {
    try {
      const { mint } = req.params;
      const timeframe = (req.query.timeframe as string) || "24h";
      
      if (!["1h", "24h", "7d", "30d"].includes(timeframe)) {
        return res.status(400).json({ message: "Invalid timeframe" });
      }
      
      const priceHistory = await getTokenPriceHistory(
        mint,
        timeframe as "1h" | "24h" | "7d" | "30d"
      );
      
      if (!priceHistory) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      res.json(priceHistory);
    } catch (error) {
      console.error("Price history error:", error);
      res.status(500).json({ message: "Failed to fetch price history" });
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
