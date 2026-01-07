import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../db";
import { eq, and, gt, lt } from "drizzle-orm";
import { refreshTokens } from "@shared/schema";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for JWT signing");
}

const JWT_SECRET: string = process.env.SESSION_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface TokenPayload {
  sub: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  type: "access" | "refresh";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export async function generateTokenPair(
  userId: string,
  userInfo: { email?: string; firstName?: string; lastName?: string },
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const accessPayload: TokenPayload = {
    sub: userId,
    email: userInfo.email,
    firstName: userInfo.firstName,
    lastName: userInfo.lastName,
    type: "access",
  };

  const accessToken = jwt.sign(accessPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshTokenValue = generateRandomToken();
  const tokenHash = hashToken(refreshTokenValue);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
    expiresAt,
  });

  const refreshPayload: TokenPayload = {
    sub: userId,
    type: "refresh",
  };

  const refreshToken = jwt.sign(
    { ...refreshPayload, jti: refreshTokenValue },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRY_SECONDS,
  };
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const payload = decoded as unknown as TokenPayload;
    if (payload.type !== "access") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair | null> {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const payload = decoded as unknown as TokenPayload & { jti: string };
    
    if (payload.type !== "refresh" || !payload.jti) {
      return null;
    }

    const tokenHash = hashToken(payload.jti);
    
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.userId, payload.sub),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!storedToken || storedToken.revokedAt) {
      return null;
    }

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, storedToken.id));

    const { authStorage } = await import("../replit_integrations/auth/storage");
    const user = await authStorage.getUser(payload.sub);
    
    return generateTokenPair(
      payload.sub,
      {
        email: user?.email || undefined,
        firstName: user?.firstName || undefined,
        lastName: user?.lastName || undefined,
      },
      deviceInfo,
      ipAddress
    );
  } catch {
    return null;
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        gt(refreshTokens.expiresAt, new Date())
      )
    );
}

export async function revokeToken(refreshToken: string): Promise<boolean> {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const payload = decoded as unknown as TokenPayload & { jti: string };
    
    if (payload.type !== "refresh" || !payload.jti) {
      return false;
    }

    const tokenHash = hashToken(payload.jti);
    
    const result = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    return true;
  } catch {
    return false;
  }
}

export async function cleanupExpiredTokens(): Promise<void> {
  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
}
