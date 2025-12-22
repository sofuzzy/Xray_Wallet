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
};

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
