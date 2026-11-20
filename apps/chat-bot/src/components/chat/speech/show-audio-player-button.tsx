'use client';

import { SpeakerSimpleHighIcon, SpeakerSimpleSlashIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';

type ShowAudioPlayerButtonProps = {
  isSpeechModelEnabled: boolean;
  showPlayer: boolean;
  onToggle: () => void;
};

/** Controlled toggle for showing/hiding the `AudioPlayer`. */
export default function ShowAudioPlayerButton({
  isSpeechModelEnabled,
  showPlayer,
  onToggle,
}: ShowAudioPlayerButtonProps) {
  const tCommon = useTranslations('common');

  if (!isSpeechModelEnabled) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={showPlayer ? tCommon('hide-audio-player') : tCommon('show-audio-player')}
      title={showPlayer ? tCommon('hide-audio-player') : tCommon('show-audio-player')}
      className="text-primary"
      data-testid="show-audio-player-button"
    >
      {showPlayer ? (
        <SpeakerSimpleSlashIcon className="size-4 text-primary" />
      ) : (
        <SpeakerSimpleHighIcon className="size-4 text-primary" />
      )}
    </Button>
  );
}
