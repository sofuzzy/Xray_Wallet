import crypto from "crypto";
import { storage, type WebAuthnCredential } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";

const registrationChallenges = new Map<string, { challenge: string; expiresAt: number }>();
const authenticationChallenges = new Map<string, { challenge: string; expiresAt: number }>();
const passkeyRegistrationChallenges = new Map<string, { challenge: string; expiresAt: number; username?: string }>();
const passkeyLoginChallenges = new Map<string, { challenge: string; expiresAt: number }>();

const RP_NAME = "Xray Wallet";
const RP_ID = process.env.REPL_SLUG && process.env.REPL_OWNER 
  ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER.toLowerCase()}.repl.co` 
  : "localhost";
const ORIGIN = process.env.REPL_SLUG && process.env.REPL_OWNER
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER.toLowerCase()}.repl.co`
  : "http://localhost:5000";

export function generateRegistrationChallenge(userId: string): {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout: number;
  authenticatorSelection: {
    authenticatorAttachment: string;
    userVerification: string;
    residentKey: string;
  };
} {
  const challenge = crypto.randomBytes(32).toString("base64url");
  
  registrationChallenges.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return {
    challenge,
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: Buffer.from(userId).toString("base64url"),
      name: userId,
      displayName: "Xray User",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  };
}

export function generateAuthenticationChallenge(userId: string): {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: string;
} {
  const challenge = crypto.randomBytes(32).toString("base64url");
  
  authenticationChallenges.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return {
    challenge,
    rpId: RP_ID,
    timeout: 60000,
    userVerification: "required",
  };
}

export async function verifyRegistration(
  userId: string,
  credentialId: string,
  clientDataJSON: string,
  attestationObject: string,
  transports?: string[]
): Promise<boolean> {
  try {
    const storedChallenge = registrationChallenges.get(userId);
    if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
      console.error("No valid registration challenge found for user");
      return false;
    }
    
    const response = {
      id: credentialId,
      rawId: credentialId,
      response: {
        clientDataJSON,
        attestationObject,
        transports: transports as AuthenticatorTransportFuture[] | undefined,
      },
      type: "public-key" as const,
      clientExtensionResults: {},
      authenticatorAttachment: "platform" as const,
    };

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (error) {
      console.error("WebAuthn registration verification failed:", error);
      return false;
    }

    if (!verification.verified || !verification.registrationInfo) {
      console.error("Registration not verified");
      return false;
    }

    registrationChallenges.delete(userId);

    const { credential } = verification.registrationInfo;
    
    await storage.createWebAuthnCredential({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      deviceType: "platform",
      transports: transports?.join(",") || null,
    });

    return true;
  } catch (error) {
    console.error("WebAuthn registration verification failed:", error);
    return false;
  }
}

export async function verifyAuthentication(
  userId: string,
  credentialId: string,
  clientDataJSON: string,
  authenticatorData: string,
  signature: string
): Promise<boolean> {
  try {
    const storedChallenge = authenticationChallenges.get(userId);
    if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
      console.error("No valid authentication challenge found");
      return false;
    }

    const credential = await storage.getWebAuthnCredentialById(credentialId);
    if (!credential || credential.userId !== userId) {
      console.error("Credential not found or user mismatch");
      return false;
    }

    const response = {
      id: credentialId,
      rawId: credentialId,
      response: {
        clientDataJSON,
        authenticatorData,
        signature,
      },
      type: "public-key" as const,
      clientExtensionResults: {},
      authenticatorAttachment: "platform" as const,
    };

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, "base64"),
          counter: credential.counter,
          transports: credential.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
        },
      });
    } catch (error) {
      console.error("WebAuthn authentication verification failed:", error);
      return false;
    }

    if (!verification.verified) {
      console.error("Authentication not verified");
      return false;
    }

    authenticationChallenges.delete(userId);
    
    await storage.updateWebAuthnCounter(credentialId, verification.authenticationInfo.newCounter);
    
    return true;
  } catch (error) {
    console.error("WebAuthn authentication verification failed:", error);
    return false;
  }
}

export async function getCredentialsForUser(userId: string): Promise<WebAuthnCredential[]> {
  return storage.getWebAuthnCredentials(userId);
}

export async function deleteCredential(id: number, userId: string): Promise<boolean> {
  return storage.deleteWebAuthnCredential(id, userId);
}

