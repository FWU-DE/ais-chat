'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { CheckIcon, PenIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { FormField } from '@ui/components/form/form-field';

const editFormSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich'),
  orderNumber: z
    .number({ error: 'Die Ordnungsnummer muss eine nicht-negative ganze Zahl sein' })
    .int('Die Nummer muss eine nicht-negative ganze Zahl sein')
    .nonnegative('Die Nummer muss eine nicht-negative ganze Zahl sein'),
});

type EditForm = z.infer<typeof editFormSchema>;

export type EditUrlPresetFormProps = {
  currentName: string;
  existingNames: string[];
  currentOrderNumber: number;
  onUpdate: ({ name, orderNumber }: { name: string; orderNumber: number }) => Promise<void>;
};

export function EditUrlPresetForm({
  currentName,
  existingNames,
  currentOrderNumber,
  onUpdate,
}: EditUrlPresetFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    reset,
    setError,
  } = useForm<EditForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name: currentName, orderNumber: currentOrderNumber },
  });

  function enterEditMode() {
    reset({ name: currentName, orderNumber: currentOrderNumber });
    setIsEditing(true);
  }

  function cancelEdit() {
    reset({ name: currentName, orderNumber: currentOrderNumber });
    setIsEditing(false);
  }

  async function onSubmit(data: EditForm) {
    const name = data.name.trim();
    if (name === currentName && data.orderNumber === currentOrderNumber) {
      setIsEditing(false);
      return;
    }
    if (name !== currentName) {
      const isDuplicate = existingNames.some(
        (existing) => existing.trim().toLowerCase() === name.toLowerCase(),
      );
      if (isDuplicate) {
        setError('name', { message: 'Dieser Name ist bereits vergeben' });
        return;
      }
    }

    await onUpdate({ name, orderNumber: data.orderNumber });
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <>
        <span className="text-xl">{currentName}</span>
        <Button variant="ghost" onClick={enterEditMode} aria-label="Preset bearbeiten">
          <PenIcon />
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-3">
      <FormField name="name" control={control} label="Name" placeholder="Name" />
      <FormField name="orderNumber" control={control} label="Reihenfolge" type="number" />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={cancelEdit}
          aria-label="Abbrechen"
        >
          <XIcon />
        </Button>
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={isSubmitting}
          aria-label="Speichern"
        >
          <CheckIcon />
        </Button>
      </div>
    </form>
  );
}
