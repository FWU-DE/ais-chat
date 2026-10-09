import { RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT } from '@/configuration-text-inputs/const';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { dbGetExtractedFileContent } from '@shared/db/functions/files';
import type { FileModel } from '@shared/db/schema';
import { z } from 'zod';
import type { BuildToolsContext, ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const retrieveEntireFileArgsSchema = z.object({
  fileName: z.string(),
});

export type RetrieveEntireFileToolResponse = {
  fileName: string | null;
  content: string | null;
  truncated: boolean;
  characterCount: number;
  maxCharacters: number;
  error: string | null;
};

export const retrieveEntireFileActivity: ToolActivity<RetrieveEntireFileToolResponse> = {
  createStep: (toolCall: ToolCall) => {
    const parsed = retrieveEntireFileArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.retrieveEntireFile,
      detail: parsed.success ? parsed.data.fileName.trim() : undefined,
    };
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

  const response: RetrieveEntireFileToolResponse = {
    fileName: file.name ?? null,
    content: content.length > 0 ? truncatedContent : null,
    truncated,
    characterCount,
    maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
    error: null,
  };

  if (!content) {
    response.error = 'No usable content found.';
  } else if (truncated) {
    response.error = 'File content was truncated to fit the character limit.';
  }

  return response;
}

type BuildRetrieveEntireFileToolParams = Pick<BuildToolsContext, 'relatedFileEntities'>;

export function buildRetrieveEntireFileTool({
  relatedFileEntities,
}: BuildRetrieveEntireFileToolParams): ToolRegistration<
  typeof TOOL_NAMES.retrieveEntireFile,
  RetrieveEntireFileToolResponse
> | null {
  if (relatedFileEntities.length === 0) {
    return null;
  }

  const attachedFileDescriptions = relatedFileEntities.map(
    (file) => `${file.name} (${file.size} bytes)`,
  );

  const definition: ToolDefinition<typeof TOOL_NAMES.retrieveEntireFile> = {
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

  const handler = async (args: Record<string, unknown>) => {
    const parsed = retrieveEntireFileArgsSchema.safeParse(args);
    const fileName = parsed.success ? parsed.data.fileName.trim() : '';

    if (fileName.length === 0) {
      const response: RetrieveEntireFileToolResponse = {
        fileName: null,
        content: null,
        truncated: false,
        characterCount: 0,
        maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
        error: 'Missing file name.',
      };

      return response;
    }

    const matchedFile = relatedFileEntities.find((file) => file.name === fileName);

    if (matchedFile === undefined) {
      const response: RetrieveEntireFileToolResponse = {
        fileName,
        content: null,
        truncated: false,
        characterCount: 0,
        maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
        error: 'File not found.',
      };

      return response;
    }

    return formatEntireFileForTool(matchedFile);
  };

  return {
    definition,
    handler,
    activity: retrieveEntireFileActivity,
  };
}
