'use client';

import { useEffect, useState } from 'react';
import { ConversationMessageModel } from '@shared/db/types';
import { FileModel } from '@shared/db/schema';
import { logError } from '@shared/logging';
import { getReadOnlySignedUrlAction } from '@/app/api/file-operations/actions';
import { isImageFile } from '@/utils/files/generic';
import { ImageVersion } from './image-generation-types';

interface UseImageVersionsArgs {
  initialMessages?: ConversationMessageModel[];
  fileMapping?: Map<string, FileModel[]>;
}

interface UseImageVersionsResult {
  versions: ImageVersion[];
  selectedIndex: number;
  selectedVersion: ImageVersion | null;
  setSelectedIndex: (index: number) => void;
  appendVersion: (version: ImageVersion) => void;
}

async function buildInitialVersions(
  initialMessages: ConversationMessageModel[],
  fileMapping: Map<string, FileModel[]>,
): Promise<ImageVersion[]> {
  const sorted = [...initialMessages].sort((a, b) => a.orderNumber - b.orderNumber);

  const versions = await Promise.all(
    sorted.map(async (assistant, i): Promise<ImageVersion | null> => {
      if (assistant.role !== 'assistant') return null;
      const user = sorted[i - 1];
      if (user?.role !== 'user') return null;

      const imageFile = (fileMapping.get(assistant.id) ?? []).find((f) => isImageFile(f.name));
      if (!imageFile) return null;

      try {
        const signedUrl = await getReadOnlySignedUrlAction({
          key: `message_attachments/${imageFile.id}`,
          contentType: imageFile.type,
          attachment: false,
        });

        if (!signedUrl) return null;

        return {
          userMessageId: user.id,
          assistantMessageId: assistant.id,
          prompt: user.content,
          imageUrl: signedUrl,
          imageFileId: imageFile.id,
          attachedFiles: (fileMapping.get(user.id) ?? []).filter((f) => isImageFile(f.name)),
        };
      } catch (error) {
        logError('Error loading image version:', error);
        return null;
      }
    }),
  );

  return versions.filter((v): v is ImageVersion => v !== null);
}

export function useImageVersions({
  initialMessages = [],
  fileMapping,
}: UseImageVersionsArgs): UseImageVersionsResult {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  useEffect(() => {
    if (initialMessages.length < 2 || !fileMapping) return;

    void (async () => {
      const initialVersions = await buildInitialVersions(initialMessages, fileMapping);
      if (initialVersions.length === 0) return;
      setVersions(initialVersions);
      setSelectedIndex(initialVersions.length - 1);
    })();
  }, [initialMessages, fileMapping]);

  const appendVersion = (version: ImageVersion) => {
    setVersions((prev) => {
      const next = [...prev, version];
      setSelectedIndex(next.length - 1);
      return next;
    });
  };

  return {
    versions,
    selectedIndex,
    selectedVersion: versions[selectedIndex] ?? null,
    setSelectedIndex,
    appendVersion,
  };
}
