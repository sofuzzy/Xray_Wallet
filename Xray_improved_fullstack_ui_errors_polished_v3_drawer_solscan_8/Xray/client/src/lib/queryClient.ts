import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { tokenManager } from "./tokenManager";

class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.code = data?.error?.code;
    this.details = data?.error?.details;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let data: any = undefined;
    let message = res.statusText || "Request failed";
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        data = await res.json();
        // Prefer our unified API error shape: { error: { code, message, details } }
        message = data?.error?.message || data?.message || message;
      } else {
        const text = (await res.text()) || message;
        message = text;
        data = { message: text };
      }
    } catch {
      // ignore parsing errors
    }
    throw new ApiError(message, res.status, data);
  }
}

function toToastTitle(err: ApiError) {
  // Prefer semantic codes (more helpful than HTTP status)
  const code = (err.code || "").toUpperCase();
  const codeTitleMap: Record<string, string> = {
    VALIDATION_ERROR: "Check your info",
    INVALID_INPUT: "Check your info",
    INVALID_AMOUNT: "Check the amount",
    RISK_ACK_REQUIRED: "Needs confirmation",
    RISK_BLOCKED: "Swap blocked",
    FORBIDDEN: "Blocked",
    UNAUTHORIZED: "Session expired",
    RATE_LIMITED: "Slow down",
  };
  if (code && codeTitleMap[code]) return codeTitleMap[code];

  const status = err.status;
  if (status === 401) return "Session expired";
  if (status === 428) return "Needs confirmation";
  if (status === 403) return "Blocked";
  if (status === 404) return "Not found";
  if (status === 408) return "Request timed out";
  if (status === 422) return "Invalid input";
  if (status === 429) return "Slow down";
  if (status >= 500) return "Server error";
  return "Something went wrong";
}

function shouldToastError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  // Avoid spamming users for background polling / auth edge cases
  if (err.status === 401) return true;
  return true;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await tokenManager.getValidAccessToken();
  if (token) {
    return { "Authorization": `Bearer ${token}` };
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  let fullUrl = url;
  let body: string | undefined;

  if (method === "GET" && data) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      params.append(key, String(value));
    }
    fullUrl = url + "?" + params.toString();
  } else if (method !== "GET" && data) {
    body = JSON.stringify(data);
  }

  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    ...(body ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(fullUrl, {
    method,
    headers,
    body,
    credentials: "include",
  });

  if (res.status === 401) {
    const refreshed = await tokenManager.refreshTokens();
    if (refreshed) {
      const retryAuthHeaders = await getAuthHeaders();
      const retryHeaders: Record<string, string> = {
        ...retryAuthHeaders,
        ...(body ? { "Content-Type": "application/json" } : {}),
      };
      const retryRes = await fetch(fullUrl, {
        method,
        headers: retryHeaders,
        body,
        credentials: "include",
      });
      await throwIfResNotOk(retryRes);
      if (retryRes.status === 204 || retryRes.headers.get("content-length") === "0") {
        return null;
      }
      return await retryRes.json();
    }
  }

  await throwIfResNotOk(res);
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders,
    });

    if (res.status === 401) {
      const refreshed = await tokenManager.refreshTokens();
      if (refreshed) {
        const retryHeaders = await getAuthHeaders();
        const retryRes = await fetch(queryKey.join("/") as string, {
          credentials: "include",
          headers: retryHeaders,
        });
        
        if (unauthorizedBehavior === "returnNull" && retryRes.status === 401) {
          return null;
        }
        
        await throwIfResNotOk(retryRes);
        return await retryRes.json();
      }
      
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
      onError: (err) => {
        if (!shouldToastError(err)) return;
        const apiErr = err as ApiError;
        toast({
          title: toToastTitle(apiErr),
          description: apiErr.message || "Request failed",
          variant: "destructive",
        });
      },
    },
  },
});

export type { ApiError };
