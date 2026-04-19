import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass, Settings, Lock, LogOut, MoreHorizontal, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WalletSwitcher } from "@/components/WalletSwitcher";
import { DegenModeToggle } from "@/components/degen/DegenModeToggle";
import xrayLogo from "@/assets/xray-logo.png";
import type { StoredWallet } from "@/lib/solana";
import type { RegisteredWallet } from "@/hooks/use-wallet-registry";

interface AppHeaderProps {
  wallets: StoredWallet[];
  activeWallet: StoredWallet | null;
  onSwitch: (walletId: string) => Promise<boolean>;
  onAdd: (name: string) => Promise<StoredWallet>;
  onRemove: (walletId: string) => Promise<boolean>;
  onRename: (walletId: string, newName: string) => boolean | Promise<boolean>;
  registeredWallets: RegisteredWallet[];
  isAuthenticated: boolean;
  profileImageUrl?: string;
  onOpenSettings: () => void;
  onLock: () => void;
  onLogout: () => void;
}

function MobileMenuSheet({
  open,
  onClose,
  onOpenSettings,
  onLock,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
  onLogout: () => void;
}) {
  const items = [
    {
      icon: Compass,
      label: "Explore Tokens",
      description: "Browse trending & new tokens",
      href: "/explore",
      testId: "mobile-menu-explorer",
    },
  ];

  const actions = [
    {
      icon: Settings,
      label: "Settings",
      description: "Manage wallet & preferences",
      onClick: () => { onOpenSettings(); onClose(); },
      testId: "mobile-menu-settings",
    },
    {
      icon: Lock,
      label: "Lock Wallet",
      description: "Lock and require PIN to unlock",
      onClick: () => { onLock(); onClose(); },
      testId: "mobile-menu-lock",
      danger: false,
    },
    {
      icon: LogOut,
      label: "Log Out",
      description: "Sign out of your account",
      onClick: () => { onLogout(); onClose(); },
      testId: "mobile-menu-logout",
      danger: true,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="pb-8 rounded-t-2xl max-h-[60vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Menu</SheetTitle>
        </SheetHeader>

        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              data-testid={item.testId}
              className="flex items-center gap-4 w-full p-4 rounded-xl hover:bg-muted/60 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-foreground/70" />
              </div>
              <div>
                <div className="font-medium text-[15px]">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
              </div>
            </Link>
          ))}

          <div className="h-px bg-border/50 my-2" />

          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              data-testid={action.testId}
              className={`flex items-center gap-4 w-full p-4 rounded-xl hover:bg-muted/60 transition-colors text-left ${
                action.danger ? "text-destructive/80" : ""
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                action.danger ? "bg-destructive/10" : "bg-muted"
              }`}>
                <action.icon className={`w-5 h-5 ${action.danger ? "text-destructive/70" : "text-foreground/70"}`} />
              </div>
              <div>
                <div className={`font-medium text-[15px] ${action.danger ? "text-destructive" : ""}`}>{action.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{action.description}</div>
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppHeader({
  wallets,
  activeWallet,
  onSwitch,
  onAdd,
  onRemove,
  onRename,
  registeredWallets,
  isAuthenticated,
  profileImageUrl,
  onOpenSettings,
  onLock,
  onLogout,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-3 sm:px-6 h-14 flex items-center gap-2">

          {/* Logo — always visible */}
          <img
            src={xrayLogo}
            alt="XRAY"
            className="h-7 mix-blend-screen flex-shrink-0"
          />

          {/* Wallet selector — takes available space, truncates on mobile */}
          <div className="flex-1 min-w-0">
            <WalletSwitcher
              wallets={wallets}
              activeWallet={activeWallet}
              onSwitch={onSwitch}
              onAdd={onAdd}
              onRemove={onRemove}
              onRename={onRename}
              registeredWallets={registeredWallets}
              isAuthenticated={isAuthenticated}
            />
          </div>

          {/* BETA badge — hidden on mobile to save space */}
          <span className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-medium tracking-wide rounded-full bg-amber-500/10 text-amber-500/70 flex-shrink-0">
            BETA
          </span>

          {/* Degen toggle — always visible, more compact on mobile */}
          <div className="flex-shrink-0">
            <DegenModeToggle />
          </div>

          {/* Desktop-only action icons */}
          <div className="hidden sm:flex items-center gap-1">
            {profileImageUrl && (
              <img
                src={profileImageUrl}
                alt=""
                className="w-7 h-7 rounded-full ring-1 ring-border/50"
              />
            )}
            <Link
              href="/explore"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-explorer"
            >
              <Compass className="w-5 h-5" />
            </Link>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onLock}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-lock-vault"
              title="Lock Wallet"
            >
              <Lock className="w-5 h-5" />
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile-only overflow menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            className="sm:hidden p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            data-testid="button-mobile-menu"
            aria-label="Open menu"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile bottom sheet */}
      <MobileMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenSettings={onOpenSettings}
        onLock={onLock}
        onLogout={onLogout}
      />
    </>
  );
}
