# Xray - Non-Custodial Solana Wallet

## Overview

Xray is a non-custodial Solana mainnet wallet application with a retro-futuristic terminal-inspired interface. The app provides wallet functionality including sending/receiving SOL, token swaps via Jupiter aggregator, token launching, staking, and portfolio management. The critical design principle is that the server never stores or handles private keys - all cryptographic signing happens client-side only.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state caching, React hooks for local state
- **Styling**: Tailwind CSS with shadcn/ui components (New York style variant)
- **Animations**: Framer Motion for UI transitions
- **Blockchain**: @solana/web3.js for client-side Solana interactions

Key directories:
- `client/src/pages/` - Page components (Home, TokenExplorer)
- `client/src/components/` - Reusable UI components (modals, buttons, forms)
- `client/src/hooks/` - Custom hooks for wallet, auth, biometrics, uploads
- `client/src/lib/solana.ts` - Client-side Solana utilities (signing happens here, never server-side)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Dual-mode - Replit Auth (OpenID Connect) and WebAuthn/Passkeys via @simplewebauthn/server
- **Session**: JWT tokens (httpOnly, secure, sameSite) with refresh token rotation

Key directories:
- `server/routes.ts` - API route registration
- `server/services/` - Business logic (Jupiter swaps, RPC handling, WebAuthn, token risk assessment)
- `server/middleware/` - Zero-trust security middleware (rate limiting, anomaly detection)
- `server/config/env.ts` - Centralized environment configuration

### Non-Custodial Architecture (Critical)
The server is explicitly designed to NEVER be custodial:
- Private keys are generated and stored client-side only (browser secure storage/IndexedDB)
- Server stores only WebAuthn public credentials (credentialId, publicKey, counter)
- No server endpoint accepts private keys, seed phrases, or pre-signed transactions
- Transaction signing happens in the browser using the local keypair
- Future-ready for MPC providers (Web3Auth/Privy/Dynamic) as an alternative to on-device keys

### RPC Service
- Centralized RPC configuration with prioritized endpoint list
- Automatic failover with exponential backoff
- Support for user-supplied RPC via `X-User-RPC` header
- Fallback to public Solana mainnet if no RPC configured

### Security Hardening
- WebAuthn origin/RP ID validation with strict production guards
- Challenge nonces with 90-second TTL to prevent replay attacks
- Rate limiting per endpoint category (auth, quotes, swaps, token lookups)
- Token metadata validation (decimals 0-18, ASCII symbols, SPL program ownership verification)
- Risk assessment engine for tokens with configurable shield policies

### Data Storage
Database tables in `shared/schema.ts`:
- `users` - User accounts (supports both Replit Auth and passkey-only)
- `sessions` - Auth session storage
- `wallets` - Public keys linked to users (private keys never stored)
- `transactions` - Transaction history
- `webauthnCredentials` - WebAuthn public credential data only
- `tokenLaunches` - User-created SPL tokens
- `autoTradeRules` - Stop-loss/take-profit rules
- `watchlistTokens` - Token watchlist

## External Dependencies

### Blockchain Services
- **Solana RPC**: Configurable via `SOLANA_RPCS`, `HELIUS_RPC_URL`, `QUICKNODE_RPC_URL` environment variables
- **Jupiter Aggregator**: Token swap quotes and transaction building via `lite-api.jup.ag`
- **DexScreener API**: Token metadata, price history, and liquidity data

### Authentication
- **Replit Auth**: OpenID Connect via Passport.js for Replit-hosted deployments
- **SimpleWebAuthn**: Passkey registration and authentication (@simplewebauthn/server)

### Payment Processing
- **Stripe**: Payment intents for fiat-to-SOL purchases (via Replit connector)

### Database
- **PostgreSQL**: Primary data store via Drizzle ORM
- Connection string via `DATABASE_URL` environment variable

### Object Storage
- **Replit Object Storage / Google Cloud Storage**: For token image uploads

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - JWT signing secret
- `SOLANA_RPCS` or `HELIUS_RPC_URL` - Solana RPC endpoints
- `XRAY_WEBAUTHN_ORIGINS` - Allowed WebAuthn origins (required in production)