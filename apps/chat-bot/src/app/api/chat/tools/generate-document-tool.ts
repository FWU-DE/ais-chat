import { toolParameters } from '@ais-chat/ai-core/chat/tool-parameters';
import type { ToolCall, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import { z } from 'zod';

import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/tool-result-parsing';
import {
  createGeneratedDocumentFileName,
  GENERATED_DOCUMENT_FORMATS,
  type GeneratedDocumentFormat,
  MAX_FILE_NAME_LENGTH,
} from '@/utils/files/generated-document-format';

import { parseGenericPersistedToolResult } from './parse-persisted-tool-result';
import type { ToolActivity, ToolDefinition, ToolRegistration } from './types';

const MAX_DOCUMENT_CONTENT_LENGTH = 100_000;
const FALLBACK_FILE_NAME = 'Dokument';
const COMPLETE_HTML_DOCUMENT_PATTERN =
  /^\s*<!doctype\s+html\b[\s\S]*<html[\s>][\s\S]*<\/html>\s*$/i;

export const generateDocumentArgsSchema = z
  .object({
    format: z.enum(GENERATED_DOCUMENT_FORMATS),
    title: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
    content: z.string().trim().min(1).max(MAX_DOCUMENT_CONTENT_LENGTH),
  })
  .superRefine(({ format, content }, context) => {
    if (format === 'html' && !COMPLETE_HTML_DOCUMENT_PATTERN.test(content)) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'HTML content must be a complete document starting with <!doctype html>.',
      });
    }
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
      document: { fileName, title, format, content },
    };
  },
  parsePersistedResult: (raw) => parseGenericPersistedToolResult<GenerateDocumentToolResult>(raw),
};

export function buildGenerateDocumentTool(): ToolRegistration<GenerateDocumentToolResult> {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.generateDocument,
    description: `Creates a downloadable ${GENERATED_DOCUMENT_FORMATS.join(', ')} file from Markdown or a complete HTML document. Supports tables, LaTeX formulas, uploaded images and jsxgraph-json plots.`,
    parameters: toolParameters({
      format: {
        type: 'string',
        enum: [...GENERATED_DOCUMENT_FORMATS],
        description: 'The file format the user asked for',
      },
      title: {
        type: 'string',
        description: 'A meaningful title; it becomes the file name.',
        minLength: 1,
        maxLength: MAX_FILE_NAME_LENGTH,
      },
      content: {
        type: 'string',
        description:
          'For docx and pdf, provide the complete document as Markdown. For html, provide a complete HTML document starting with <!doctype html>, including an <html> root element and inline JavaScript where needed.',
        minLength: 1,
        maxLength: MAX_DOCUMENT_CONTENT_LENGTH,
      },
    }),
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
