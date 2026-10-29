'use client';

import { ImageSquareIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function CustomChatAvatarImage({ pictureUrl }: { pictureUrl: string | undefined }) {
  const t = useTranslations('custom-chat.image');

  return (
    <div className="relative w-35 h-35 justify-center items-center flex">
      {pictureUrl ? (
        <Image
          src={pictureUrl}
          fill
          unoptimized
          alt={t('profile-picture')}
          className="rounded-full"
          priority
        />
      ) : (
        <div className="rounded-full bg-primary/7 flex items-center justify-center w-full h-full">
          <ImageSquareIcon className="text-primary/30 rounded-full size-18" weight="thin" />
        </div>
      )}
    </div>
  );
}
