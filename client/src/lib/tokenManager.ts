interface TokenResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

type TokenChangeListener = (hasToken: boolean) => void;

class TokenManager {
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private listeners: Set<TokenChangeListener> = new Set();

  subscribe(listener: TokenChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const hasToken = !!this.accessToken;
    this.listeners.forEach(listener => listener(hasToken));
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() > this.tokenExpiry - 60000;
  }

  setTokens(response: TokenResponse): void {
    this.accessToken = response.accessToken;
    this.tokenExpiry = Date.now() + response.accessTokenExpiresIn * 1000;
    this.notifyListeners();
  }

  clearTokens(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.notifyListeners();
  }

  async initSession(): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const data: TokenResponse = await response.json();
      this.setTokens(data);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  async refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          this.clearTokens();
          return false;
        }

        const data: TokenResponse = await response.json();
        this.setTokens(data);
        return true;
      } catch {
        this.clearTokens();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      const success = await this.initSession();
      return success ? this.accessToken : null;
    }

    if (!this.isTokenExpired()) {
      return this.accessToken;
    }

    const success = await this.refreshTokens();
    return success ? this.accessToken : null;
  }

  async logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    
    this.clearTokens();
  }

  hasValidToken(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }
}

export const tokenManager = new TokenManager();
