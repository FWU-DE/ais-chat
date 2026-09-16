'use client';

import React from 'react';
import { useToast } from '../common/toast';
import { CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { logError } from '@shared/logging';
import { Button } from '@ui/components/button';
import { Switch } from '@ui/components/switch';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { bakeAiBadge } from '@/utils/images/bake-ai-badge';
import aiBadge from '@/assets/ai-badge.png';

interface ImageActionButtonsProps {
  imageRef: React.RefObject<HTMLImageElement | null>;
  fileId: string;
  isImageReady: boolean;
  showAiBadge: boolean;
  onShowAiBadgeChange: (checked: boolean) => void;
}

export function ImageActionButtons({
  imageRef,
  fileId,
  isImageReady,
  showAiBadge,
  onShowAiBadgeChange,
}: ImageActionButtonsProps) {
  const toast = useToast();
  const t = useTranslations('image-generation');

  async function handleCopyImage() {
    try {
      const img = imageRef.current;
      if (!img || !img.complete) {
        throw new Error('Image not loaded');
      }

      // construct ClipboardItem with a Promise for Safari compatibility
      const blobPromise: Promise<Blob> = showAiBadge
        ? bakeAiBadge(img.currentSrc, aiBadge.src)
        : new Promise<Blob>((resolve, reject) => {
            // Create a canvas in memory without adding it to the DOM
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }

            try {
              ctx.drawImage(img, 0, 0);
            } catch (drawError) {
              reject(drawError);
              return;
            }

            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create image blob'));
              }
            }, 'image/png');
          });

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast.success(t('copy-image-success'));
    } catch (error) {
      logError('Failed to copy image to clipboard', error);
      toast.error(t('copy-image-error'));
    }
  }

  async function handleDownloadImage() {
    try {
      const img = imageRef.current;
      if (!img || !img.complete || !img.currentSrc) {
        throw new Error('Image not loaded');
      }

      let blob: Blob;
      if (showAiBadge) {
        blob = await bakeAiBadge(img.currentSrc, aiBadge.src);
      } else {
        const response = await fetch(img.currentSrc);
        if (!response.ok) {
          throw new Error('Failed to fetch image for download');
        }
        blob = await response.blob();
      }

      downloadFileFromBlob(blob, `AIS.chat-Bild-${fileId}.png`);
    } catch (error) {
      logError('Failed to download image', error);
      toast.error(t('download-image-error'));
    }
  }

  return (
    <div className="flex mt-1.5 items-center justify-between">
      <div className="flex">
        <Button
          onClick={handleCopyImage}
          variant="ghost"
          size="icon-sm"
          title={t('copy-image-tooltip')}
          aria-label={t('copy-image-tooltip')}
          data-testid="image-copy-button"
          disabled={!isImageReady}
        >
          <CopyIcon />
        </Button>
        <Button
          onClick={handleDownloadImage}
          variant="ghost"
          size="icon-sm"
          title={t('download-image-tooltip')}
          aria-label={t('download-image-tooltip')}
          data-testid="image-download-button"
          disabled={!isImageReady}
        >
          <DownloadSimpleIcon />
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Switch
          checked={showAiBadge}
          onCheckedChange={onShowAiBadgeChange}
          disabled={!isImageReady}
        />
        <span>{t('ai-badge-toggle-label')}</span>
      </label>
    </div>
  );
}
