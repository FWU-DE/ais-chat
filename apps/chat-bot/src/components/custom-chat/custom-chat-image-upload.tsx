import { AVATAR_MAX_SIZE } from '@/const';
import { ImageSquareIcon, UploadIcon } from '@phosphor-icons/react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { Input } from '@ui/components/input';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import React from 'react';
import { useToast } from '../common/toast';
import AvatarCropModal from './custom-chat-avatar-crop-modal';

type AvatarUploadResult = {
  picturePath: string;
  signedUrl?: string;
};

export function CustomChatImageUpload({
  avatarPictureUrl,
  onUploadPicture,
}: {
  avatarPictureUrl?: string;
  onUploadPicture: (croppedImageBlob: Blob) => Promise<ServerActionResult<AvatarUploadResult>>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [imageSource, setImageSource] = React.useState<string | null>(null);
  const [showCropModal, setShowCropModal] = React.useState<boolean>(false);
  const [displayedAvatarUrl, setDisplayedAvatarUrl] = React.useState<string | undefined>(
    avatarPictureUrl,
  );

  const toast = useToast();
  const t = useTranslations('custom-chat.image');
  const tFileInteraction = useTranslations('file-interaction');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files === null) return;
    const firstFile = files[0];
    if (!firstFile) return;
    setFile(firstFile);

    const reader = new FileReader();
    reader.onload = () => {
      setImageSource(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(firstFile);
    event.target.value = '';
  }

  async function handleCroppedImage(croppedBlob: Blob) {
    if (!croppedBlob || !file) return;

    const result = await onUploadPicture(croppedBlob);

    if (result.success && result.value) {
      if (result.value.signedUrl) {
        setDisplayedAvatarUrl(result.value.signedUrl);
      }
      setShowCropModal(false);
    } else {
      toast.error(tFileInteraction('toasts.upload-error'));
      setShowCropModal(false);
    }
    setFile(null);
    setImageSource(null);
  }

  return (
    <Card className="justify-center items-center">
      <CardContent className="flex items-center gap-4 flex-wrap justify-center">
        <div className="relative w-35 h-35 justify-center items-center flex">
          {displayedAvatarUrl ? (
            <Image
              src={displayedAvatarUrl}
              fill
              unoptimized
              alt={t('uploaded-profile-picture')}
              className="rounded-full"
              priority
            />
          ) : (
            <div className="rounded-full bg-primary/7 flex items-center justify-center w-full h-full">
              <ImageSquareIcon className="text-primary/30 rounded-full size-18" weight="thin" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            className="hidden"
            onChange={handleImageUpload}
            ref={fileInputRef}
            aria-label={t('upload-image')}
          />
          <Button type="button" onClick={handleButtonClick}>
            <UploadIcon weight="regular" />
            {t('upload-image')}
          </Button>
        </div>
      </CardContent>
      {showCropModal && imageSource && (
        <AvatarCropModal
          imageSrc={imageSource}
          aspect={1}
          circularCrop
          onClose={() => {
            setShowCropModal(false);
            setFile(null);
            setImageSource(null);
          }}
          onCropComplete={handleCroppedImage}
          compressionOptions={{ maxWidth: AVATAR_MAX_SIZE, maxHeight: AVATAR_MAX_SIZE }}
        />
      )}
    </Card>
  );
}
