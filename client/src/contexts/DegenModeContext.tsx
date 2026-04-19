import { createContext, useContext, useState, useEffect } from "react";

interface DegenModeContextValue {
  isDegenMode: boolean;
  toggle: () => void;
}

const DegenModeContext = createContext<DegenModeContextValue>({
  isDegenMode: false,
  toggle: () => {},
});

export function DegenModeProvider({ children }: { children: React.ReactNode }) {
  const [isDegenMode, setIsDegenMode] = useState(() => {
    try {
      return localStorage.getItem("xray_degen_mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("xray_degen_mode", String(isDegenMode));
    } catch {}
  }, [isDegenMode]);

  return (
    <DegenModeContext.Provider value={{ isDegenMode, toggle: () => setIsDegenMode((v) => !v) }}>
      {children}
    </DegenModeContext.Provider>
  );
}

export function useDegenMode() {
  return useContext(DegenModeContext);
}
