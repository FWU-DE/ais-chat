'use client';

import { LICENSE_INFORMATION_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { COPYRIGHT_OVERVIEW_URL } from '@/components/navigation/const';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { CustomChatCollapsibleTextareaField } from '../custom-chat-collapsible-textarea-field';

export type LicenseInformationFields = { licenseInformation: string };

type CustomChatLicenseInformationEditViewProps<TFieldValues extends FieldValues = FieldValues> = {
  control: Control<TFieldValues & LicenseInformationFields>;
  onBlur: () => void;
};

export function CustomChatLicenseInformationEditView<
  TFieldValues extends FieldValues = FieldValues,
>({ control, onBlur }: CustomChatLicenseInformationEditViewProps<TFieldValues>) {
  const t = useTranslations('custom-chat.license-information');

  return (
    <CustomChatCollapsibleTextareaField
      control={control}
      name={'licenseInformation' as FieldPath<TFieldValues & LicenseInformationFields>}
      label={t('heading')}
      tooltip={t('heading-tooltip')}
      toggleAriaLabel={t('toggle-aria-label')}
      maxLength={LICENSE_INFORMATION_LENGTH_LIMIT}
      maxLengthErrorMessage={t('max-length', {
        maxLength: LICENSE_INFORMATION_LENGTH_LIMIT,
      })}
      toggleTestId="license-information-toggle"
      inputTestId="license-information-input"
      onBlur={onBlur}
    >
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
    </CustomChatCollapsibleTextareaField>
  );
}
