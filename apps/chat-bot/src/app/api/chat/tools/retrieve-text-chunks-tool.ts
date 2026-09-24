import { VECTOR_SEARCH_LIMIT } from '@/configuration-text-inputs/const';
import { z } from 'zod';
import { ingestWebContent } from '../../rag/ingestWebContent';
import { retrieveChunksByQuery } from '../../rag/rag-service';
import type { BuildToolsContext, ToolDefinition, ToolRegistration } from './types';
import { dbGetAllChunks } from '@shared/db/functions/files';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { TOOL_NAMES } from '@/types/tool-names';

export const retrieveTextChunksArgsSchema = z.object({
  search: z.string(),
});

type SemanticFileSearchChunkResult = {
  fileName: string | null;
  orderIndex: number | null;
  content: string | null;
};

type SemanticFileSearchToolResponse = {
  chunks: SemanticFileSearchChunkResult[];
  error: string | null;
};

function formatRetrievedChunksForTool(chunks: Awaited<ReturnType<typeof retrieveChunksByQuery>>) {
  const formattedChunks: SemanticFileSearchChunkResult[] = chunks.map((chunk) => ({
    fileName: chunk.fileName ?? null,
    orderIndex: chunk.orderIndex ?? null,
    content: chunk.content ?? null,
  }));

  const response: SemanticFileSearchToolResponse = {
    chunks: formattedChunks,
    error: null,
  };

  if (chunks.length === 0) {
    response.error = 'No matching chunks found.';
  }

  return JSON.stringify(response);
}

type BuildRetrieveTextChunksToolParams = Pick<
  BuildToolsContext,
  'user' | 'relatedFileEntities' | 'sourceUrls' | 'attachedLinks'
>;

export function buildRetrieveTextChunksTool({
  user,
  relatedFileEntities,
  sourceUrls,
  attachedLinks,
}: BuildRetrieveTextChunksToolParams): ToolRegistration | null {
  const attachedSourceUrls = sourceUrls.length > 0 ? sourceUrls : attachedLinks;

  if (relatedFileEntities.length === 0 && attachedSourceUrls.length === 0) {
    return null;
  }

  const attachedFileDescriptions = relatedFileEntities.map(
    (file) => `${file.name} (${file.size} bytes)`,
  );

  const definition: ToolDefinition = {
    name: TOOL_NAMES.retrieveTextChunks,
    description:
      'Retrieve relevant text chunks from the attached sources. ' +
      `${attachedFileDescriptions.length > 0 ? `Available files right now: ${attachedFileDescriptions.join(', ')}.` : ''} ` +
      `${attachedSourceUrls.length > 0 ? `Available linked web pages right now: ${attachedSourceUrls.join(', ')}.` : ''} ` +
      'Use this tool when you need exact passages from the files or linked web pages or want to inspect a specific topic inside the available sources. ' +
      "Call this tool BEFORE answering or claiming you don't know something, whenever the question could relate to the sources' topic. " +
      `Returns up to ${VECTOR_SEARCH_LIMIT} chunks per call. Call it with a short, specific search string in the same language as the user.`,
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'A concise search string that captures the exact topic or passage you want to retrieve.',
        },
      },
      required: ['search'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>) => {
    const parsed = retrieveTextChunksArgsSchema.safeParse(args);
    let processedSourceUrls = attachedSourceUrls;

    if (attachedSourceUrls.length > 0) {
      const { processedUrls } = await ingestWebContent({
        urls: attachedSourceUrls,
        federalStateId: user.federalState.id,
      });

      processedSourceUrls = processedUrls;
    }

    const search = parsed.success ? parsed.data.search : '';

    // Fetch at most VECTOR_SEARCH_LIMIT + 1 chunks to cheaply check whether
    // the total fits within the limit without pulling the full dataset.
    const fileIds = relatedFileEntities.map((f) => f.id);
    const allChunks = await dbGetAllChunks({
      fileIds,
      sourceUrls: processedSourceUrls,
      limit: VECTOR_SEARCH_LIMIT + 1,
    });

    if (allChunks.length <= VECTOR_SEARCH_LIMIT) {
      const response: SemanticFileSearchToolResponse = {
        chunks: allChunks.map((chunk) => ({
          fileName: chunk.fileName,
          orderIndex: chunk.orderIndex,
          content: chunk.content,
        })),
        error: allChunks.length === 0 ? 'No matching chunks found.' : null,
      };
      return JSON.stringify(response);
    }

    return formatRetrievedChunksForTool(
      await retrieveChunksByQuery({
        searchQuery: search,
        federalStateId: user.federalState.id,
        relatedFileEntities,
        sourceUrls: processedSourceUrls,
        limit: VECTOR_SEARCH_LIMIT,
      }),
    );
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        return {
          kind: 'tool',
          id: toolCall.id,
          tool: TOOL_NAMES.retrieveTextChunks,
        };
      },
    },
  };
}
