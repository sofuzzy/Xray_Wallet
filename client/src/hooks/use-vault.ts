import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { encryptWalletData, decryptWalletData, type EncryptedVaultData } from "@/lib/vaultCrypto";
import { useToast } from "@/hooks/use-toast";

interface VaultStatus {
  hasVault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface VaultData extends EncryptedVaultData {
  createdAt: string;
  updatedAt: string;
}

interface VaultAudit {
  id: number;
  userId: string;
  action: "created" | "restored" | "deleted";
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function useVault() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusQuery = useQuery<VaultStatus>({
    queryKey: ["/api/vault/status"],
    staleTime: 30000,
    retry: false,
  });

  const auditsQuery = useQuery<VaultAudit[]>({
    queryKey: ["/api/vault/audits"],
    staleTime: 60000,
    retry: false,
  });

  const backupMutation = useMutation({
    mutationFn: async ({ walletData, passphrase }: { walletData: string; passphrase: string }) => {
      const encrypted = await encryptWalletData(walletData, passphrase);
      
      return apiRequest("PUT", "/api/vault", encrypted);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/audits"] });
      toast({
        title: "Backup Complete",
        description: "Your wallet has been encrypted and backed up to the cloud.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Backup Failed",
        description: error.message || "Failed to backup wallet",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ passphrase }: { passphrase: string }): Promise<string> => {
      const response = await fetch("/api/vault", {
        credentials: "include",
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("No backup found for this account");
        }
        throw new Error("Failed to fetch vault data");
      }
      
      const vaultData: VaultData = await response.json();
      
      try {
        const decrypted = await decryptWalletData(vaultData, passphrase);
        return decrypted;
      } catch (error: any) {
        if (error.message === "DECRYPTION_FAILED") {
          throw new Error("Incorrect passphrase. Please try again.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault/audits"] });
      toast({
        title: "Restore Complete",
        description: "Your wallet has been restored from backup.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore wallet",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/vault");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/audits"] });
      toast({
        title: "Backup Deleted",
        description: "Your cloud backup has been permanently deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete backup",
        variant: "destructive",
      });
    },
  });

  return {
    hasVault: statusQuery.data?.hasVault ?? false,
    vaultCreatedAt: statusQuery.data?.createdAt,
    vaultUpdatedAt: statusQuery.data?.updatedAt,
    isStatusLoading: statusQuery.isLoading,
    audits: auditsQuery.data ?? [],
    isAuditsLoading: auditsQuery.isLoading,
    backup: backupMutation.mutateAsync,
    isBackingUp: backupMutation.isPending,
    restore: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    deleteVault: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    refetchStatus: statusQuery.refetch,
  };
}
