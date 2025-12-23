import { ArrowUpRight, ArrowDownLeft, Plus, Shuffle } from "lucide-react";
import { motion } from "framer-motion";

interface ActionButtonsProps {
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onTopUp: () => void;
}

export function ActionButtons({ onSend, onReceive, onSwap, onTopUp }: ActionButtonsProps) {
  const buttons = [
    { label: "Send", icon: ArrowUpRight, onClick: onSend, color: "bg-white text-black hover:bg-white/90" },
    { label: "Receive", icon: ArrowDownLeft, onClick: onReceive, color: "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md" },
    { label: "Swap", icon: Shuffle, onClick: onSwap, color: "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md" },
    { label: "Top Up", icon: Plus, onClick: onTopUp, color: "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md" },
  ];

  return (
    <div className="flex gap-4 justify-center py-8">
      {buttons.map((btn, idx) => (
        <motion.button
          key={btn.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={btn.onClick}
          className="flex flex-col items-center gap-2 group"
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all ${btn.color}`}>
            <btn.icon className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {btn.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
