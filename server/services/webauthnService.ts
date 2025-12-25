import crypto from "crypto";
import { storage, type WebAuthnCredential } from "../storage";

const registrationChallenges = new Map<string, { challenge: string; expiresAt: number }>();
const authenticationChallenges = new Map<string, { challenge: string; expiresAt: number }>();

const RP_NAME = "Xray Wallet";
const RP_ID = process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co` : "localhost";

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
    
    const clientData = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString());
    
    if (clientData.type !== "webauthn.create") {
      console.error("Invalid clientData type:", clientData.type);
      return false;
    }

    if (clientData.challenge !== storedChallenge.challenge) {
      console.error("Challenge mismatch");
      return false;
    }

    registrationChallenges.delete(userId);

    await storage.createWebAuthnCredential({
      userId,
      credentialId,
      publicKey: attestationObject,
      counter: 0,
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

    const clientData = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString());
    
    if (clientData.type !== "webauthn.get") {
      console.error("Invalid clientData type:", clientData.type);
      return false;
    }

    if (clientData.challenge !== storedChallenge.challenge) {
      console.error("Authentication challenge mismatch");
      return false;
    }

    authenticationChallenges.delete(userId);

    const credential = await storage.getWebAuthnCredentialById(credentialId);
    if (!credential || credential.userId !== userId) {
      console.error("Credential not found or user mismatch");
      return false;
    }

    const authDataBuffer = Buffer.from(authenticatorData, "base64url");
    let signCount = 0;
    if (authDataBuffer.length >= 37) {
      signCount = authDataBuffer.readUInt32BE(33);
    }
    
    if (signCount > 0 && signCount <= credential.counter) {
      console.warn("Potential credential cloning detected - counter not incrementing");
      return false;
    }

    await storage.updateWebAuthnCounter(credentialId, signCount);
    
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

setInterval(() => {
  const now = Date.now();
  const regEntries = Array.from(registrationChallenges.entries());
  for (const [key, value] of regEntries) {
    if (value.expiresAt < now) {
      registrationChallenges.delete(key);
    }
  }
  const authEntries = Array.from(authenticationChallenges.entries());
  for (const [key, value] of authEntries) {
    if (value.expiresAt < now) {
      authenticationChallenges.delete(key);
    }
  }
}, 60000);
