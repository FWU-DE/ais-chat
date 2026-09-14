import {
  type SQL,
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
} from 'drizzle-orm';
import { db } from '..';
import {
  AssistantFileMapping,
  assistantTable,
  CharacterFileMapping,
  characterTable,
  ChunkInsertModel,
  chunkTable,
  ConversationMessageFileMappingTable,
  conversationTable,
  federalStateTable,
  FileInsertModel,
  FileMetadata,
  FileModel,
  fileTable,
  LearningScenarioFileMapping,
  learningScenarioTable,
} from '../schema';
import { logDebug } from '@shared/logging';

export async function linkFilesToConversation({
  conversationMessageId,
  conversationId,
  fileIds,
}: {
  conversationMessageId: string;
  conversationId: string;
  fileIds: string[];
}) {
  if (fileIds.length === 0) return;
  await db
    .insert(ConversationMessageFileMappingTable)
    .values(fileIds.map((fileId) => ({ conversationMessageId, fileId, conversationId })))
    .onConflictDoNothing({
      target: [
        ConversationMessageFileMappingTable.conversationMessageId,
        ConversationMessageFileMappingTable.fileId,
      ],
    });
}

export async function dbDetachFilesFromConversationMessages(messageIds: string[]) {
  if (messageIds.length === 0) return;

  await db
    .delete(ConversationMessageFileMappingTable)
    .where(inArray(ConversationMessageFileMappingTable.conversationMessageId, messageIds));
}

export async function dbVerifyFileOwnership({
  fileId,
  userId,
}: {
  fileId: string;
  userId: string;
}): Promise<boolean> {
  // Check ownership via conversation mapping (for files already linked to a message)
  const mappingResult = await db
    .select({ fileId: ConversationMessageFileMappingTable.fileId })
    .from(ConversationMessageFileMappingTable)
    .innerJoin(
      conversationTable,
      eq(ConversationMessageFileMappingTable.conversationId, conversationTable.id),
    )
    .where(
      and(
        eq(ConversationMessageFileMappingTable.fileId, fileId),
        eq(conversationTable.userId, userId),
      ),
    )
    .limit(1);
  if (mappingResult.length > 0) return true;

  // Fallback: check direct ownership on file_table (for files uploaded but not yet linked to a conversation)
  const fileResult = await db
    .select({ id: fileTable.id })
    .from(fileTable)
    .where(and(eq(fileTable.id, fileId), eq(fileTable.userId, userId)))
    .limit(1);
  return fileResult.length > 0;
}

export async function dbGetRelatedFiles(conversationId: string): Promise<Map<string, FileModel[]>> {
  const files = await db
    .select({
      foreignId: ConversationMessageFileMappingTable.conversationMessageId,
      fileId: ConversationMessageFileMappingTable.fileId,
      name: fileTable.name,
      type: fileTable.type,
      size: fileTable.size,
      createdAt: fileTable.createdAt,
      metadata: fileTable.metadata,
      userId: fileTable.userId,
    })
    .from(ConversationMessageFileMappingTable)
    .innerJoin(fileTable, eq(ConversationMessageFileMappingTable.fileId, fileTable.id))
    .where(eq(ConversationMessageFileMappingTable.conversationId, conversationId));

  const resultMap = convertToMap(files);
  return resultMap;
}

export async function dbGetRelatedLearningScenarioFiles(
  learningScenarioId?: string,
): Promise<FileModel[]> {
  if (learningScenarioId === undefined) return [];
  const files = await db
    .select({
      id: LearningScenarioFileMapping.fileId,
      name: fileTable.name,
      type: fileTable.type,
      size: fileTable.size,
      createdAt: fileTable.createdAt,
      metadata: fileTable.metadata,
      userId: fileTable.userId,
    })
    .from(LearningScenarioFileMapping)
    .innerJoin(fileTable, eq(LearningScenarioFileMapping.fileId, fileTable.id))
    .where(eq(LearningScenarioFileMapping.learningScenarioId, learningScenarioId));

  return files;
}

