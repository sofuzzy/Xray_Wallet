# Xray - Solana Wallet Application

## Overview

Xray is a Solana mainnet wallet application that allows users to manage SOL tokens with a clean, modern futuristic interface. The app provides core wallet functionality including sending/receiving SOL, token swaps, and token launchpad. It supports both Passkey (WebAuthn) and Replit Auth for user authentication and stores wallet data in a PostgreSQL database. The wallet is completely non-custodial - private keys never touch the server.

### Design Philosophy
The UI uses a clean, edgy futuristic aesthetic:
- **Color Palette**: Deep slate backgrounds with teal/emerald primary (165 85% 45%) and purple accent (270 80% 65%)
- **Typography**: Inter for body text, JetBrains Mono for monospace data
- **Effects**: Subtle glassmorphism with backdrop-blur, modern gradients, minimal shadows
- **Components**: shadcn/ui Button components with proper variants (no custom hover states)
- **Cards**: Modern gradient backgrounds with subtle mesh overlays and gradient borders

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
  - `watchlistTokens` - User token watchlist for tracking tokens of interest

### Wallet Implementation
- Keypairs are generated client-side using `@solana/web3.js`
- Public keys synced to server database for user lookups
- Connects to Solana mainnet-beta for all operations
- **Encrypted Local Vault**: All wallet data encrypted at rest with user PIN
  - AES-256-GCM encryption with PBKDF2 key derivation (100k iterations)
  - Stored as `xray_encrypted_vault` in localStorage
  - Decrypted data kept only in React state (memory) while unlocked - never persisted
  - VaultUnlockModal prompts for PIN on app startup or page refresh
  - Lock button in header clears memory and requires re-authentication
  - Legacy plaintext wallets auto-migrated to encrypted vault on first use
  - Key files: `client/src/lib/localVault.ts`, `client/src/lib/vaultCrypto.ts`, `client/src/contexts/VaultContext.tsx`
- **Multi-Wallet Support**: Create and manage multiple wallets
  - Wallet data stored encrypted in vault as JSON array
  - Each wallet has id, name, mnemonic, publicKey, and createdAt
  - WalletSwitcher component in header for quick switching
  - Create, rename, and delete wallets (minimum 1 required)
- **Multi-Device Wallet Sync**: Cloud registry for wallet visibility across devices
  - `userWallets` table stores public addresses (never private keys) linked to user accounts
  - API endpoints: `/api/wallet-registry` (GET/POST/DELETE/PUT)
  - Frontend hook: `use-wallet-registry.ts` syncs local wallets on login
  - WalletSwitcher shows cloud sync status and "Not on device" badges for remote-only wallets
  - Activity logging tracks wallet_registered and wallet_unlinked events
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
- Activation/deactivation takes 2-3 epochs (~4-6 days on mainnet)

### Token Swap Implementation (Jupiter)
- **Jupiter API Integration**: Server-side quote and swap transaction generation (lite-api.jup.ag for swaps only)
- **Token Discovery**: All token data (names, symbols, logos, prices, market caps) fetched from DexScreener API
- **Swap Flow**:
  1. Client fetches quote via `/api/swaps/quote`
  2. Client requests transaction via `/api/swaps/transaction`
  3. Client signs transaction locally with keypair
  4. Client sends signed tx via `/api/swaps/send` for broadcast
- **Priority Fee Tiers**: Low (5k), Medium (25k), High (100k) lamports
- **Paste-to-Add**: Paste any token mint address to discover and swap
- **Direct DEX Routing**: Option to route swaps through a single DEX for faster execution
  - Auto (default): Jupiter aggregates across all DEXes for best price
  - Orca: Routes through Orca V1, V2, and Whirlpool pools only
  - Raydium: Routes through Raydium, CLMM, and CP pools only
  - Uses `dex` query parameter on `/api/swaps/quote` endpoint
  - AMM labels from Jupiter's program-id-to-label endpoint
- **Key Files**:
  - `server/services/jupiterSwap.ts` - DexScreener token discovery, Jupiter swap execution
  - `server/services/priceHistory.ts` - DexScreener token metadata, price history with caching
  - `client/src/components/SwapModal.tsx` - Swap UI with token selection and trending
  - `client/src/components/TokenChart.tsx` - Price chart with skeleton loading
