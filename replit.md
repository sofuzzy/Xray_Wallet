# Xray - Solana Wallet Application

## Overview

Xray is a non-custodial Solana mainnet wallet application designed for managing SOL tokens with a modern, futuristic interface. It provides essential wallet functionalities including sending/receiving SOL, token swaps, and a token launchpad. The application supports both Passkey (WebAuthn) and Replit Auth for user authentication, storing wallet data securely in a PostgreSQL database without ever exposing private keys to the server.

The project's vision is to offer a secure, user-friendly, and feature-rich Solana wallet experience that leverages cutting-edge web technologies and blockchain capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Design Philosophy
The UI adopts a clean, edgy futuristic aesthetic:
- **Color Palette**: Deep slate backgrounds with teal/emerald primary and purple accent.
- **Typography**: Inter for body text, JetBrains Mono for monospace data.
- **Effects**: Subtle glassmorphism with backdrop-blur, modern gradients, and minimal shadows.
- **Components**: Utilizes shadcn/ui Button components.
- **Cards**: Modern gradient backgrounds with subtle mesh overlays and gradient borders.

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query for server state, React hooks for local state.
- **Styling**: Tailwind CSS with shadcn/ui.
- **Animations**: Framer Motion.
- **Build Tool**: Vite.

The frontend is built with a component-based architecture, separating pages, reusable UI components, custom hooks for wallet, auth, and data fetching, and Solana blockchain utilities.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM with PostgreSQL.
- **Authentication**: Replit Auth (OpenID Connect via Passport.js).
- **Session Storage**: PostgreSQL-backed sessions.

The server follows a modular pattern with distinct routes, abstracted database operations, and isolated authentication integration.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Location**: `shared/schema.ts` and `shared/models/auth.ts`.
- **Key Tables**: `users`, `sessions`, `wallets`, `transactions`, `tokenLaunches`, `autoTradeRules`, `watchlistTokens`.

### Wallet Implementation
- **Non-Custodial Security**: Keypairs generated client-side; private keys never leave the user's device.
- **Encrypted Local Vault**: All wallet data is encrypted at rest in `localStorage` using AES-256-GCM with PBKDF2 key derivation. Data is decrypted into memory only when the user provides a PIN.
- **No Plaintext Secrets**: Mnemonic phrases and private keys are NEVER stored in plaintext localStorage. All sensitive wallet data goes through the encrypted vault system only.
- **Memory-Only Unlock**: Decrypted wallet data lives only in React state (memory) while unlocked. A short-lived memory token tracks unlock status. On page refresh, vault returns to locked state - no secrets persisted to sessionStorage.
- **Multi-Wallet Support**: Users can create, manage, and switch between multiple wallets, stored encrypted within the local vault.
- **Multi-Device Wallet Sync**: Public wallet addresses (never private keys) are synced to a cloud registry (`userWallets` table) for cross-device visibility.
- **Seed Phrase Management**: Supports BIP39 12-word mnemonic for backup, restore, and generation of new wallets.
- **Key Files**: `client/src/lib/localVault.ts`, `client/src/lib/vaultCrypto.ts`, `client/src/contexts/VaultContext.tsx`

### Staking Implementation
- Supports native Solana staking using `StakeProgram` from web3.js, including delegation, activation, deactivation, and withdrawal.

### Token Launchpad Implementation
- **Server-Assisted SPL Token Creation**: Users can create custom SPL tokens with configurable parameters
  - Server builds unsigned transaction with mint creation, ATA, and mintTo instructions (`/api/launchpad/build-create-mint-tx`)
  - Server signs with generated mint keypair, returns transaction to client
  - Client signs with wallet keypair locally (non-custodial)
  - Client submits signed transaction to server (`/api/launchpad/send-signed-tx`)
  - Server broadcasts via Helius Sender with resend loop and getSignatureStatuses confirmation
  - Configurable name, symbol, decimals (0-18), and total supply
  - Optional token image upload to object storage
  - Key file: `server/services/launchpadService.ts`
- **Raydium CPMM Liquidity Pool Creation**: Optional pool creation after token launch
  - Server-side transaction building via Raydium API v3 (`/api/liquidity-pool/build`)
  - Client-side transaction signing and server-side broadcast/confirmation
  - Configurable SOL amount (min 0.1) and token supply percentage (1-100%)
  - Pool creation fee: ~0.3 SOL (fetched dynamically from `/api/liquidity-pool/cost`)
  - Robust base64 decoding with URL-safe character handling
  - Key files: `server/services/raydiumPool.ts`, `client/src/components/LaunchpadModal.tsx`
- **Token Launch Tracking**: Launched tokens saved to database (`tokenLaunches` table)
  - Displayed in "My Tokens" section with quick swap access
- **Transaction Confirmation**: Uses getSignatureStatuses polling with resend loop instead of blockhash-based confirmation
  - Avoids "block height exceeded" errors from confirming with mismatched blockhashes
  - Key files: `server/services/heliusSender.ts`, `server/services/solanaTransactions.ts`

### Token Swap Implementation (Jupiter)
- **Jupiter API Integration**: Leverages Jupiter's API for server-side quote and swap transaction generation.
- **Token Discovery**: Uses DexScreener API for comprehensive token data, prices, and trending information.
- **Swap Flow**: Client-side transaction signing with server-side quote and transaction building.
- **Advanced Features**: Includes priority fee tiers, paste-to-add token functionality, and direct DEX routing options (e.g., Orca, Raydium).
- **RPC Manager**: Implements automatic RPC fallback across multiple endpoints with health tracking and latency-based routing.
- **Helius Integrations**: Supports Helius Post-Trade Rebates and Helius Sender for ultra-low latency transaction broadcasting (optional, feature-flagged).
- **Transaction Integrity Verification**: Client-side SHA256 message hash checks to prevent post-signing transaction mutations.
- **Server-Only RPC Architecture**: ALL Solana RPC calls are routed through server endpoints (`/api/solana/*`). No client-side RPC connections to mainnet. This prevents exposure of API keys and provides centralized RPC control via Helius.

## External Dependencies

### Blockchain
- **Solana Web3.js**: Core interaction with the Solana blockchain.
- **@solana/spl-token**: For SPL token operations.
- **bs58**: Base58 encoding.
- **Network**: Solana Mainnet (mainnet-beta).

### Authentication & Security
- **Passkey Authentication**: Primary WebAuthn-based passwordless authentication.
- **Replit Auth**: Alternative OpenID Connect authentication.
- **Passport.js**: Authentication middleware.
- **express-session**: Session management.
- **Zero-Trust Architecture**: JWT-based authentication with short-lived access tokens, HttpOnly refresh tokens, and per-request validation.
- **WebAuthn**: For biometric unlock (Face ID / Biometric Unlock).

### UI Components
- **shadcn/ui**: Comprehensive UI component library.
- **Lucide React**: Icon library.
- **qrcode.react**: QR code generation.

### Database
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.
- **pg**: PostgreSQL client.
- **connect-pg-simple**: PostgreSQL session store.

### Development
- **Vite**: Build tool.
- **esbuild**: Production server bundling.
- **TypeScript**: For type safety across the codebase.