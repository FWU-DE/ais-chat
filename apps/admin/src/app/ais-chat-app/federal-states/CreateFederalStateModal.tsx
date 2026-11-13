'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { logError } from '@shared/logging';
import { Button } from '@ui/components/button';
import { FormField } from '@ui/components/form/form-field';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { FormErrorDisplay } from '@/components/FormErrorDisplay';
import { ROUTES } from '@/consts/routes';

import { createFederalStateAction } from './[federalStateId]/actions';

export type CreateFederalStateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

// Minimal form schema - only mandatory fields without defaults
export const createFederalStateFormSchema = z.object({
  id: z.string().min(1, 'ID ist erforderlich'),
});

export type CreateFederalStateForm = z.infer<typeof createFederalStateFormSchema>;

export function CreateFederalStateModal(props: CreateFederalStateModalProps) {
  const { isOpen, onClose, onSuccess } = props;
  const router = useRouter();

  const {
    control,
    formState: { isValid, errors, isSubmitting },
    handleSubmit,
    reset,
  } = useForm({
    resolver: zodResolver(createFederalStateFormSchema),
  });

  async function onSubmit(data: CreateFederalStateForm) {
    if (!isValid) {
      toast.error('Das Formular enthält ungültige Werte.');
      return;
    }

    try {
      await createFederalStateAction({
        id: data.id,
      });

      toast.success('Bundesland erfolgreich erstellt');
      reset();
      onClose();
      if (onSuccess) {
        onSuccess();
      }
      router.push(ROUTES.app.federalStateDetails(data.id));
    } catch (error) {
      logError('Error creating federal state', error);
      toast.error('Fehler beim Erstellen des Bundeslands');
    }
  }

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  }, [isSubmitting, reset, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/25 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Neues Bundesland erstellen</h2>

        <FormErrorDisplay errors={errors} />

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField
            name="id"
            label="ID"
            description="Eindeutige ID des Bundeslandes (z.B. DE-BY, DE-NW)."
            control={control}
            required
            autoFocusWhenEmpty
          />

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Wird erstellt...' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
