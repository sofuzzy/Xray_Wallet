export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 ${className}`}>
      BETA
    </span>
  );
}
