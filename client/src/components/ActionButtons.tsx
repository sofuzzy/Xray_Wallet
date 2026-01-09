import { ArrowUpRight, ArrowDownLeft, Shuffle, Rocket } from "lucide-react";
import { motion } from "framer-motion";

interface ActionButtonsProps {
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onLaunch?: () => void;
}

export function ActionButtons({ onSend, onReceive, onSwap, onLaunch }: ActionButtonsProps) {
  const buttons = [
    { label: "Send", icon: ArrowUpRight, onClick: onSend, color: "bg-primary text-primary-foreground", testId: "button-send" },
    { label: "Receive", icon: ArrowDownLeft, onClick: onReceive, color: "bg-muted text-foreground", testId: "button-receive" },
    { label: "Swap", icon: Shuffle, onClick: onSwap, color: "bg-muted text-foreground", testId: "button-swap" },
    { label: "Launch", icon: Rocket, onClick: onLaunch || (() => {}), color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white", testId: "button-launch" },
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
          data-testid={btn.testId}
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
