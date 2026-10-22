'use client';

import { useTranslations } from 'next-intl';
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { Card, CardContent } from '@ui/components/card';
import { CustomChatHeading2 } from '../custom-chat-heading2';
import { SpeechFields } from './speech.types';

type CustomChatSpeechViewProps = Pick<SpeechFields, 'isSpeechEnabled'>;

export function CustomChatSpeechView(props: CustomChatSpeechViewProps) {
  const t = useTranslations('custom-chat.speech');

  return (
    <div className="flex flex-col gap-3 mt-10">
      <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
      <Card>
        <CardContent>
          <div className="flex items-center gap-2">
            {props.isSpeechEnabled ? (
              <>
                <CheckCircleIcon className="size-6.5 shrink-0 text-success" />
                <span>{t('activated')}</span>
              </>
            ) : (
              <>
                <XCircleIcon className="size-6.5 shrink-0 text-muted-foreground" />
                <span>{t('deactivated')}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
