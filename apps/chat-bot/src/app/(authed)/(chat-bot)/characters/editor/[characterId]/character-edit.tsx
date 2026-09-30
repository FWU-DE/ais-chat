'use client';

import z from 'zod';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import {
  CharacterOptionalShareDataModel,
  FileModel,
  schoolTypesSchema,
  gradeRangesSchema,
  subjectsSchema,
  categoriesSchema,
  federalStatesSchema,
  languagesSchema,
  webSearchScopeSchema,
} from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { useTranslations } from 'next-intl';
import { useForceReloadOnBrowserBackButton } from '@/hooks/use-force-reload-on-browser-back-button';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  deleteCharacterAction,
  deleteFileMappingAndEntityAction,
  downloadFileFromCharacterAction,
  getCharacterShareDataAction,
  linkFileToCharacterAction,
  createCommunityTemplateRequestAction,
  cancelCommunityTemplateRequestAction,
  sendMessageToEditorAction,
  getCommunityTemplateRequestWithEventsAction,
  getCharacterSharingStateAction,
  shareCharacterAction,
  unshareCharacterAction,
  updateCharacterSchoolSharingAction,
  extendCharacterShareExpirationAction,
  updateCharacterShareTokenPointsLimitAction,
  updateCharacterAction,
  uploadAvatarPictureForCharacterAction,
} from './actions';
import { useFormAutosave } from '@/hooks/use-form-autosave';
import { useCommunityTemplateRequest } from '@/hooks/use-community-template-request';
import { usePendingChangesGuard } from '@/hooks/use-pending-changes-guard';
import { BackButton } from '@/components/common/back-button';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import { CustomChatActionDelete } from '@/components/custom-chat/custom-chat-action-delete';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatShareInfo } from '@/components/custom-chat/custom-chat-share-info';
import { CustomChatShareWithLearners } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners';
import { CustomChatHeading2 } from '@/components/custom-chat/custom-chat-heading2';
import { CustomChatImageUpload } from '@/components/custom-chat/custom-chat-image-upload';
import { FieldGroup } from '@ui/components/field';
import { Card, CardContent } from '@ui/components/card';
import {
  SMALL_TEXT_INPUT_FIELDS_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
} from '@/configuration-text-inputs/const';
import { useToast } from '@/components/common/toast';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { CustomChatHeaderContent } from '@/components/custom-chat/custom-chat-header-content';
import { useLlmModels } from '@/components/providers/llm-model-provider';
import { useForm, useWatch } from 'react-hook-form';
import { CustomChatModelSelect } from '@/components/custom-chat/custom-chat-model-select';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import { CustomChatWebSearchEditView } from '@/components/custom-chat/web-search/custom-chat-web-search-edit-view';
import CustomShareSection from '@/components/custom-chat/custom-chat-share-section';
import { FormField } from '@ui/components/form/form-field';
import { createNewCharacterAction } from '../../actions';
import { CustomChatInstructionsExampleDialog } from '@/components/custom-chat/custom-chat-instructions-example-dialog';
import { RichText, stripRichTextTags } from '@/components/common/rich-text';
import { CustomChatSuspensionError } from '@/components/custom-chat/custom-chat-suspension-error';
import FilterSelectSection from '@/components/custom-chat/filter/custom-chat-filter-select-section';
import {
  extractFilterValues,
  toFilterGroup,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { CommunityTemplateRequest } from '@/components/custom-chat/sharing/community-template-request';

type CharacterTranslator = ReturnType<typeof useTranslations<'characters'>>;

function createCharacterFieldValidationConfig(t: CharacterTranslator) {
  return {
    name: {
      required: true,
      maxLength: SMALL_TEXT_INPUT_FIELDS_LIMIT,
      maxLengthErrorMessage: t('name-max-length', {
        maxLength: SMALL_TEXT_INPUT_FIELDS_LIMIT,
      }),
    },
    description: {
      maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      maxLengthErrorMessage: t('description-max-length', {
        maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      }),
    },
    instructions: {
      maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
      maxLengthErrorMessage: t('instructions-max-length', {
        maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
      }),
    },
    initialMessage: {
      maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      maxLengthErrorMessage: t('initial-message-max-length', {
        maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      }),
    },
  };
}

function createCharacterFormValuesSchema(t: CharacterTranslator) {
  return z.object({
    name: z.string().trim().min(1, t('name-required')),
    description: z.string(),
    instructions: z.string(),
    initialMessage: z.string(),
    modelId: z.string(),
    schoolTypes: z.array(schoolTypesSchema),
    gradeRanges: z.array(gradeRangesSchema),
    subjects: z.array(subjectsSchema),
    categories: z.array(categoriesSchema),
    federalStates: z.array(federalStatesSchema),
    languages: z.array(languagesSchema),
    isSchoolShared: z.boolean(),
    isCommunityShared: z.boolean(),
    hasLinkAccess: z.boolean(),
    isWebSearchEnabled: z.boolean(),
    webSearchScope: webSearchScopeSchema,
    webSearchIncludedDomains: z.array(z.string()),
  });
}

export type CharacterFormValues = z.infer<ReturnType<typeof createCharacterFormValuesSchema>>;

export function CharacterEdit({
  character,
  relatedFiles,
  initialLinks,
  avatarPictureUrl,
  usedBudget,
  maxBudget,
  budgetUsedBySharedChat,
  isWebSearchAvailable,
}: {
  character: CharacterOptionalShareDataModel;
  relatedFiles: FileModel[];
  initialLinks: WebSource[];
  avatarPictureUrl?: string;
  usedBudget: number;
  maxBudget: number;
  budgetUsedBySharedChat: number;
  isWebSearchAvailable: boolean;
}) {
  useForceReloadOnBrowserBackButton();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('characters');
  const characterFormValuesSchema = useMemo(() => createCharacterFormValuesSchema(t), [t]);
  const {
    communityTemplateRequest,
    setCommunityTemplateRequest,
    createRequest: createCommunityTemplateRequest,
    cancelRequest: cancelCommunityTemplateRequest,
    sendMessage: sendMessageToEditor,
  } = useCommunityTemplateRequest({
    entityId: character.id,
    getRequest: () => getCommunityTemplateRequestWithEventsAction({ characterId: character.id }),
    createRequest: () => createCommunityTemplateRequestAction({ characterId: character.id }),
    cancelRequest: () => cancelCommunityTemplateRequestAction({ characterId: character.id }),
    sendMessage: (message) => sendMessageToEditorAction({ characterId: character.id, message }),
  });

  const { models, defaultModel } = useLlmModels();
  const maybeDefaultModelId = defaultModel?.id;
  const isModelAvailable = character.modelId && models.some((m) => m.id === character.modelId);
  const selectedModelId = isModelAvailable ? character.modelId : maybeDefaultModelId;
  const filterValues = extractFilterValues(character);

  const initialValues: CharacterFormValues = {
    name: character.name,
    description: character.description ?? '',
    instructions: character.instructions ?? '',
    initialMessage: character.initialMessage ?? '',
    modelId: selectedModelId ?? '',
    schoolTypes: filterValues.schoolTypes,
    gradeRanges: filterValues.gradeRanges,
    subjects: filterValues.subjects,
    categories: filterValues.categories,
    federalStates: filterValues.federalStates,
    languages: filterValues.languages,
    isSchoolShared: character.isSchoolShared,
    isCommunityShared: character.isCommunityShared,
    hasLinkAccess: character.hasLinkAccess,
    isWebSearchEnabled: character.isWebSearchEnabled,
    webSearchScope: character.webSearchScope,
    webSearchIncludedDomains: character.webSearchIncludedDomains,
  };

  const {
    control,
    trigger,
    getValues,
    reset,
    setValue,
    formState: { isDirty },
  } = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormValuesSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  const { isSaving, hasSaveError, flushAutoSave, handleAutoSave } =
    useFormAutosave<CharacterFormValues>({
      initialValues,
      isDirty,
      getValues,
      reset: (values) => {
        reset({ ...values, name: values.name.trim() });
      },
      validate: trigger,
      saveValues: async (data) => {
        // isSchoolShared/isCommunityShared are handled separately in handleSharingChange
        // attachedLinks are handled separately in handleLinksChange
        const updateResult = await updateCharacterAction({
          id: character.id,
          name: data.name.trim(),
          description: data.description,
          instructions: data.instructions,
          initialMessage: data.initialMessage,
          modelId: data.modelId,
          filterGroup: toFilterGroup(data),
          hasLinkAccess: data.hasLinkAccess,
          isWebSearchEnabled: data.isWebSearchEnabled,
          webSearchScope: data.webSearchScope,
          webSearchIncludedDomains: data.webSearchIncludedDomains,
        });

        return updateResult.success;
      },
    });

  const name = useWatch({ control, name: 'name' });
  const schoolTypes = useWatch({ control, name: 'schoolTypes' });
  const gradeRanges = useWatch({ control, name: 'gradeRanges' });
  const subjects = useWatch({ control, name: 'subjects' });
  const categories = useWatch({ control, name: 'categories' });
  const federalStates = useWatch({ control, name: 'federalStates' });
  const languages = useWatch({ control, name: 'languages' });
  const isSchoolShared = useWatch({ control, name: 'isSchoolShared' });
  const isCommunityShared = useWatch({ control, name: 'isCommunityShared' });
  const hasLinkAccess = useWatch({ control, name: 'hasLinkAccess' });
  const showShareInfo =
    (isSchoolShared || isCommunityShared || hasLinkAccess) && !character.suspended;

  const saveBeforeLeave = useCallback(async (): Promise<void> => {
    if (!isDirty) {
      return;
    }

    await flushAutoSave();
  }, [flushAutoSave, isDirty]);

  const { guardNavigation } = usePendingChangesGuard({
    hasPendingChanges: isDirty,
    onBeforePageLeave: saveBeforeLeave,
  });

  const handleUseChat = () => {
    guardNavigation(() => {
      router.push(`/characters/d/${character.id}/`);
    });
  };

  const handleDuplicateCharacter = async () => {
    const createResult = await createNewCharacterAction({
      templateId: character.id,
      duplicateCharacterName: t('duplicate-name-format-string', {
        sourceName: name,
      }),
    });
    if (createResult.success) {
      guardNavigation(() => {
        router.push(`/characters/editor/${createResult.value.id}?create=true`);
      });
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  };

  const handleDeleteCharacter = async () => {
    const deleteResult = await deleteCharacterAction({ characterId: character.id });
    if (deleteResult.success) {
      toast.success(t('toasts.delete-toast-success'));
    }
    if (!deleteResult.success) {
      toast.error(t('toasts.delete-toast-error'));
    }
    guardNavigation(() => {
      router.push('/characters');
    });
  };

  const handleFileUploaded = async (data: { id: string; name: string; file: File }) => {
    const linkResult = await linkFileToCharacterAction({
      fileId: data.id,
      characterId: character.id,
    });

    if (!linkResult.success) {
      toast.error(t('toasts.file-link-error'));
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    return deleteFileMappingAndEntityAction({
      characterId: character.id,
      fileId,
    });
  };

  const handleDownloadFile = async (fileId: string) => {
    return downloadFileFromCharacterAction({ characterId: character.id, fileId });
  };

  const handleLinksChange = async (links: string[]) => {
    return updateCharacterAction({ id: character.id, attachedLinks: links });
  };

  async function handleUploadPicture(croppedImageBlob: Blob) {
    const result = await uploadAvatarPictureForCharacterAction({
      characterId: character.id,
      croppedImageBlob,
    });

    if (result.success) {
      toast.success(t('toasts.edit-toast-success'));
    }

    return result;
  }

  // Resyncs the sharing checkboxes and hasLinkAccess from the server after a failed mutation,
  // without touching any other (possibly unsaved) form fields.
  const refreshSharingState = useCallback(async () => {
    const result = await getCharacterSharingStateAction({ characterId: character.id });
    if (result.success) {
      setValue('isSchoolShared', result.value.entity.isSchoolShared, { shouldDirty: false });
      setValue('isCommunityShared', result.value.entity.isCommunityShared, { shouldDirty: false });
      setValue('hasLinkAccess', result.value.entity.hasLinkAccess, { shouldDirty: false });
      setCommunityTemplateRequest(result.value.request);
    }
  }, [character.id, setValue, setCommunityTemplateRequest]);

  const handleSharingChange = async ({ name, checked }: { name: string; checked: boolean }) => {
    if (name === 'isCommunityShared') {
      const result = checked
        ? await createCommunityTemplateRequest()
        : await cancelCommunityTemplateRequest();

      if (!result.success) {
        await refreshSharingState();
        toast.error(t('toasts.edit-toast-error'));
        return;
      }

      // Cancelling a request that was already approved also revokes community sharing
      // server-side; reflect that here (isSchoolShared is never touched by this flow).
      setValue('isCommunityShared', result.value.entity.isCommunityShared, {
        shouldDirty: false,
      });
      setValue('hasLinkAccess', result.value.entity.hasLinkAccess, { shouldDirty: false });
    } else if (name === 'isSchoolShared') {
      const result = await updateCharacterSchoolSharingAction({
        characterId: character.id,
        isSchoolShared: checked,
      });

      if (!result.success) {
        await refreshSharingState();
        toast.error(t('toasts.edit-toast-error'));
        return;
      }
    }

    await flushAutoSave();
  };

  const actionButtons = (
    <CustomChatActions>
      <CustomChatActionUse onClick={handleUseChat} />
      {!character.suspended && <CustomChatActionDuplicate onClick={handleDuplicateCharacter} />}
      <CustomChatActionDelete
        onClick={handleDeleteCharacter}
        modalTitle={t('delete-modal-title')}
        modalDescription={t('delete-modal-description')}
      />
    </CustomChatActions>
  );

  return (
    <>
      <CustomChatHeaderContent
        isDirty={isDirty}
        isSubmitting={isSaving}
        hasSaveError={hasSaveError}
      />
      <CustomChatLayoutContainer>
        <BackButton
          href="/characters"
          text={t('back-button')}
          aria-label={t('back-button-aria-label')}
          onClick={() => {
            guardNavigation(() => {
              router.push('/characters');
            });
          }}
        />
        <CustomChatTitle title={name} />
        <div className="flex flex-wrap items-start gap-3">{actionButtons}</div>
        {showShareInfo && (
          <CustomChatShareInfo
            href="#share-settings"
            info={t('sharing-info')}
            linkText={t('sharing-settings')}
          />
        )}
        {character.suspended && <CustomChatSuspensionError info={t('suspension-error')} />}
        <CustomChatShareWithLearners
          expiredAt={character.expiredAt}
          manuallyStoppedAt={character.manuallyStoppedAt}
          maxUsageTimeLimit={character.maxUsageTimeLimit}
          tokenPointsLimit={character.tokenPointsLimit}
          usedBudget={usedBudget}
          budgetUsedBySharedChat={budgetUsedBySharedChat}
          maxBudget={maxBudget}
          onShare={(data) =>
            shareCharacterAction({
              id: character.id,
              tokenPointsPercentageLimit: data.tokenPointsPercentageLimit,
              usageTimeLimit: data.usageTimeLimit,
            })
          }
          onUnshare={() =>
            unshareCharacterAction({
              characterId: character.id,
            })
          }
          onAddTime={async (data) => {
            const result = await extendCharacterShareExpirationAction({
              characterId: character.id,
              additionalTimeInMinutes: data.additionalTimeInMinutes,
            });
            if (result.success) {
              return { success: true, expiredAt: result.value.expiredAt };
            }
            return { success: false };
          }}
          onAdjustTokenLimit={async (data) => {
            const result = await updateCharacterShareTokenPointsLimitAction({
              characterId: character.id,
              tokenPointsPercentageLimit: data.tokenPointsPercentageLimit,
            });
            if (result.success) {
              return { success: true, tokenPointsLimit: result.value.tokenPointsLimit };
            }
            return { success: false };
          }}
          onPollShareData={() =>
            getCharacterShareDataAction({
              characterId: character.id,
            })
          }
          shareUILink={`/characters/editor/${character.id}/share`}
          sharingDisabled={!name || name.trim().length === 0}
        />

        <div className="flex flex-col gap-3">
          <CustomChatHeading2 text={t('configuration-heading')} />

          <CustomChatImageUpload
            avatarPictureUrl={avatarPictureUrl}
            onUploadPicture={handleUploadPicture}
          />
        </div>

        <form
          id="character-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleAutoSave();
          }}
        >
          <Card>
            <CardContent>
              <FieldGroup>
                <FormField
                  name="name"
                  control={control}
                  {...createCharacterFieldValidationConfig(t).name}
                  label={t('name-label')}
                  placeholder={t('name-placeholder')}
                  autoFocusWhenEmpty
                  testId="character-name-input"
                  onBlur={handleAutoSave}
                />
                <FormField
                  name="description"
                  control={control}
                  {...createCharacterFieldValidationConfig(t).description}
                  label={t('description-label')}
                  placeholder={t('description-placeholder')}
                  testId="character-description-input"
                  onBlur={handleAutoSave}
                  type="textArea"
                  className="h-27 resize-none"
                />
                <CustomChatModelSelect
                  models={models}
                  selectedModelId={selectedModelId ?? undefined}
                  onValueChange={(value) => {
                    setValue('modelId', value, { shouldDirty: true });
                    void flushAutoSave();
                  }}
                />
                <FormField
                  name="instructions"
                  control={control}
                  {...createCharacterFieldValidationConfig(t).instructions}
                  label={t('instructions-label')}
                  labelAction={
                    <CustomChatInstructionsExampleDialog
                      descriptionContent={
                        <div className="whitespace-pre-line">
                          <RichText>{(tags) => t.rich('instructions-placeholder', tags)}</RichText>
                        </div>
                      }
                    />
                  }
                  placeholder={stripRichTextTags(t.raw('instructions-placeholder'))}
                  testId="character-instructions-input"
                  onBlur={handleAutoSave}
                  type="textArea"
                  className="h-125"
                />
                <FormField
                  name="initialMessage"
                  control={control}
                  {...createCharacterFieldValidationConfig(t).initialMessage}
                  label={t('initial-message-label')}
                  tooltip={t('initial-message-tooltip')}
                  placeholder={t('initial-message-placeholder')}
                  testId="character-initial-message-input"
                  onBlur={handleAutoSave}
                  type="textArea"
                  className="h-27 resize-none"
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <CustomChatFilesAndLinks
            initialFiles={relatedFiles}
            onFileUploaded={handleFileUploaded}
            onDeleteFile={handleDeleteFile}
            initialLinks={initialLinks}
            onLinksChange={handleLinksChange}
            onDownloadFile={handleDownloadFile}
          />

          {isWebSearchAvailable && (
            <CustomChatWebSearchEditView
              control={control}
              onCheckedChange={() => {
                void flushAutoSave();
              }}
              onChange={() => {
                void flushAutoSave();
              }}
            />
          )}

          <CustomShareSection
            control={control}
            schoolSharingName="isSchoolShared"
            communitySharingName="isCommunityShared"
            linkSharingName="hasLinkAccess"
            linkToShare={`/characters/${character.id}`}
            onShareChange={handleSharingChange}
            suspended={character.suspended}
          />
          {communityTemplateRequest && (
            <CommunityTemplateRequest
              requestWithEvents={communityTemplateRequest}
              onResubmit={createCommunityTemplateRequest}
              onSendMessage={sendMessageToEditor}
            />
          )}
          <FilterSelectSection
            values={{
              schoolTypes,
              gradeRanges,
              subjects,
              categories,
              federalStates,
              languages,
            }}
            onSchoolTypesChange={(values) => {
              setValue('schoolTypes', values, { shouldDirty: true });
              void flushAutoSave();
            }}
            onGradeRangesChange={(values) => {
              setValue('gradeRanges', values, { shouldDirty: true });
              void flushAutoSave();
            }}
            onSubjectsChange={(values) => {
              setValue('subjects', values, { shouldDirty: true });
              void flushAutoSave();
            }}
            onCategoriesChange={(values) => {
              setValue('categories', values, { shouldDirty: true });
              void flushAutoSave();
            }}
            onFederalStatesChange={(values) => {
              setValue('federalStates', values, { shouldDirty: true });
              void flushAutoSave();
            }}
            onLanguagesChange={(values) => {
              setValue('languages', values, { shouldDirty: true });
              void flushAutoSave();
            }}
          />
        </form>
      </CustomChatLayoutContainer>
    </>
  );
}
