import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tokenManager } from "@/lib/tokenManager";

export interface RegisteredWallet {
  id: number;
  userId: string;
  walletAddress: string;
  label: string;
  source: "created" | "imported" | "restored";
  createdAt: string;
  lastSeenAt: string;
}

interface RegisterWalletParams {
  walletAddress: string;
  label: string;
  source: "created" | "imported" | "restored";
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await tokenManager.getValidAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers, credentials: "include" });
}

export function useWalletRegistry(isAuthenticated: boolean) {
  const queryClient = useQueryClient();

  const { data: registeredWallets = [], isLoading } = useQuery<RegisteredWallet[]>({
    queryKey: ["/api/wallet-registry"],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/wallet-registry");
      if (!response.ok) {
        if (response.status === 401) return [];
        throw new Error("Failed to fetch registered wallets");
      }
      return response.json();
    },
    enabled: isAuthenticated,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const registerMutation = useMutation({
    mutationFn: async (params: RegisterWalletParams) => {
      const response = await fetchWithAuth("/api/wallet-registry", {
        method: "POST",
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error("Failed to register wallet");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-registry"] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (walletAddress: string) => {
      const response = await fetchWithAuth(`/api/wallet-registry/${walletAddress}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to unlink wallet");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-registry"] });
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: async ({ address, label }: { address: string; label: string }) => {
      const response = await fetchWithAuth(`/api/wallet-registry/${address}/label`, {
        method: "PUT",
        body: JSON.stringify({ label }),
      });
      if (!response.ok) {
        throw new Error("Failed to update wallet label");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-registry"] });
    },
  });

  const registerWallet = async (params: RegisterWalletParams) => {
    if (!isAuthenticated) return null;
    try {
      return await registerMutation.mutateAsync(params);
    } catch (error) {
      console.error("Failed to register wallet:", error);
      return null;
    }
  };

  const unlinkWallet = async (walletAddress: string) => {
    if (!isAuthenticated) return false;
    try {
      await unlinkMutation.mutateAsync(walletAddress);
      return true;
    } catch (error) {
      console.error("Failed to unlink wallet:", error);
      return false;
    }
  };

  const updateWalletLabel = async (address: string, label: string) => {
    if (!isAuthenticated) return false;
    try {
      await updateLabelMutation.mutateAsync({ address, label });
      return true;
    } catch (error) {
      console.error("Failed to update wallet label:", error);
      return false;
    }
  };

  const isWalletOnDevice = (walletAddress: string, localWallets: { publicKey: string }[]) => {
    return localWallets.some(w => w.publicKey === walletAddress);
  };

  return {
    registeredWallets,
    isLoading,
    registerWallet,
    unlinkWallet,
    updateWalletLabel,
    isWalletOnDevice,
    isRegistering: registerMutation.isPending,
    isUnlinking: unlinkMutation.isPending,
  };
}
