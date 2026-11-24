const STAR_PATH =
  'M0,162.5 22.041947,230.338137 -35.664619,188.411863H35.664619L-22.041947,230.338137z';
const STAR_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);

export function EuFlagIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="24"
      height="16"
      viewBox="0 0 900 600"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect width="900" height="600" fill="#039" />
      <g fill="#fc0" transform="translate(450,300)">
        {STAR_ANGLES.map((angle) => (
          <path key={angle} d={STAR_PATH} transform={`rotate(${angle}) rotate(${-angle},0,200)`} />
        ))}
      </g>
    </svg>
  );
}
