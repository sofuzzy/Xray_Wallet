import { useState, useEffect, useCallback } from "react";

export interface RiskShieldCheckConfig {
  lowLiquidity: boolean;
  volumeAnomaly: boolean;
  highVolatility: boolean;
  newMarket: boolean;
  fdvDisconnect: boolean;
  lpNotLocked: boolean;
  mintAuthority: boolean;
  freezeAuthority: boolean;
  topHolderConcentration: boolean;
  unknownProgram: boolean;
}

export interface RiskShieldSettings {
  enabled: boolean;
  checks: RiskShieldCheckConfig;
}

const DEFAULT_SETTINGS: RiskShieldSettings = {
  enabled: true,
  checks: {
    lowLiquidity: true,
    volumeAnomaly: true,
    highVolatility: true,
    newMarket: true,
    fdvDisconnect: true,
    lpNotLocked: true,
    mintAuthority: true,
    freezeAuthority: true,
    topHolderConcentration: true,
    unknownProgram: true,
  },
};

const STORAGE_KEY = "xray_risk_shield_settings";

function loadSettings(): RiskShieldSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        checks: {
          ...DEFAULT_SETTINGS.checks,
          ...(typeof parsed.checks === "object" ? parsed.checks : {}),
        },
      };
    }
  } catch {
    // ignore parsing errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: RiskShieldSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function useRiskShieldSettings() {
  const [settings, setSettingsState] = useState<RiskShieldSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettingsState((prev) => ({ ...prev, enabled }));
  }, []);

  const setCheck = useCallback((key: keyof RiskShieldCheckConfig, value: boolean) => {
    setSettingsState((prev) => ({
      ...prev,
      checks: { ...prev.checks, [key]: value },
    }));
  }, []);

  const setAllChecks = useCallback((value: boolean) => {
    setSettingsState((prev) => ({
      ...prev,
      checks: {
        lowLiquidity: value,
        volumeAnomaly: value,
        highVolatility: value,
        newMarket: value,
        fdvDisconnect: value,
        lpNotLocked: value,
        mintAuthority: value,
        freezeAuthority: value,
        topHolderConcentration: value,
        unknownProgram: value,
      },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
  }, []);

  const getEnabledCheckCodes = useCallback((): string[] => {
    const codes: string[] = [];
    const { checks } = settings;
    
    if (checks.lowLiquidity) {
      codes.push("LOW_LIQUIDITY_CRITICAL", "LOW_LIQUIDITY", "MODEST_LIQUIDITY", "UNKNOWN_LIQUIDITY");
    }
    if (checks.volumeAnomaly) {
      codes.push("VOLUME_LIQUIDITY_SPIKE", "VOLUME_LIQUIDITY_HIGH");
    }
    if (checks.highVolatility) {
      codes.push("EXTREME_VOLATILITY_24H", "HIGH_VOLATILITY_24H");
    }
    if (checks.newMarket) {
      codes.push("VERY_NEW_MARKET", "NEW_MARKET");
    }
    if (checks.fdvDisconnect) {
      codes.push("FDV_LIQ_DISCONNECT");
    }
    if (checks.lpNotLocked) {
      codes.push("LP_NOT_LOCKED", "LP_PARTIALLY_LOCKED", "LP_LOCK_UNVERIFIED");
    }
    if (checks.mintAuthority) {
      codes.push("MINT_AUTHORITY_PRESENT", "MINT_AUTHORITY_UNKNOWN");
    }
    if (checks.freezeAuthority) {
      codes.push("FREEZE_AUTHORITY_PRESENT", "FREEZE_AUTHORITY_UNKNOWN");
    }
    if (checks.topHolderConcentration) {
      codes.push("TOP_HOLDER_CONCENTRATION_CRITICAL", "TOP_HOLDER_CONCENTRATION", "TOP5_CONCENTRATION_HIGH", "TOP5_CONCENTRATION", "TOP_HOLDERS_UNKNOWN");
    }
    if (checks.unknownProgram) {
      codes.push("UNKNOWN_TOKEN_PROGRAM", "TOKEN_2022");
    }
    
    return codes;
  }, [settings]);

  return {
    settings,
    setEnabled,
    setCheck,
    setAllChecks,
    resetToDefaults,
    getEnabledCheckCodes,
  };
}

export function getRiskShieldSettingsSync(): RiskShieldSettings {
  return loadSettings();
}