export async function generatePasskeyRegistrationOptions(sessionId: string, username?: string): Promise<{
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout: number;
  authenticatorSelection: {
    authenticatorAttachment?: string;
    userVerification: string;
    residentKey: string;
    requireResidentKey: boolean;
  };
  attestation: string;
}> {
  const challenge = crypto.randomBytes(32).toString("base64url");
  const tempUserId = crypto.randomBytes(16).toString("base64url");
  
  passkeyRegistrationChallenges.set(sessionId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
    username,
  });

  return {
    challenge,
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: tempUserId,
      name: username || `user_${Date.now()}`,
      displayName: username || "Xray User",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 120000,
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "required",
      requireResidentKey: true,
    },
    attestation: "none",
  };
}

export async function verifyPasskeyRegistration(
  sessionId: string,
  credentialId: string,
  clientDataJSON: string,
  attestationObject: string,
  transports?: string[]
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const storedChallenge = passkeyRegistrationChallenges.get(sessionId);
    if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
      return { success: false, error: "Challenge expired or not found" };
    }
    
    const response = {
      id: credentialId,
      rawId: credentialId,
      response: {
        clientDataJSON,
        attestationObject,
        transports: transports as AuthenticatorTransportFuture[] | undefined,
      },
      type: "public-key" as const,
      clientExtensionResults: {},
      authenticatorAttachment: "cross-platform" as const,
    };

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (error) {
      console.error("Passkey registration verification failed:", error);
      return { success: false, error: "Credential verification failed" };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: "Registration not verified" };
    }

    passkeyRegistrationChallenges.delete(sessionId);

    const userId = crypto.randomUUID();
    const username = storedChallenge.username || `user_${Date.now()}`;
    const { credential } = verification.registrationInfo;

    await db.insert(users).values({
      id: userId,
      username,
      authMethod: "passkey",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.createWebAuthnCredential({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      deviceType: "cross-platform",
      transports: transports?.join(",") || null,
    });

    return { success: true, userId };
  } catch (error) {
    console.error("Passkey registration failed:", error);
    return { success: false, error: "Registration failed" };
  }
}

export function generatePasskeyLoginOptions(sessionId: string): {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: string;
  allowCredentials: never[];
} {
  const challenge = crypto.randomBytes(32).toString("base64url");
  
  passkeyLoginChallenges.set(sessionId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return {
    challenge,
    rpId: RP_ID,
    timeout: 120000,
    userVerification: "required",
    allowCredentials: [],
  };
}

export async function verifyPasskeyLogin(
  sessionId: string,
  credentialId: string,
  rawId: string,
  clientDataJSON: string,
  authenticatorData: string,
  signature: string,
  userHandle?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const storedChallenge = passkeyLoginChallenges.get(sessionId);
    if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
      return { success: false, error: "Challenge expired or not found" };
    }

    const credential = await storage.getWebAuthnCredentialById(credentialId);
    if (!credential) {
      return { success: false, error: "Credential not found" };
    }

    const response = {
      id: credentialId,
      rawId: rawId,
      response: {
        clientDataJSON,
        authenticatorData,
        signature,
        userHandle,
      },
      type: "public-key" as const,
      clientExtensionResults: {},
      authenticatorAttachment: "cross-platform" as const,
    };

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, "base64"),
          counter: credential.counter,
          transports: credential.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
        },
      });
    } catch (error) {
      console.error("Passkey login verification failed:", error);
      return { success: false, error: "Credential verification failed" };
    }

    if (!verification.verified) {
      return { success: false, error: "Authentication not verified" };
    }

    passkeyLoginChallenges.delete(sessionId);

    await storage.updateWebAuthnCounter(credentialId, verification.authenticationInfo.newCounter);

    await db.update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, credential.userId));

    return { success: true, userId: credential.userId };
  } catch (error) {
    console.error("Passkey login failed:", error);
    return { success: false, error: "Authentication failed" };
  }
}

export function getRpId(): string {
  return RP_ID;
}

setInterval(() => {
  const now = Date.now();
  Array.from(registrationChallenges.entries()).forEach(([key, value]) => {
    if (value.expiresAt < now) registrationChallenges.delete(key);
  });
  Array.from(authenticationChallenges.entries()).forEach(([key, value]) => {
    if (value.expiresAt < now) authenticationChallenges.delete(key);
  });
  Array.from(passkeyRegistrationChallenges.entries()).forEach(([key, value]) => {
    if (value.expiresAt < now) passkeyRegistrationChallenges.delete(key);
  });
  Array.from(passkeyLoginChallenges.entries()).forEach(([key, value]) => {
    if (value.expiresAt < now) passkeyLoginChallenges.delete(key);
  });
}, 60000);
