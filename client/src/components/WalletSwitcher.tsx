import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronDown, 
  Plus, 
  Wallet, 
  Check,
  Trash2,
  Pencil,
  X,
  Loader2 
} from "lucide-react";
import { shortenAddress } from "@/lib/solana";
import type { StoredWallet } from "@/lib/solana";

interface WalletSwitcherProps {
  wallets: StoredWallet[];
  activeWallet: StoredWallet | null;
  onSwitch: (walletId: string) => Promise<boolean>;
  onAdd: (name: string) => Promise<StoredWallet>;
  onRemove: (walletId: string) => Promise<boolean>;
  onRename: (walletId: string, newName: string) => boolean;
}

export function WalletSwitcher({ 
  wallets, 
  activeWallet, 
  onSwitch, 
  onAdd,
  onRemove,
  onRename 
}: WalletSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWalletName, setNewWalletName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateWallet = async () => {
    if (!newWalletName.trim()) return;
    setIsLoading(true);
    try {
      await onAdd(newWalletName.trim());
      setNewWalletName("");
      setIsCreating(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitch = async (walletId: string) => {
    if (walletId === activeWallet?.id) return;
    setIsLoading(true);
    try {
      await onSwitch(walletId);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = (walletId: string) => {
    if (!editName.trim()) return;
    onRename(walletId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = async (walletId: string) => {
    if (wallets.length <= 1) return;
    setIsLoading(true);
    try {
      await onRemove(walletId);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        data-testid="button-wallet-switcher"
      >
        <Wallet className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-white max-w-[120px] truncate">
          {activeWallet?.name || "Select Wallet"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-2 w-72 rounded-xl bg-card border border-white/10 shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-2 border-b border-white/10">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Your Wallets
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {wallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className={`group flex items-center gap-2 p-2 rounded-lg transition-colors ${
                      wallet.id === activeWallet?.id 
                        ? 'bg-primary/20' 
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {editingId === wallet.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(wallet.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => handleRename(wallet.id)}
                          className="p-1 rounded hover:bg-white/10 text-green-500"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 rounded hover:bg-white/10 text-muted-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSwitch(wallet.id)}
                          className="flex-1 flex items-center gap-3 text-left"
                          data-testid={`button-wallet-${wallet.id}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            wallet.id === activeWallet?.id 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-white/10 text-muted-foreground'
                          }`}>
                            <Wallet className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{wallet.name}</p>
                            <p className="text-xs text-muted-foreground">{shortenAddress(wallet.publicKey)}</p>
                          </div>
                          {wallet.id === activeWallet?.id && (
                            <Check className="w-4 h-4 text-primary shrink-0" />
                          )}
                        </button>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingId(wallet.id);
                              setEditName(wallet.name);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground"
                            data-testid={`button-edit-wallet-${wallet.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {wallets.length > 1 && (
                            <button
                              onClick={() => handleDelete(wallet.id)}
                              className="p-1 rounded hover:bg-white/10 text-destructive"
                              data-testid={`button-delete-wallet-${wallet.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-white/10">
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newWalletName}
                      onChange={(e) => setNewWalletName(e.target.value)}
                      placeholder="Wallet name..."
                      className="flex-1 px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateWallet();
                        if (e.key === 'Escape') setIsCreating(false);
                      }}
                    />
                    <button
                      onClick={handleCreateWallet}
                      disabled={isLoading || !newWalletName.trim()}
                      className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setIsCreating(false)}
                      className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                    data-testid="button-create-wallet"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">Create New Wallet</span>
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
