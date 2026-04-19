import { motion, AnimatePresence } from "framer-motion";
import { Flame, ShieldCheck } from "lucide-react";
import { useDegenMode } from "@/contexts/DegenModeContext";

export function DegenModeToggle() {
  const { isDegenMode, toggle } = useDegenMode();

  return (
    <button
      onClick={toggle}
      data-testid="button-degen-toggle"
      title={isDegenMode ? "Switch to Safety Mode" : "Switch to Degen Mode"}
      className={`
        relative flex items-center gap-1.5 pl-2 pr-2.5 py-[5px] rounded-full
        text-[10px] font-bold tracking-widest transition-all duration-200
        select-none border outline-none ring-0 active:scale-95
        ${isDegenMode
          ? "bg-orange-500/12 border-orange-500/35 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/55"
          : "bg-transparent border-white/[0.12] text-white/40 hover:text-white/70 hover:border-white/[0.22]"
        }
      `}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDegenMode ? (
          <motion.span
            key="degen"
            initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.13, type: "spring", stiffness: 400, damping: 20 }}
            className="flex items-center gap-1.5"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
            </span>
            DEGEN
            <Flame className="w-3 h-3" />
          </motion.span>
        ) : (
          <motion.span
            key="safe"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.13 }}
            className="flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3 h-3" />
            SAFE
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
