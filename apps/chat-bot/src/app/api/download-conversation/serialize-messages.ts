import { isImageFile } from '@/utils/files/generic';
import { getReadOnlySignedUrl } from '@shared/s3';

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

export async function serializeMessages({
  messages,
  fileMapping,
}: {
  messages: SerializableMessage[];
  fileMapping: Map<string, SerializableFile[]>;
}) {
  return Promise.all(
    messages.map(async ({ id, role, content }) => ({
      id,
      role,
      content,
      images: await Promise.all(
        (fileMapping.get(id) ?? [])
          .filter((file) => isImageFile(file.name))
          .map(async (file) => ({
            alt: file.name,
            url: await getReadOnlySignedUrl({
              key: `message_attachments/${file.id}`,
              filename: file.name,
              contentType: file.type,
              attachment: false,
              options: { expiresIn: 300 },
            }),
          })),
      ),
    })),
  );
}
