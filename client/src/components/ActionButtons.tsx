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
    <div className="flex gap-6 justify-center py-6 px-6">
      {buttons.map((btn, idx) => (
        <motion.div
          key={btn.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06, type: "spring", stiffness: 220, damping: 20 }}
          className="flex flex-col items-center gap-2.5"
        >
          <Button
            size="icon"
            variant={btn.variant}
            onClick={btn.onClick}
            disabled={btn.disabled}
            className={`w-[60px] h-[60px] rounded-2xl shadow-sm ${btn.className || ''} disabled:opacity-40`}
            data-testid={btn.testId}
          >
            <btn.icon className="w-5 h-5" strokeWidth={2} />
          </Button>
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {btn.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
