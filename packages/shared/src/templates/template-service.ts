/**
 * @description Service functions for handling global templates of characters, assistants, and learning scenarios.
 * Only for admin use, does not check for user authorization.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@shared/db';
import {
  AccessLevel,
  assistantTable,
  assistantTemplateMappingTable,
  characterTable,
  characterTemplateMappingTable,
  federalStateTable,
  FileModel,
  learningScenarioInsertSchema,
  learningScenarioTable,
  learningScenarioTemplateMappingTable,
} from '@shared/db/schema';
import {
  TemplateModel,
  TemplateToFederalStateMapping,
  TemplateTypes,
} from '@shared/templates/template';
import { dbCreateCharacter, dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetAssistantById, dbUpsertAssistant } from '@shared/db/functions/assistants';
import {
  dbGetFilesForLearningScenario,
  dbGetRelatedAssistantFiles,
  dbGetRelatedCharacterFiles,
} from '@shared/db/functions/files';
import { DUMMY_USER_ID } from '@shared/db/seed/user-entity';
import { logError } from '@shared/logging';
import {
  duplicateFileWithEmbeddings,
  linkFileToAssistant,
  linkFileToCharacter,
  linkFileToLearningScenario,
} from '@shared/files/fileService';
import {
  buildAssistantPictureKey,
  buildCharacterPictureKey,
  buildLearningScenarioPictureKey,
} from '@shared/utils/picture-key';
import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import { NotFoundError } from '@shared/error';
import { copyFileInS3 } from '@shared/s3';
import { generateUUID } from '@shared/utils/uuid';
import path from 'node:path';
import { UserModel } from '@shared/auth/user-model';

const templateTypeMap: Record<string, TemplateTypes> = {
  assistants: 'assistant',
  characters: 'character',
  'learning-scenarios': 'learning-scenario',
};

const MAX_ENTITY_NAME_LENGTH = 50;

export async function copyEntityPictureIfExists({
  sourcePictureId,
  newEntityId,
  buildPictureKey,
}: {
  sourcePictureId: string | null | undefined;
  newEntityId: string;
  buildPictureKey: (entityId: string, filename: string) => string;
}) {
  if (!sourcePictureId) {
    return undefined;
  }

  const copiedPictureKey = buildPictureKey(newEntityId, path.basename(sourcePictureId));
  await copyFileInS3({
    copySource: sourcePictureId,
    newKey: copiedPictureKey,
  });

  return copiedPictureKey;
}

/**
 * Fetch all global templates from the database, including deleted templates.
 * This function is used in admin ui to manage global templates.
 * @returns A list of all global templates
 */
export async function getTemplates(): Promise<TemplateModel[]> {
  const [characterTemplates, assistantTemplates, learningScenarioTemplates] = await Promise.all([
    getCharacterTemplates(),
    getAssistantTemplates(),
    getLearningScenarioTemplates(),
  ]);

  return [...characterTemplates, ...assistantTemplates, ...learningScenarioTemplates];
}

/** Fetch all character templates from the database. */
async function getCharacterTemplates(): Promise<TemplateModel[]> {
  const templates = await db
    .select({
      id: characterTable.id,
      author: characterTable.author,
      name: characterTable.name,
      createdAt: characterTable.createdAt,
      originalId: characterTable.originalCharacterId,
      isDeleted: characterTable.isDeleted,
    })
    .from(characterTable)
    .where(eq(characterTable.accessLevel, 'global'));

  return templates.map((template) => ({
    ...template,
    type: 'character',
  }));
}

/** Fetch all assistant templates from the database. */
async function getAssistantTemplates(): Promise<TemplateModel[]> {
  const templates = await db
    .select({
      id: assistantTable.id,
      author: assistantTable.author,
      name: assistantTable.name,
      createdAt: assistantTable.createdAt,
      originalId: assistantTable.originalAssistantId,
      isDeleted: assistantTable.isDeleted,
    })
    .from(assistantTable)
    .where(eq(assistantTable.accessLevel, 'global'));

  return templates.map((template) => ({
    ...template,
    type: 'assistant',
  }));
}

