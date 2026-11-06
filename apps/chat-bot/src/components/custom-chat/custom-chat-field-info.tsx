import { InfoTooltip } from '@ui/components/tooltip';
import type { ReactNode } from 'react';

export function CustomChatFieldInfo({
  label,
  value,
  tooltip,
  fallback = '–',
}: {
  label: string;
  value: ReactNode;
  tooltip?: string;
  fallback?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-base">
      <div className="inline-flex items-center gap-1 font-semibold">
        <span>{label}</span>
        {tooltip ? <InfoTooltip tooltip={tooltip} ariaLabel={label} /> : null}
      </div>
      <div className="whitespace-pre-wrap font-normal">{value ?? fallback}</div>
    </div>
  );
}