export async function dbGetFilesForLearningScenario(
  learningScenarioId: string,
): Promise<FileModel[]> {
  return db
    .select({
      id: LearningScenarioFileMapping.fileId,
      name: fileTable.name,
      type: fileTable.type,
      size: fileTable.size,
      createdAt: fileTable.createdAt,
      metadata: fileTable.metadata,
      userId: fileTable.userId,
    })
    .from(LearningScenarioFileMapping)
    .innerJoin(fileTable, eq(LearningScenarioFileMapping.fileId, fileTable.id))
    .where(eq(LearningScenarioFileMapping.learningScenarioId, learningScenarioId));
}

export async function dbGetRelatedCharacterFiles(conversationId?: string): Promise<FileModel[]> {
  if (conversationId === undefined) return [];
  const files = await db
    .select({
      id: CharacterFileMapping.fileId,
      name: fileTable.name,
      type: fileTable.type,
      size: fileTable.size,
      createdAt: fileTable.createdAt,
      metadata: fileTable.metadata,
      userId: fileTable.userId,
    })
    .from(CharacterFileMapping)
    .innerJoin(fileTable, eq(CharacterFileMapping.fileId, fileTable.id))
    .where(eq(CharacterFileMapping.characterId, conversationId));

  return files;
}

export async function dbGetRelatedAssistantFiles(assistantId?: string): Promise<FileModel[]> {
  if (assistantId === undefined) return [];
  const files = await db
    .select({
      id: AssistantFileMapping.fileId,
      name: fileTable.name,
      type: fileTable.type,
      size: fileTable.size,
      createdAt: fileTable.createdAt,
      metadata: fileTable.metadata,
      userId: fileTable.userId,
    })
    .from(AssistantFileMapping)
    .innerJoin(fileTable, eq(AssistantFileMapping.fileId, fileTable.id))
    .where(eq(AssistantFileMapping.assistantId, assistantId));

  return files;
}

export async function dbGetFileForLearningScenario({
  learningScenarioId,
  fileId,
}: {
  learningScenarioId: string;
  fileId: string;
}): Promise<FileModel | undefined> {
  const [file] = await db
    .select({ ...getTableColumns(fileTable) })
    .from(LearningScenarioFileMapping)
    .innerJoin(fileTable, eq(LearningScenarioFileMapping.fileId, fileTable.id))
    .where(
      and(
        eq(LearningScenarioFileMapping.learningScenarioId, learningScenarioId),
        eq(LearningScenarioFileMapping.fileId, fileId),
      ),
    )
    .limit(1);

  return file;
}

export async function dbGetFileForCharacter({
  characterId,
  fileId,
}: {
  characterId: string;
  fileId: string;
}): Promise<FileModel | undefined> {
  const [file] = await db
    .select({ ...getTableColumns(fileTable) })
    .from(CharacterFileMapping)
    .innerJoin(fileTable, eq(CharacterFileMapping.fileId, fileTable.id))
    .where(
      and(
        eq(CharacterFileMapping.characterId, characterId),
        eq(CharacterFileMapping.fileId, fileId),
      ),
    )
    .limit(1);

  return file;
}

export async function dbGetFileForAssistant({
  assistantId,
  fileId,
}: {
  assistantId: string;
  fileId: string;
}): Promise<FileModel | undefined> {
  const [file] = await db
    .select({ ...getTableColumns(fileTable) })
    .from(AssistantFileMapping)
    .innerJoin(fileTable, eq(AssistantFileMapping.fileId, fileTable.id))
    .where(
      and(
        eq(AssistantFileMapping.assistantId, assistantId),
        eq(AssistantFileMapping.fileId, fileId),
      ),
    )
    .limit(1);

  return file;
}

function convertToMap(
  files: {
    foreignId: string;
    fileId: string;
    name: string;
    type: string;
    size: number;
    createdAt: Date;
    metadata: FileMetadata | null;
    userId: string | null;
  }[],
) {
  const resultMap: Map<string, FileModel[]> = new Map();
  for (const row of files) {
    const file = {
      id: row.fileId,
      name: row.name,
      size: row.size,
      createdAt: row.createdAt,
      type: row.type,
      metadata: row.metadata,
      userId: row.userId,
    };
    const maybeFiles = resultMap.get(row.foreignId);
    if (maybeFiles === null || maybeFiles === undefined) {
      resultMap.set(row.foreignId, [file]);
    }
    if (maybeFiles !== undefined) {
      maybeFiles.push(file);
    }
  }
  return resultMap;
}