/** Fetch all learning scenario templates from the database. */
async function getLearningScenarioTemplates(): Promise<TemplateModel[]> {
  const templates = await db
    .select({
      id: learningScenarioTable.id,
      author: learningScenarioTable.author,
      name: learningScenarioTable.name,
      createdAt: learningScenarioTable.createdAt,
      originalId: learningScenarioTable.originalLearningScenarioId,
      isDeleted: learningScenarioTable.isDeleted,
    })
    .from(learningScenarioTable)
    .where(eq(learningScenarioTable.accessLevel, 'global'));

  return templates.map((template) => ({
    ...template,
    type: 'learning-scenario',
  }));
}

/** Fetch a template by its type and id. */
export async function getTemplateById(
  templateType: TemplateTypes,
  templateId: string,
): Promise<TemplateModel> {
  if (templateType === 'character') {
    const [character] = await db
      .select({
        id: characterTable.id,
        originalId: characterTable.originalCharacterId,
        author: characterTable.author,
        name: characterTable.name,
        createdAt: characterTable.createdAt,
        isDeleted: characterTable.isDeleted,
      })
      .from(characterTable)
      .where(eq(characterTable.id, templateId));

    if (!character) {
      throw new Error('Character template not found');
    }

    return {
      ...character,
      type: 'character',
    };
  } else if (templateType === 'assistant') {
    const [assistant] = await db
      .select({
        id: assistantTable.id,
        originalId: assistantTable.originalAssistantId,
        author: assistantTable.author,
        name: assistantTable.name,
        createdAt: assistantTable.createdAt,
        isDeleted: assistantTable.isDeleted,
      })
      .from(assistantTable)
      .where(eq(assistantTable.id, templateId));

    if (!assistant) {
      throw new Error('Assistant template not found');
    }

    return {
      ...assistant,
      type: 'assistant',
    };
  } else if (templateType === 'learning-scenario') {
    const [learningScenario] = await db
      .select({
        id: learningScenarioTable.id,
        originalId: learningScenarioTable.originalLearningScenarioId,
        author: learningScenarioTable.author,
        name: learningScenarioTable.name,
        createdAt: learningScenarioTable.createdAt,
        isDeleted: learningScenarioTable.isDeleted,
      })
      .from(learningScenarioTable)
      .where(eq(learningScenarioTable.id, templateId));

    if (!learningScenario) {
      throw new Error('Learning scenario template not found');
    }

    return {
      ...learningScenario,
      type: 'learning-scenario',
    };
  } else {
    throw new Error('Invalid template type');
  }
}

/** Admin is allowed to update the author of a template. */
export async function updateAuthorOfTemplate(
  templateType: TemplateTypes,
  templateId: string,
  newAuthor: string,
) {
  if (templateType === 'character') {
    await db
      .update(characterTable)
      .set({ author: newAuthor })
      .where(eq(characterTable.id, templateId));
  } else if (templateType === 'assistant') {
    await db
      .update(assistantTable)
      .set({ author: newAuthor })
      .where(eq(assistantTable.id, templateId));
  } else if (templateType === 'learning-scenario') {
    await db
      .update(learningScenarioTable)
      .set({ author: newAuthor })
      .where(eq(learningScenarioTable.id, templateId));
  } else {
    throw new Error('Invalid template type');
  }
}

/** Admin is allowed to update the deleted state of a template. */
export async function updateTemplateDeletedState(
  templateType: TemplateTypes,
  templateId: string,
  isDeleted: boolean,
) {
  if (templateType === 'character') {
    await db.update(characterTable).set({ isDeleted }).where(eq(characterTable.id, templateId));
  } else if (templateType === 'assistant') {
    await db.update(assistantTable).set({ isDeleted }).where(eq(assistantTable.id, templateId));
  } else if (templateType === 'learning-scenario') {
    await db
      .update(learningScenarioTable)
      .set({ isDeleted })
      .where(eq(learningScenarioTable.id, templateId));
  } else {
    throw new Error('Invalid template type');
  }
}

