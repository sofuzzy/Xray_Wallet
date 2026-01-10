# Solana Crypto Wallet - Retro-Futuristic Terminal Design Guidelines

## Design Approach
**Reference-Based**: Drawing from terminal aesthetics, cyberpunk interfaces (Cyberpunk 2077 UI, Blade Runner), and modern fintech apps like Phantom Wallet and MetaMask, blended with retro terminal command-line interfaces.

**Core Principles:**
- Terminal command authenticity with modern usability
- Scanline/CRT aesthetic elements sparingly applied
- Monospace typography for data/addresses
- Clean geometric shapes with glowing accent treatments
- High contrast for readability and trust

---

## Typography System

**Primary Font:** JetBrains Mono (monospace) via Google Fonts - for addresses, amounts, technical data
**Secondary Font:** Inter (sans-serif) via Google Fonts - for UI labels, descriptions

**Hierarchy:**
- Headings: Inter Bold, text-2xl to text-4xl
- Wallet addresses/hashes: JetBrains Mono Regular, text-sm with letter-spacing-wide
- Token amounts: JetBrains Mono SemiBold, text-3xl to text-5xl
- Body text: Inter Regular, text-base
- Labels/metadata: Inter Medium, text-xs uppercase with tracking-wider

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16 (p-4, m-6, gap-8, etc.)

**Grid Structure:**
- Sidebar navigation: Fixed 64px collapsed, 256px expanded (desktop)
- Main content area: max-w-7xl with px-6 to px-8 padding
- Card containers: Consistent p-6 with rounded-lg borders
- Mobile: Full-width panels, bottom navigation

**Layout Pattern:**
- Persistent left sidebar (desktop) with icon-only collapsed state
- Top app bar with wallet connection status and network indicator
- Main dashboard uses 12-column grid for widget placement
- All transaction/token lists in full-width cards

---

## Component Library

### Navigation & Structure
**Sidebar Navigation:**
- Icon + label rows with hover state indicators
- Active state shows left border accent (4px)
- Icons from Heroicons (outline style)
- Sections: Dashboard, Send, Receive, Swap, Stake, NFTs, Settings

**Top Bar:**
- Network selector (dropdown with chain icons)
- Wallet address (truncated, click to copy)
- Connection status indicator (pulsing dot)
- Settings icon button

### Dashboard Widgets
**Portfolio Card:**
- Large total balance display (JetBrains Mono, text-5xl)
- 24h change indicator with arrow icon
- Portfolio allocation mini chart (donut chart placeholder)
- Dimensions: Full-width on mobile, 2/3 width on desktop

**Token List:**
- Virtualized list with row height 72px
- Each row: Token icon (40px) | Name + Amount | USD Value | 24h Change
- Hover reveals quick action buttons (Send, Swap)

**Transaction History:**
- Timeline-style layout with connecting lines
- Each transaction: Icon | Action type | Amount | Status badge | Timestamp
- Expandable for details (hash, block, gas)

### Action Panels
**Swap Interface:**
- Two token input fields stacked with swap direction icon between
- From/To token selector buttons with dropdown
- Slippage settings and price impact warnings
- Route visualization showing DEX path
- Large "Review Swap" button at bottom

**Send/Receive:**
- Send: Address input (QR scanner icon button), Amount input, Token selector, Gas fee estimator
- Receive: Large QR code (256px), Wallet address with copy button, Network warning badge

**Staking Dashboard:**
- Available staking pools grid (2 columns desktop, 1 mobile)
- Each pool card: APY badge (large, top-right), Pool name, TVL, Your stake, Action buttons
- Active stakes section with countdown timers and claim buttons

### Security Components
**Transaction Confirmation Modal:**
- Overlay with backdrop blur
- Transaction details in terminal-style box
- Risk indicators for suspicious transactions
- Fingerprint/Face ID prompt visualization
- Approve/Reject buttons (equal prominence)

**Security Center:**
- Recovery phrase backup status card
- Two-factor authentication toggle
- Trusted dApps list with revoke buttons
- Session management table

### Data Display
**Cards:** 
- All use rounded-lg borders (8px radius)
- Subtle border glow effect on hover
- p-6 padding standard
- Backdrop filter slight blur for layered cards

**Tables:**
- Fixed header with sticky positioning
- Zebra striping subtle (every other row)
- Monospace for numerical data columns
- Right-aligned numbers, left-aligned text

**Badges/Tags:**
- Rounded-full for status indicators
- Uppercase text-xs with px-3 py-1
- Types: Success, Pending, Failed, Warning

---

## Animations
**Sparingly Applied:**
- Number counter animations for balance changes (500ms duration)
- Subtle scanline overlay animation (slow, 3s cycle) on main container - optional decorative layer
- Transaction status transitions (pending → confirmed)
- Page transitions: 200ms fade
- NO elaborate scroll animations or parallax

---

## Images

**Hero Section:** NO traditional hero image. Application starts directly with dashboard.

**Supporting Images:**
1. **Network Chain Icons** (20px): Solana logo, custom chain icons - use official brand assets
2. **Token Icons** (32-40px): Cryptocurrency logos - use CoinGecko/CoinMarketCap standard icons
3. **Empty State Illustrations:** 
   - No tokens yet: Terminal window with blinking cursor (SVG illustration)
   - No transactions: Holographic grid plane (abstract geometric)
   - Dimensions: 240px height, centered
4. **QR Codes:** Generated dynamically for receive addresses (256x256px)
5. **Background Texture:** Subtle grid pattern overlay on main container - use CSS grid pattern, NOT image

All images should be optimized SVGs where possible. No decorative photography. Keep consistent geometric/technical aesthetic.

---

## Critical Implementation Notes
- Maintain exact 8px grid alignment throughout
- All interactive elements have minimum 44px touch target
- Skeleton loading states for all data-heavy components
- Error states use inline messaging, not just color changes
- Copy buttons include visual confirmation (checkmark transition)
- All numerical inputs support decimal precision for crypto amounts
- Address inputs validate format and show ENS resolution where applicable