import type { Express } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { validate } from "./middleware/validate";
import { ApiError, isApiError } from "./utils/apiError";
import { sendApiError as sendApiErrorResponse } from "./utils/sendApiError";
import { setupAuth, registerAuthRoutes, isAuthenticated as sessionAuth } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { swapTokens, getSwapQuote } from "./services/pumpfun";
import { 
  getTokens, 
  getTokenByMint, 
  getJupiterQuote, 
  getJupiterSwapTransaction,
  sendTransaction,
  type Token,
  type DexOption
} from "./services/jupiterSwap";
import { getTokenPriceHistory, getTokenMetadata, getMultipleTokenMetadata } from "./services/priceHistory";
import { assessTokenRisk, assessTokenRiskBatch } from "./services/tokenRiskEngine";
import { decideTokenAction, getRiskShieldPolicy } from "./services/riskShield";
import { registerStripeRoutes } from "./stripeRoutes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { 
  extractClientInfo, 
  hybridAuth, 
  globalRateLimiter, 
  strictRateLimiter,
  authRateLimiter,
  quoteRateLimiter,
  swapTxRateLimiter,
  tokenLookupRateLimiter,
  riskAssessmentRateLimiter,
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

// ---------------------------
// Validation helpers/schemas
// ---------------------------
const zBoolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "string" ? v === "true" : v));

const zBase58 = z.string().min(20).max(80);

const schemas = {
  authRefresh: z.object({
    refreshToken: z.string().min(20),
  }),
  authRevoke: z.object({
    refreshToken: z.string().min(20).optional(),
    revokeAll: z.boolean().optional(),
  }),
  passkeyRegisterOptions: z.object({
    username: z.string().min(1).max(64).optional(),
  }),
  passkeyRegisterVerify: z.object({
    sessionId: z.string().min(8),
    id: z.string().min(8),
    response: z.object({
      clientDataJSON: z.string().min(10),
      attestationObject: z.string().min(10),
    }).passthrough(),
    transports: z.array(z.string()).optional(),
  }).passthrough(),
  passkeyLoginVerify: z.object({
    sessionId: z.string().min(8),
    id: z.string().min(8),
    response: z.object({
      clientDataJSON: z.string().min(10),
      authenticatorData: z.string().min(10).optional(),
      signature: z.string().min(10).optional(),
      userHandle: z.string().optional(),
    }).passthrough(),
  }).passthrough(),
  webauthnRegisterVerify: z.object({
    id: z.string().min(5),
    response: z.object({
      clientDataJSON: z.string().min(10),
      attestationObject: z.string().min(10),
    }).passthrough(),
    transports: z.array(z.string()).optional(),
  }).passthrough(),
  webauthnAuthVerify: z.object({
    userId: z.string().min(1),
    id: z.string().min(5),
    response: z.object({
      clientDataJSON: z.string().min(10),
      authenticatorData: z.string().min(10),
      signature: z.string().min(10),
    }).passthrough(),
  }).passthrough(),
  webauthnCredentialIdParam: z.object({ id: z.string().min(5) }),
  walletsCreate: api.wallets.create.input,
  transactionsCreate: api.transactions.create.input,
  swapsExecute: api.swaps.execute.input,
  solanaSendTx: z.object({
    serializedTransaction: z.string().min(10),
  }).passthrough(),
  swapsSend: z.object({
    signedTransaction: z.string().min(10),
  }).passthrough(),
  tokenMetadataBatch: z.object({ mints: z.array(z.string().min(10)).max(20) }),
  tokenRiskBatch: z.object({ mints: z.array(z.string().min(10)).max(20) }),
  riskDecisionQuery: z.object({
    action: z.enum(["swap", "send", "view"]).default("swap"),
    ack: zBoolFromString.optional(),
  }).passthrough(),
  tokenSearchQuery: z.object({ q: z.string().min(1).max(64) }).passthrough(),
  walletAddressParam: z.object({ address: zBase58 }),
  tokenMintParam: z.object({ mint: zBase58 }),
  usernameParam: z.object({ username: z.string().min(1).max(50) }),
};