/** Select all federal states with the mapping information for the given template. */
export async function getFederalStatesWithMappings(
  templateType: TemplateTypes,
  templateId: string,
): Promise<TemplateToFederalStateMapping[]> {
  let subquery;
  if (templateType === 'character') {
    subquery = db
      .select({
        federalStateId: characterTemplateMappingTable.federalStateId,
        template: characterTemplateMappingTable.characterId,
      })
      .from(characterTemplateMappingTable)
      .where(eq(characterTemplateMappingTable.characterId, templateId))
      .as('mapping');
  } else if (templateType === 'assistant') {
    subquery = db
      .select({
        federalStateId: assistantTemplateMappingTable.federalStateId,
        template: assistantTemplateMappingTable.assistantId,
      })
      .from(assistantTemplateMappingTable)
      .where(eq(assistantTemplateMappingTable.assistantId, templateId))
      .as('mapping');
  } else if (templateType === 'learning-scenario') {
    subquery = db
      .select({
        federalStateId: learningScenarioTemplateMappingTable.federalStateId,
        template: learningScenarioTemplateMappingTable.learningScenarioId,
      })
      .from(learningScenarioTemplateMappingTable)
      .where(eq(learningScenarioTemplateMappingTable.learningScenarioId, templateId))
      .as('mapping');
  } else {
    throw new Error('Invalid template type');
  }

  const federalStateMappings = await db
    .select({ federalStateId: federalStateTable.id, template: subquery.template })
    .from(federalStateTable)
    .leftJoin(subquery, eq(subquery.federalStateId, federalStateTable.id));

  return federalStateMappings.map((mapping) => ({
    ...mapping,
    isMapped: mapping.template !== null,
  }));
}

/** Updates template to federal state mapping by:
 * - adding new mappings
 * - deleting old mappings
 */
export async function updateTemplateMappings(
  templateType: TemplateTypes,
  templateId: string,
  mappings: TemplateToFederalStateMapping[],
): Promise<TemplateToFederalStateMapping[]> {
  if (templateType === 'character') {
    await db.transaction(async (tx) => {
      if (mappings.some((m) => !m.isMapped)) {
        await tx.delete(characterTemplateMappingTable).where(
          and(
            eq(characterTemplateMappingTable.characterId, templateId),
            inArray(
              characterTemplateMappingTable.federalStateId,
              mappings.filter((m) => !m.isMapped).map((m) => m.federalStateId),
            ),
          ),
        );
      }

      if (mappings.some((m) => m.isMapped)) {
        await tx
          .insert(characterTemplateMappingTable)
          .values(
            mappings
              .filter((mapping) => mapping.isMapped)
              .map((mapping) => ({
                characterId: templateId,
                federalStateId: mapping.federalStateId,
              })),
          )
          .onConflictDoNothing(); // Prevent duplicate entries
      }
    });
  } else if (templateType === 'assistant') {
    await db.transaction(async (tx) => {
      if (mappings.some((m) => !m.isMapped)) {
        await tx.delete(assistantTemplateMappingTable).where(
          and(
            eq(assistantTemplateMappingTable.assistantId, templateId),
            inArray(
              assistantTemplateMappingTable.federalStateId,
              mappings.filter((m) => !m.isMapped).map((m) => m.federalStateId),
            ),
          ),
        );
      }

      if (mappings.some((m) => m.isMapped)) {
        await tx
          .insert(assistantTemplateMappingTable)
          .values(
            mappings
              .filter((mapping) => mapping.isMapped)
              .map((mapping) => ({
                assistantId: templateId,
                federalStateId: mapping.federalStateId,
              })),
          )
          .onConflictDoNothing(); // Prevent duplicate entries
      }
    });
  } else if (templateType === 'learning-scenario') {
    await db.transaction(async (tx) => {
      if (mappings.some((m) => !m.isMapped)) {
        await tx.delete(learningScenarioTemplateMappingTable).where(
          and(
            eq(learningScenarioTemplateMappingTable.learningScenarioId, templateId),
            inArray(
              learningScenarioTemplateMappingTable.federalStateId,
              mappings.filter((m) => !m.isMapped).map((m) => m.federalStateId),
            ),
          ),
        );
      }

      if (mappings.some((m) => m.isMapped)) {
        await tx
          .insert(learningScenarioTemplateMappingTable)
          .values(
            mappings
              .filter((mapping) => mapping.isMapped)
              .map((mapping) => ({
                learningScenarioId: templateId,
                federalStateId: mapping.federalStateId,
              })),
          )
          .onConflictDoNothing(); // Prevent duplicate entries
      }
    });
  } else {
    throw new Error('Invalid template type');
  }

  return getFederalStatesWithMappings(templateType, templateId);
}

