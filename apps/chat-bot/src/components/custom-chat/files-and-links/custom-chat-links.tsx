'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { WebSource } from '@shared/db/types';
import { utils } from '@shared/utils';
import { Button } from '@ui/components/button';
import { Chip } from '@ui/components/chip';
import { Input } from '@ui/components/input';
import { useTranslations } from 'next-intl';
import React from 'react';

import { useToast } from '@/components/common/toast';
import { ingestWebContentAction } from '@/components/custom-chat/files-and-links/actions';
import {
  NUMBER_OF_LINKS_LIMIT_FOR_SHARED_CHAT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
} from '@/configuration-text-inputs/const';

export type CustomChatLinksProps = {
  initialLinks: WebSource[];
  // If onLinksChange is undefined, the component will be in read-only mode
  onLinksChange?: (links: string[]) => Promise<{ success: boolean }>;
};

export function CustomChatLinks({ initialLinks, onLinksChange }: CustomChatLinksProps) {
  const [links, setLinks] = React.useState<WebSource[]>(initialLinks);
  const [currentLink, setCurrentLink] = React.useState('');
  const [processingLinks, setProcessingLinks] = React.useState<Set<string>>(new Set());
  const toast = useToast();
  const t = useTranslations('custom-chat.links');
  const isReadonly = onLinksChange === undefined;

  async function handleAddLink() {
    if (isReadonly) return;

    const normalizedLink = currentLink.trim();

    if (normalizedLink === '') {
      toast.error(t('empty-error'));
      return;
    }

    const linkExists = links.find((item) => item.link === normalizedLink);
    if (linkExists !== undefined) {
      toast.error(t('duplicate-error'));
      setCurrentLink('');
      return;
    }

    const parsedUrls = utils.url.parseHyperlinks(normalizedLink);
    if (!parsedUrls || parsedUrls[0] !== normalizedLink) {
      toast.error(t('invalid-error'));
      return;
    }

    const newLink: WebSource = { link: normalizedLink };
    const updatedLinks = [...links, newLink];
    setLinks(updatedLinks);
    setCurrentLink('');

    setProcessingLinks((prev) => new Set(prev).add(normalizedLink));

    const ingestResult = await ingestWebContentAction({ url: normalizedLink });
    if (!ingestResult.success || ingestResult.value.errorUrls.length > 0) {
      setLinks((current) => current.filter((item) => item.link !== normalizedLink));
      toast.error(t('loading-error'));
    } else {
      const saveResult = await onLinksChange(updatedLinks.map((l) => l.link));
      if (!saveResult.success) {
        setLinks((current) => current.filter((item) => item.link !== normalizedLink));
        toast.error(t('saving-error'));
      }
    }

    setProcessingLinks((prev) => {
      const next = new Set(prev);
      next.delete(normalizedLink);
      return next;
    });
  }

  async function handleDeleteLink(index: number) {
    if (isReadonly) return;

    const linkToDelete = links[index];
    if (linkToDelete === undefined) return;

    const updatedLinks = links.filter((_, i) => i !== index);
    setLinks(updatedLinks);

    const result = await onLinksChange(updatedLinks.map((l) => l.link));
    if (!result.success) {
      setLinks((current) => [...current.slice(0, index), linkToDelete, ...current.slice(index)]);
      toast.error(t('delete-error'));
    }
  }

  const maxLinksReached = links.length >= NUMBER_OF_LINKS_LIMIT_FOR_SHARED_CHAT;

  return (
    <div className="flex flex-col gap-4">
      {!isReadonly && (
        // the breakpoint is lg because the sidebar collapses at sm, we want the input to be big enough also between sm and lg
        <div className="flex w-full flex-col gap-2 lg:flex-row">
          <Input
            wrapperClassName="flex-1"
            type="url"
            placeholder={t('placeholder')}
            maxLength={TEXT_INPUT_FIELDS_LENGTH_LIMIT}
            showCharacterCount={false}
            value={currentLink}
            disabled={maxLinksReached}
            aria-label={t('aria-input')}
            onChange={(e) => setCurrentLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLink();
              }
            }}
          />
          <Button
            className="self-center"
            disabled={maxLinksReached}
            onClick={handleAddLink}
            aria-label={t('aria-add-link')}
          >
            <PlusIcon className="size-4" />
            {t('add-link')}
          </Button>
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link, index) => {
            const isProcessing = processingLinks.has(link.link);
            const displayTitle = utils.url.getDisplayUrl(link.link);
            return (
              <Chip
                key={`${displayTitle}_${index}`}
                href={link.link}
                label={displayTitle}
                ariaDeleteLabel={t('aria-delete', { link: displayTitle })}
                onDelete={() => handleDeleteLink(index)}
                isProcessing={isProcessing}
                tooltip={link.link}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