export async function dbGetFilesInIds(fileIds: string[]): Promise<FileModel[]> {
  const maybeFiles = await db.select().from(fileTable).where(inArray(fileTable.id, fileIds));
  return [...maybeFiles];
}

export async function dbGetExtractedFileContent(fileId: string): Promise<string> {
  const chunks = await db
    .select({ content: chunkTable.content })
    .from(chunkTable)
    .where(eq(chunkTable.fileId, fileId))
    .orderBy(asc(chunkTable.orderIndex), asc(chunkTable.id));

  return chunks
    .map((chunk) => chunk.content)
    .join('\n')
    .trim();
}

export async function dbGetAttachedFileByEntityId({
  conversationId,
  characterId,
  learningScenarioId,
  assistantId,
}: {
  conversationId?: string;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
}): Promise<(FileModel & { conversationMessageId?: string })[]> {
  const combinedFiles = await Promise.all([
    dbGetRelatedLearningScenarioFiles(learningScenarioId),
    dbGetRelatedCharacterFiles(characterId),
    dbGetAllFileIdByConversationId(conversationId),
    dbGetRelatedAssistantFiles(assistantId),
  ]);
  return combinedFiles.flat();
}

export async function dbGetAllFileIdByConversationId(
  conversationId?: string,
): Promise<(FileModel & { conversationMessageId?: string })[]> {
  if (conversationId === undefined) return [];
  const fileMappings = await db
    .select()
    .from(ConversationMessageFileMappingTable)
    .where(eq(ConversationMessageFileMappingTable.conversationId, conversationId))
    .innerJoin(fileTable, eq(ConversationMessageFileMappingTable.fileId, fileTable.id))
    .orderBy(ConversationMessageFileMappingTable.createdAt);
  return fileMappings.map((row) => ({
    ...row.file_table,
    conversationMessageId: row.conversation_message_file_mapping.conversationMessageId,
  }));
}

export async function dbGetDanglingConversationFileIds(): Promise<string[]> {
  const fileMappings = await db
    .select({ fileId: ConversationMessageFileMappingTable.fileId })
    .from(ConversationMessageFileMappingTable)
    .innerJoin(
      conversationTable,
      eq(conversationTable.id, ConversationMessageFileMappingTable.conversationId),
    )
    .where(isNotNull(conversationTable.deletedAt));
  return fileMappings.map((row) => row.fileId);
}

export async function dbInsertFileWithChunks(file: FileInsertModel, chunks: ChunkInsertModel[]) {
  await db.transaction(async (tx) => {
    await tx.insert(fileTable).values(file).onConflictDoNothing();
    if (chunks.length > 0) {
      await tx.insert(chunkTable).values(chunks);
    }
  });
}

export async function dbInsertWebChunks(chunks: ChunkInsertModel[]) {
  if (chunks.length === 0) return;
  await db.insert(chunkTable).values(chunks).onConflictDoNothing();
}

/**
 * Checks which of the given source URLs already have chunks in the database.
 * Returns the set of URLs that exist.
 */
export async function dbChunksExistForSourceUrls(sourceUrls: string[]): Promise<Set<string>> {
  if (sourceUrls.length === 0) return new Set();
  const results = await db
    .selectDistinct({ sourceUrl: chunkTable.sourceUrl })
    .from(chunkTable)
    .where(inArray(chunkTable.sourceUrl, sourceUrls));
  return new Set(results.map((r) => r.sourceUrl).filter((url): url is string => url !== null));
}

/**
 * Returns chunks for the given file IDs and/or source URLs,
 * ordered by fileId, sourceUrl, orderIndex, id.
 * Pass `limit` to cap the number of rows returned.
 */
