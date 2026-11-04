import { isImageFile } from '@/utils/files/generic';

type SerializableMessage = {
  id: string;
  role: string;
  content: string;
};

type SerializableFile = {
  id: string;
  name: string;
  type: string;
};

export async function serializeMessages<TFile extends SerializableFile>({
  messages,
  fileMapping,
  imageUrl,
}: {
  messages: SerializableMessage[];
  fileMapping: Map<string, TFile[]>;
  imageUrl?: (file: TFile) => string;
}) {
  return Promise.all(
    messages.map(async ({ id, role, content }) => ({
      role,
      content,
      images: await Promise.all(
        (fileMapping.get(id) ?? [])
          .filter((file) => isImageFile(file.name))
          .map((file) => ({
            alt: file.name,
            url: imageUrl?.(file) ?? `/api/files/${file.id}/scaled-image?width=200&height=320`,
          })),
      ),
    })),
  );
}
