'use client';

import { Card, CardContent } from '@ui/components/card';
import { useTranslations } from 'next-intl';
import { FieldValues } from 'react-hook-form';

import { CustomChatHeading2 } from '../custom-chat-heading2';
import { WebSearchEditView, WebSearchEditViewProps } from './web-search-edit-view';

type CustomChatWebSearchEditViewProps<TFieldValues extends FieldValues = FieldValues> =
  WebSearchEditViewProps<TFieldValues>;

export function CustomChatWebSearchEditView<TFieldValues extends FieldValues = FieldValues>(
  props: CustomChatWebSearchEditViewProps<TFieldValues>,
) {
  const t = useTranslations('custom-chat.web-search');

  return (
    <div className="flex flex-col gap-3 mt-10">
      <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
      <Card>
        <CardContent>
          <WebSearchEditView {...props} />
        </CardContent>
      </Card>
    </div>
  );
}
