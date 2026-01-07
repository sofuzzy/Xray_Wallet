import type { Express, Request, Response } from "express";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { isAuthenticated as authMiddleware } from "./replit_integrations/auth";
import { sendApiError } from "./utils/sendApiError";

export function registerStripeRoutes(app: Express) {
  // Get Stripe publishable key for frontend
  app.get('/api/stripe/publishable-key', async (req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error('Failed to get publishable key:', error);
      return sendApiError(res, 500, "STRIPE_CONFIG_ERROR", "Failed to get Stripe configuration");
    }
  });

  // Create payment intent for buying SOL
  app.post('/api/stripe/create-payment-intent', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      
      if (!amount || amount < 100) {
        return sendApiError(res, 400, "INVALID_AMOUNT", "Minimum amount is $1.00");
      }

      const stripe = await getUncachableStripeClient();
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId: (req.user as any)?.claims?.sub || 'unknown',
          purpose: 'buy_sol',
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      console.error('Payment intent creation failed:', error);
      return sendApiError(res, 500, "STRIPE_PAYMENT_INTENT_ERROR", error.message || "Failed to create payment");
    }
  });

  // Get SOL price (mock for demo, in production would use real price feed)
  app.get('/api/stripe/sol-price', async (req: Request, res: Response) => {
    // Mock SOL price - in production, fetch from CoinGecko or similar
    const solPrice = 175.50; // USD per SOL
    res.json({ price: solPrice, currency: 'USD' });
  });
}
