import { useState, useEffect, useCallback } from "react";

const TURBO_MODE_KEY = "XRAY_TURBO_MODE";
const TURBO_TIP_AMOUNT_KEY = "XRAY_TURBO_TIP_AMOUNT";

// Default tip amount in SOL (0.0002 SOL = 200,000 lamports - minimum required)
const DEFAULT_TIP_SOL = 0.0002;

export interface TurboModeSettings {
  enabled: boolean;
  tipAmountSol: number;
}

export function useTurboMode() {
  const [settings, setSettings] = useState<TurboModeSettings>(() => {
    if (typeof window === "undefined") {
      return { enabled: false, tipAmountSol: DEFAULT_TIP_SOL };
    }
    
    const enabled = localStorage.getItem(TURBO_MODE_KEY) === "true";
    const tipAmount = parseFloat(localStorage.getItem(TURBO_TIP_AMOUNT_KEY) || String(DEFAULT_TIP_SOL));
    
    return {
      enabled,
      tipAmountSol: isNaN(tipAmount) ? DEFAULT_TIP_SOL : tipAmount,
    };
  });

  const setEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(TURBO_MODE_KEY, String(enabled));
    setSettings(prev => ({ ...prev, enabled }));
  }, []);

  const setTipAmount = useCallback((tipAmountSol: number) => {
    // Enforce minimum tip of 0.0002 SOL
    const validTip = Math.max(0.0002, tipAmountSol);
    localStorage.setItem(TURBO_TIP_AMOUNT_KEY, String(validTip));
    setSettings(prev => ({ ...prev, tipAmountSol: validTip }));
  }, []);

  const getTipLamports = useCallback(() => {
    return Math.floor(settings.tipAmountSol * 1_000_000_000);
  }, [settings.tipAmountSol]);

  return {
    enabled: settings.enabled,
    tipAmountSol: settings.tipAmountSol,
    setEnabled,
    setTipAmount,
    getTipLamports,
  };
}

// Export a function to get turbo mode settings for use in non-React contexts
export function getTurboModeSettings(): TurboModeSettings {
  if (typeof window === "undefined") {
    return { enabled: false, tipAmountSol: DEFAULT_TIP_SOL };
  }
  
  const enabled = localStorage.getItem(TURBO_MODE_KEY) === "true";
  const tipAmount = parseFloat(localStorage.getItem(TURBO_TIP_AMOUNT_KEY) || String(DEFAULT_TIP_SOL));
  
  return {
    enabled,
    tipAmountSol: isNaN(tipAmount) ? DEFAULT_TIP_SOL : tipAmount,
  };
}
