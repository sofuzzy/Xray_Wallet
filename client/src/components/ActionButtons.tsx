import { ArrowUpRight, ArrowDownLeft, Shuffle, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface ActionButtonsProps {
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onLaunch?: () => void;
}

export function ActionButtons({ onSend, onReceive, onSwap, onLaunch }: ActionButtonsProps) {
  const buttons = [
    { 
      label: "Send", 
      icon: ArrowUpRight, 
      onClick: onSend, 
      variant: "default" as const,
      className: "bg-emerald-600 dark:bg-emerald-500 text-white border-emerald-700 dark:border-emerald-600",
      testId: "button-send" 
    },
    { 
      label: "Receive", 
      icon: ArrowDownLeft, 
      onClick: onReceive, 
      variant: "secondary" as const,
      testId: "button-receive" 
    },
    { 
      label: "Swap", 
      icon: Shuffle, 
      onClick: onSwap, 
      variant: "secondary" as const,
      testId: "button-swap" 
    },
    { 
      label: "Launch", 
      icon: Rocket, 
      onClick: onLaunch || (() => {}), 
      variant: "secondary" as const,
      testId: "button-launch",
      disabled: !onLaunch
    },
  ];

  return (
    <div className="flex gap-8 justify-center py-8">
      {buttons.map((btn, idx) => (
        <motion.div
          key={btn.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, type: "spring", stiffness: 200 }}
          className="flex flex-col items-center gap-3"
        >
          <Button
            size="icon"
            variant={btn.variant}
            onClick={btn.onClick}
            disabled={btn.disabled}
            className={`w-16 h-16 rounded-2xl ${btn.className || ''}`}
            data-testid={btn.testId}
          >
            <btn.icon className="w-6 h-6" strokeWidth={2} />
          </Button>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {btn.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
