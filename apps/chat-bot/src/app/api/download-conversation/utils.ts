import {
  Document,
  Packer,
  Paragraph,
  Table,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  ImageRun,
} from 'docx';
import { type ConversationModel, type ConversationMessageModel } from '@shared/db/types';
import { type FileModel } from '@shared/db/schema';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { markdownToDocx } from './markdown';
import { logError } from '@shared/logging';
import { dbGetModelByName } from '@shared/db/functions/llm-model';
import { getFileFromS3 } from '@shared/s3';
import { getFileExtension, isImageFile } from '@/utils/files/generic';
import { Readable } from 'stream';
import sharp from 'sharp';

const USER_FULL_NAME = 'Nutzer/in';
const EXPORTED_IMAGE_MAX_HEIGHT = 256;
type ExportedImageType = 'jpg' | 'png';

export async function generateConversationDocxFile({
  conversation,
  messages,
  fileMapping,
  gptName,
}: {
  conversation: ConversationModel;
  messages: ConversationMessageModel[];
  fileMapping: Map<string, FileModel[]>;
  gptName: string;
}): Promise<ArrayBuffer | undefined> {
  try {
    const conversationMetadata = getConversationMetadata({
      conversation,
    });
    const messageParagraphs = await getConversationMessages({
      messages,
      fileMapping,
      gptName,
      userFullName: USER_FULL_NAME,
    });

    const lastAssistantMessage = messages.findLast((m) => m.role === 'assistant');

    let modelDisplayName = lastAssistantMessage?.modelName ?? gptName;

    if (lastAssistantMessage?.modelName) {
      const modelDbEntry = await dbGetModelByName(lastAssistantMessage.modelName);
      if (modelDbEntry?.displayName) {
        modelDisplayName = modelDbEntry.displayName;
      }
    }

    messageParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generiert von AIS.chat unter Nutzung von ${modelDisplayName}`,
            italics: true,
            size: 18,
            color: '666666',
          }),
        ],
        spacing: { before: 400 },
      }),
    );

    const doc = buildDocxDocument({ conversationMetadata, messageParagraphs });
    const buffer = await Packer.toArrayBuffer(doc);

    return buffer;
  } catch (error) {
    logError('Error generating conversation .docx file', error);
    return undefined;
  }
}

function getConversationMetadata({ conversation }: { conversation: ConversationModel }) {
  return [
    new Paragraph({
      children: [new TextRun({ text: `Konversation: ${conversation.name}`, bold: true, size: 40 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Erstellt am: ${formatDateToGermanTimestamp(conversation.createdAt)} Uhr`,
          size: 22,
        }),
      ],
    }),
    new Paragraph({}),
  ];
}

type SectionType = Paragraph | Table;
function getConversationMessages({
  messages,
  fileMapping,
  gptName,
  userFullName,
}: {
  messages: ConversationMessageModel[];
  fileMapping: Map<string, FileModel[]>;
  gptName: string;
  userFullName: string;
}): Promise<SectionType[]> {
  return Promise.all(
    messages.map(async (message: ConversationMessageModel) => [
      new Paragraph({
        children: [
          new TextRun({
            text: `${message.role === 'user' ? userFullName : gptName}:`,
            bold: true,
            size: 22,
          }),
        ],
      }),
      ...markdownToDocx(message.content),
      ...(await getImageParagraphsForMessage({ messageId: message.id, fileMapping })),
      new Paragraph({}),
    ]),
  ).then((messageSections) => messageSections.flat());
}

export async function generateConversationMessageDocxFile({
  message,
  fileMapping,
  gptName,
}: {
  message: ConversationMessageModel;
  fileMapping: Map<string, FileModel[]>;
  gptName: string;
}): Promise<ArrayBuffer | undefined> {
  try {
    let modelDisplayName = message.modelName ?? gptName;

    if (message.modelName) {
      const modelDbEntry = await dbGetModelByName(message.modelName);
      if (modelDbEntry?.displayName) {
        modelDisplayName = modelDbEntry.displayName;
      }
    }

    const conversationMetadata = [
      new Paragraph({
        children: [
          new TextRun({
            text: `Erstellt am: ${formatDateToGermanTimestamp(message.createdAt)} Uhr`,
            size: 22,
          }),
        ],
      }),
      new Paragraph({}),
    ];

    const messageParagraphs = [
      ...markdownToDocx(message.content),
      ...(await getImageParagraphsForMessage({ messageId: message.id, fileMapping })),
      new Paragraph({}),
      new Paragraph({
        children: [
          new TextRun({
            text: `Generiert von AIS.chat unter Nutzung von ${modelDisplayName}`,
            italics: true,
            size: 18,
            color: '666666',
          }),
        ],
        spacing: { before: 400 },
      }),
    ];

    const doc = buildDocxDocument({ conversationMetadata, messageParagraphs });
    const buffer = await Packer.toArrayBuffer(doc);

    return buffer;
  } catch (error) {
    logError('Error generating conversation message .docx file', error);
    return undefined;
  }
}

