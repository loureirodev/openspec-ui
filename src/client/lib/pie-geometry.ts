export interface Point {
  x: number;
  y: number;
}

/**
 * The point on a circle of radius `r` centred at `(cx, cy)` at `fraction` of the way
 * clockwise around it, starting at 12 o'clock. `fraction` is expected in `[0, 1]`.
 */
export function pointOnCircle(cx: number, cy: number, r: number, fraction: number): Point {
  const theta = fraction * 2 * Math.PI;
  return {
    x: cx + r * Math.sin(theta),
    y: cy - r * Math.cos(theta),
  };
}

/**
 * An SVG path `d` string for a pie slice covering `fraction` of a circle of radius `r`
 * centred at `(cx, cy)`, sweeping clockwise from 12 o'clock. Returns `null` at the
 * boundaries (`fraction <= 0` renders as an empty ring; `fraction >= 1` is drawn as a
 * solid filled circle) since a single arc command cannot describe either case — see
 * `StatusIcon`, which renders those two cases directly.
 */
export function describePieSlice(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): string | null {
  if (fraction <= 0 || fraction >= 1) return null;

  const start = pointOnCircle(cx, cy, r, 0);
  const end = pointOnCircle(cx, cy, r, fraction);
  const largeArcFlag = fraction > 0.5 ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}