/**
 * Parses a template URL to extract the template type and ID.
 *
 * @param url - The URL containing template information in format: /custom/editor/{id} or /characters/editor/{id} or /learning-scenarios/editor/{id}
 * @returns Object containing templateType and templateId
 * @throws Error if URL format is invalid or template ID is missing
 */
function parseTemplateUrl(url: string): { templateType: TemplateTypes; originalId: string } {
  const urlPattern = /\/(assistants|characters|learning-scenarios)\/editor\/([a-fA-F0-9-]+)/;
  const match = url.match(urlPattern);

  if (!match) {
    throw new Error('Invalid url format.');
  }

  const [, templateTypeRaw, originalId] = match;
  const templateType = templateTypeMap[templateTypeRaw ?? ''];

  if (!templateType) {
    throw new Error(`Invalid template type: ${templateTypeRaw}`);
  }

  if (!originalId) {
    throw new Error('Template ID ist erforderlich');
  }

  return { templateType, originalId };
}

/**
 * Creates a template from URL by parsing the URL, extracting template type and ID,
 * and creating a new global template based on the existing template.
 *
 * @param url - The URL containing template information in format: /custom/editor/{id} or /characters/editor/{id}
 * @returns Promise with success result containing templateId, templateType, and message
 * @throws Error if URL format is invalid, template ID is missing, or template creation fails
 */
export async function createTemplateFromUrl(url: string): Promise<string> {
  const { templateType, originalId } = parseTemplateUrl(url);

  try {
    let newTemplate;

    if (templateType === 'character') {
      newTemplate = await createCharacterTemplate(originalId);
    } else if (templateType === 'assistant') {
      // Handle assistant template creation
      newTemplate = await createAssistantTemplate(originalId);
    } else if (templateType === 'learning-scenario') {
      // Handle learning scenario template creation
      newTemplate = await createLearningScenarioTemplate(originalId);
    } else {
      throw new Error('Ungültiger Template-Typ');
    }

    // Copy associated files
    await copyRelatedTemplateFiles(templateType, originalId, newTemplate.id);

    return newTemplate.id;
  } catch (error) {
    logError('Error creating template from URL', error);
    throw new Error(error instanceof Error ? error.message : 'Fehler beim Erstellen der Vorlage');
  }
}

/**
 * Copies all files associated with a template to a new template, including embeddings and text chunks.
 * Files are duplicated in S3 and database records are created for the new template.
 *
 * @param templateType - The type of template ('character', 'assistant' or 'learning-scenario')
 * @param templateId - The ID of the source template to copy files from
 * @param resultId - The ID of the new template to link copied files to
 * @throws Error if file copying fails, but continues with remaining files
 */
