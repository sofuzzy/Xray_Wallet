import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { tokenManager } from "@/lib/tokenManager";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await tokenManager.getValidAccessToken();
  if (token) {
    return { "Authorization": `Bearer ${token}` };
  }
  return {};
}

export function useTransactions(address?: string) {
  return useQuery({
    queryKey: [api.transactions.list.path, address],
    queryFn: async () => {
      if (!address) return [];
      const url = `${api.transactions.list.path}?address=${address}`;
      const authHeaders = await getAuthHeaders();
      const res = await fetch(url, { 
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return api.transactions.list.responses[200].parse(await res.json());
    },
    enabled: !!address,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { fromAddr: string; toAddr: string; amount: string; signature: string }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(api.transactions.create.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to record transaction");
      return api.transactions.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
    },
  });
}
