🔐 Security Policy
Overview

Xray is a non-custodial Solana wallet currently in beta.
Security is a core design goal, but as with all blockchain software, risks exist.

This document explains:

how Xray handles security

what to expect as a user

how to responsibly report vulnerabilities

🔑 Non-Custodial Model

Private keys are generated and stored locally on the user’s device

Keys are never transmitted in plaintext to Xray servers

Xray cannot access, recover, or reset user wallets

Optional encrypted backups are user-controlled and require a passphrase

If you lose your keys or passphrase, funds cannot be recovered.

🔒 Key Storage & Encryption

Wallet material is encrypted client-side using WebCrypto

Encrypted vault data may be stored locally or backed up (if enabled)

Decrypted key material exists only in memory during an active session

Xray does not store unencrypted private keys server-side

🔁 Authentication & Sessions

Authentication tokens are handled via HttpOnly cookies

Sensitive tokens are not stored in localStorage

Server-side enforcement is used for all privileged operations

⛓️ Transaction Security

All on-chain transaction execution is enforced server-side

Client-side checks are advisory only and cannot bypass server rules

Transactions may be gated during beta (e.g. token-holding requirements)

Xray does not custody funds or intermediate assets during swaps

🛡️ Risk Analysis Disclaimer

Xray provides token risk analysis and warnings based on heuristics and on-chain data.

Important:

Risk analysis is informational only

No analysis guarantees safety or profitability

Users are solely responsible for their trading decisions

Xray does not provide financial, legal, or investment advice.

🧪 Beta Status

This software is in active beta:

Features may change or break

Performance issues may occur

Security assumptions may evolve

Do not use Xray with funds you cannot afford to lose.

🚨 Reporting a Security Vulnerability

We take security issues seriously.

If you discover a vulnerability:

Do NOT open a public GitHub issue

Do NOT exploit the issue beyond proof of concept

Instead, please report responsibly via one of the following:

Email: xraythewallet@gmail.com

Or direct message via official project contact channels

Please include:

a clear description of the issue

steps to reproduce (if applicable)

potential impact

screenshots or logs (if helpful)

We aim to acknowledge valid reports promptly.

🏆 Responsible Disclosure

Researchers acting in good faith will not face legal action

Public disclosure should only occur after a fix or mitigation

We appreciate community contributions to improving security

📜 Scope

This policy applies to:

Xray wallet frontend

Xray backend services

Xray transaction and risk analysis flows

Third-party services (RPC providers, DEXs, external APIs) are subject to their own security policies.

Final Note

Using blockchain software involves inherent risk.
Xray’s goal is to increase clarity and reduce surprises, not eliminate risk entirely.

Thank you for helping keep Xray safe.
