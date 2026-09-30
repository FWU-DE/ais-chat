'use client';

import {
  NUMBER_OF_EXAMPLE_PROMPTS_LIMIT,
  SMALL_TEXT_INPUT_FIELDS_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
} from '@/configuration-text-inputs/const';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AssistantSelectModel,
  FileModel,
  schoolTypesSchema,
  gradeRangesSchema,
  subjectsSchema,
  categoriesSchema,
  federalStatesSchema,
  languagesSchema,
  webSearchScopeSchema,
} from '@shared/db/schema';
import { BackButton } from '@/components/common/back-button';
import { Card, CardContent } from '@ui/components/card';
import { FieldGroup } from '@ui/components/field';
import { FormField } from '@ui/components/form/form-field';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { useCallback, useMemo } from 'react';
import z from 'zod';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatActionDelete } from '@/components/custom-chat/custom-chat-action-delete';
import {
  createNewAssistantAction,
  deleteAssistantAction,
  deleteFileMappingAndEntityAction,
  downloadFileFromAssistantAction,
  linkFileToAssistantAction,
  createCommunityTemplateRequestAction,
  cancelCommunityTemplateRequestAction,
  getCommunityTemplateRequestWithEventsAction,
  getAssistantSharingStateAction,
  updateAssistantSchoolSharingAction,
  updateAssistantAction,
  uploadAvatarPictureForAssistantAction,
} from '../../actions';
import { useToast } from '@/components/common/toast';
import { useTranslations } from 'next-intl';
import { CustomChatShareInfo } from '@/components/custom-chat/custom-chat-share-info';
import { CustomChatImageUpload } from '@/components/custom-chat/custom-chat-image-upload';
import { usePendingChangesGuard } from '@/hooks/use-pending-changes-guard';
import { useForceReloadOnBrowserBackButton } from '@/hooks/use-force-reload-on-browser-back-button';
import { useFormAutosave } from '@/hooks/use-form-autosave';
import { useCommunityTemplateRequest } from '@/hooks/use-community-template-request';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import { WebSource } from '@shared/db/types';
import CustomShareSection from '@/components/custom-chat/custom-chat-share-section';
import { CustomChatPromptSuggestions } from '@/components/custom-chat/custom-chat-prompt-suggestions';
import { CustomChatInstructionsExampleDialog } from '@/components/custom-chat/custom-chat-instructions-example-dialog';
import { RichText, stripRichTextTags } from '@/components/common/rich-text';
import { CustomChatHeaderContent } from '@/components/custom-chat/custom-chat-header-content';
import { CustomChatWebSearchEditView } from '@/components/custom-chat/web-search/custom-chat-web-search-edit-view';
import { CustomChatSuspensionError } from '@/components/custom-chat/custom-chat-suspension-error';
import FilterSelectSection from '@/components/custom-chat/filter/custom-chat-filter-select-section';
import {
  extractFilterValues,
  toFilterGroup,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { CommunityTemplateRequest } from '@/components/custom-chat/sharing/community-template-request';

type AssistantTranslator = ReturnType<typeof useTranslations<'assistants'>>;

/**
 * Creates field validation configuration with pre-translated error messages.
 * Called inside the component where the translation function is available.
 */
function createAssistantFieldValidationConfig(t: AssistantTranslator) {
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
  } as const;
}

function createAssistantFormValuesSchema(t: AssistantTranslator) {
  return z.object({
    name: z.string().trim().min(1, t('name-required')).max(SMALL_TEXT_INPUT_FIELDS_LIMIT),
    description: z.string(),
    instructions: z.string(),
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
    promptSuggestions: z
      .array(
        z.object({
          value: z.string(),
        }),
      )
      .max(
        NUMBER_OF_EXAMPLE_PROMPTS_LIMIT,
        t('prompt-suggestions-max-count', { maxCount: NUMBER_OF_EXAMPLE_PROMPTS_LIMIT }),
      ),
  });
}

export type AssistantFormValues = z.infer<ReturnType<typeof createAssistantFormValuesSchema>>;

