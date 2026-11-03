'use client';

import { DIDACTIC_COMMENTARY_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { Textarea } from '@ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import { CustomChatHeading2 } from '../custom-chat-heading2';

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
  const { field } = useController({
    name: 'didacticCommentary' as FieldPath<TFieldValues & DidacticCommentaryFields>,
    control,
  });
  const [isOpen, setIsOpen] = useState(() => String(field.value ?? '').trim() !== '');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-10 flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <CustomChatHeading2 text={t('heading')} tooltip={tooltip} />
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('toggle-aria-label')}
            data-testid="didactic-commentary-toggle"
          >
            {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              {...field}
              value={field.value ?? ''}
              id={field.name}
              aria-label={t('heading')}
              data-testid="didactic-commentary-input"
              className="h-27 resize-y"
              maxLength={DIDACTIC_COMMENTARY_LENGTH_LIMIT}
              maxLengthErrorMessage={t('max-length', {
                maxLength: DIDACTIC_COMMENTARY_LENGTH_LIMIT,
              })}
              onBlur={() => {
                field.onBlur();
                onBlur();
              }}
            />
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
