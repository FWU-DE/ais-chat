'use client';

import { SpeakerSimpleHighIcon, SpeakerSimpleSlashIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

type ShowAudioPlayerButtonProps = {
  isSpeechModelEnabled: boolean;
  onShowPlayerChanged: (showPlayer: boolean) => void;
};

export default function ShowAudioPlayerButton({
  isSpeechModelEnabled,
  onShowPlayerChanged,
}: ShowAudioPlayerButtonProps) {
  const tCommon = useTranslations('common');
  const [showPlayer, setShowPlayer] = React.useState<boolean>(false);

  async function handleClick() {
    setShowPlayer(!showPlayer);
    onShowPlayerChanged(!showPlayer);

    return;
  }

  if (!isSpeechModelEnabled) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
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
