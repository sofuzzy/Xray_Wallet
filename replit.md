# Xray - Solana Wallet Application

## Overview

Xray is a Solana devnet wallet application that allows users to manage SOL tokens with a modern, mobile-friendly interface. The app provides core wallet functionality including sending/receiving SOL, token swaps, and purchasing SOL via Stripe payments. It uses Replit Auth for user authentication and stores wallet data in a PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **Animations**: Framer Motion for smooth UI transitions
- **Build Tool**: Vite with hot module replacement

The frontend follows a component-based architecture with:
- Page components in `client/src/pages/`
- Reusable UI components in `client/src/components/`
- Custom hooks for wallet, auth, and data fetching in `client/src/hooks/`
- Solana blockchain utilities in `client/src/lib/solana.ts`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Replit Auth (OpenID Connect via Passport.js)
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

The server follows a modular pattern:
- Routes registered in `server/routes.ts`
- Database operations abstracted through storage classes in `server/storage.ts`
- Auth integration isolated in `server/replit_integrations/auth/`

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` and `shared/models/auth.ts`
- **Key Tables**:
  - `users` - User accounts from Replit Auth
  - `sessions` - Session storage for auth
  - `wallets` - Solana wallet public keys linked to users
  - `transactions` - Transaction history records
  - `tokenLaunches` - User-created SPL tokens with mint addresses and images
  - `autoTradeRules` - User-defined stop loss and take profit rules for tokens

### Wallet Implementation
- Keypairs are generated client-side using `@solana/web3.js`
- Private keys stored in browser localStorage (base58 encoded)
- Public keys synced to server database for user lookups
- Connects to Solana devnet for all operations
- **Multi-Wallet Support**: Create and manage multiple wallets
  - Wallet data stored in localStorage as JSON array
  - Each wallet has id, name, mnemonic, publicKey, and createdAt
  - WalletSwitcher component in header for quick switching
  - Create, rename, and delete wallets (minimum 1 required)
  - Legacy single-wallet storage auto-migrated to multi-wallet format
- **Seed Phrase Backup/Restore**: BIP39 12-word mnemonic with BIP44 derivation (m/44'/501'/0'/0')
  - Uses `bip39` and `ed25519-hd-key` packages for mnemonic-to-keypair derivation
  - Backup: View/copy seed phrase from Settings modal
  - Restore: Import wallet from existing seed phrase
  - Reset: Generate new wallet with fresh seed phrase
  - Page reload strategy ensures all components sync to restored wallet

### Staking Implementation
- Native Solana staking using `StakeProgram` from web3.js
- Stake accounts created client-side with wallet keypair as authority
- Supports delegation to top validators by activated stake
- Stake lifecycle: create → delegate → deactivate → withdraw
- Activation/deactivation takes 2-3 epochs (~4-6 days on devnet)

### Token Swap Implementation (Jupiter)
- **Jupiter API Integration**: Server-side quote and swap transaction generation
- **Token Discovery**: DexScreener trending tokens + fallback verified token list
- **Swap Flow**:
  1. Client fetches quote via `/api/swaps/quote`
  2. Client requests transaction via `/api/swaps/transaction`
  3. Client signs transaction locally with keypair
  4. Client sends signed tx via `/api/swaps/send` for broadcast
- **Priority Fee Tiers**: Low (5k), Medium (25k), High (100k) lamports
- **Paste-to-Add**: Paste any token mint address to discover and swap
- **Key Files**:
  - `server/services/jupiterSwap.ts` - Jupiter API client, token caching, swap execution
  - `client/src/components/SwapModal.tsx` - Swap UI with token selection and trending
- **Note**: Jupiter token.jup.ag DNS is blocked on Replit, falls back to hardcoded popular tokens; DexScreener API works for trending discovery
- **RPC**: Uses HELIUS_RPC_URL or QUICKNODE_RPC_URL env var, falls back to devnet

## External Dependencies

### Blockchain
- **Solana Web3.js**: Core Solana blockchain interaction
- **@solana/spl-token**: SPL token creation and management
- **bs58**: Base58 encoding for key serialization
- **Buffer polyfill**: CDN-loaded buffer for browser SPL token compatibility
- **Network**: Solana Devnet (clusterApiUrl)

### Payments
- **Stripe**: Payment processing for SOL purchases
- **stripe-replit-sync**: Stripe webhook and schema management
- Credentials fetched from Replit Connectors API

### Authentication & Security
- **Replit Auth**: OpenID Connect authentication
- **Passport.js**: Authentication middleware
- **express-session**: Session management (backward compatibility)
- **Zero-Trust Architecture**: JWT-based authentication with:
  - Short-lived access tokens (15 min expiry)
  - Refresh token rotation (7-day expiry, single-use)
  - Per-request token validation
  - Hybrid auth supporting both sessions and tokens
  - Rate limiting (global/strict/auth tiers)
  - Basic anomaly detection for suspicious patterns
- **Face ID / Biometric Unlock**: WebAuthn-based biometric authentication
  - Platform authenticator (Face ID, Touch ID) for quick unlock
  - Credential registration stores public key server-side
  - Authentication issues new JWT tokens upon successful biometric verification
  - Feature detection for unsupported browsers with graceful fallback
- **Key Files**:
  - `server/services/tokenService.ts` - JWT token generation/validation
  - `server/middleware/zeroTrust.ts` - Auth middleware, rate limiting, anomaly detection
  - `server/services/webauthnService.ts` - WebAuthn registration/authentication
  - `client/src/lib/tokenManager.ts` - Frontend token management with auto-refresh
  - `client/src/hooks/use-biometric.ts` - WebAuthn frontend integration

### UI Components
- **shadcn/ui**: Full component library (Radix UI primitives)
- **Lucide React**: Icon library
- **qrcode.react**: QR code generation for receive addresses

### Database
- **Drizzle ORM**: Type-safe database queries
- **pg**: PostgreSQL client
- **connect-pg-simple**: PostgreSQL session store

### Development
- **Vite**: Build tool and dev server
- **esbuild**: Production server bundling
- **TypeScript**: Type checking across all code