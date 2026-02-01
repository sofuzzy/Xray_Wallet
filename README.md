Xray Wallet (Beta)

Xray is a non-custodial Solana wallet focused on clarity, safety, and execution quality — especially for high-risk tokens and new launches.

This project is currently in beta. Features may change, break, or be removed. Use at your own risk.

KEY FEATURES

Non-Custodial by Design
- Private keys are generated and stored locally on the user’s device
- Optional encrypted cloud backup for multi-device access
- Xray cannot access or recover user wallets

Risk Shield
Before executing a swap, Xray analyzes tokens for common risk factors such as:
- holder concentration
- liquidity conditions
- mint / freeze authority
- suspicious launch patterns

Fast, Reliable Swaps
- Server-side Solana RPC routing (Helius)
- Reduced reliance on overloaded public RPCs
- Designed to minimize failed or expired transactions

Token Discovery & Explorer
- Token search and trending discovery
- Contextual risk indicators
- Integrated links to Solscan / Dexscreener

Wallet Cleanup Tools
- Close empty SPL token accounts
- Reclaim SOL rent from unused accounts
- Transparent activity logs

BETA UNLOCK
During beta, on-chain transactions are gated.
To execute swaps, sends, or token launches, the transacting wallet must hold at least 5,000 tokens of a specific SPL mint.
Read-only features remain available to all users.

BETA DISCLAIMER
This software is provided as-is and without warranties.
Xray does not provide financial, legal, or investment advice.
Users are solely responsible for their funds and actions.

TECH STACK
Frontend: React + TypeScript
Backend: Node.js + Express
Blockchain: Solana
RPC: Helius
Security: WebCrypto

LICENSE
All rights reserved.
This repository is shared for transparency and review during beta.
Commercial reuse or redistribution is not permitted.

Collab inquiries and questions: xraythewallet@gmail.com
