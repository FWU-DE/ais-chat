export function CustomRectangleIcon({
  width,
  height,
  className,
}: {
  className?: string;
  width: number;
  height: number;
}) {
  const strokeWidth = 1.5;
  const inset = strokeWidth / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x={inset}
        y={inset}
        width={width - strokeWidth}
        height={height - strokeWidth}
        rx="1.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
