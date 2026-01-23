import type { Express } from "express";
import { authStorage } from "./storage";
import { hybridAuth } from "../../middleware/zeroTrust";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user (supports both OAuth sessions and JWT tokens)
  app.get("/api/auth/user", hybridAuth, async (req: any, res) => {
    try {
      // First try JWT token user (from passkey auth)
      if (req.tokenUser?.sub) {
        const user = await authStorage.getUser(req.tokenUser.sub);
        if (user) {
          return res.json(user);
        }
      }
      
      // Fall back to session user (from Replit OAuth)
      if (req.user?.claims?.sub) {
        const user = await authStorage.getUser(req.user.claims.sub);
        return res.json(user);
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
