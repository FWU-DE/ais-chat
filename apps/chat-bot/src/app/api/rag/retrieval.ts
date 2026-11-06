import { db } from '@shared/db';
import { chunkTable, fileTable } from '@shared/db/schema';
import { cosineDistance, eq, inArray, or, type SQL } from 'drizzle-orm';

import { RetrievedChunk } from './types';

/**
 * Finds chunks most similar to the query embedding using cosine similarity (pgvector).
 *
 * @param embedding - The query embedding vector
 * @param fileIds - The IDs of files to search within
 * @param sourceUrls - The source URLs to search within
 * @param limit - Maximum number of results to return
 * @returns Array of chunks sorted by embedding similarity
 */
export async function vectorSearch({
  embedding,
  fileIds,
  sourceUrls,
  limit,
}: {
  embedding: number[];
  fileIds: string[];
  sourceUrls?: string[];
  limit: number;
}): Promise<RetrievedChunk[]> {
  const conditions: SQL[] = [];
  if (fileIds.length > 0) {
    conditions.push(inArray(chunkTable.fileId, fileIds));
  }
  if (sourceUrls && sourceUrls.length > 0) {
    conditions.push(inArray(chunkTable.sourceUrl, sourceUrls));
  }
  if (conditions.length === 0) return [];

  return db
    .select({
      id: chunkTable.id,
      content: chunkTable.content,
      fileId: chunkTable.fileId,
      fileName: fileTable.name,
      orderIndex: chunkTable.orderIndex,
      sourceType: chunkTable.sourceType,
      sourceUrl: chunkTable.sourceUrl,
    })
    .from(chunkTable)
    .leftJoin(fileTable, eq(chunkTable.fileId, fileTable.id))
    .where(or(...conditions))
    .limit(limit)
    .orderBy(cosineDistance(chunkTable.embedding, embedding));
}
