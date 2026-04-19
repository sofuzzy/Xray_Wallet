import { motion, AnimatePresence } from "framer-motion";
import { Flame, Shield } from "lucide-react";
import { useDegenMode } from "@/contexts/DegenModeContext";

export function DegenModeToggle() {
  const { isDegenMode, toggle } = useDegenMode();

  return (
    <button
      onClick={toggle}
      data-testid="button-degen-toggle"
      title={isDegenMode ? "Switch to Safety Mode" : "Switch to Degen Mode"}
      className={`
        relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
        transition-all duration-300 select-none border
        ${isDegenMode
          ? "bg-orange-500/15 border-orange-500/40 text-orange-400 hover:bg-orange-500/25"
          : "bg-muted/60 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted"
        }
      `}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDegenMode ? (
          <motion.span
            key="degen"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1"
          >
            <Flame className="w-3 h-3" />
            DEGEN
          </motion.span>
        ) : (
          <motion.span
            key="safe"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1"
          >
            <Shield className="w-3 h-3" />
            SAFE
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
