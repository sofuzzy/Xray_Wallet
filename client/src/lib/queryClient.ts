import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { tokenManager } from "./tokenManager";

class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
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
        message = data?.message || message;
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
    },
  },
});
