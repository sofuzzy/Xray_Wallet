import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { tokenManager } from "@/lib/tokenManager";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = await response.json();
  
  if (user && !tokenManager.getAccessToken()) {
    await tokenManager.requestTokens();
  }
  
  return user;
}

async function logout(): Promise<void> {
  // Check if user is using passkey auth before clearing tokens
  const isPasskeyUser = localStorage.getItem("passkeyUserId") !== null;
  
  // Clear JWT tokens for passkey auth
  await tokenManager.revokeTokens();
  
  // Clear passkey-specific localStorage items
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("passkeyUserId");
  
  // For passkey users, just reload the page
  if (isPasskeyUser) {
    window.location.reload();
    return;
  }
  
  // For Replit OAuth users, redirect to OAuth logout
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
