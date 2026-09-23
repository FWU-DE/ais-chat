'use client';

import Image from 'next/image';
import loadingGif from '@/assets/loading-transparent.gif';
import type { AiActivityStep } from '@/types/ai-activity';
import { useCurrentActivityLabel } from './activity/use-current-activity-label';

export default function LoadingAnimation({
  activitySteps = [],
}: {
  activitySteps?: AiActivityStep[];
}) {
  const currentActivityLabel = useCurrentActivityLabel(activitySteps);

  return (
    <div className="text-secondary-foreground flex w-fit items-center gap-2 m-4">
      <Image src={loadingGif} alt="Ladeanimation" width="107" height="107" unoptimized />
      {currentActivityLabel !== undefined && (
        <span className="text-sm" aria-live="polite">
          {currentActivityLabel}
        </span>
      )}
    </div>
  );
}