export async function dbGetAllChunks({
  fileIds,
  sourceUrls,
  limit,
}: {
  fileIds: string[];
  sourceUrls: string[];
  limit?: number;
}) {
  const conditions: SQL[] = [];
  if (fileIds.length > 0) {
    conditions.push(inArray(chunkTable.fileId, fileIds));
  }
  if (sourceUrls.length > 0) {
    conditions.push(inArray(chunkTable.sourceUrl, sourceUrls));
  }
  if (conditions.length === 0) return [];
  const query = db
    .select({
      fileId: chunkTable.fileId,
      fileName: fileTable.name,
      sourceUrl: chunkTable.sourceUrl,
      orderIndex: chunkTable.orderIndex,
      content: chunkTable.content,
    })
    .from(chunkTable)
    .leftJoin(fileTable, eq(chunkTable.fileId, fileTable.id))
    .where(or(...conditions))
    .orderBy(
      asc(chunkTable.fileId),
      asc(chunkTable.sourceUrl),
      asc(chunkTable.orderIndex),
      asc(chunkTable.id),
    );
  return limit !== undefined ? query.limit(limit) : query;
}

export async function dbInsertFile(file: FileInsertModel) {
  await db.insert(fileTable).values(file).onConflictDoNothing();
}

export async function dbDeleteFileAndDetachFromConversation(filesToDelete: string[]) {
  await db.transaction(async (tx) => {
    await tx
      .delete(ConversationMessageFileMappingTable)
      .where(inArray(ConversationMessageFileMappingTable.fileId, filesToDelete));
    await tx.delete(fileTable).where(inArray(fileTable.id, filesToDelete));
  });
}

export async function dbDeleteDanglingFiles() {
  return await db.transaction(async (tx) => {
    const fileIds = await tx
      .select({ fileId: fileTable.id })
      .from(fileTable)
      .leftJoin(
        ConversationMessageFileMappingTable,
        eq(fileTable.id, ConversationMessageFileMappingTable.fileId),
      )
      .leftJoin(CharacterFileMapping, eq(fileTable.id, CharacterFileMapping.fileId))
      .leftJoin(AssistantFileMapping, eq(fileTable.id, AssistantFileMapping.fileId))
      .leftJoin(LearningScenarioFileMapping, eq(fileTable.id, LearningScenarioFileMapping.fileId))
      .where(
        and(
          isNull(ConversationMessageFileMappingTable.fileId),
          isNull(CharacterFileMapping.fileId),
          isNull(AssistantFileMapping.fileId),
          isNull(LearningScenarioFileMapping.fileId),
        ),
      );
    const fileIdsToDelete = fileIds.map((f) => f.fileId);
    logDebug('fileIdsToDelete', { fileIdsToDelete });
    await tx.delete(fileTable).where(inArray(fileTable.id, fileIdsToDelete));
    return fileIdsToDelete;
  });
}

/**
 * Returns all S3 keys for files which are referenced in the database in any table.
 */
export async function dbGetAllS3FileKeys(): Promise<string[]> {
  const [files, characters, assistants, sharedSchoolConversations, federalStates] =
    await Promise.all([
      db.select({ fileId: fileTable.id }).from(fileTable),
      db
        .select({ id: characterTable.id, pictureId: characterTable.pictureId })
        .from(characterTable),
      db
        .select({ id: assistantTable.id, pictureId: assistantTable.pictureId })
        .from(assistantTable),
      db
        .select({
          id: learningScenarioTable.id,
          pictureId: learningScenarioTable.pictureId,
        })
        .from(learningScenarioTable),
      db.select({ pictureUrls: federalStateTable.pictureUrls }).from(federalStateTable),
    ]);

  const fileIds = files.map((x) => `message_attachments/${x.fileId}`);
  const pictureIds = [...characters, ...assistants, ...sharedSchoolConversations]
    .map((x) => x.pictureId)
    .filter((x): x is string => !!x);
  const federalStatePictureUrls = federalStates
    .flatMap((x) => [x.pictureUrls?.favicon, x.pictureUrls?.logo])
    .filter((x): x is string => !!x);

  return [...fileIds, ...pictureIds, ...federalStatePictureUrls];
}
