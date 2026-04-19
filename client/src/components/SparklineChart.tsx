import { useEffect, useRef, memo } from "react";

interface SparklineChartProps {
  /** Array of close prices, oldest first */
  prices: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  className?: string;
}

/**
 * Ultra-lightweight SVG sparkline — zero library dependency.
 * Used in token lists, watchlist rows, degen cards, etc.
 * Does NOT import lightweight-charts.
 */
export const SparklineChart = memo(function SparklineChart({
  prices,
  width  = 80,
  height = 32,
  positive,
  className = "",
}: SparklineChartProps) {
  if (!prices.length) return null;

  const isUp = positive ?? (prices[prices.length - 1] >= prices[0]);
  const color = isUp ? "#10b981" : "#ef4444";

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pad  = 2;
  const w    = width  - pad * 2;
  const h    = height - pad * 2;

  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = points.join(" ");
  // Fill path: close the polyline down to the bottom to create area fill
  const lastX  = (pad + w).toFixed(1);
  const firstX = pad.toFixed(1);
  const bottom = (pad + h + 2).toFixed(1);
  const fill   = `${polyline} ${lastX},${bottom} ${firstX},${bottom}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {/* Area fill */}
      <polygon
        points={fill}
        fill={color}
        fillOpacity={0.08}
      />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].split(",")[0]}
        cy={points[points.length - 1].split(",")[1]}
        r={2}
        fill={color}
      />
    </svg>
  );
});
