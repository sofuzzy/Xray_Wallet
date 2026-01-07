const TOKEN_STORAGE_KEY = "xray_access_token";
const REFRESH_TOKEN_KEY = "xray_refresh_token";
const TOKEN_EXPIRY_KEY = "xray_token_expiry";

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

class TokenManager {
  private refreshPromise: Promise<boolean> | null = null;

  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  getTokenExpiry(): number | null {
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return expiry ? parseInt(expiry) : null;
  }

  isTokenExpired(): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return true;
    return Date.now() > expiry - 60000;
  }

  setTokens(response: TokenResponse): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    const expiryTime = Date.now() + response.accessTokenExpiresIn * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  }

  clearTokens(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }

  async requestTokens(): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        return false;
      }

      const tokens: TokenResponse = await response.json();
      this.setTokens(tokens);
      return true;
    } catch {
      return false;
    }
  }

  async refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
          return await this.requestTokens();
        }

        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          this.clearTokens();
          return await this.requestTokens();
        }

        const tokens: TokenResponse = await response.json();
        this.setTokens(tokens);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!this.isTokenExpired()) {
      return this.getAccessToken();
    }

    const success = await this.refreshTokens();
    return success ? this.getAccessToken() : null;
  }

  async revokeTokens(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    
    if (refreshToken) {
      try {
        await fetch("/api/auth/revoke", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.getAccessToken()}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
    }
    
    this.clearTokens();
  }
}

export const tokenManager = new TokenManager();
