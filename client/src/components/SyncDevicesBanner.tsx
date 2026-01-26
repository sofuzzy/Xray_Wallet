import { useState, useEffect } from "react";
import { Cloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface SyncDevicesBannerProps {
  onEnableSync: () => void;
}

const SYNC_DISMISSED_KEY = "xray_sync_banner_dismissed";

export function SyncDevicesBanner({ onEnableSync }: SyncDevicesBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    const wasDismissed = localStorage.getItem(SYNC_DISMISSED_KEY);
    return wasDismissed === "true";
  });

  const handleDismiss = () => {
    localStorage.setItem(SYNC_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  const handleEnableSync = () => {
    onEnableSync();
    handleDismiss();
  };

  if (dismissed) return null;

  return (
    <Card className="mx-4 mt-4 p-4 bg-primary/5 border-primary/20" data-testid="banner-sync-devices">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Cloud className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm mb-1">Sync across devices?</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Enable encrypted backup to access your wallet on other devices
          </p>
          <div className="flex flex-wrap gap-2">
            <Button 
              size="sm" 
              onClick={handleEnableSync}
              data-testid="button-enable-sync"
            >
              Enable Sync
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleDismiss}
              data-testid="button-dismiss-sync"
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close-sync-banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

export function resetSyncBannerDismissed() {
  localStorage.removeItem(SYNC_DISMISSED_KEY);
}
