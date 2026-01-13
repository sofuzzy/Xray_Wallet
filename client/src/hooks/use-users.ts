import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, UpdateUserRequest } from "@shared/routes";

export function useCurrentUser() {
  return useQuery({
    queryKey: [api.users.me.path],
    queryFn: async () => {
      const res = await fetch(api.users.me.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return api.users.me.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdateUserRequest) => {
      const res = await fetch(api.users.update.path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update user");
      return api.users.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.users.me.path] });
    },
  });
}

export function useLookupUser(username: string) {
  return useQuery({
    queryKey: [api.users.lookup.path, username],
    queryFn: async () => {
      if (!username) return null;
      const url = buildUrl(api.users.lookup.path, { username });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to lookup user");
      return api.users.lookup.responses[200].parse(await res.json());
    },
    enabled: !!username && username.length > 2,
    retry: false,
  });
}
