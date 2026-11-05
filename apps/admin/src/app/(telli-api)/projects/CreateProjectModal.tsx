'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { Label } from '@ui/components/label';
import { toast } from 'sonner';
import { createProjectAction } from './actions';

type CreateProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id.trim()) {
      setError('Projekt-ID ist erforderlich');
      return;
    }

    if (!name.trim()) {
      setError('Projektname ist erforderlich');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createProjectAction(id, name);
      toast.success('Projekt erfolgreich erstellt');
      handleClose();
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Ein unerwarteter Fehler ist aufgetreten';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = React.useCallback(() => {
    setId('');
    setName('');
    setError(null);
    onClose();
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/25 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Neues Projekt erstellen</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label htmlFor="projectId">Projekt-ID</Label>
            <Input
              id="projectId"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Geben Sie die Projekt-ID ein..."
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="projectName">Projektname</Label>
            <Input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Geben Sie den Projektnamen ein..."
              disabled={isLoading}
            />
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Wird erstellt...' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
