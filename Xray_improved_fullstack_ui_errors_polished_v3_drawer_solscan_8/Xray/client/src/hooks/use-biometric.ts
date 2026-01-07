import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { tokenManager } from "@/lib/tokenManager";

interface BiometricCredential {
  id: number;
  deviceType: string | null;
  createdAt: string;
}

export function useBiometric() {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [credentials, setCredentials] = useState<BiometricCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSupport = async () => {
      if (!window.PublicKeyCredential) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setIsSupported(available);
      } catch {
        setIsSupported(false);
      }
      setIsLoading(false);
    };

    checkSupport();
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const creds = await apiRequest("GET", "/api/webauthn/credentials");
      setCredentials(creds || []);
      setIsEnabled((creds || []).length > 0);
    } catch {
      setCredentials([]);
      setIsEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (isSupported) {
      fetchCredentials();
    }
  }, [isSupported, fetchCredentials]);

  const register = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const options = await apiRequest("POST", "/api/webauthn/register/options");

      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        rp: options.rp,
        user: {
          id: Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
        timeout: options.timeout,
        authenticatorSelection: {
          authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment,
          userVerification: options.authenticatorSelection.userVerification as UserVerificationRequirement,
          residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement,
        },
        attestation: "none",
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyOptions,
      }) as PublicKeyCredential | null;

      if (!credential) {
        setError("No credential returned");
        return false;
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      
      const result = await apiRequest("POST", "/api/webauthn/register/verify", {
        id: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          attestationObject: bufferToBase64url(response.attestationObject),
        },
        transports: response.getTransports?.() || [],
      });

      if (result.success) {
        await fetchCredentials();
        return true;
      }

      setError("Registration failed");
      return false;
    } catch (e: any) {
      setError(e.message || "Failed to register biometric");
      return false;
    }
  }, [fetchCredentials]);

  const authenticate = useCallback(async (userId: string): Promise<boolean> => {
    setError(null);
    try {
      const options = await apiRequest("POST", "/api/webauthn/authenticate/options");

      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification as UserVerificationRequirement,
        allowCredentials: options.allowCredentials?.map((c: any) => ({
          type: c.type,
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
          transports: c.transports,
        })),
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyOptions,
      }) as PublicKeyCredential | null;

      if (!credential) {
        setError("No credential returned");
        return false;
      }

      const response = credential.response as AuthenticatorAssertionResponse;

      const result = await apiRequest("POST", "/api/webauthn/authenticate/verify", {
        userId,
        id: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          authenticatorData: bufferToBase64url(response.authenticatorData),
          signature: bufferToBase64url(response.signature),
        },
      });

      if (result.success && result.accessToken) {
        tokenManager.setTokens(result);
        return true;
      }

      setError("Authentication failed");
      return false;
    } catch (e: any) {
      setError(e.message || "Biometric authentication failed");
      return false;
    }
  }, []);

  const remove = useCallback(async (credentialId: number): Promise<boolean> => {
    try {
      await apiRequest("DELETE", `/api/webauthn/credentials/${credentialId}`);
      await fetchCredentials();
      return true;
    } catch {
      return false;
    }
  }, [fetchCredentials]);

  return {
    isSupported,
    isEnabled,
    credentials,
    isLoading,
    error,
    register,
    authenticate,
    remove,
    refresh: fetchCredentials,
  };
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
