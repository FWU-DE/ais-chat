import { RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT } from '@/configuration-text-inputs/const';
import { dbGetExtractedFileContent } from '@shared/db/functions/files';
import type { FileModel } from '@shared/db/schema';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { parseJsonRecord, readString, truncate } from '@/utils/chat/ai-activity';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';

type RetrieveEntireFileToolResponse = {
  fileName: string | null;
  content: string | null;
  truncated: boolean;
  characterCount: number;
  maxCharacters: number;
  error: string | null;
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

  return JSON.stringify(response);
}

type BuildRetrieveEntireFileToolParams = Pick<BuildToolsContext, 'relatedFileEntities'>;

export function buildRetrieveEntireFileTool({
  relatedFileEntities,
}: BuildRetrieveEntireFileToolParams): ToolRegistration | null {
  if (relatedFileEntities.length === 0) {
    return null;
  }

  const attachedFileDescriptions = relatedFileEntities.map(
    (file) => `${file.name} (${file.size} bytes)`,
  );

  const definition: ToolDefinition = {
    name: 'retrieve_entire_file',
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
    const fileName = typeof args.fileName === 'string' ? args.fileName.trim() : '';

    if (fileName.length === 0) {
      const response: RetrieveEntireFileToolResponse = {
        fileName: null,
        content: null,
        truncated: false,
        characterCount: 0,
        maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
        error: 'Missing file name.',
      };

      return JSON.stringify(response);
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

      return JSON.stringify(response);
    }

    return formatEntireFileForTool(matchedFile);
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const args = parseJsonRecord(toolCall.arguments);
        return {
          kind: 'tool' as const,
          id: toolCall.id,
          tool: 'retrieve_entire_file' as const,
          detail: truncate(readString(args, 'fileName')),
        };
      },
    },
  };
}
