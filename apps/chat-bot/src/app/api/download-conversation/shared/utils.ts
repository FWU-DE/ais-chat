import {
  Document,
  Packer,
  Paragraph,
  Table,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
} from 'docx';
import { type FileModel } from '@shared/db/schema';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { logError } from '@shared/logging';
import { markdownToDocx } from '../markdown';
import { type ChatMessage as Message } from '@/types/chat';
import { getImageParagraphsForMessage } from '../utils';

export async function generateSharedConversationDocxFiles({
  conversationMessages,
  userFullName,
  fileMapping,
}: {
  conversationMessages: Message[];
  userFullName: string;
  fileMapping: Map<string, FileModel[]>;
}): Promise<
  | {
      buffer: ArrayBuffer;
      messages: Message[];
    }
  | undefined
> {
  try {
    const conversationMetadata = getConversationMetadata();
    const messageParagraphs = await getConversationMessages({
      messages: conversationMessages,
      userFullName,
      fileMapping,
    });

    const doc = buildDocxDocument({ conversationMetadata, messageParagraphs });
    const buffer = await Packer.toArrayBuffer(doc);

    return { buffer, messages: conversationMessages };
  } catch (error) {
    logError('Error generating conversation .docx files', error);
    return undefined;
  }
}

function getConversationMetadata() {
  return [
    new Paragraph({
      children: [new TextRun({ text: `AIS.chat Konversation`, bold: true, size: 40 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Erstellt am: ${formatDateToGermanTimestamp(new Date())} Uhr`,
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
  userFullName,
  fileMapping,
}: {
  messages: Message[];
  userFullName: string;
  fileMapping: Map<string, FileModel[]>;
}): Promise<SectionType[]> {
  return Promise.all(
    messages.map(async (message) => [
      new Paragraph({
        children: [
          new TextRun({
            text: `${message.role === 'user' ? userFullName : 'AIS.chat'}:`,
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
