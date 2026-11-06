'use client';

import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { Label } from '@ui/components/label';
import React, { useEffect, useState } from 'react';

import { createTemplateFromUrlAction } from './actions';

type CreateTemplateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CreateTemplateModal({ isOpen, onClose, onSuccess }: CreateTemplateModalProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = (inputUrl: string): boolean => {
    // Support both full URLs and path-only URLs
    const urlPattern =
      /(?:https?:\/\/[^\/]+)?\/(assistants|characters|learning-scenarios)\/editor\/([a-fA-F0-9-]+)/;
    return urlPattern.test(inputUrl);
  };

  const extractPath = (inputUrl: string): string => {
    // Extract just the path part if it's a full URL
    const urlPattern =
      /(?:https?:\/\/[^\/]+)?(\/(assistants|characters|learning-scenarios)\/editor\/[a-fA-F0-9-]+)/;
    const match = inputUrl.match(urlPattern);
    return match?.[1] ?? inputUrl;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Bitte geben Sie eine URL ein.');
      return;
    }

    if (!validateUrl(url.trim())) {
      setError(
        'URL Format ungültig. URL muss in einem der folgenden Formate sein:\n /custom/editor/{id}\n /characters/editor/{id}\n /learning-scenarios/editor/{id}',
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pathOnly = extractPath(url.trim());
      const resultId = await createTemplateFromUrlAction(pathOnly);

      if (resultId) {
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = React.useCallback(() => {
    setUrl('');
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

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Neue Vorlage aus URL erstellen</h2>

        <p className="text-gray-600 mb-4">
          Geben Sie die URL zu einem bestehenden Dialogpartner oder Assistenten ein, um eine neue
          Vorlage zu erstellen.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="template-url" className="text-sm font-medium">
              URL zum Dialogpartner oder Assistenten
            </Label>
            <Input
              id="template-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://app.ais-chat.schule/custom/editor/12345"
              className="mt-1"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Beispiele: <br />
              • https://app.ais-chat.schule/custom/editor/12345 <br />• /characters/editor/67890
            </p>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded border whitespace-pre-line">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading || !url.trim()}>
              {isLoading ? 'Wird erstellt...' : 'Vorlage erstellen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