export async function getImageParagraphsForMessage({
  messageId,
  fileMapping,
}: {
  messageId: string | undefined;
  fileMapping: Map<string, FileModel[]>;
}): Promise<Paragraph[]> {
  if (!messageId) {
    return [];
  }

  const imageFiles = (fileMapping.get(messageId) ?? []).filter((file) => isImageFile(file.name));
  const imageParagraphs = await Promise.all(imageFiles.map(getImageParagraph));

  return imageParagraphs.filter((paragraph) => paragraph !== undefined);
}

async function getImageParagraph(file: FileModel): Promise<Paragraph | undefined> {
  try {
    const fileStream = await getFileFromS3(`message_attachments/${file.id}`);
    const imageBuffer = await streamToBuffer(fileStream);
    const { data, type } = await getDocxImageData({ imageBuffer, file });
    const { width, height } = await getExportedImageSize({ imageBuffer, file });

    return new Paragraph({
      children: [
        new ImageRun({
          type,
          data,
          transformation: {
            width,
            height,
          },
        }),
      ],
      spacing: { before: 120, after: 120 },
    });
  } catch (error) {
    logError(`Failed to add image ${file.id} to conversation export`, error);
    return undefined;
  }
}

async function getDocxImageData({
  imageBuffer,
  file,
}: {
  imageBuffer: Buffer;
  file: FileModel;
}): Promise<{ data: Buffer; type: ExportedImageType }> {
  const imageType = getDocxImageType(file.name);

  if (imageType) {
    return {
      data: imageBuffer,
      type: imageType,
    };
  }

  return {
    data: await sharp(imageBuffer).png().toBuffer(),
    type: 'png',
  };
}

function getDocxImageType(fileName: string): ExportedImageType | undefined {
  const extension = getFileExtension(fileName).toLowerCase();

  if (extension === 'jpeg') {
    return 'jpg';
  }

  if (extension === 'jpg' || extension === 'png') {
    return extension;
  }

  return undefined;
}

async function getExportedImageSize({
  imageBuffer,
  file,
}: {
  imageBuffer: Buffer;
  file: FileModel;
}): Promise<{ width: number; height: number }> {
  let width = typeof file.metadata?.width === 'number' ? file.metadata.width : undefined;
  let height = typeof file.metadata?.height === 'number' ? file.metadata.height : undefined;

  if (width === undefined || height === undefined) {
    const metadata = await sharp(imageBuffer).metadata();
    width ??= metadata.width;
    height ??= metadata.height;
  }

  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return {
      width: EXPORTED_IMAGE_MAX_HEIGHT,
      height: EXPORTED_IMAGE_MAX_HEIGHT,
    };
  }

  const scale = Math.min(1, EXPORTED_IMAGE_MAX_HEIGHT / height);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function buildDocxDocument({
  conversationMetadata,
  messageParagraphs,
}: {
  conversationMetadata: Paragraph[];
  messageParagraphs: SectionType[];
}) {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'dgptNumbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.18) },
                },
              },
            },
            {
              level: 1,
              format: 'decimal',
              text: '%2.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.68) },
                },
              },
            },
            {
              level: 2,
              format: 'decimal',
              text: '%3.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(1.18) },
                },
              },
            },
            {
              level: 3,
              format: 'decimal',
              text: '%4.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 2880, hanging: 2420 },
                },
              },
            },
          ],
        },
        {
          reference: 'dgptBullet',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '■',
              alignment: 'left',
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
                },
              },
            },
            {
              level: 1,
              format: 'bullet',
              text: '■',
              alignment: 'left',
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1), hanging: convertInchesToTwip(0.25) },
                },
              },
            },
            {
              level: 2,
              format: 'bullet',
              text: '■',
              alignment: 'left',
              style: {
                paragraph: {
                  indent: { left: 2160, hanging: convertInchesToTwip(0.25) },
                },
              },
            },
            {
              level: 3,
              format: 'bullet',
              text: '■',
              alignment: 'left',
              style: {
                paragraph: {
                  indent: { left: 2880, hanging: convertInchesToTwip(0.25) },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: {
            font: 'Aptos',
          },
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [...conversationMetadata, ...messageParagraphs],
      },
    ],
  });

  return doc;
}
