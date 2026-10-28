import { VECTOR_SEARCH_LIMIT } from '@/configuration-text-inputs/const';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/tool-result-parsing';
import type { ToolCall, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import { dbGetAllChunks } from '@shared/db/functions/files';
import { z } from 'zod';
import { ingestWebContent } from '../../rag/ingestWebContent';
import { retrieveChunksByQuery } from '../../rag/rag-service';
import { parseGenericPersistedToolResult } from './parse-persisted-tool-result';
import type { BuildToolsContext, ToolActivity, ToolDefinition, ToolRegistration } from './types';

export const retrieveTextChunksArgsSchema = z.object({
  search: z.string().trim().min(1),
});

type SemanticFileSearchChunkResult = {
  fileName: string | null;
  orderIndex: number | null;
  content: string | null;
};

export type SemanticFileSearchToolResponse = {
  chunks: SemanticFileSearchChunkResult[];
  notice?: string;
};

// An `error` explaining empty `chunks` isn't a failure, removing the `error` property in that case.
const legacyEmptyChunksResultSchema = z
  .object({ chunks: z.tuple([]), error: z.string() })
  .transform(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ error, ...rest }) => rest,
  );

export const retrieveTextChunksActivity: ToolActivity<SemanticFileSearchToolResponse> = {
  createStep: (toolCall: ToolCall) => {
    const parsed = retrieveTextChunksArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
    return {
      kind: 'tool',
      id: toolCall.id,
      tool: TOOL_NAMES.retrieveTextChunks,
      detail: parsed.success ? parsed.data.search : undefined,
    };
  },
  parsePersistedResult: (raw) => {
    const generic = parseGenericPersistedToolResult<SemanticFileSearchToolResponse>(raw);
    const legacy = legacyEmptyChunksResultSchema.safeParse(generic);
    return legacy.success ? legacy.data : generic;
  },
};

function formatRetrievedChunksForTool(chunks: Awaited<ReturnType<typeof retrieveChunksByQuery>>) {
  const formattedChunks: SemanticFileSearchChunkResult[] = chunks.map((chunk) => ({
    fileName: chunk.fileName ?? null,
    orderIndex: chunk.orderIndex ?? null,
    content: chunk.content ?? null,
  }));

  return {
    chunks: formattedChunks,
    ...(formattedChunks.length === 0 && {
      notice: 'No matching chunks found.',
    }),
  };
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
}: BuildRetrieveTextChunksToolParams): ToolRegistration<SemanticFileSearchToolResponse> | null {
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

  const handler = async (
    args: Record<string, unknown>,
  ): ToolOutcome<SemanticFileSearchToolResponse> => {
    const parsed = retrieveTextChunksArgsSchema.safeParse(args);

    if (!parsed.success) {
      return { error: 'Missing search query.' };
    }

    let processedSourceUrls = attachedSourceUrls;

    if (attachedSourceUrls.length > 0) {
      const { processedUrls } = await ingestWebContent({
        urls: attachedSourceUrls,
        federalStateId: user.federalState.id,
      });

      processedSourceUrls = processedUrls;
    }

    const search = parsed.data.search;

    // Fetch at most VECTOR_SEARCH_LIMIT + 1 chunks to cheaply check whether
    // the total fits within the limit without pulling the full dataset.
    const fileIds = relatedFileEntities.map((f) => f.id);
    const allChunks = await dbGetAllChunks({
      fileIds,
      sourceUrls: processedSourceUrls,
      limit: VECTOR_SEARCH_LIMIT + 1,
    });

    if (allChunks.length <= VECTOR_SEARCH_LIMIT) {
      const chunks = allChunks.map((chunk) => ({
        fileName: chunk.fileName,
        orderIndex: chunk.orderIndex,
        content: chunk.content,
      }));

      return {
        chunks,
        ...(chunks.length === 0 && {
          notice: 'No matching chunks found.',
        }),
      };
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
    activity: retrieveTextChunksActivity,
  };
}
