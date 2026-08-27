export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="10 0 120 140"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <g fill="currentColor">
        <rect x={50} y={0} width={20} height={20} />
        <rect x={70} y={0} width={20} height={20} />
        <rect x={30} y={20} width={20} height={20} />
        <rect x={90} y={20} width={20} height={20} />
        <rect x={10} y={40} width={20} height={20} />
        <rect x={10} y={60} width={20} height={20} />
        <rect x={10} y={80} width={20} height={20} />
        <rect x={110} y={40} width={20} height={20} />
        <rect x={110} y={60} width={20} height={20} />
        <rect x={110} y={80} width={20} height={20} />
        <rect x={30} y={100} width={20} height={20} />
        <rect x={90} y={100} width={20} height={20} />
        <rect x={50} y={120} width={20} height={20} />
        <rect x={70} y={120} width={20} height={20} />
      </g>
      <g fill="var(--brand)">
        <rect x={30} y={60} width={20} height={20} />
        <rect x={50} y={60} width={20} height={20} />
        <rect x={70} y={60} width={20} height={20} />
        <rect x={90} y={60} width={20} height={20} />
      </g>
    </svg>
  );
}
