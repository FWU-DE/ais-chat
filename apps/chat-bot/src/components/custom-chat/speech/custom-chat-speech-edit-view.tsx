'use client';

import { useTranslations } from 'next-intl';
import { CustomChatHeading2 } from '../custom-chat-heading2';
import { Card, CardContent } from '@ui/components/card';
import { FieldValues } from 'react-hook-form';
import { SpeechEditView, SpeechEditViewProps } from './speech-edit-view';

type CustomChatSpeechEditViewProps<TFieldValues extends FieldValues = FieldValues> =
  SpeechEditViewProps<TFieldValues>;

export function CustomChatSpeechEditView<TFieldValues extends FieldValues = FieldValues>(
  props: CustomChatSpeechEditViewProps<TFieldValues>,
) {
  const t = useTranslations('custom-chat.speech');

  return (
    <div className="flex flex-col gap-3 mt-10">
      <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
      <Card>
        <CardContent>
          <SpeechEditView {...props} />
        </CardContent>
      </Card>
    </div>
  );
}
