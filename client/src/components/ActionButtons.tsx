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
      className: "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-500",
      testId: "button-launch" 
    },
  ];

  return (
    <div className="flex gap-5 justify-center py-6">
      {buttons.map((btn, idx) => (
        <motion.div
          key={btn.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, type: "spring", stiffness: 200 }}
          className="flex flex-col items-center gap-2.5"
        >
          <Button
            size="icon"
            variant={btn.variant}
            onClick={btn.onClick}
            className={`w-14 h-14 rounded-2xl ${btn.className || ''}`}
            data-testid={btn.testId}
          >
            <btn.icon className="w-5 h-5" strokeWidth={2} />
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {btn.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
