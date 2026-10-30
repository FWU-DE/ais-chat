'use client';

import { LICENSE_INFORMATION_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { COPYRIGHT_OVERVIEW_URL } from '@/components/navigation/const';
import { CaretDownIcon, CaretRightIcon, CaretUpIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { Textarea } from '@ui/components/textarea';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import { CustomChatHeading2 } from '../custom-chat-heading2';

export type LicenseInformationFields = { licenseInformation: string };

type CustomChatLicenseInformationEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  control: Control<TFieldValues & LicenseInformationFields>;
  onBlur: () => void;
};

export function CustomChatLicenseInformationEditView<
  TFieldValues extends FieldValues = FieldValues,
>({ control, onBlur }: CustomChatLicenseInformationEditViewProps<TFieldValues>) {
  const t = useTranslations('custom-chat.license-information');
  const { field } = useController({
    name: 'licenseInformation' as FieldPath<TFieldValues & LicenseInformationFields>,
    control,
  });
  const [isOpen, setIsOpen] = useState(() => String(field.value ?? '').trim() !== '');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-10 flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <CustomChatHeading2 text={t('heading')} tooltip={t('heading-tooltip')} />
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('toggle-aria-label')}
            data-testid="license-information-toggle"
          >
            {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Link
              href={COPYRIGHT_OVERVIEW_URL}
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
            >
              {t('copyright-link')}
              <CaretRightIcon aria-hidden="true" />
            </Link>
            <Textarea
              {...field}
              value={field.value ?? ''}
              id={field.name}
              aria-label={t('heading')}
              data-testid="license-information-input"
              className="h-27 resize-y"
              maxLength={LICENSE_INFORMATION_LENGTH_LIMIT}
              maxLengthErrorMessage={t('max-length', {
                maxLength: LICENSE_INFORMATION_LENGTH_LIMIT,
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