- **Data Source**: DexScreener API (https://api.dexscreener.com) for all token metadata, prices, and trending data
- **Chart Caching**: Stale-while-revalidate pattern for price history
  - 10-minute TTL with 60-second stale threshold
  - Returns stale data immediately while refreshing in background
  - Provider fallback: DexScreener (primary) → Birdeye (requires BIRDEYE_API_KEY)
  - 3-second timeout per provider with AbortController
  - Latency logging for monitoring provider health
- **RPC Manager**: Automatic fallback across multiple RPC endpoints with health tracking
  - Prioritized endpoints: HELIUS_RPC_URL, QUICKNODE_RPC_URL (if configured), then public RPCs
  - Public fallback endpoints: Solana Mainnet, Ankr, Public-RPC.com
  - Latency-based routing: Prefers fastest healthy endpoint
  - Automatic retry on timeout/rate-limit with exponential backoff
  - Health status tracking per endpoint with cooldown periods
- **Helius Post-Trade Rebates**: Server-side rebate support for Helius RPC
  - Feature flag: `ENABLE_HELIUS_REBATES=true` to enable
  - Rebate address: `HELIUS_REBATE_ADDRESS` (Solana address to receive rebates)
  - Only applies to sendTransaction/sendRawTransaction operations
  - Appends `rebate-address` query param to Helius RPC URL
  - Non-custodial: Rebate address never exposed to frontend
  - Fallback to regular connection if rebate connection fails
  - Key files: `server/config/env.ts`, `server/services/rpcService.ts`
- **Transaction Integrity Verification**: SHA256 message hash checks to prevent signing errors
  - Detects post-signing message mutations that would cause "INVALID signature" errors
  - Client-side utility: `client/src/lib/transactionIntegrity.ts`
  - SwapModal and SendModal verify integrity before broadcasting
  - Structured error codes: BLOCKHASH_EXPIRED, INVALID_SIGNATURE, TX_MUTATED_AFTER_SIGN, INSUFFICIENT_FUNDS, RATE_LIMITED, SLIPPAGE_EXCEEDED
  - Server returns parseable error codes for user-friendly error messages
  - Base64 encoding consistency enforced end-to-end (no mutations after signing)
- **Helius Sender Integration**: Ultra-low latency transaction broadcasting
  - Feature flag: `ENABLE_HELIUS_SENDER=true` to enable
  - Environment variables: `HELIUS_API_KEY`, `HELIUS_SENDER_URL` (defaults to https://sender.helius-rpc.com/fast)
  - Used ONLY for sendTransaction broadcast, NOT for reads/quotes/blockhash
  - Automatic fallback to standard RPC if Sender fails
  - Confirmation still uses normal Helius RPC Connection
  - Non-custodial: API keys never exposed to frontend
  - Logs which broadcast path was used (Helius Sender vs standard RPC)
  - Key files: `server/services/heliusSender.ts`, `server/services/solanaTransactions.ts`

## External Dependencies

### Blockchain
- **Solana Web3.js**: Core Solana blockchain interaction
- **@solana/spl-token**: SPL token creation and management
- **bs58**: Base58 encoding for key serialization
- **Buffer polyfill**: CDN-loaded buffer for browser SPL token compatibility
- **Network**: Solana Devnet (clusterApiUrl)

### Authentication & Security
- **Passkey Authentication (Primary)**: WebAuthn-based passwordless authentication
  - Supports Touch ID, Face ID, Windows Hello, and security keys
  - Resident key support for discoverable credentials
  - Server stores only public credential data - never private keys
  - Creates new user account on first registration
  - Issues JWT tokens upon successful authentication
  - Endpoints: `/api/auth/passkey/register/*` and `/api/auth/passkey/login/*`
- **Replit Auth (Alternative)**: OpenID Connect authentication
- **Passport.js**: Authentication middleware
- **express-session**: Session management (backward compatibility)
- **Zero-Trust Architecture**: JWT-based authentication with:
  - Short-lived access tokens (15 min expiry) stored in memory only
  - Refresh tokens stored in HttpOnly cookies (Secure, SameSite=Strict, 7-day expiry)
  - No localStorage usage for auth tokens (security hardening)
  - `/api/auth/session` endpoint restores auth state on app load from HttpOnly cookie
  - `/api/auth/refresh` reads refresh token from cookie, returns new access token
  - Per-request token validation with automatic refresh on 401
  - Hybrid auth supporting both sessions and tokens
  - Rate limiting (global/strict/auth tiers)
  - Basic anomaly detection for suspicious patterns
- **Face ID / Biometric Unlock**: WebAuthn-based biometric authentication for existing sessions
- **Non-Custodial Design**: Server NEVER stores or handles:
  - Private keys
  - Seed phrases
  - Anything that can sign transactions
- **Key Files**:
  - `server/services/tokenService.ts` - JWT token generation/validation
  - `server/middleware/zeroTrust.ts` - Auth middleware, rate limiting, anomaly detection
  - `server/services/webauthnService.ts` - WebAuthn registration/authentication + passkey-only auth
  - `client/src/lib/tokenManager.ts` - Frontend token management with auto-refresh
  - `client/src/hooks/use-passkey.ts` - Passkey authentication frontend hook
  - `client/src/hooks/use-biometric.ts` - WebAuthn biometric unlock (for existing sessions)

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