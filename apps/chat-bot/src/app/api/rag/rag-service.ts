import { ChunkInsertModel, ChunkSourceType, FileModel } from '@shared/db/schema';
import { chunkText } from './chunking';
import { embedText, embedChunks } from './embedding';
import { vectorSearch } from './retrieval';
import { RetrievedChunk, UnembeddedChunk } from './types';
import { VECTOR_SEARCH_LIMIT } from '@/configuration-text-inputs/const';
import { logError } from '@shared/logging';

/**
 * Chunks and embeds text.
 *
 * @param text - Input text
 * @param fileId - The ID to associate chunks with
 * @param sourceUrl - The source URL to associate chunks with
 * @param sourceType - The source type of the chunks ('file' or 'webpage')
 * @param federalStateId - The federal state ID of the user
 * @returns Embedded text chunks ready for DB insertion
 */
export async function chunkAndEmbed({
  text,
  fileId,
  sourceUrl,
  sourceType,
  federalStateId,
}: {
  text: string;
  fileId?: string;
  sourceUrl?: string;
  sourceType?: ChunkSourceType;
  federalStateId: string;
}): Promise<ChunkInsertModel[]> {
  if (text.trim() === '') {
    return [];
  }

  const chunks = await chunkText(text);

  const enrichedChunks: UnembeddedChunk[] = chunks.map((content, index) => ({
    fileId: fileId ?? null,
    sourceUrl: sourceUrl ?? null,
    sourceType,
    content,
    orderIndex: index,
  }));

  return embedChunks({
    chunksWithoutEmbeddings: enrichedChunks,
    federalStateId,
  });
}

/**
 * Retrieves relevant chunks for a given search query using vector search.
 *
 * @param searchQuery - The search query
 * @param federalStateId - The federal state ID of the user
 * @param relatedFileEntities - File entities to search within
 * @param sourceUrls - Optional source URLs to search within
 * @param limit - The maximum number of chunks to retrieve
 * @returns The most relevant chunks
 */
export async function retrieveChunksByQuery({
  searchQuery,
  federalStateId,
  relatedFileEntities,
  sourceUrls,
  limit = VECTOR_SEARCH_LIMIT,
}: {
  searchQuery: string;
  federalStateId: string;
  relatedFileEntities: FileModel[];
  sourceUrls?: string[];
  limit?: number;
}): Promise<RetrievedChunk[]> {
  if (relatedFileEntities.length === 0 && (!sourceUrls || sourceUrls.length === 0)) {
    return [];
  }

  if (searchQuery.trim() === '') {
    return [];
  }

  let queryEmbedding: number[] = [];
  try {
    const [embedding] = await embedText({
      text: [searchQuery],
      federalStateId,
    });
    queryEmbedding = embedding ?? [];
  } catch (error) {
    logError('Failed to generate embedding, returning no chunks:', error);
  }

  // pgvector rejects zero-dimension vectors, so skip the query instead of failing at the DB level
  if (queryEmbedding.length === 0) {
    return [];
  }

  const fileIds = relatedFileEntities.map((file) => file.id);
  const chunks = await vectorSearch({
    embedding: queryEmbedding,
    fileIds,
    sourceUrls,
    limit,
  });

  return chunks;
}
