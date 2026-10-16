import { RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT } from '@/configuration-text-inputs/const';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/tool-result-parsing';
import type { ToolCall, ToolErrorResult, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import { dbGetExtractedFileContent } from '@shared/db/functions/files';
import type { FileModel } from '@shared/db/schema';
import { z } from 'zod';
import { parseGenericPersistedToolResult } from './parse-persisted-tool-result';
import type { BuildToolsContext, ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const retrieveEntireFileArgsSchema = z.object({
  fileName: z.string().trim().min(1),
});

export type RetrieveEntireFileToolResponse = {
  fileName: string | null;
  content: string | null;
  characterCount: number;
  maxCharacters: number;
  notice?: string;
};

export const retrieveEntireFileActivity: ToolActivity<RetrieveEntireFileToolResponse> = {
  createStep: (toolCall: ToolCall) => {
    const parsed = retrieveEntireFileArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.retrieveEntireFile,
      detail: parsed.success ? parsed.data.fileName : undefined,
    };
  },
  parsePersistedResult: (raw) => {
    const generic = parseGenericPersistedToolResult<RetrieveEntireFileToolResponse>(raw);
    if (generic === undefined) {
      return generic;
    }

    // Rename `error` to `notice` and drop `truncated: true` when it flagged truncation, rather than a failure.
    const { error, truncated, ...rest } = generic as RetrieveEntireFileToolResponse &
      ToolErrorResult & { truncated?: unknown };
    if (truncated === true) {
      return { ...rest, notice: error } as RetrieveEntireFileToolResponse;
    }

    return generic;
  },
};

function truncateToCharacterLimit(text: string, maxCharacters: number) {
  return text.slice(0, maxCharacters);
}

async function formatEntireFileForTool(file: FileModel) {
  const content = await dbGetExtractedFileContent(file.id);
  const characterCount = content.length;
  const truncatedContent = truncateToCharacterLimit(content, RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT);
  const truncated = truncatedContent.length !== content.length;

  const notice = !content
    ? 'No usable content found.'
    : truncated
      ? 'File content was truncated to fit the character limit.'
      : undefined;

  const response: RetrieveEntireFileToolResponse = {
    fileName: file.name ?? null,
    content: content.length > 0 ? truncatedContent : null,
    characterCount,
    maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
    ...(notice && { notice }),
  };

  return response;
}

type BuildRetrieveEntireFileToolParams = Pick<BuildToolsContext, 'relatedFileEntities'>;

export function buildRetrieveEntireFileTool({
  relatedFileEntities,
}: BuildRetrieveEntireFileToolParams): ToolRegistration<RetrieveEntireFileToolResponse> | null {
  if (relatedFileEntities.length === 0) {
    return null;
  }

  const attachedFileDescriptions = relatedFileEntities.map(
    (file) => `${file.name} (${file.size} bytes)`,
  );

  const definition: ToolDefinition = {
    name: TOOL_NAMES.retrieveEntireFile,
    description: `Retrieve the full content of one attached file by name. Available files right now: ${attachedFileDescriptions.join(', ') || 'none'}. Use this tool when you need the full text of a specific attached file instead of only relevant excerpts. The returned content is capped at ${RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT} characters.`,
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'The exact name of the attached file to retrieve.',
        },
      },
      required: ['fileName'],
      additionalProperties: false,
    },
  };

  const handler = async (
    args: Record<string, unknown>,
  ): ToolOutcome<RetrieveEntireFileToolResponse, { fileName?: string }> => {
    const parsed = retrieveEntireFileArgsSchema.safeParse(args);

    if (!parsed.success) {
      return { error: 'Missing file name.' };
    }

    const fileName = parsed.data.fileName;
    const matchedFile = relatedFileEntities.find((file) => file.name === fileName);

    if (!matchedFile) {
      return { error: 'File not found.', fileName };
    }

    return formatEntireFileForTool(matchedFile);
  };

  return {
    definition,
    handler,
    activity: retrieveEntireFileActivity,
  };
}
