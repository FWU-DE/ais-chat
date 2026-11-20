'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { EntityRef } from '@shared/entities/entity-types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@ui/components/alert-dialog';
import { Field, FieldGroup, FieldLabel } from '@ui/components/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { Textarea } from '@ui/components/textarea';
import { useMessages } from 'next-intl';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod';

import { createSuspensionRequestAction } from '@/app/(authed)/(chat-bot)/actions/suspension-actions';

import { useToast } from '../common/toast';

const FORM_ID = 'create-suspension-form';

const suspensionFormValuesSchema = z.object({
  reason: z.string().min(1),
  description: z.string().max(500),
});

type CustomChatCreateSuspensionDialogProps = {
  trigger: React.ReactElement;
  entityRef: EntityRef;
};

export function CustomChatCreateSuspensionDialog({
  trigger,
  entityRef,
}: CustomChatCreateSuspensionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const toast = useToast();
  const tMessages = useMessages();
  const { entityType } = entityRef;
  const tEntityMessages = tMessages.suspension[entityType];
  const tReasons = tMessages.suspension['create-dialog-reasons'];

  const reasons = [
    { value: 'copyright_violation', label: tReasons['copyright-violation'] },
    { value: 'false_or_outdated_information', label: tReasons['false-or-outdated-information'] },
    { value: 'insufficient_sources', label: tReasons['insufficient-sources'] },
    { value: 'discrimination', label: tReasons['discrimination'] },
    { value: 'personal_data_usage_or_query', label: tReasons['personal-data-usage-or-query'] },
    { value: 'violence_or_extremist_content', label: tReasons['violence-or-extremist-content'] },
    { value: 'sexualized_content', label: tReasons['sexualized-content'] },
    { value: 'other', label: tReasons['other'] },
  ] as const;

  const form = useForm<z.infer<typeof suspensionFormValuesSchema>>({
    resolver: zodResolver(suspensionFormValuesSchema),
    mode: 'onChange',
    defaultValues: {
      reason: '',
      description: '',
    },
  });

  async function onSubmit(data: z.infer<typeof suspensionFormValuesSchema>) {
    const result = await createSuspensionRequestAction({
      ...entityRef,
      reason: data.reason,
      description: data.description,
    });

    if (result.success) {
      toast.success(tEntityMessages['create-dialog-success-message']);
    } else {
      toast.error(result.error.message);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      form.reset();
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tEntityMessages['create-dialog-title']}</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            {tMessages.suspension['create-dialog-description']}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="suspension-reason" required>
                    {tMessages.suspension['create-dialog-reason-label']}
                  </FieldLabel>
                  <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="suspension-reason">
                      <SelectValue
                        placeholder={tMessages.suspension['create-dialog-reason-placeholder']}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {reasons.map((reason) => (
                          <SelectItem key={reason.value} value={reason.value}>
                            {reason.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="suspension-description">
                    {tMessages.suspension['create-dialog-description-label']}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="suspension-description"
                    maxLength={500}
                    className="min-h-36 max-h-60 resize-none"
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <AlertDialogFooter>
          <AlertDialogCancel>
            {tMessages.suspension['create-dialog-cancel-button-text']}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="default"
            type="submit"
            form={FORM_ID}
            disabled={!form.formState.isValid}
          >
            {tEntityMessages['create-dialog-confirm-button-text']}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