function handleApiError(res: any, err: unknown) {
  if (isApiError(err)) {
    return sendApiErrorResponse(res, err.status, err.code, err.message, err.details);
  }
  console.error("Unhandled error:", err);
  return sendApiErrorResponse(res, 500, "INTERNAL_ERROR", "Internal Server Error");
}

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
        return sendApiErrorResponse(res, 404, "USER_NOT_FOUND", "User not found");
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
      return sendApiErrorResponse(res, 500, "TOKEN_GENERATION_FAILED", "Failed to generate tokens");
    }
  });

  app.post("/api/auth/refresh", authRateLimiter, validate(schemas.authRefresh, "body"), async (req, res) => {
    try {
      const { refreshToken } = req.body as z.infer<typeof schemas.authRefresh>;

      const tokens = await refreshAccessToken(
        refreshToken,
        req.clientInfo?.userAgent,
        req.clientInfo?.ip
      );

      if (!tokens) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");

      res.json(tokens);
    } catch (error) {
      console.error("Token refresh failed:", error);
      return handleApiError(res, error);
    }
  });

  app.post("/api/auth/revoke", hybridAuth, validate(schemas.authRevoke, "body"), async (req, res) => {
    try {
      const { refreshToken, revokeAll } = req.body as z.infer<typeof schemas.authRevoke>;
      
      if (revokeAll && req.tokenUser) {
        await revokeAllUserTokens(req.tokenUser.sub);
        return res.json({ success: true, message: "All tokens revoked" });
      }

      if (!refreshToken) throw new ApiError(400, "MISSING_TOKEN", "Refresh token required");

      const success = await revokeToken(refreshToken);
      if (!success) throw new ApiError(400, "REVOKE_FAILED", "Failed to revoke token");

      res.json({ success: true, message: "Token revoked" });
    } catch (error) {
      console.error("Token revocation failed:", error);
      return handleApiError(res, error);
    }
  });

  // ============================================
  // PASSKEY-ONLY AUTHENTICATION ROUTES
  // NON-CUSTODIAL: These endpoints NEVER handle private keys, seed phrases, or
  // anything that can sign transactions. Only public credential data is stored.
  // ============================================

  app.post(
    "/api/auth/passkey/register/options",
    authRateLimiter,
    validate(schemas.passkeyRegisterOptions, "body"),
    async (req, res) => {
    try {
      const { username } = req.body as z.infer<typeof schemas.passkeyRegisterOptions>;
      const sessionId = req.sessionID || crypto.randomUUID();
      
      const options = await generatePasskeyRegistrationOptions(sessionId, username);
      
      res.json({
        ...options,
        sessionId,
      });
    } catch (error) {
      console.error("Passkey registration options failed:", error);
      return handleApiError(res, error);
    }
  });

  app.post(
    "/api/auth/passkey/register/verify",
    strictRateLimiter,
    validate(schemas.passkeyRegisterVerify, "body"),
    async (req, res) => {
    try {
      const { sessionId, id, response, transports } = req.body as z.infer<typeof schemas.passkeyRegisterVerify>;

      const result = await verifyPasskeyRegistration(
        sessionId,
        id,
        response.clientDataJSON,
        response.attestationObject,
        transports
      );

      if (!result.success || !result.userId) throw new ApiError(400, "VERIFICATION_FAILED", result.error || "Registration failed");

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
      return handleApiError(res, error);
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
      return sendApiErrorResponse(res, 500, "OPTIONS_FAILED", "Failed to generate login options");
    }
  });

  app.post(
    "/api/auth/passkey/login/verify",
    strictRateLimiter,
    validate(schemas.passkeyLoginVerify, "body"),
    async (req, res) => {
    try {
      const { sessionId, id, response } = req.body as z.infer<typeof schemas.passkeyLoginVerify>;

      const result = await verifyPasskeyLogin(
        sessionId,
        id,
        id,
        response.clientDataJSON,
        response.authenticatorData!,
        response.signature!,
        response.userHandle
      );

      if (!result.success || !result.userId) throw new ApiError(401, "AUTH_FAILED", result.error || "Authentication failed");

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
      return handleApiError(res, error);
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
      return sendApiErrorResponse(res, 500, "FETCH_FAILED", "Failed to fetch credentials");
    }
  });

  app.post("/api/webauthn/register/options", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const options = generateRegistrationChallenge(userId);
      res.json(options);
    } catch (error) {
      return sendApiErrorResponse(res, 500, "OPTIONS_FAILED", "Failed to generate registration options");
    }
  });

  app.post(
    "/api/webauthn/register/verify",
    hybridAuth,
    strictRateLimiter,
    validate(schemas.webauthnRegisterVerify, "body"),
    async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const { id, response, transports } = req.body as z.infer<typeof schemas.webauthnRegisterVerify>;

      const success = await verifyRegistration(
        userId,
        id,
        response.clientDataJSON,
        response.attestationObject,
        transports
      );

      if (!success) throw new ApiError(400, "VERIFICATION_FAILED", "Failed to verify registration");

      res.json({ success: true, message: "Face ID registered successfully" });
    } catch (error) {
      console.error("WebAuthn registration failed:", error);
      return handleApiError(res, error);
    }
  });

  app.post("/api/webauthn/authenticate/options", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const credentials = await getCredentialsForUser(userId);
      
      if (credentials.length === 0) {
        return sendApiErrorResponse(res, 400, "NO_CREDENTIALS", "No biometric credentials registered");
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
      return sendApiErrorResponse(res, 500, "OPTIONS_FAILED", "Failed to generate authentication options");
    }
  });

  app.post(
    "/api/webauthn/authenticate/verify",
    strictRateLimiter,
    validate(schemas.webauthnAuthVerify, "body"),
    async (req, res) => {
    try {
      const { userId, id, response } = req.body as z.infer<typeof schemas.webauthnAuthVerify>;

      const success = await verifyAuthentication(
        userId,
        id,
        response.clientDataJSON,
        response.authenticatorData,
        response.signature
      );

      if (!success) {
        return sendApiErrorResponse(res, 401, "AUTH_FAILED", "Biometric authentication failed");
      }

      const user = await authStorage.getUser(userId);
      if (!user) {
        return sendApiErrorResponse(res, 404, "USER_NOT_FOUND", "User not found");
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
      return sendApiErrorResponse(res, 500, "AUTH_FAILED", "Failed to authenticate");
    }
  });

  app.delete("/api/webauthn/credentials/:id", hybridAuth, async (req, res) => {
    try {
      const userId = req.tokenUser!.sub;
      const credentialId = parseInt(req.params.id);
      
      await deleteCredential(credentialId, userId);
      res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      return sendApiErrorResponse(res, 500, "DELETE_FAILED", "Failed to delete credential");
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

  app.post(api.wallets.create.path, hybridAuth, strictRateLimiter, validate(schemas.walletsCreate, "body"), async (req, res) => {
    const userId = req.tokenUser!.sub;
    // Check if already has wallet
    const existing = await storage.getWallet(userId);
    if (existing) return res.status(400).json({ message: "Wallet already exists" });

    try {
      const { publicKey } = req.body as z.infer<typeof schemas.walletsCreate>;
      const wallet = await storage.createWallet({
        userId,
        publicKey,
      });
      res.status(201).json(wallet);
    } catch (err) {
      return handleApiError(res, err);
    }
  });

  // Wallet balance endpoint - proxies to Solana RPC
  app.get("/api/wallet/balance/:address", validate(schemas.walletAddressParam, "params"), async (req, res) => {
    try {
      const { address } = req.params as z.infer<typeof schemas.walletAddressParam>;
      const result = await getWalletBalance(address);
      res.json(result);
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      return handleApiError(res, error);
    }
  });

  // Token accounts endpoint - proxies to Solana RPC
  app.get("/api/wallet/tokens/:address", validate(schemas.walletAddressParam, "params"), async (req, res) => {
    try {
      const { address } = req.params as z.infer<typeof schemas.walletAddressParam>;
      const tokens = await getTokenAccounts(address);
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching token accounts:", error);
      return handleApiError(res, error);
    }
  });

  // Get latest blockhash for transaction building
  app.get("/api/solana/blockhash", async (req, res) => {
    try {
      const result = await getLatestBlockhash();
      res.json(result);
    } catch (error) {
      console.error("Error fetching blockhash:", error);
      return sendApiErrorResponse(res, 500, "BLOCKHASH_FETCH_FAILED", "Failed to fetch blockhash");
    }
  });

  // Send signed transaction
  app.post("/api/solana/send-transaction", validate(schemas.solanaSendTx, "body"), async (req, res) => {
    try {
      const { serializedTransaction } = req.body as z.infer<typeof schemas.solanaSendTx>;
      const signature = await sendRawTransaction(serializedTransaction);
      res.json({ signature });
    } catch (error: any) {
      console.error("Error sending transaction:", error);
      return handleApiError(res, error);
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

  // Jupiter Quote (supports direct DEX routing via 'dex' param: auto, orca, raydium)
  app.get(api.swaps.quote.path, hybridAuth, quoteRateLimiter, async (req, res) => {
    try {
      const swapQuoteQuerySchema = z.object({
        inputMint: z.string().min(20),
        outputMint: z.string().min(20),
        amount: z.coerce.number().int().positive(),
        slippage: z.coerce.number().int().min(1).max(5000).optional(),
        dex: z.enum(["auto", "orca", "raydium"]).optional(),
        riskShieldDisabled: z.coerce.boolean().optional(),
        enabledCheckCodes: z.string().optional(),
        ack: z.coerce.boolean().optional(),
      }).passthrough();

      const parsedQuery = swapQuoteQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({ message: "Invalid parameters", issues: parsedQuery.error.issues });
      }

      const { inputMint, outputMint, amount, slippage, dex, riskShieldDisabled, enabledCheckCodes, ack } = parsedQuery.data;
      
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
      const ackBool = Boolean(ack);
      const [riskDecision, quote] = await Promise.all([
        // Skip Risk Shield if disabled by user
        (!isRiskShieldDisabled && outputMint) 
          ? decideTokenAction({ mint: outputMint as string, action: "swap_quote_output", acknowledge: ackBool, includeAssessment: true }) 
          : Promise.resolve(null),
        getJupiterQuote(
          inputMint as string,
          outputMint as string,
          amount,
          slippage ?? 50,
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
      
      res.json({
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        outputAmount: parseInt(quote.outAmount),
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
  app.post("/api/swaps/transaction", hybridAuth, swapTxRateLimiter, async (req, res) => {
    try {
      const swapTxBodySchema = z.object({
        quote: z.object({}).passthrough(),
        userPublicKey: z.string().min(20),
        priorityFee: z.union([z.number(), z.string()]).optional(),
        riskShieldDisabled: z.coerce.boolean().optional(),
        enabledCheckCodes: z.union([z.array(z.string()), z.string()]).optional(),
        acknowledgeRisk: z.any().optional(),
        riskAcknowledgement: z.any().optional(),
      }).passthrough();

      const parsedBody = swapTxBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Invalid request body", issues: parsedBody.error.issues });
      }

      const { quote, userPublicKey, priorityFee, riskShieldDisabled, enabledCheckCodes, acknowledgeRisk, riskAcknowledgement } = parsedBody.data;

      // Check if Risk Shield is disabled by user
      const isRiskShieldDisabled = Boolean(riskShieldDisabled);
      
      // Parse enabled check codes filter
      const enabledCodesFilter = enabledCheckCodes 
        ? (Array.isArray(enabledCheckCodes) ? enabledCheckCodes : String(enabledCheckCodes).split(",")).filter(Boolean)
        : null;

      // Risk Shield: require acknowledgement/block risky swaps (skip if disabled)
      const ack = Boolean(acknowledgeRisk || (riskAcknowledgement as any)?.accepted);
      const outMint = quote?.outputMint;
      if (!isRiskShieldDisabled && outMint) {
        const decision = await decideTokenAction({ mint: outMint, action: "swap_tx_output", acknowledge: ackBool, includeAssessment: true });
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
  app.get("/api/tokens/metadata/:mint", hybridAuth, tokenLookupRateLimiter, async (req, res) => {
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
  app.post("/api/tokens/metadata/batch", hybridAuth, tokenLookupRateLimiter, async (req, res) => {
    try {
      const batchSchema = z.object({
        mints: z.array(z.string().min(20)).min(1).max(20),
      });

      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid mints array", issues: parsed.error.issues });
      }

      const { mints } = parsed.data;
      
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
  app.get("/api/tokens/risk/:mint", hybridAuth, riskAssessmentRateLimiter, async (req, res) => {
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

  app.post("/api/tokens/risk/batch", hybridAuth, riskAssessmentRateLimiter, async (req, res) => {
    try {
      const batchSchema = z.object({
        mints: z.array(z.string().min(20)).min(1).max(20),
      });

      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid mints array", issues: parsed.error.issues });
      }

      const { mints } = parsed.data;
      const results = await assessTokenRiskBatch(mints);
      res.json(results);
    } catch (error) {
      console.error("Batch risk error:", error);
      res.status(500).json({ message: "Failed to assess token risk" });
    }
  });

  return httpServer;
}