export async function copyRelatedTemplateFiles(
  templateType: TemplateTypes,
  templateId: string,
  resultId: string,
) {
  try {
    let relatedFiles: FileModel[];

    if (templateType === 'character') {
      relatedFiles = await dbGetRelatedCharacterFiles(templateId);
    } else if (templateType === 'assistant') {
      relatedFiles = await dbGetRelatedAssistantFiles(templateId);
    } else if (templateType === 'learning-scenario') {
      relatedFiles = await dbGetFilesForLearningScenario(templateId);
    } else {
      throw new Error('Invalid template type for copying files');
    }

    await Promise.all(
      relatedFiles.map(async (file) => {
        try {
          const newFileId = await duplicateFileWithEmbeddings(file.id);
          if (templateType === 'character') {
            await linkFileToCharacter(newFileId, resultId);
          } else if (templateType === 'assistant') {
            await linkFileToAssistant(newFileId, resultId);
          } else if (templateType === 'learning-scenario') {
            await linkFileToLearningScenario(newFileId, resultId);
          } else {
            throw new Error('Invalid template type for linking file');
          }
        } catch (error) {
          logError(`Error copying file ${file.id} for ${templateType} template ${resultId}`, error);
          // Continue with other files even if one fails
        }
      }),
    );
  } catch (error) {
    logError(`Error processing files for ${templateType} template ${resultId}`, error);
    // Don't fail the entire template creation if file copying fails
  }
}

/**
 * Copies an assistant and creates a new one based on an existing assistant.
 * The new assistant inherits all properties from the source but can have customized
 * access level, user, and school assignments.
 *
 * @param originalId - The ID of the source assistant to copy
 * @param accessLevel - The access level for the new assistant
 * @param userId - The user ID to assign to the new assistant
 * @param duplicateAssistantName - Optional name for the new assistant, defaults to source name if not provided
 * @returns Promise resolving to the newly created assistant object
 * @throws Error if source assistant is not found or assistant creation fails
 */
export async function copyAssistant(
  originalId: string,
  accessLevel: AccessLevel,
  user: Pick<UserModel, 'id'>,
  duplicateAssistantName?: string,
) {
  const sourceAssistant = await dbGetAssistantById({ assistantId: originalId });
  if (!sourceAssistant) {
    throw new Error('Assistent nicht gefunden');
  }

  const newAssistantId = generateUUID();

  const newAssistant = {
    ...sourceAssistant,
    name: (duplicateAssistantName ?? sourceAssistant.name).substring(0, MAX_ENTITY_NAME_LENGTH),
    id: newAssistantId,
    originalAssistantId: originalId,
    accessLevel,
    userId: user.id,
    isDeleted: false,
    hasLinkAccess: false, // Reset sharing settings for new template
    pictureId: await copyEntityPictureIfExists({
      sourcePictureId: sourceAssistant.pictureId,
      newEntityId: newAssistantId,
      buildPictureKey: buildAssistantPictureKey,
    }),
  };

  const result = await dbUpsertAssistant({ assistant: newAssistant });
  const assistantId = result?.id;
  if (!assistantId) {
    throw new Error('Fehler beim Erstellen des Assistenten');
  }
  return result;
}

/**
 * Creates a new global assistant template based on an existing assistant.
 * The new template inherits all properties from the source but becomes a global template
 * accessible across all schools.
 *
 * @param originalId - The ID of the source assistant to create a template from
 * @returns Promise resolving to the newly created assistant template object
 * @throws Error if source assistant is not found or template creation fails
 */
async function createAssistantTemplate(originalId: string) {
  return copyAssistant(originalId, 'global', { id: DUMMY_USER_ID });
}

/**
 * Copies a character and creates a new one based on an existing character.
 * The new character inherits all properties from the source but can have customized
 * access level, user, and school assignments.
 *
 * @param originalId - The ID of the source character to copy
 * @param accessLevel - The access level for the new character
 * @param user - The user ID to assign to the new character
 * @param duplicateCharacterName - Optional custom name for the new character. If not provided, uses the source character's name.
 * @returns Promise resolving to the newly created character object
 * @throws Error if source character is not found or character creation fails
 */
