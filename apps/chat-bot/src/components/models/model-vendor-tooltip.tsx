'use client';

import { VENDORS } from '@ais-chat/shared-core/schemas/llm-model-vendor';
import { ModelVendorIcon } from '@ui/components/icons/model-vendor-icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ui/components/tooltip';
import { useTranslations } from 'next-intl';

export function ModelVendorTooltip({ vendor }: { vendor: string | null }) {
  const t = useTranslations('models');
  const knownVendor = VENDORS.find((known) => known === vendor);
  const label = knownVendor
    ? t('vendor-tooltip', { vendor: t(`vendors.${knownVendor}`) })
    : t('vendor-unknown');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ModelVendorIcon vendor={vendor} className="size-4.5" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