export function AssistantEdit({
  assistant,
  relatedFiles,
  initialLinks,
  avatarPictureUrl,
  isWebSearchAvailable,
}: {
  assistant: AssistantSelectModel;
  relatedFiles: FileModel[];
  initialLinks: WebSource[];
  avatarPictureUrl?: string;
  isWebSearchAvailable: boolean;
}) {
  useForceReloadOnBrowserBackButton();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('assistants');
  const assistantFormValuesSchema = useMemo(() => createAssistantFormValuesSchema(t), [t]);
  const assistantFieldValidationConfig = useMemo(
    () => createAssistantFieldValidationConfig(t),
    [t],
  );
  const filterValues = extractFilterValues(assistant);
  const {
    communityTemplateRequest,
    setCommunityTemplateRequest,
    createRequest: createCommunityTemplateRequest,
    cancelRequest: cancelCommunityTemplateRequest,
  } = useCommunityTemplateRequest({
    entityId: assistant.id,
    getRequest: () => getCommunityTemplateRequestWithEventsAction({ assistantId: assistant.id }),
    createRequest: () => createCommunityTemplateRequestAction({ assistantId: assistant.id }),
    cancelRequest: () => cancelCommunityTemplateRequestAction({ assistantId: assistant.id }),
  });
  const initialValues: AssistantFormValues = {
    name: assistant.name,
    description: assistant.description ?? '',
    instructions: assistant.instructions ?? '',
    schoolTypes: filterValues.schoolTypes,
    gradeRanges: filterValues.gradeRanges,
    subjects: filterValues.subjects,
    categories: filterValues.categories,
    federalStates: filterValues.federalStates,
    languages: filterValues.languages,
    isSchoolShared: assistant.isSchoolShared,
    isCommunityShared: assistant.isCommunityShared,
    hasLinkAccess: assistant.hasLinkAccess,
    isWebSearchEnabled: assistant.isWebSearchEnabled,
    webSearchScope: assistant.webSearchScope,
    webSearchIncludedDomains: assistant.webSearchIncludedDomains,
    promptSuggestions:
      assistant.promptSuggestions && assistant.promptSuggestions.length > 0
        ? assistant.promptSuggestions.map((s) => ({ value: s }))
        : [{ value: '' }],
  };

  const {
    control,
    trigger,
    getValues,
    reset,
    setValue,
    formState: { isDirty },
  } = useForm<AssistantFormValues>({
    resolver: zodResolver(assistantFormValuesSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  const { isSaving, hasSaveError, flushAutoSave, handleAutoSave } =
    useFormAutosave<AssistantFormValues>({
      initialValues,
      isDirty,
      getValues,
      reset: (values) => {
        reset({ ...values, name: values.name.trim() });
      },
      validate: trigger,
      saveValues: async (data) => {
        // isSchoolShared/isCommunityShared are handled separately in handleSharingChange
        const updateResult = await updateAssistantAction({
          assistantId: assistant.id,
          name: data.name.trim(),
          description: data.description,
          instructions: data.instructions,
          filterGroup: toFilterGroup(data),
          hasLinkAccess: data.hasLinkAccess,
          isWebSearchEnabled: data.isWebSearchEnabled,
          webSearchScope: data.webSearchScope,
          webSearchIncludedDomains: data.webSearchIncludedDomains,
          promptSuggestions: data.promptSuggestions
            .map((suggestion) => suggestion.value.trim())
            .filter((suggestion) => suggestion.length > 0),
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
    (isSchoolShared || isCommunityShared || hasLinkAccess) && !assistant.suspended;

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
      router.push(`/assistants/d/${assistant.id}/`);
    });
  };

  const handleDuplicateAssistant = async () => {
    const createResult = await createNewAssistantAction({
      templateId: assistant.id,
      duplicateAssistantName: t('duplicate-name-format-string', {
        sourceName: name,
      }),
    });
    if (createResult.success) {
      guardNavigation(() => {
        router.push(`/assistants/editor/${createResult.value.id}`);
      });
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  };

  const handleDeleteAssistant = async () => {
    const deleteResult = await deleteAssistantAction({ assistantId: assistant.id });
    if (deleteResult.success) {
      toast.success(t('toasts.delete-toast-success'));
    }
    if (!deleteResult.success) {
      toast.error(t('toasts.delete-toast-error'));
    }
    guardNavigation(() => {
      router.push('/assistants');
    });
  };

  const handleFileUploaded = async (data: { id: string; name: string; file: File }) => {
    // after a file is uploaded, we need to link it to the assistant
    const linkResult = await linkFileToAssistantAction({
      fileId: data.id,
      assistantId: assistant.id,
    });

    if (!linkResult.success) {
      toast.error(t('toasts.file-link-error'));
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    return await deleteFileMappingAndEntityAction({ assistantId: assistant.id, fileId });
  };

  async function handleDownloadFile(fileId: string) {
    return downloadFileFromAssistantAction({ assistantId: assistant.id, fileId });
  }

  const handleLinksChange = async (links: string[]) => {
    return await updateAssistantAction({ assistantId: assistant.id, attachedLinks: links });
  };

  async function handleUploadPicture(croppedImageBlob: Blob) {
    const result = await uploadAvatarPictureForAssistantAction({
      assistantId: assistant.id,
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
    const result = await getAssistantSharingStateAction({ assistantId: assistant.id });
    if (result.success) {
      setValue('isSchoolShared', result.value.entity.isSchoolShared, { shouldDirty: false });
      setValue('isCommunityShared', result.value.entity.isCommunityShared, { shouldDirty: false });
      setValue('hasLinkAccess', result.value.entity.hasLinkAccess, { shouldDirty: false });
      setCommunityTemplateRequest(result.value.request);
    }
  }, [assistant.id, setValue, setCommunityTemplateRequest]);

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

      setValue('isCommunityShared', result.value.entity.isCommunityShared, {
        shouldDirty: false,
      });
      setValue('hasLinkAccess', result.value.entity.hasLinkAccess, { shouldDirty: false });
    } else if (name === 'isSchoolShared') {
      const result = await updateAssistantSchoolSharingAction({
        assistantId: assistant.id,
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

  const assistantActions = (
    <CustomChatActions>
      <CustomChatActionUse onClick={handleUseChat} />
      {!assistant.suspended && <CustomChatActionDuplicate onClick={handleDuplicateAssistant} />}
      <CustomChatActionDelete
        onClick={handleDeleteAssistant}
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
          href="/custom"
          text={t('back-button')}
          aria-label={t('back-button-aria-label')}
          onClick={() => {
            guardNavigation(() => {
              router.push('/assistants');
            });
          }}
        />
        <CustomChatTitle title={name} />
        <div className="flex flex-wrap items-start gap-3">{assistantActions}</div>
        {showShareInfo && (
          <CustomChatShareInfo
            href="#share-settings"
            info={t('sharing-info')}
            linkText={t('sharing-settings')}
          />
        )}
        {assistant.suspended && <CustomChatSuspensionError info={t('suspension-error')} />}
        <CustomChatImageUpload
          avatarPictureUrl={avatarPictureUrl}
          onUploadPicture={handleUploadPicture}
        />

        <form
          id="assistant-edit-form"
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
                  {...assistantFieldValidationConfig.name}
                  label={t('name-label')}
                  placeholder={t('name-placeholder')}
                  autoFocusWhenEmpty
                  testId="assistant-name-input"
                  onBlur={handleAutoSave}
                />
                <FormField
                  name="description"
                  control={control}
                  {...assistantFieldValidationConfig.description}
                  label={t('description-label')}
                  placeholder={t('description-placeholder')}
                  testId="assistant-description-input"
                  onBlur={handleAutoSave}
                  type="textArea"
                  className="h-27 resize-none"
                />
                <FormField
                  name="instructions"
                  control={control}
                  {...assistantFieldValidationConfig.instructions}
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
                  testId="assistant-instructions-input"
                  onBlur={handleAutoSave}
                  type="textArea"
                  className="h-125"
                />
                <CustomChatPromptSuggestions control={control} onBlur={handleAutoSave} />
              </FieldGroup>
            </CardContent>
          </Card>

          <CustomChatFilesAndLinks
            initialFiles={relatedFiles}
            onFileUploaded={handleFileUploaded}
            onDeleteFile={handleDeleteFile}
            onDownloadFile={handleDownloadFile}
            initialLinks={initialLinks}
            onLinksChange={handleLinksChange}
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
            linkToShare={`/assistants/${assistant.id}`}
            onShareChange={handleSharingChange}
            suspended={assistant.suspended}
          />
          {communityTemplateRequest && (
            <CommunityTemplateRequest
              requestWithEvents={communityTemplateRequest}
              onResubmit={createCommunityTemplateRequest}
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
