'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Checkbox } from '@ui/components/checkbox';
import MarkdownDisplay from '@/components/chat/markdown-display';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/alert-dialog';

const CHECKLIST_SECTIONS = [
  {
    titleKey: 'community-confirmation.sections.copyright',
    items: [
      { key: 'community-confirmation.items.copyright-material-reviewed' },
      { key: 'community-confirmation.items.copyright-no-protected-upload' },
      { key: 'community-confirmation.items.copyright-image-reviewed' },
      { key: 'community-confirmation.items.copyright-sources-provided' },
    ],
  },
  {
    titleKey: 'community-confirmation.sections.personal-data',
    items: [
      { key: 'community-confirmation.items.personal-no-data' },
      { key: 'community-confirmation.items.personal-no-invitation' },
    ],
  },
  {
    titleKey: 'community-confirmation.sections.ethics',
    items: [
      { key: 'community-confirmation.items.ethics-no-real-person' },
      { key: 'community-confirmation.items.ethics-no-discrimination' },
    ],
  },
  {
    titleKey: 'community-confirmation.sections.content',
    items: [
      { key: 'community-confirmation.items.content-no-extremism-violence-sexualized' },
      { key: 'community-confirmation.items.content-no-false-outdated' },
    ],
  },
  {
    titleKey: 'community-confirmation.sections.terms',
    items: [{ key: 'community-confirmation.items.terms-accepted', useMarkdown: true }],
  },
] as const;

type ChecklistItemKey = (typeof CHECKLIST_SECTIONS)[number]['items'][number]['key'];
type ChecklistState = Record<ChecklistItemKey, boolean>;

function createInitialChecklistState(): ChecklistState {
  return Object.fromEntries(
    CHECKLIST_SECTIONS.flatMap((section) => section.items.map((item) => [item.key, false])),
  ) as ChecklistState;
}

type CustomShareConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
};

export function CustomShareConfirmationDialog({
  open,
  onOpenChange,
  onAccept,
}: CustomShareConfirmationDialogProps) {
  const t = useTranslations('sharing');
  const [checklistState, setChecklistState] = useState<ChecklistState>(createInitialChecklistState);

  const allChecklistItemsChecked = CHECKLIST_SECTIONS.every((section) =>
    section.items.every((item) => checklistState[item.key]),
  );

  function resetChecklist() {
    setChecklistState(createInitialChecklistState());
  }

  function updateChecklist(itemKey: ChecklistItemKey, checked: boolean) {
    setChecklistState((prev) => ({ ...prev, [itemKey]: checked }));
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !allChecklistItemsChecked) {
          return;
        }

        if (!nextOpen) {
          resetChecklist();
        }

        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent
        variant="scrollable"
        size="lg"
        onEscapeKeyDown={(event) => {
          if (!allChecklistItemsChecked) {
            event.preventDefault();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('community-confirmation.title')}</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-6">
          <AlertDialogDescription>{t('community-confirmation.description')}</AlertDialogDescription>
          {CHECKLIST_SECTIONS.map((section) => (
            <section key={section.titleKey} className="space-y-3">
              <div className="font-semibold">{t(section.titleKey)}</div>
              <div className="space-y-2 sm:space-y-3">
                {section.items.map((item) => {
                  const checkboxId = item.key.replaceAll('.', '-');

                  return (
                    <label key={item.key} htmlFor={checkboxId} className="flex items-start gap-3">
                      <Checkbox
                        id={checkboxId}
                        data-testid={checkboxId}
                        className="mt-1"
                        checked={checklistState[item.key]}
                        onCheckedChange={(checked) => updateChecklist(item.key, checked === true)}
                      />
                      {'useMarkdown' in item && item.useMarkdown ? (
                        <div
                          className="flex-1"
                          onClickCapture={(event) => {
                            const target = event.target;
                            if (target instanceof HTMLElement && target.closest('a')) {
                              event.stopPropagation();
                            }
                          }}
                        >
                          <MarkdownDisplay>{t(item.key)}</MarkdownDisplay>
                        </div>
                      ) : (
                        <span>{t(item.key)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <AlertDialogFooter className="mt-4 sm:pt-0">
          <AlertDialogCancel
            data-testid="community-confirmation-cancel"
            onClick={() => {
              onOpenChange(false);
              resetChecklist();
            }}
          >
            {t('community-confirmation.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="community-confirmation-accept"
            disabled={!allChecklistItemsChecked}
            onClick={() => {
              onAccept();
              onOpenChange(false);
              resetChecklist();
            }}
          >
            {t('community-confirmation.accept')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
