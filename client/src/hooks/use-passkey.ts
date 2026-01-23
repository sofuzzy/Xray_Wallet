import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { tokenManager } from "@/lib/tokenManager";

interface AuthResult {
  success: boolean;
  userId?: string;
  accessToken?: string;
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
      const options = await apiRequest("POST", "/api/auth/passkey/register/options", { username });

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
      
      const result = await apiRequest("POST", "/api/auth/passkey/register/verify", {
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

      if (result.success && result.accessToken) {
        tokenManager.setTokens({
          accessToken: result.accessToken,
          accessTokenExpiresIn: result.accessTokenExpiresIn || 900,
        });
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
      const options = await apiRequest("POST", "/api/auth/passkey/login/options", {});

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
      
      const result = await apiRequest("POST", "/api/auth/passkey/login/verify", {
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

      if (result.success && result.accessToken) {
        tokenManager.setTokens({
          accessToken: result.accessToken,
          accessTokenExpiresIn: result.accessTokenExpiresIn || 900,
        });
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

  const logout = useCallback(async () => {
    await tokenManager.logout();
  }, []);

  const isAuthenticated = useCallback((): boolean => {
    return tokenManager.hasValidToken();
  }, []);

  return {
    register,
    login,
    logout,
    isLoading,
    error,
    isSupported: isSupported(),
    isAuthenticated,
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
