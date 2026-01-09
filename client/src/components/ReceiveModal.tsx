import { motion } from "framer-motion";
import { X, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiveModal({ isOpen, onClose }: ReceiveModalProps) {
  const { address } = useWallet();
  const { toast } = useToast();

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({
        title: "Copied!",
        description: "Address copied to clipboard",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-3xl p-6 shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground">
          <X className="w-6 h-6" />
        </button>

        <div className="space-y-8 flex flex-col items-center">
          <div className="flex items-center gap-2 w-full">
            <h2 className="text-2xl font-bold font-display">Receive SOL</h2>
            <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">BETA</span>
          </div>

          <div className="p-4 bg-white rounded-3xl shadow-xl">
            {address && (
              <QRCodeSVG 
                value={address} 
                size={200}
                level="Q"
                imageSettings={{
                  src: "https://cryptologos.cc/logos/solana-sol-logo.png",
                  x: undefined,
                  y: undefined,
                  height: 40,
                  width: 40,
                  excavate: true,
                }}
              />
            )}
          </div>

          <div className="w-full space-y-2">
            <label className="text-sm font-medium text-muted-foreground block text-center">Your Wallet Address</label>
            <button 
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-muted border border-border hover:bg-muted/80 transition-colors font-mono text-sm break-all text-foreground"
            >
              {address}
              <Copy className="w-4 h-4 shrink-0" />
            </button>
          </div>
          
          <div className="text-xs text-center text-muted-foreground">
            Only send Solana (SOL) to this address.<br/>Sending other assets may result in permanent loss.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
