'use client';

import { DIDACTIC_COMMENTARY_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { useTranslations } from 'next-intl';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { CustomChatCollapsibleTextareaField } from '../custom-chat-collapsible-textarea-field';

export type DidacticCommentaryFields = { didacticCommentary: string };

type CustomChatDidacticCommentaryEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  control: Control<TFieldValues & DidacticCommentaryFields>;
  onBlur: () => void;
  tooltip: string;
};

export function CustomChatDidacticCommentaryEditView<
  TFieldValues extends FieldValues = FieldValues,
>({ control, onBlur, tooltip }: CustomChatDidacticCommentaryEditViewProps<TFieldValues>) {
  const t = useTranslations('custom-chat.didactic-commentary');

  return (
    <CustomChatCollapsibleTextareaField
      control={control}
      name={'didacticCommentary' as FieldPath<TFieldValues & DidacticCommentaryFields>}
      label={t('heading')}
      tooltip={tooltip}
      toggleAriaLabel={t('toggle-aria-label')}
      maxLength={DIDACTIC_COMMENTARY_LENGTH_LIMIT}
      maxLengthErrorMessage={t('max-length', {
        maxLength: DIDACTIC_COMMENTARY_LENGTH_LIMIT,
      })}
      toggleTestId="didactic-commentary-toggle"
      inputTestId="didactic-commentary-input"
      onBlur={onBlur}
    />
  );
}
