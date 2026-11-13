import type { ToolCall, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';

import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/tool-result-parsing';
import {
  createGeneratedDocumentFileName,
  GENERATED_DOCUMENT_FORMATS,
  type GeneratedDocumentFormat,
} from '@/utils/files/generated-document';

import { parseGenericPersistedToolResult } from './parse-persisted-tool-result';
import type { ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const MAX_DOCUMENT_CONTENT_LENGTH = 100_000;
const MAX_DOCUMENT_TITLE_LENGTH = 120;
const FALLBACK_FILE_NAME = 'Dokument';

export const generateDocumentArgsSchema = z.object({
  format: z.enum(GENERATED_DOCUMENT_FORMATS),
  title: z.string().trim().min(1).max(MAX_DOCUMENT_TITLE_LENGTH),
  content: z.string().trim().min(1).max(MAX_DOCUMENT_CONTENT_LENGTH),
});

export type GenerateDocumentToolResult = {
  status: 'created';
  fileName: string;
  format: GeneratedDocumentFormat;
};

export const generateDocumentActivity: ToolActivity<GenerateDocumentToolResult> = {
  createStep: (toolCall: ToolCall) => {
    const parsed = generateDocumentArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    if (!parsed.success) {
      return { kind: 'tool', id: toolCall.id, tool: TOOL_NAMES.generateDocument };
    }

    const { format, title, content } = parsed.data;
    const fileName = createGeneratedDocumentFileName(title, format, FALLBACK_FILE_NAME);
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.generateDocument,
      detail: fileName,
      document: { fileName, format, content },
    };
  },
  parsePersistedResult: (raw) => parseGenericPersistedToolResult<GenerateDocumentToolResult>(raw),
};

export function buildGenerateDocumentTool(): ToolRegistration<GenerateDocumentToolResult> {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.generateDocument,
    description: `Creates a downloadable DOCX or HTML file. Use it only when the user wants a file. If the format or the content is unclear, ask the user first instead of calling this tool. For HTML, provide a complete HTML document with inline JavaScript in the content. JavaScript will execute when the user opens the downloaded file locally; warn the user briefly. The file is shown below your answer with a download button automatically: do not repeat the content in your answer. Images: only images the user uploaded in this chat can be embedded. The result is {"status":"created","fileName":"..."} or {"error":"..."}.`,
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: [...GENERATED_DOCUMENT_FORMATS],
          description: 'The file format the user asked for',
        },
        title: {
          type: 'string',
          description: `A meaningful title; it becomes the file name (max ${MAX_DOCUMENT_TITLE_LENGTH} characters).`,
          minLength: 1,
          maxLength: MAX_DOCUMENT_TITLE_LENGTH,
        },
        content: {
          type: 'string',
          description: `The complete document as Markdown, written in the language of the conversation (max ${MAX_DOCUMENT_CONTENT_LENGTH} characters).`,
          minLength: 1,
          maxLength: MAX_DOCUMENT_CONTENT_LENGTH,
        },
      },
      required: ['format', 'title', 'content'],
      additionalProperties: false,
    },
  };

  const handler = async (
    args: Record<string, unknown>,
  ): ToolOutcome<GenerateDocumentToolResult> => {
    const parsed = generateDocumentArgsSchema.safeParse(args);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return { error: `Invalid arguments (${problems}).` };
    }

    const { format, title } = parsed.data;
    return {
      status: 'created',
      fileName: createGeneratedDocumentFileName(title, format, FALLBACK_FILE_NAME),
      format,
    };
  };

  return {
    definition,
    handler,
    activity: generateDocumentActivity,
  };
}
