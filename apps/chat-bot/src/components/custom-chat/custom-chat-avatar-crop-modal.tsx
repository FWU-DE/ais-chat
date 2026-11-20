'use client';

import 'react-image-crop/dist/ReactCrop.css';

import { Button } from '@ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import React from 'react';
import ReactCrop, { centerCrop, Crop, makeAspectCrop, PixelCrop } from 'react-image-crop';

import { CompressionOptions, getCroppedImageBlob } from '@/utils/files/image-utils';

import { useToast } from '../common/toast';

type AvatarCropModalProps = {
  imageSrc: string;
  aspect: number;
  circularCrop?: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob) => Promise<void>;
  compressionOptions?: CompressionOptions;
};

export default function AvatarCropModal({
  imageSrc,
  aspect,
  circularCrop = false,
  onClose,
  onCropComplete,
  compressionOptions,
}: AvatarCropModalProps) {
  const [crop, setCrop] = React.useState<Crop>();
  const [completedCrop, setCompletedCrop] = React.useState<PixelCrop>();
  const [isUploading, setIsUploading] = React.useState(false);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const cropViewportRef = React.useRef<HTMLDivElement | null>(null);
  const toast = useToast();
  const t = useTranslations('custom-chat.image');
  const tCommon = useTranslations('common');

  function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
    return centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        aspect,
        mediaWidth,
        mediaHeight,
      ),
      mediaWidth,
      mediaHeight,
    );
  }

  function onImageLoad(width: number, height: number) {
    const newCrop = centerAspectCrop(width, height, aspect);
    setCrop(newCrop);

    requestAnimationFrame(() => {
      const container = cropViewportRef.current;
      const image = imageRef.current;

      if (!container || !image) {
        return;
      }

      const targetLeft = image.offsetLeft + image.clientWidth / 2 - container.clientWidth / 2;
      const targetTop = image.offsetTop + image.clientHeight / 2 - container.clientHeight / 2;

      container.scrollTo({
        left: Math.max(0, targetLeft),
        top: Math.max(0, targetTop),
      });
    });
  }

  async function handleCropConfirm() {
    if (!completedCrop || !imageRef.current) {
      toast.error(t('toasts.image-toast-error'));
      return;
    }
    setIsUploading(true);
    try {
      const croppedBlob = await getCroppedImageBlob(
        imageRef.current,
        completedCrop,
        compressionOptions,
      );
      await onCropComplete(croppedBlob);
    } catch {
      toast.error(t('toasts.image-toast-error'));
    } finally {
      setIsUploading(false);
    }
  }

  function onChange(newCrop: Crop) {
    const MIN_CROP_SIZE = 10;
    if (
      newCrop.width &&
      newCrop.height &&
      newCrop.width >= MIN_CROP_SIZE &&
      newCrop.height >= MIN_CROP_SIZE
    ) {
      setCrop(newCrop);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('crop-image')}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
    >
      <Card className="w-full max-w-xl max-h-[90vh] gap-4 py-4 sm:py-6">
        <CardHeader className="shrink-0 pl-8">
          <CardTitle>{t('crop-image')}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div
            ref={cropViewportRef}
            className="min-h-0 flex-1 overflow-auto overscroll-contain touch-pan-y p-2"
          >
            <ReactCrop
              crop={crop}
              onChange={onChange}
              onComplete={(c: PixelCrop) => setCompletedCrop(c)}
              aspect={aspect}
              circularCrop={circularCrop}
              keepSelection
            >
              <Image
                alt={t('crop-image')}
                src={imageSrc}
                width={500}
                height={500}
                onLoad={({ currentTarget: img }) => {
                  if (img instanceof HTMLImageElement) {
                    imageRef.current = img;
                    onImageLoad(img.naturalWidth, img.naturalHeight);
                  }
                }}
                className="h-auto w-auto max-w-none"
                // Has to be set as a separate style because ReactCrop.css sets explicitly touchAction: 'none' on the image,
                // which has to be overridden here to allow mobile user to scroll the image in the background.
                style={{ touchAction: 'pan-y' }}
              />
            </ReactCrop>
          </div>
          <div className="mt-4 flex shrink-0 justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline" disabled={isUploading}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleCropConfirm} type="button" disabled={isUploading}>
              {t('upload-image')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
