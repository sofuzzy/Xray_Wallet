import { AlertTriangle, Info } from "lucide-react";

type Props = {
  title?: string;
  message: string;
  variant?: "error" | "warning" | "info";
  className?: string;
};

/**
 * Reusable inline error/warning/info message.
 * Use for form + modal feedback where a toast is too easy to miss.
 */
export function InlineError({ title, message, variant = "error", className = "" }: Props) {
  const Icon = variant === "info" ? Info : AlertTriangle;
  const tone =
    variant === "info"
      ? "border-border bg-muted/50 text-foreground"
      : variant === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-foreground"
        : "border-destructive/30 bg-destructive/10 text-foreground";

  return (
    <div className={`flex gap-2 rounded-md border p-3 text-sm ${tone} ${className}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {title && <div className="font-medium">{title}</div>}
        <div className="text-muted-foreground">{message}</div>
      </div>
    </div>
  );
}
