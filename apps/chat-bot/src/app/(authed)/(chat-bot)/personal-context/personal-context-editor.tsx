'use client';

import { PERSONAL_CONTEXT_MAX_CHARS } from '@shared/personal-context/personal-context-document';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { Switch } from '@ui/components/switch';
import { Textarea } from '@ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/common/toast';

import {
  setPersonalContextAutoUpdateEnabledAction,
  setPersonalContextEnabledAction,
  updatePersonalContextAction,
} from './actions';

export function PersonalContextEditor({
  initialContent,
  initialEnabled,
  initialAutoUpdateEnabled,
}: {
  initialContent: string;
  initialEnabled: boolean;
  initialAutoUpdateEnabled: boolean;
}) {
  const t = useTranslations('personal-context');
  const toast = useToast();

  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(initialAutoUpdateEnabled);
  const [isSaving, startSaving] = useTransition();

  const isDirty = content !== savedContent;

  function handleSave() {
    startSaving(async () => {
      const result = await updatePersonalContextAction({ content });

      if (result.success) {
        setSavedContent(content);
        toast.success(t('toasts.saved'));
        return;
      }

      toast.error(t('toasts.save-error'));
    });
  }

  function handleToggle(checked: boolean) {
    const previous = enabled;
    setEnabled(checked);

    startSaving(async () => {
      const result = await setPersonalContextEnabledAction({ enabled: checked });

      if (!result.success) {
        setEnabled(previous);
        toast.error(t('toasts.save-error'));
      }
    });
  }

  function handleClear() {
    setContent('');
  }

  function handleAutoUpdateToggle(checked: boolean) {
    const previous = autoUpdateEnabled;
    setAutoUpdateEnabled(checked);

    startSaving(async () => {
      const result = await setPersonalContextAutoUpdateEnabledAction({ enabled: checked });

      if (!result.success) {
        setAutoUpdateEnabled(previous);
        toast.error(t('toasts.save-error'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">{t('heading')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              aria-label={t('toggle-label')}
            />
            <span className="font-medium">{t('toggle-label')}</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('toggle-description')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={autoUpdateEnabled}
              onCheckedChange={handleAutoUpdateToggle}
              disabled={!enabled}
              aria-label={t('auto-update-toggle-label')}
            />
            <span className="font-medium">{t('auto-update-toggle-label')}</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('auto-update-toggle-description')}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <label htmlFor="personal-context-content" className="font-medium">
          {t('editor-label')}
        </label>
        <p className="text-sm text-muted-foreground">{t('editor-description')}</p>
        <Textarea
          id="personal-context-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={PERSONAL_CONTEXT_MAX_CHARS}
          placeholder={t('editor-placeholder')}
          disabled={!enabled}
          className="min-h-80 font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={!isDirty || isSaving}>
          {t('save')}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={content.length === 0 || isSaving}>
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
