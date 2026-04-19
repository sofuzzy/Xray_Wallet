# Xray - Solana Wallet Application

## Overview
Xray is a non-custodial Solana mainnet wallet application for managing SOL tokens with a modern, futuristic interface. It offers essential wallet functionalities like sending/receiving SOL, token swaps, staking, and a token launchpad. The application supports both Passkey (WebAuthn) and Replit Auth for user authentication, storing wallet data securely in a PostgreSQL database without exposing private keys to the server. The project aims to provide a secure, user-friendly, and feature-rich Solana wallet experience leveraging cutting-edge web technologies and blockchain capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Design Philosophy
The UI emphasizes a premium, calm aesthetic with deep slate backgrounds, teal/emerald primary, and purple accent colors. Typography uses Inter for body text and JetBrains Mono for monospace. Visuals incorporate subtle glassmorphism, toned-down gradients, and soft shadows. Components utilize shadcn/ui, including Skeleton loaders and cards with soft borders and minimal gradients. Spacing follows an 8px scale for generous padding and section gaps. Visual hierarchy prioritizes balance display and de-emphasizes secondary labels. Action buttons are large and Phantom-style, with Send as the primary action.

### Core Features
- **Degen Mode**: A toggleable alternate UI with a trader-terminal aesthetic, featuring live price tickers, compact balance bar, and tab navigation for trending tokens, new/low MC tokens, portfolio, and activity.
- **Wallet-First Onboarding**: Streamlined onboarding process starting with wallet setup (create, import, restore), followed by PIN creation for local vault encryption. Authentication is optional for cloud backup.
- **Non-Custodial Wallet Security**: Keypairs are generated client-side, with private keys never leaving the user's device. Wallet data is encrypted in `localStorage` using AES-256-GCM and PBKDF2, decrypted only when unlocked with a PIN. Multi-wallet support and multi-device sync (public addresses only) are included.
- **Staking**: Supports native Solana staking including delegation, activation, deactivation, and withdrawal.
- **Token Launchpad**: Enables server-assisted creation of custom SPL tokens with configurable parameters, optional image upload, and Raydium CPMM liquidity pool creation. Uses getSignatureStatuses for transaction confirmation.
- **Chart Performance**: Optimized chart components with dynamic import of `lightweight-charts`, `useMemo` for data processing, prefetching, and debounced resizing. Zero-dependency SVG sparklines are used for token lists.
- **Beta Unlock Gating**: Transaction features are gated by holding ≥5,000 XRAY tokens, enforced by server-side middleware and client-side UI disabling.
- **Token Account Cleanup**: Allows users to close empty SPL token accounts to reclaim SOL rent deposits, supporting both SPL Token and Token-2022 programs with batching.
- **Turbo Mode**: Optional feature for ultra-fast transaction processing via Helius Sender with Jito tips for priority validator processing.
- **Token Swap**: Integrates Jupiter's API for server-side quote and swap transaction generation, DexScreener for token data, and advanced features like priority fees and direct DEX routing. All Solana RPC calls are routed through server endpoints to prevent API key exposure and centralize RPC control.

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query for server state, React hooks for local state.
- **Styling**: Tailwind CSS with shadcn/ui.
- **Animations**: Framer Motion.
- **Build Tool**: Vite.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **Database ORM**: Drizzle ORM with PostgreSQL.
- **Authentication**: Replit Auth (OpenID Connect via Passport.js).
- **Session Storage**: PostgreSQL-backed sessions.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Key Tables**: `users`, `sessions`, `wallets`, `transactions`, `tokenLaunches`, `autoTradeRules`, `watchlistTokens`.

## External Dependencies

### Blockchain
- **Solana Web3.js**: Core interaction with Solana blockchain.
- **@solana/spl-token**: SPL token operations.
- **bs58**: Base58 encoding.
- **Network**: Solana Mainnet (mainnet-beta).

### Authentication & Security
- **Passkey Authentication**: WebAuthn-based passwordless authentication.
- **Replit Auth**: OpenID Connect authentication.
- **Passport.js**: Authentication middleware.
- **express-session**: Session management.
- **WebAuthn**: For biometric unlock.

### UI Components
- **shadcn/ui**: UI component library.
- **Lucide React**: Icon library.
- **qrcode.react**: QR code generation.

### Database
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.
- **pg**: PostgreSQL client.
- **connect-pg-simple**: PostgreSQL session store.

### Development
- **Vite**: Build tool.
- **esbuild**: Production server bundling.
- **TypeScript**: Type safety.