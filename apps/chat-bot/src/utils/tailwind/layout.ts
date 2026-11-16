import { DesignConfiguration } from '@ui/types/design-configuration';

export const reductionBreakpoint = 'sm';

function darken(color: string | undefined, percent: number) {
  return `color-mix(in srgb, ${color}, black ${percent}%)`;
}

export function constructRootLayoutStyle({
  designConfiguration,
}: {
  designConfiguration: DesignConfiguration;
}) {
  return {
    '--primary': designConfiguration?.primaryColor,
    '--primary-foreground': designConfiguration?.primaryTextColor,
    '--secondary': designConfiguration?.secondaryColor,
    '--secondary-foreground': designConfiguration?.secondaryTextColor,
    '--ring': designConfiguration?.primaryColor,
    '--sidebar-accent': `color-mix(in srgb, ${designConfiguration?.primaryColor} 15%, transparent)`,
    '--sidebar-accent-foreground': designConfiguration?.primaryColor,
    '--sidebar-ring': designConfiguration?.primaryColor,
    '--scrollbar-on-secondary': darken(designConfiguration?.secondaryColor, 22),
    '--scrollbar-on-secondary-hover': darken(designConfiguration?.secondaryColor, 45),
  } as React.CSSProperties;
}
