import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { validateStartupConfig } from "./config/env";
import { isApiError } from "./utils/apiError";
import { sendApiError } from "./utils/sendApiError";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('DATABASE_URL not set - Stripe integration disabled');
    return;
  }

  try {
    log('Initializing Stripe schema...', 'stripe');
    await runMigrations({ 
      databaseUrl
    });
    log('Stripe schema ready', 'stripe');

    const stripeSync = await getStripeSync();

    // Set up managed webhook only if domains are available
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      try {
        log('Setting up managed webhook...', 'stripe');
        const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`);
        if (result?.webhook?.url) {
          log(`Webhook configured: ${result.webhook.url}`, 'stripe');
        } else {
          log('Webhook setup returned no URL - continuing without webhook', 'stripe');
        }
      } catch (webhookError: any) {
        log(`Webhook setup failed: ${webhookError.message} - continuing without webhook`, 'stripe');
      }
    } else {
      log('REPLIT_DOMAINS not set - skipping webhook setup', 'stripe');
    }

    log('Syncing Stripe data...', 'stripe');
    stripeSync.syncBackfill()
      .then(() => {
        log('Stripe data synced', 'stripe');
      })
      .catch((err: any) => {
        console.error('Error syncing Stripe data:', err);
      });
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Register Stripe webhook route BEFORE express.json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return sendApiError(res, 400, "STRIPE_WEBHOOK_MISSING_SIGNATURE", "Missing stripe-signature header");
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return sendApiError(res, 500, "STRIPE_WEBHOOK_BODY_INVALID", "Webhook body must be a raw Buffer");
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      return sendApiError(res, 400, "STRIPE_WEBHOOK_PROCESSING_ERROR", "Webhook processing error");
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security & traffic protection
app.use(
  helmet({
    // Vite + embedded assets can conflict with strict CSP; keep CSP off unless you configure it intentionally.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const allowedOrigins = (process.env.XRAY_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / server-to-server / tools without Origin header
      if (!origin) return cb(null, true);
      if (process.env.NODE_ENV !== "production") return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, false);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  }),
);

// Apply a general API rate limiter. Add tighter limiters per-route in routes.ts for expensive endpoints.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240, // 240 req/min per IP (tune as needed)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  validateStartupConfig();
  
  await initStripe();
  
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const fallbackStatus = err?.status || err?.statusCode || 500;
    const status = Number.isFinite(fallbackStatus) ? fallbackStatus : 500;

    if (isApiError(err)) {
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }

    // Don't leak internals; keep details minimal.
    const message = status >= 500 ? "Internal Server Error" : (err?.message ?? "Request failed");
    return res.status(status).json({
      error: {
        code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
        message,
      },
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
