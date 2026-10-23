'use client';

import { updateUserSettingsAction } from '@/app/(authed)/(chat-bot)/actions';
import { useToast } from '@/components/common/toast';
import { SpeechVoicePreviewButton } from '@/components/custom-chat/speech/speech-voice-preview-button';
import { useUserSettings } from '@/components/providers/user-settings-provider';
import { deepEqual } from '@/utils/object';
import { GearSixIcon } from '@phosphor-icons/react';
import type { SpeechVoice, UserSettings } from '@shared/db/schema';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/dialog';
import { DropdownMenuItem } from '@ui/components/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { Separator } from '@ui/components/separator';
import { Switch } from '@ui/components/switch';
import { InfoTooltip } from '@ui/components/tooltip';
import { useTranslations } from 'next-intl';
import React from 'react';

export function SettingsDialog({
  open,
  onOpenChange,
  restoreFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('settings');
  const toast = useToast();
  const { settings, setSettings, speechVoices } = useUserSettings();

  const [draftSettings, setDraftSettings] = React.useState<UserSettings>(settings);
  const [wasOpen, setWasOpen] = React.useState(open);
  // Settings of a save that is still in flight; the provider does not know them yet.
  const [pendingSettings, setPendingSettings] = React.useState<UserSettings | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraftSettings(pendingSettings ?? settings);
    }
  }

  async function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (nextOpen || deepEqual(draftSettings, pendingSettings ?? settings)) {
      return;
    }

    setPendingSettings(draftSettings);
    try {
      const result = await updateUserSettingsAction({ settings: draftSettings });
      if (result.success) {
        setSettings(result.value);
        toast.success(t('toasts.save-success'));
      } else {
        toast.error(t('toasts.save-error'));
      }
    } catch {
      // The server action rejects on transport failures, e.g. a lost connection.
      toast.error(t('toasts.save-error'));
    } finally {
      // A later save may already have replaced the pending settings.
      setPendingSettings((current) => (current === draftSettings ? null : current));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
      {open && (
        <SettingsDialogContent
          settings={draftSettings}
          speechVoices={speechVoices}
          onChange={setDraftSettings}
          restoreFocusRef={restoreFocusRef}
        />
      )}
    </Dialog>
  );
}

function SettingsDialogContent({
  settings,
  speechVoices,
  onChange,
  restoreFocusRef,
}: {
  settings: UserSettings;
  speechVoices: SpeechVoice[];
  onChange: (settings: UserSettings) => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  return (
    <DialogContent
      className="max-w-[min(42rem,calc(100%-2rem))]"
      // Opened programmatically, so Radix has no trigger to restore focus to.
      onCloseAutoFocus={(event) => {
        if (!restoreFocusRef?.current) return;
        event.preventDefault();
        restoreFocusRef.current.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('title')}</DialogDescription>
      </DialogHeader>
      {speechVoices.length > 0 && (
        <SpeechSettingsSection
          settings={settings}
          speechVoices={speechVoices}
          onChange={onChange}
        />
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">{tCommon('close')}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}

export function SettingsMenuItem({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations('settings');
  // extend if more settings are added
  const { speechVoices } = useUserSettings();

  if (speechVoices.length === 0) {
    return null;
  }

  return (
    <DropdownMenuItem key="profile-menu-settings" onSelect={onSelect} className="text-primary">
      <GearSixIcon />
      {t('menu-label')}
    </DropdownMenuItem>
  );
}

function SpeechSettingsSection({
  settings,
  speechVoices,
  onChange,
}: {
  settings: UserSettings;
  speechVoices: SpeechVoice[];
  onChange: (settings: UserSettings) => void;
}) {
  const t = useTranslations('settings');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <span className="leading-none">{t('default-voice-label')}</span>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Select
            value={settings.defaultSpeechVoice || undefined}
            onValueChange={(value) => onChange({ ...settings, defaultSpeechVoice: value })}
          >
            <SelectTrigger
              aria-label={t('default-voice-label')}
              data-testid="settings-default-voice-select"
              className="text-base"
            >
              <SelectValue placeholder={t('voice-placeholder')} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {speechVoices.map((voice) => (
                  <SelectItem key={voice.name} value={voice.name} className="text-base">
                    {voice.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <SpeechVoicePreviewButton voice={settings.defaultSpeechVoice ?? ''} />
        </div>
      </div>
      <Separator />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="leading-none">{t('speech-only-label')}</span>
          <InfoTooltip tooltip={t('speech-only-tooltip')} ariaLabel={t('speech-only-label')} />
        </div>
        <Switch
          checked={settings.defaultIsSpeechOnly === true}
          onCheckedChange={(checked) => onChange({ ...settings, defaultIsSpeechOnly: checked })}
          aria-label={t('speech-only-label')}
          data-testid="settings-speech-only-switch"
          className="self-end sm:self-auto"
        />
      </div>
    </div>
  );
}
