import { z } from 'zod';
import { insertWalletSchema, insertTransactionSchema, wallets, transactions, users } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  users: {
    me: {
      method: 'GET' as const,
      path: '/api/users/me',
      responses: {
        200: z.object({
          user: z.custom<typeof users.$inferSelect>(),
          wallet: z.custom<typeof wallets.$inferSelect>().nullable(),
        }),
        401: errorSchemas.notFound,
      },
    },
    lookup: {
      method: 'GET' as const,
      path: '/api/users/lookup/:username',
      responses: {
        200: z.object({
          username: z.string(),
          walletPublicKey: z.string().nullable(),
        }),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/users/me',
      input: z.object({
        username: z.string().min(3).max(30).optional(),
        firstName: z.string().max(50).optional(),
        lastName: z.string().max(50).optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  wallets: {
    create: {
      method: 'POST' as const,
      path: '/api/wallets',
      input: z.object({
        publicKey: z.string(),
      }),
      responses: {
        201: z.custom<typeof wallets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  transactions: {
    list: {
      method: 'GET' as const,
      path: '/api/transactions',
      responses: {
        200: z.array(z.custom<typeof transactions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/transactions',
      input: insertTransactionSchema,
      responses: {
        201: z.custom<typeof transactions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  swaps: {
    quote: {
      method: 'GET' as const,
      path: '/api/swaps/quote',
      responses: {
        200: z.object({
          outputAmount: z.number(),
          priceImpact: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
    execute: {
      method: 'POST' as const,
      path: '/api/swaps',
      input: z.object({
        inputMint: z.string(),
        outputMint: z.string(),
        amount: z.number(),
        slippage: z.number(),
      }),
      responses: {
        200: z.object({
          signature: z.string(),
          inputAmount: z.number(),
          outputAmount: z.number(),
          priceImpact: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
    tokens: {
      method: 'GET' as const,
      path: '/api/swaps/tokens',
      responses: {
        200: z.array(z.object({
          mint: z.string(),
          name: z.string(),
          symbol: z.string(),
          decimals: z.number(),
        })),
      },
    },
  },
};

export const UpdateUserRequestSchema = api.users.update.input;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
