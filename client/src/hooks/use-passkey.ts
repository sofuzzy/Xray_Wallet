import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

interface PasskeyInfo {
  rpId: string;
  rpName: string;
  supported: boolean;
  nonCustodial: boolean;
  message: string;
}

interface AuthResult {
  success: boolean;
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  error?: string;
}

export function usePasskey() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useCallback((): boolean => {
    return !!(window.PublicKeyCredential && 
      typeof window.PublicKeyCredential === "function");
  }, []);

  const register = useCallback(async (username?: string): Promise<AuthResult> => {
    if (!isSupported()) {
      return { success: false, error: "Passkeys not supported on this device" };
    }

    setIsLoading(true);
    setError(null);

    try {
      const optionsRes = await apiRequest("POST", "/api/auth/passkey/register/options", { username });
      const options = await optionsRes.json();

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
          rp: options.rp,
          user: {
            id: Uint8Array.from(atob(options.user.id.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
          timeout: options.timeout,
          authenticatorSelection: options.authenticatorSelection as AuthenticatorSelectionCriteria,
          attestation: options.attestation as AttestationConveyancePreference,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error("No credential returned");
      }

      const attestationResponse = credential.response as AuthenticatorAttestationResponse;
      
      const verifyRes = await apiRequest("POST", "/api/auth/passkey/register/verify", {
        sessionId: options.sessionId,
        id: credential.id,
        rawId: arrayBufferToBase64Url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: arrayBufferToBase64Url(attestationResponse.clientDataJSON),
          attestationObject: arrayBufferToBase64Url(attestationResponse.attestationObject),
        },
        transports: attestationResponse.getTransports?.() || [],
      });

      const result = await verifyRes.json();

      if (result.success && result.accessToken) {
        localStorage.setItem("accessToken", result.accessToken);
        localStorage.setItem("refreshToken", result.refreshToken);
        localStorage.setItem("passkeyUserId", result.userId);
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Registration failed";
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  }, [isSupported]);

  const login = useCallback(async (): Promise<AuthResult> => {
    if (!isSupported()) {
      return { success: false, error: "Passkeys not supported on this device" };
    }

    setIsLoading(true);
    setError(null);

    try {
      const optionsRes = await apiRequest("POST", "/api/auth/passkey/login/options", {});
      const options = await optionsRes.json();

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification as UserVerificationRequirement,
          allowCredentials: options.allowCredentials || [],
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error("No credential returned");
      }

      const assertionResponse = credential.response as AuthenticatorAssertionResponse;
      
      const verifyRes = await apiRequest("POST", "/api/auth/passkey/login/verify", {
        sessionId: options.sessionId,
        id: credential.id,
        rawId: arrayBufferToBase64Url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: arrayBufferToBase64Url(assertionResponse.clientDataJSON),
          authenticatorData: arrayBufferToBase64Url(assertionResponse.authenticatorData),
          signature: arrayBufferToBase64Url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? arrayBufferToBase64Url(assertionResponse.userHandle) : undefined,
        },
      });

      const result = await verifyRes.json();

      if (result.success && result.accessToken) {
        localStorage.setItem("accessToken", result.accessToken);
        localStorage.setItem("refreshToken", result.refreshToken);
        localStorage.setItem("passkeyUserId", result.userId);
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  }, [isSupported]);

  const logout = useCallback(() => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("passkeyUserId");
  }, []);

  const getStoredUserId = useCallback((): string | null => {
    return localStorage.getItem("passkeyUserId");
  }, []);

  return {
    register,
    login,
    logout,
    isLoading,
    error,
    isSupported: isSupported(),
    getStoredUserId,
  };
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
