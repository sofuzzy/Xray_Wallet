import type { Request, Response, NextFunction, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { verifyAccessToken, type TokenPayload } from "../services/tokenService";

function normalizeIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":");
  }
  
  return ip;
}

function getClientKey(req: Request): string {
  const tokenUser = (req as any).tokenUser;
  if (tokenUser?.sub) {
    return `user:${tokenUser.sub}`;
  }
  const normalizedIp = normalizeIp(req.ip || req.socket.remoteAddress);
  return `ip:${normalizedIp}`;
}

declare global {
  namespace Express {
    interface Request {
      tokenUser?: TokenPayload;
      clientInfo?: {
        ip: string;
        userAgent: string;
        fingerprint: string;
      };
    }
  }
}

export const extractClientInfo: RequestHandler = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = req.get("user-agent") || "unknown";
  const fingerprint = `${ip}:${userAgent}`.substring(0, 100);
  
  req.clientInfo = { ip, userAgent, fingerprint };
  next();
};

export const validateToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ 
      error: "UNAUTHORIZED",
      message: "Missing or invalid authorization header" 
    });
  }

  const token = authHeader.substring(7);
  const payload = await verifyAccessToken(token);
  
  if (!payload) {
    return res.status(401).json({ 
      error: "TOKEN_EXPIRED",
      message: "Access token is invalid or expired" 
    });
  }

  req.tokenUser = payload;
  next();
};

export const hybridAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);
    
    if (payload) {
      req.tokenUser = payload;
      return next();
    }
    
    return res.status(401).json({ 
      error: "TOKEN_EXPIRED",
      message: "Access token is invalid or expired" 
    });
  }
  
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const sessionUser = req.user as any;
    if (sessionUser.claims?.sub) {
      req.tokenUser = {
        sub: sessionUser.claims.sub,
        email: sessionUser.claims.email,
        firstName: sessionUser.claims.first_name,
        lastName: sessionUser.claims.last_name,
        type: "access",
      };
      return next();
    }
  }
  
  return res.status(401).json({ 
    error: "UNAUTHORIZED",
    message: "Authentication required" 
  });
};

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: "RATE_LIMITED", message: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "RATE_LIMITED", message: "Too many requests for this action" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});


// More granular limiters for expensive endpoints
export const quoteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "RATE_LIMITED", message: "Too many quote requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const swapTxRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "RATE_LIMITED", message: "Too many swap attempts, please try again shortly" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const tokenLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "RATE_LIMITED", message: "Too many token requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const riskAssessmentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "RATE_LIMITED", message: "Too many risk checks, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "RATE_LIMITED", message: "Too many authentication attempts" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

interface AnomalyTracker {
  requestCount: number;
  lastRequest: number;
  failedAttempts: number;
  suspiciousPatterns: string[];
}

const anomalyStore = new Map<string, AnomalyTracker>();

export const anomalyDetection: RequestHandler = (req, res, next) => {
  const key = getClientKey(req);
  const now = Date.now();
  
  let tracker = anomalyStore.get(key);
  if (!tracker) {
    tracker = {
      requestCount: 0,
      lastRequest: now,
      failedAttempts: 0,
      suspiciousPatterns: [],
    };
    anomalyStore.set(key, tracker);
  }
  
  const timeSinceLastRequest = now - tracker.lastRequest;
  tracker.requestCount++;
  tracker.lastRequest = now;
  
  if (timeSinceLastRequest < 5 && tracker.requestCount > 500) {
    tracker.suspiciousPatterns.push("rapid_requests");
    console.warn(`[ANOMALY] Rapid requests detected from ${key}`);
  }
  
  const sensitiveRoutes = ["/api/wallets", "/api/transactions", "/api/swaps"];
  if (sensitiveRoutes.some(route => req.path.startsWith(route))) {
    if (tracker.failedAttempts > 10) {
      console.warn(`[ANOMALY] High failure rate on sensitive route from ${key}`);
    }
  }
  
  res.on("finish", () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      tracker!.failedAttempts++;
    }
  });
  
  if (tracker.suspiciousPatterns.length > 100) {
    return res.status(429).json({
      error: "SUSPICIOUS_ACTIVITY",
      message: "Unusual activity detected. Please try again later.",
    });
  }
  
  next();
};

setInterval(() => {
  const now = Date.now();
  const expiryTime = 15 * 60 * 1000;
  
  const keysToDelete: string[] = [];
  anomalyStore.forEach((tracker, key) => {
    if (now - tracker.lastRequest > expiryTime) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => anomalyStore.delete(key));
}, 5 * 60 * 1000);
