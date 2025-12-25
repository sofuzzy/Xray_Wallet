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
- **Key Files**:
  - `server/services/tokenService.ts` - JWT token generation/validation
  - `server/middleware/zeroTrust.ts` - Auth middleware, rate limiting, anomaly detection
  - `client/src/lib/tokenManager.ts` - Frontend token management with auto-refresh

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