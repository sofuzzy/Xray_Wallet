import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { userWallets } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated as sessionAuth } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote } from "./services/pumpfun";
import { 
  getTokens, 
  getTokenByMint, 
  getJupiterQuote, 
  getJupiterSwapTransaction,
  sendTransaction,
  getTokenDecimals,
  type Token,
  type DexOption
} from "./services/jupiterSwap";
import { getTokenPriceHistory, getTokenMetadata, getMultipleTokenMetadata } from "./services/priceHistory";
import { assessTokenRisk, assessTokenRiskBatch } from "./services/tokenRiskEngine";
import { decideTokenAction, getRiskShieldPolicy } from "./services/riskShield";
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
import { getOnChainTransactions, getWalletBalance, getTokenAccounts, sendRawTransaction, getLatestBlockhash } from "./services/solanaTransactions";
import { balanceCache } from "./services/balanceCache";

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
      const origin = req.headers.origin || req.headers.referer;
      
      const options = await generatePasskeyRegistrationOptions(sessionId, username, origin);
      
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
      const origin = req.headers.origin || req.headers.referer;
      const options = generatePasskeyLoginOptions(sessionId, origin);
      
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
      const origin = req.headers.origin || req.headers.referer;
      const options = generateRegistrationChallenge(userId, origin);
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

      const origin = req.headers.origin || req.headers.referer;
      const options = generateAuthenticationChallenge(userId, origin);
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

  app.put(api.users.update.path, hybridAuth, async (req, res) => {
    const userId = req.tokenUser!.sub;
    
    const parseResult = api.users.update.input.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
    }

    const { username, firstName, lastName } = parseResult.data;
    const updates: { username?: string; firstName?: string; lastName?: string } = {};
    if (username !== undefined) updates.username = username;
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

    const updatedUser = await authStorage.updateUser(userId, updates);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updatedUser);
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

  // Wallet balance endpoint - proxies to Solana RPC
  app.get("/api/wallet/balance/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const result = await getWalletBalance(address);
      res.json(result);
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Token accounts endpoint - proxies to Solana RPC with metadata
  app.get("/api/wallet/tokens/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const tokens = await getTokenAccounts(address);
      
      // Fetch metadata for all tokens
      if (tokens.length > 0) {
        const mints = tokens.map((t: any) => t.mint);
        const metadataMap = await getMultipleTokenMetadata(mints);
        
        // Enhance tokens with metadata
        const enhancedTokens = tokens.map((token: any) => {
          const meta = metadataMap.get(token.mint);
          return {
            ...token,
            name: meta?.name || null,
            symbol: meta?.symbol || null,
            imageUrl: meta?.imageUrl || null,
            price: meta?.price || null,
            priceChange24h: meta?.priceChange24h || null,
            marketCap: meta?.marketCap || null,
          };
        });
        
        res.json(enhancedTokens);
      } else {
        res.json(tokens);
      }
    } catch (error) {
      console.error("Error fetching token accounts:", error);
      res.json([]);
    }
  });

  // Get latest blockhash for transaction building
  app.get("/api/solana/blockhash", async (req, res) => {
    try {
      const result = await getLatestBlockhash();
      res.json(result);
    } catch (error) {
      console.error("Error fetching blockhash:", error);
      res.status(500).json({ error: "Failed to fetch blockhash" });
    }
  });

  // Send signed transaction
  app.post("/api/solana/send-transaction", async (req, res) => {
    try {
      const { serializedTransaction } = req.body;
      if (!serializedTransaction) {
        return res.status(400).json({ error: "Missing serializedTransaction" });
      }
      const signature = await sendRawTransaction(serializedTransaction);
      res.json({ signature });
    } catch (error: any) {
      console.error("Error sending transaction:", error);
      res.status(500).json({ error: error.message || "Failed to send transaction" });
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

  // Pre-swap balance validation with caching
  app.get("/api/swaps/validate-balance", hybridAuth, async (req, res) => {
    try {
      const { walletAddress, inputMint, amount } = req.query;
      
      if (!walletAddress || !inputMint || !amount) {
        return res.status(400).json({ message: "Missing required parameters: walletAddress, inputMint, amount" });
      }

      const requestedAmount = parseFloat(amount as string);
      if (isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      const [solBalance, tokenBalances] = await Promise.all([
        balanceCache.getSolBalance(walletAddress as string),
        balanceCache.getTokenBalances(walletAddress as string),
      ]);

      const validation = balanceCache.validateSwapBalance(
        solBalance,
        inputMint as string,
        requestedAmount,
        tokenBalances
      );

      if (!validation.valid) {
        const userId = req.tokenUser?.sub;
        await storage.createActivityLog({
          userId: userId || null,
          walletAddress: walletAddress as string,
          action: "swap_blocked",
          reason: validation.code,
          inputMint: inputMint as string,
          requestedAmount: amount as string,
          details: JSON.stringify({ message: validation.reason, solBalance: solBalance.balance }),
        });
      }

      res.json({
        valid: validation.valid,
        reason: validation.reason,
        code: validation.code,
        solBalance: solBalance.balance,
        solStatus: solBalance.status,
        tokenBalances,
      });
    } catch (error) {
      console.error("Balance validation failed:", error);
      res.status(500).json({ message: "Failed to validate balance" });
    }
  });

  // Activity logs endpoint - supports both authenticated users and wallet-based queries
  app.get("/api/activity-logs", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      const { walletAddress } = req.query;
      
      // Allow wallet-based queries even without full authentication
      if (!userId && !walletAddress) {
        return res.json([]);
      }
      
      const logs = await storage.getActivityLogs(userId || null, walletAddress as string | undefined);
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Delete activity log (dismiss blocked swap notification)
  app.delete("/api/activity-logs/:id", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "INVALID_ID", message: "Invalid activity log ID" });
      }
      
      await storage.deleteActivityLog(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete activity log:", error);
      res.status(500).json({ message: "Failed to delete activity log" });
    }
  });

  // Vault endpoints - encrypted key backup system
  // GET /api/vault - Retrieve encrypted vault data for the authenticated user
  app.get("/api/vault", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const vault = await storage.getVault(userId);
      if (!vault) {
        return res.status(404).json({ error: "VAULT_NOT_FOUND", message: "No vault found for this user" });
      }

      // Return vault data (ciphertext, salt, iv, kdfParams) - never the decryption key
      res.json({
        ciphertext: vault.ciphertext,
        salt: vault.salt,
        iv: vault.iv,
        kdfParams: vault.kdfParams,
        createdAt: vault.createdAt,
        updatedAt: vault.updatedAt,
      });
    } catch (error) {
      console.error("Failed to fetch vault:", error);
      res.status(500).json({ error: "VAULT_FETCH_FAILED", message: "Failed to fetch vault" });
    }
  });

  // PUT /api/vault - Create or update encrypted vault data
  app.put("/api/vault", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const vaultSchema = z.object({
        ciphertext: z.string().min(1),
        salt: z.string().min(1),
        iv: z.string().min(1),
        kdfParams: z.string().min(1), // JSON string with algorithm, iterations, etc.
      });

      const parsed = vaultSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_VAULT_DATA", message: "Invalid vault data format" });
      }

      const { ciphertext, salt, iv, kdfParams } = parsed.data;

      // Check if vault exists
      const existingVault = await storage.getVault(userId);
      
      let vault;
      let action: "created" | "restored";
      
      if (existingVault) {
        // Update existing vault
        vault = await storage.updateVault(userId, { ciphertext, salt, iv, kdfParams });
        action = "restored"; // Consider update as re-backup
      } else {
        // Create new vault
        vault = await storage.createVault({ userId, ciphertext, salt, iv, kdfParams });
        action = "created";
      }

      // Audit log - never log ciphertext or any sensitive data
      await storage.createVaultAudit({
        userId,
        action,
        sourceIp: req.clientInfo?.ip || null,
        userAgent: req.clientInfo?.userAgent || null,
      });

      res.json({
        success: true,
        message: action === "created" ? "Vault created successfully" : "Vault updated successfully",
        createdAt: vault?.createdAt,
        updatedAt: vault?.updatedAt,
      });
    } catch (error) {
      console.error("Failed to save vault:", error);
      res.status(500).json({ error: "VAULT_SAVE_FAILED", message: "Failed to save vault" });
    }
  });

  // DELETE /api/vault - Delete vault data
  app.delete("/api/vault", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const existingVault = await storage.getVault(userId);
      if (!existingVault) {
        return res.status(404).json({ error: "VAULT_NOT_FOUND", message: "No vault found to delete" });
      }

      await storage.deleteVault(userId);

      // Audit log
      await storage.createVaultAudit({
        userId,
        action: "deleted",
        sourceIp: req.clientInfo?.ip || null,
        userAgent: req.clientInfo?.userAgent || null,
      });

      res.json({ success: true, message: "Vault deleted successfully" });
    } catch (error) {
      console.error("Failed to delete vault:", error);
      res.status(500).json({ error: "VAULT_DELETE_FAILED", message: "Failed to delete vault" });
    }
  });

  // GET /api/vault/status - Check if user has a vault (without fetching data)
  app.get("/api/vault/status", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const vault = await storage.getVault(userId);
      res.json({
        hasVault: !!vault,
        createdAt: vault?.createdAt || null,
        updatedAt: vault?.updatedAt || null,
      });
    } catch (error) {
      console.error("Failed to check vault status:", error);
      res.status(500).json({ error: "VAULT_STATUS_FAILED", message: "Failed to check vault status" });
    }
  });

  // GET /api/vault/audits - Get vault activity history
  app.get("/api/vault/audits", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const audits = await storage.getVaultAudits(userId);
      res.json(audits);
    } catch (error) {
      console.error("Failed to fetch vault audits:", error);
      res.status(500).json({ error: "VAULT_AUDITS_FAILED", message: "Failed to fetch vault audits" });
    }
  });

  // ========== WALLET REGISTRY (Multi-Device Sync) ==========

  // GET /api/wallet-registry - List all user wallets from registry
  app.get("/api/wallet-registry", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const wallets = await storage.getUserWallets(userId);
      res.json(wallets);
    } catch (error) {
      console.error("Failed to fetch user wallets:", error);
      res.status(500).json({ error: "WALLETS_FETCH_FAILED", message: "Failed to fetch wallets" });
    }
  });

  // POST /api/wallet-registry - Register a wallet address
  app.post("/api/wallet-registry", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const schema = z.object({
        walletAddress: z.string().min(32).max(64),
        label: z.string().min(1).max(50).optional(),
        source: z.enum(["created", "imported", "restored"]).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: parsed.error.message });
      }

      const { walletAddress, label, source } = parsed.data;

      // Check if already registered
      const existing = await storage.getUserWalletByAddress(userId, walletAddress);
      if (existing) {
        // Update last seen and return existing
        await storage.updateUserWalletLastSeen(userId, walletAddress);
        return res.json({ ...existing, lastSeenAt: new Date() });
      }

      // Register new wallet
      const wallet = await storage.registerUserWallet({
        userId,
        walletAddress,
        label: label || "Wallet",
        source: source || "created",
      });

      // Activity log
      await storage.createActivityLog({
        userId,
        walletAddress,
        action: "wallet_registered",
        reason: "WALLET_SYNCED",
        details: JSON.stringify({ label: wallet.label, source: wallet.source }),
      });

      res.status(201).json(wallet);
    } catch (error) {
      console.error("Failed to register wallet:", error);
      res.status(500).json({ error: "WALLET_REGISTER_FAILED", message: "Failed to register wallet" });
    }
  });

  // DELETE /api/wallet-registry/:address - Unlink wallet from account
  app.delete("/api/wallet-registry/:address", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const { address } = req.params;
      if (!address || address.length < 32) {
        return res.status(400).json({ error: "INVALID_ADDRESS", message: "Invalid wallet address" });
      }

      // Check if exists
      const existing = await storage.getUserWalletByAddress(userId, address);
      if (!existing) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Wallet not registered" });
      }

      await storage.unlinkUserWallet(userId, address);

      // Activity log
      await storage.createActivityLog({
        userId,
        walletAddress: address,
        action: "wallet_unlinked",
        reason: "USER_ACTION",
        details: JSON.stringify({ label: existing.label }),
      });

      res.json({ success: true, message: "Wallet unlinked" });
    } catch (error) {
      console.error("Failed to unlink wallet:", error);
      res.status(500).json({ error: "WALLET_UNLINK_FAILED", message: "Failed to unlink wallet" });
    }
  });

  // PUT /api/wallet-registry/:address/label - Update wallet label
  app.put("/api/wallet-registry/:address/label", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser?.sub;
      if (!userId) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      }

      const { address } = req.params;
      const schema = z.object({ label: z.string().min(1).max(50) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: parsed.error.message });
      }

      const existing = await storage.getUserWalletByAddress(userId, address);
      if (!existing) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Wallet not registered" });
      }

      // Update label via raw query since we don't have a specific method
      await db.update(userWallets)
        .set({ label: parsed.data.label })
        .where(and(eq(userWallets.userId, userId), eq(userWallets.walletAddress, address)));

      res.json({ success: true, label: parsed.data.label });
    } catch (error) {
      console.error("Failed to update wallet label:", error);
      res.status(500).json({ error: "WALLET_UPDATE_FAILED", message: "Failed to update wallet" });
    }
  });

  // Jupiter Quote (supports direct DEX routing via 'dex' param: auto, orca, raydium)
  app.get(api.swaps.quote.path, hybridAuth, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippage, dex, riskShieldDisabled, enabledCheckCodes } = req.query;

      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      // Validate dex parameter
      const dexOption: DexOption = ["auto", "orca", "raydium"].includes(dex as string) 
        ? (dex as DexOption) 
        : "auto";

      // Check if Risk Shield is disabled by user
      const isRiskShieldDisabled = riskShieldDisabled === "true";
      
      // Parse enabled check codes filter
      const enabledCodesFilter = enabledCheckCodes 
        ? (enabledCheckCodes as string).split(",").filter(Boolean)
        : null;

      // Risk Shield check and Jupiter quote run in PARALLEL for faster response
      const ack = (req.query.ack as string) === "true";
      const [riskDecision, quote] = await Promise.all([
        // Skip Risk Shield if disabled by user
        (!isRiskShieldDisabled && outputMint) 
          ? decideTokenAction({ mint: outputMint as string, action: "swap_quote_output", acknowledge: ack, includeAssessment: true }) 
          : Promise.resolve(null),
        getJupiterQuote(
          inputMint as string,
          outputMint as string,
          parseInt(amount as string),
          slippage ? parseInt(slippage as string) : 50,
          dexOption
        )
      ]);

      // Check risk decision after parallel fetch
      // IMPORTANT: Always honor blocked status for security - user toggles only affect warnings
      if (riskDecision && !riskDecision.allowed) {
        // If hard blocked, always block regardless of user filter settings
        if (riskDecision.blocked) {
          return res.status(403).json({
            message: riskDecision.reason,
            decision: riskDecision,
          });
        }
        
        // For warnings/acknowledgements, filter flags based on user's enabled check codes
        if (enabledCodesFilter && riskDecision.assessment?.flags) {
          const relevantFlags = riskDecision.assessment.flags.filter(
            f => enabledCodesFilter.includes(f.code)
          );
          // If no relevant flags after filtering, allow the swap
          if (relevantFlags.length === 0) {
            // Proceed with quote - no blocking needed
          } else if (riskDecision.requiresAcknowledgement) {
            return res.status(428).json({
              message: riskDecision.reason,
              decision: { ...riskDecision, assessment: { ...riskDecision.assessment, flags: relevantFlags } },
              hint: "Pass ?ack=true to acknowledge the risk for this token.",
            });
          }
        } else if (riskDecision.requiresAcknowledgement) {
          return res.status(428).json({
            message: riskDecision.reason,
            decision: riskDecision,
            hint: "Pass ?ack=true to acknowledge the risk for this token.",
          });
        }
      }
      
      if (!quote) {
        const dexName = dexOption === "auto" ? "any DEX" : dexOption.charAt(0).toUpperCase() + dexOption.slice(1);
        return res.status(400).json({ message: `No route found on ${dexName} for this swap` });
      }
      
      // Fetch output token decimals for accurate display on client
      const outputDecimals = await getTokenDecimals(outputMint as string);
      
      res.json({
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        outputAmount: parseInt(quote.outAmount),
        outputDecimals,
        priceImpact: parseFloat(quote.priceImpactPct),
        routePlan: quote.routePlan,
        dex: dexOption,
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
      const { quote, userPublicKey, priorityFee, riskShieldDisabled, enabledCheckCodes } = req.body;

      // Check if Risk Shield is disabled by user
      const isRiskShieldDisabled = riskShieldDisabled === true || riskShieldDisabled === "true";
      
      // Parse enabled check codes filter
      const enabledCodesFilter = enabledCheckCodes 
        ? (Array.isArray(enabledCheckCodes) ? enabledCheckCodes : String(enabledCheckCodes).split(",")).filter(Boolean)
        : null;

      // Risk Shield: require acknowledgement/block risky swaps (skip if disabled)
      const ack = Boolean(req.body?.acknowledgeRisk || req.body?.riskAcknowledgement?.accepted);
      const outMint = quote?.outputMint;
      if (!isRiskShieldDisabled && outMint) {
        const decision = await decideTokenAction({ mint: outMint, action: "swap_tx_output", acknowledge: ack, includeAssessment: true });
        if (!decision.allowed) {
          // IMPORTANT: Always honor blocked status for security - user toggles only affect warnings
          if (decision.blocked) {
            return res.status(403).json({
              message: decision.reason,
              decision,
            });
          }
          
          // For warnings/acknowledgements, filter flags based on user's enabled check codes
          if (enabledCodesFilter && decision.assessment?.flags) {
            const relevantFlags = decision.assessment.flags.filter(
              f => enabledCodesFilter.includes(f.code)
            );
            if (relevantFlags.length === 0) {
              // No relevant flags after filtering, proceed
            } else if (decision.requiresAcknowledgement) {
              return res.status(428).json({
                message: decision.reason,
                decision: { ...decision, assessment: { ...decision.assessment, flags: relevantFlags } },
                hint: "Include { acknowledgeRisk: true } (or riskAcknowledgement.accepted=true) to proceed.",
              });
            }
          } else if (decision.requiresAcknowledgement) {
            return res.status(428).json({
              message: decision.reason,
              decision,
              hint: "Include { acknowledgeRisk: true } (or riskAcknowledgement.accepted=true) to proceed.",
            });
          }
        }
      }
      
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

      const result = await sendTransaction(
        signedTransaction,
        skipPreflight !== false,
        lastValidBlockHeight
      );

      if (!result.success && !result.signature) {
        return res.status(400).json({ message: result.error || "Failed to send transaction" });
      }
      
      if (!result.success && result.signature) {
        // Transaction was sent but failed on-chain
        return res.status(400).json({ 
          message: result.error || "Transaction failed on-chain",
          signature: result.signature 
        });
      }

      res.json({ 
        signature: result.signature, 
        success: true,
        timedOut: result.timedOut,
        message: result.timedOut ? "Transaction sent. Confirmation may take a moment." : undefined
      });
    } catch (error) {
      console.error("Send transaction error:", error);
      res.status(500).json({ message: "Failed to send transaction. Please try again." });
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

  // Watchlist Token endpoints
  app.get("/api/watchlist", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const tokens = await storage.getWatchlistTokens(userId);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const tokenInput = z.object({
        tokenMint: z.string().min(32).max(64),
        tokenSymbol: z.string().min(1).max(20),
        tokenName: z.string().min(1).max(100),
        tokenDecimals: z.number().int().min(0).max(18).default(9),
      });
      
      const parsed = tokenInput.parse(req.body);
      
      // Check if already in watchlist
      const existing = await storage.getWatchlistTokenByMint(userId, parsed.tokenMint);
      if (existing) {
        return res.status(409).json({ message: "Token already in watchlist" });
      }
      
      const token = await storage.addWatchlistToken({
        userId,
        tokenMint: parsed.tokenMint,
        tokenSymbol: parsed.tokenSymbol,
        tokenName: parsed.tokenName,
        tokenDecimals: parsed.tokenDecimals,
      });
      
      res.status(201).json(token);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to add token to watchlist" });
    }
  });

  app.delete("/api/watchlist/:id", hybridAuth, strictRateLimiter, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const tokenId = parseInt(req.params.id);
      
      await storage.removeWatchlistToken(tokenId, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove token from watchlist" });
    }
  });

  // Token search endpoint using DexScreener
  app.get("/api/tokens/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      
      if (!query || query.trim().length < 2) {
        return res.status(400).json({ message: "Query must be at least 2 characters" });
      }
      
      const { searchTokens } = await import("./services/jupiterSwap");
      const tokens = await searchTokens(query.trim(), limit);
      res.json(tokens);
    } catch (error) {
      console.error("Token search error:", error);
      res.status(500).json({ message: "Failed to search tokens" });
    }
  });

  // Token metadata endpoint for watchlist enrichment
  app.get("/api/tokens/metadata/:mint", hybridAuth, async (req, res) => {
    try {
      const { mint } = req.params;
      const metadata = await getTokenMetadata(mint);
      
      if (!metadata) {
        return res.status(404).json({ message: "Token not found" });
      }
      
      const risk = await assessTokenRisk(mint);
      res.json({ ...metadata, risk });
    } catch (error) {
      console.error("Token metadata error:", error);
      res.status(500).json({ message: "Failed to fetch token metadata" });
    }
  });

  // Batch token metadata endpoint - returns object keyed by mint for proper mapping
  app.post("/api/tokens/metadata/batch", hybridAuth, async (req, res) => {
    try {
      const { mints } = req.body;
      
      if (!Array.isArray(mints) || mints.length === 0) {
        return res.status(400).json({ message: "Mints array required" });
      }
      
      if (mints.length > 20) {
        return res.status(400).json({ message: "Maximum 20 tokens per batch" });
      }
      
      const results = await getMultipleTokenMetadata(mints);
      const metadataByMint: Record<string, any> = {};
      results.forEach((value, key) => {
        metadataByMint[key] = value;
      });
      
      const riskResults = await assessTokenRiskBatch(mints);
      Object.entries(riskResults).forEach(([key, value]) => {
        if (!metadataByMint[key]) metadataByMint[key] = { mint: key };
        metadataByMint[key].risk = value;
      });

      res.json(metadataByMint);
    } catch (error) {
      console.error("Batch metadata error:", error);
      res.status(500).json({ message: "Failed to fetch token metadata" });
    }
  });

  // Token risk endpoints (heuristic, not a guarantee)
  app.get("/api/tokens/risk/:mint", hybridAuth, async (req, res) => {
    try {
      const { mint } = req.params;
      const risk = await assessTokenRisk(mint);
      if (!risk) return res.status(404).json({ message: "Token not found" });
      res.json(risk);
    } catch (error) {
      console.error("Token risk error:", error);
      res.status(500).json({ message: "Failed to assess token risk" });
    }
  });

  app.post("/api/tokens/risk/batch", hybridAuth, async (req, res) => {
    try {
      const { mints } = req.body;
      if (!Array.isArray(mints) || mints.length === 0) {
        return res.status(400).json({ message: "Mints array required" });
      }
      if (mints.length > 20) {
        return res.status(400).json({ message: "Maximum 20 tokens per batch" });
      }
      const results = await assessTokenRiskBatch(mints);
      res.json(results);
    } catch (error) {
      console.error("Batch risk error:", error);
      res.status(500).json({ message: "Failed to assess token risk" });
    }
  });

  return httpServer;
}