export async function copyCharacter(
  originalId: string,
  accessLevel: AccessLevel,
  user: Pick<UserModel, 'id'>,
  duplicateCharacterName?: string,
) {
  const sourceCharacter = await dbGetCharacterById({ characterId: originalId });
  if (!sourceCharacter) {
    throw new Error('Dialogpartner nicht gefunden');
  }

  const newCharacterId = generateUUID();

  const newCharacter = {
    ...sourceCharacter,
    name: (duplicateCharacterName ?? sourceCharacter.name).substring(0, MAX_ENTITY_NAME_LENGTH),
    id: newCharacterId,
    originalCharacterId: originalId,
    accessLevel,
    userId: user.id,
    isDeleted: false,
    hasLinkAccess: false, // Reset sharing settings for new template
    pictureId: await copyEntityPictureIfExists({
      sourcePictureId: sourceCharacter.pictureId,
      newEntityId: newCharacterId,
      buildPictureKey: buildCharacterPictureKey,
    }),
  };

  const result = await dbCreateCharacter(newCharacter);
  const character = result?.[0];
  if (!character) {
    throw new Error('Fehler beim Erstellen des Dialogpartners');
  }
  return character;
}

/**
 * Creates a new global character template based on an existing character.
 * The new template inherits all properties from the source but becomes a global template
 * accessible across all schools.
 *
 * @param originalId - The ID of the source character to create a template from
 * @returns Promise resolving to the newly created character template object
 * @throws Error if source character is not found or template creation fails
 */
async function createCharacterTemplate(originalId: string) {
  return copyCharacter(originalId, 'global', { id: DUMMY_USER_ID });
}

/**
 * Creates a new global learning scenario template based on an existing learning scenario.
 * @param originalId - The id of the source learning scenario to create a template from.
 */
async function createLearningScenarioTemplate(originalId: string) {
  return copyLearningScenario(originalId, 'global', { id: DUMMY_USER_ID });
}

/**
 * Copies a learning scenario and creates a new one based on an existing learning scenario.
 * The new learning scenario inherits all properties from the source but can have customized
 * access level, user, and school assignments.
 *
 * @param originalId - The id of the source learning scenario to copy
 * @param accessLevel - The access level for the new learning scenario
 * @param user - The user that is the owner of the new learning scenario
 * @param duplicateLearningScenarioName - Optional custom name for the new learning scenario. If not provided, uses the source learning scenario's name.
 * @returns Promise resolving to the newly created learning scenario object
 * @throws Error if source learning scenario is not found or creation fails
 */
async function copyLearningScenario(
  originalId: string,
  accessLevel: AccessLevel,
  user: Pick<UserModel, 'id'>,
  duplicateLearningScenarioName?: string,
) {
  const learningScenario = await dbGetLearningScenarioById({ learningScenarioId: originalId });
  if (!learningScenario) {
    throw new NotFoundError('Original learning scenario not found');
  }

  const newLearningScenarioId = generateUUID();

  const copy = {
    ...learningScenarioInsertSchema.parse(learningScenario),
    name: (duplicateLearningScenarioName ?? learningScenario.name).substring(
      0,
      MAX_ENTITY_NAME_LENGTH,
    ),
    id: newLearningScenarioId,
    originalLearningScenarioId: originalId,
    accessLevel,
    userId: user.id,
    isDeleted: false,
    hasLinkAccess: false, // Reset sharing settings for new template
    pictureId: await copyEntityPictureIfExists({
      sourcePictureId: learningScenario.pictureId,
      newEntityId: newLearningScenarioId,
      buildPictureKey: buildLearningScenarioPictureKey,
    }),
  };
  // attachments are copied in a separate step atm after the template is created

  const [newLearningScenario] = await db.insert(learningScenarioTable).values(copy).returning();

  if (!newLearningScenario) {
    throw new Error('Could not create global learning scenario template');
  }

  return newLearningScenario;
}
