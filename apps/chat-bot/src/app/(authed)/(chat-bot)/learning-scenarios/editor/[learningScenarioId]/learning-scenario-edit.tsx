'use client';

import {
  SMALL_TEXT_INPUT_FIELDS_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
} from '@/configuration-text-inputs/const';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FileModel,
  LearningScenarioOptionalShareDataModel,
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
import { useForm, useWatch } from 'react-hook-form';
import { useCallback, useMemo, useRef } from 'react';
import z from 'zod';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatActionDelete } from '@/components/custom-chat/custom-chat-action-delete';
import { useRouter } from 'next/navigation';
import {
  extendLearningScenarioShareExpirationAction,
  getLearningScenarioShareDataAction,
  removeFileFromLearningScenarioAction,
  shareLearningScenarioAction,
  unshareLearningScenarioAction,
  updateLearningScenarioShareTokenPointsLimitAction,
  createCommunityTemplateRequestAction,
  cancelCommunityTemplateRequestAction,
  sendMessageToEditorAction,
  getLearningScenarioSharingStateAction,
  updateLearningScenarioSchoolSharingAction,
  updateLearningScenarioAction,
  uploadAvatarPictureForLearningScenarioAction,
} from './actions';
import {
  createNewLearningScenarioFromTemplateAction,
  deleteLearningScenarioAction,
  downloadFileFromLearningScenarioAction,
  linkFileToLearningScenarioAction,
} from '../../actions';
import { useToast } from '@/components/common/toast';
import { useTranslations } from 'next-intl';
import { CustomChatShareInfo } from '@/components/custom-chat/custom-chat-share-info';
import { CustomChatImageUpload } from '@/components/custom-chat/custom-chat-image-upload';
import { usePendingChangesGuard } from '@/hooks/use-pending-changes-guard';
import { useForceReloadOnBrowserBackButton } from '@/hooks/use-force-reload-on-browser-back-button';
import { useFormAutosave } from '@/hooks/use-form-autosave';
import { useEntitySharing } from '@/hooks/use-entity-sharing';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { isCommunitySharingActive } from '@shared/community-templates/community-sharing-state';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import { CustomChatModelSelect } from '@/components/custom-chat/custom-chat-model-select';
import { WebSource } from '@shared/db/types';
import CustomShareSection from '@/components/custom-chat/custom-chat-share-section';
import { useLlmModels } from '@/components/providers/llm-model-provider';
import { CustomChatShareWithLearners } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners';
import { CustomChatHeading2 } from '@/components/custom-chat/custom-chat-heading2';
import { CustomChatInstructionsExampleDialog } from '@/components/custom-chat/custom-chat-instructions-example-dialog';
import { CustomChatHeaderContent } from '@/components/custom-chat/custom-chat-header-content';
import { FormField } from '@ui/components/form/form-field';
import { RichText, stripRichTextTags } from '@/components/common/rich-text';
import { CustomChatSuspensionError } from '@/components/custom-chat/custom-chat-suspension-error';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import FilterSelectSection from '@/components/custom-chat/filter/custom-chat-filter-select-section';
import {
  extractFilterValues,
  toFilterGroup,
} from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { CustomChatWebSearchEditView } from '@/components/custom-chat/web-search/custom-chat-web-search-edit-view';
import { CommunityTemplateRequest } from '@/components/custom-chat/sharing/community-template-request';
import { CustomChatSpeechEditView } from '@/components/custom-chat/speech/custom-chat-speech-edit-view';

type LearningScenarioTranslator = ReturnType<typeof useTranslations<'learning-scenarios'>>;

function createLearningScenarioFieldValidationConfig(t: LearningScenarioTranslator) {
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
    additionalInstructions: {
      maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
      maxLengthErrorMessage: t('instructions-max-length', {
        maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
      }),
    },
    studentExercise: {
      maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      maxLengthErrorMessage: t('student-exercise-max-length', {
        maxLength: TEXT_INPUT_FIELDS_LENGTH_LIMIT,
      }),
    },
  };
}

function createLearningScenarioFormValuesSchema(t: LearningScenarioTranslator) {
  return z.object({
    name: z.string().trim().min(1, t('name-required')),
    description: z.string(),
    additionalInstructions: z.string(),
    studentExercise: z.string(),
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
    isSpeechEnabled: z.boolean(),
  });
}

export type LearningScenarioFormValues = z.infer<
  ReturnType<typeof createLearningScenarioFormValuesSchema>
>;

export function LearningScenarioEdit({
  learningScenario,
  relatedFiles,
  initialLinks,
  avatarPictureUrl,
  initialCommunityTemplateRequest,
  usedBudget,
  maxBudget,
  budgetUsedBySharedChat,
  isWebSearchAvailable,
  isSpeechAvailable,
}: {
  learningScenario: LearningScenarioOptionalShareDataModel;
  relatedFiles: FileModel[];
  initialLinks: WebSource[];
  avatarPictureUrl?: string;
  initialCommunityTemplateRequest: CommunityTemplateRequestWithEvents | null;
  usedBudget: number;
  maxBudget: number;
  budgetUsedBySharedChat: number;
  isWebSearchAvailable: boolean;
  isSpeechAvailable: boolean;
}) {
  useForceReloadOnBrowserBackButton();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('learning-scenarios');
  const tToast = useTranslations('learning-scenarios.toasts');
  const learningScenarioFormValuesSchema = useMemo(
    () => createLearningScenarioFormValuesSchema(t),
    [t],
  );

  const { models, defaultModel } = useLlmModels();
  const maybeDefaultModelId = defaultModel?.id;
  const isModelAvailable =
    learningScenario.modelId && models.some((m) => m.id === learningScenario.modelId);
  const selectedModelId = isModelAvailable ? learningScenario.modelId : maybeDefaultModelId;
  const filterValues = extractFilterValues(learningScenario);

  const initialValues: LearningScenarioFormValues = {
    name: learningScenario.name,
    description: learningScenario.description ?? '',
    additionalInstructions: learningScenario.additionalInstructions ?? '',
    studentExercise: learningScenario.studentExercise ?? '',
    modelId: selectedModelId ?? '',
    schoolTypes: filterValues.schoolTypes,
    gradeRanges: filterValues.gradeRanges,
    subjects: filterValues.subjects,
    categories: filterValues.categories,
    federalStates: filterValues.federalStates,
    languages: filterValues.languages,
    isSchoolShared: learningScenario.isSchoolShared,
    isCommunityShared: isCommunitySharingActive({
      isCommunityShared: learningScenario.isCommunityShared,
      requestState: initialCommunityTemplateRequest?.state,
    }),
    hasLinkAccess: learningScenario.hasLinkAccess,
    isWebSearchEnabled: learningScenario.isWebSearchEnabled,
    webSearchScope: learningScenario.webSearchScope,
    webSearchIncludedDomains: learningScenario.webSearchIncludedDomains,
    isSpeechEnabled: learningScenario.isSpeechEnabled,
  };

  const {
    control,
    trigger,
    getValues,
    reset,
    setValue,
    formState: { isDirty },
  } = useForm<LearningScenarioFormValues>({
    resolver: zodResolver(learningScenarioFormValuesSchema),
    defaultValues: initialValues,
    mode: 'onBlur',
  });

  const { isSaving, hasSaveError, flushAutoSave, handleAutoSave } =
    useFormAutosave<LearningScenarioFormValues>({
      initialValues,
      isDirty,
      getValues,
      reset: (values) => {
        reset({ ...values, name: values.name.trim() });
      },
      validate: trigger,
      saveValues: async (data) => {
        const updateResult = await updateLearningScenarioAction({
          learningScenarioId: learningScenario.id,
          data: {
            ...learningScenario,
            ...data,
            name: data.name.trim(),
            description: data.description ?? '',
            studentExercise: data.studentExercise ?? '',
            filterGroup: toFilterGroup(data),
            attachedLinks: attachedLinksRef.current,
          },
        });

        return updateResult.success;
      },
    });

  const {
    communityTemplateRequest,
    createCommunityTemplateRequest,
    sendMessageToEditor,
    handleSharingChange,
  } = useEntitySharing({
    setValue,
    initialRequest: initialCommunityTemplateRequest,
    actions: {
      createRequest: () =>
        createCommunityTemplateRequestAction({ learningScenarioId: learningScenario.id }),
      cancelRequest: () =>
        cancelCommunityTemplateRequestAction({ learningScenarioId: learningScenario.id }),
      sendMessage: (message) =>
        sendMessageToEditorAction({ learningScenarioId: learningScenario.id, message }),
      getSharingState: () =>
        getLearningScenarioSharingStateAction({ learningScenarioId: learningScenario.id }),
      updateSchoolSharing: (isSchoolShared) =>
        updateLearningScenarioSchoolSharingAction({
          learningScenarioId: learningScenario.id,
          isSchoolShared,
        }),
    },
    onError: () => toast.error(tToast('edit-toast-error')),
    onSuccess: flushAutoSave,
  });

  const name = useWatch({ control, name: 'name' });
  const schoolTypes = useWatch({ control, name: 'schoolTypes' });
  const gradeRanges = useWatch({ control, name: 'gradeRanges' });
  const subjects = useWatch({ control, name: 'subjects' });
  const categories = useWatch({ control, name: 'categories' });
  const federalStates = useWatch({ control, name: 'federalStates' });
  const languages = useWatch({ control, name: 'languages' });
  const attachedLinksRef = useRef(learningScenario.attachedLinks);
  const isSchoolShared = useWatch({ control, name: 'isSchoolShared' });
  const isCommunityShared = useWatch({ control, name: 'isCommunityShared' });
  const hasLinkAccess = useWatch({ control, name: 'hasLinkAccess' });
  const showShareInfo =
    (isSchoolShared || isCommunityShared || hasLinkAccess) && !learningScenario.suspended;

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
      router.push(`/learning-scenarios/d/${learningScenario.id}/`);
    });
  };

  const handleDuplicateLearningScenario = async () => {
    const createResult = await createNewLearningScenarioFromTemplateAction({
      templateId: learningScenario.id,
      duplicateLearningScenarioName: t('duplicate-name-format-string', {
        sourceName: name,
      }),
    });
    if (createResult.success) {
      guardNavigation(() => {
        router.push(`/learning-scenarios/editor/${createResult.value.id}`);
      });
    } else {
      toast.error(tToast('create-toast-error'));
    }
  };

  const handleDeleteLearningScenario = async () => {
    const deleteResult = await deleteLearningScenarioAction({ id: learningScenario.id });
    if (deleteResult.success) {
      toast.success(tToast('delete-toast-success'));
    } else {
      toast.error(tToast('delete-toast-error'));
    }
    guardNavigation(() => {
      router.push('/learning-scenarios');
    });
  };

  const handleFileUploaded = async (data: { id: string; name: string; file: File }) => {
    const linkResult = await linkFileToLearningScenarioAction({
      fileId: data.id,
      learningScenarioId: learningScenario.id,
    });

    if (!linkResult.success) {
      toast.error(tToast('file-link-error'));
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    return removeFileFromLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      fileId,
    });
  };

  const handleDownloadFile = async (fileId: string) => {
    return downloadFileFromLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      fileId,
    });
  };

  const handleLinksChange = async (links: string[]) => {
    const result = await updateLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      data: {
        ...learningScenario,
        attachedLinks: links,
      },
    });
    if (result.success) {
      attachedLinksRef.current = links;
    }
    return result;
  };

  async function handleUploadPicture(croppedImageBlob: Blob) {
    const result = await uploadAvatarPictureForLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      croppedImageBlob,
    });

    if (result.success) {
      toast.success(tToast('image-toast-success'));
    }

    return result;
  }

  const actionButtons = (
    <CustomChatActions>
      <CustomChatActionUse onClick={handleUseChat} />
      {!learningScenario.suspended && (
        <CustomChatActionDuplicate onClick={handleDuplicateLearningScenario} />
      )}
      <CustomChatActionDelete
        onClick={handleDeleteLearningScenario}
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
          href="/learning-scenarios"
          text={t('back-button')}
          aria-label={t('back-button-aria-label')}
          onClick={() => {
            guardNavigation(() => {
              router.push('/learning-scenarios');
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
        {learningScenario.suspended && <CustomChatSuspensionError info={t('suspension-error')} />}
        <CustomChatShareWithLearners
          expiredAt={learningScenario.expiredAt}
          manuallyStoppedAt={learningScenario.manuallyStoppedAt}
          maxUsageTimeLimit={learningScenario.maxUsageTimeLimit}
          tokenPointsLimit={learningScenario.tokenPointsLimit}
          usedBudget={usedBudget}
          maxBudget={maxBudget}
          budgetUsedBySharedChat={budgetUsedBySharedChat}
          onShare={(data) =>
            shareLearningScenarioAction({
              learningScenarioId: learningScenario.id,
              data: data as Parameters<typeof shareLearningScenarioAction>[0]['data'],
            })
          }
          onUnshare={() =>
            unshareLearningScenarioAction({
              learningScenarioId: learningScenario.id,
            })
          }
          onAddTime={(data) =>
            extendLearningScenarioShareExpirationAction({
              learningScenarioId: learningScenario.id,
              additionalTimeInMinutes: data.additionalTimeInMinutes,
            }).then((result) => {
              if (result.success) {
                return { success: true, expiredAt: result.value.expiredAt };
              }
              return { success: false };
            })
          }
          onAdjustTokenLimit={(data) =>
            updateLearningScenarioShareTokenPointsLimitAction({
              learningScenarioId: learningScenario.id,
              tokenPointsPercentageLimit: data.tokenPointsPercentageLimit,
            }).then((result) => {
              if (result.success) {
                return { success: true, tokenPointsLimit: result.value.tokenPointsLimit };
              }
              return { success: false };
            })
          }
          onPollShareData={() =>
            getLearningScenarioShareDataAction({
              learningScenarioId: learningScenario.id,
            })
          }
          shareUILink={`/learning-scenarios/editor/${learningScenario.id}/share`}
          sharingDisabled={!name || name.trim().length === 0}
        />

        <div className="flex flex-col gap-3">
          <CustomChatHeading2 text={t('configuration-heading')} />

          <CustomChatImageUpload
            avatarPictureUrl={avatarPictureUrl}
            onUploadPicture={handleUploadPicture}
          />

          <form
            id="learning-scenario-edit-form"
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
                    {...createLearningScenarioFieldValidationConfig(t).name}
                    label={t('name-label')}
                    placeholder={t('name-placeholder')}
                    autoFocusWhenEmpty
                    testId="learning-scenario-name-input"
                    onBlur={handleAutoSave}
                  />
                  <FormField
                    name="description"
                    control={control}
                    {...createLearningScenarioFieldValidationConfig(t).description}
                    label={t('description-label')}
                    placeholder={t('description-placeholder')}
                    testId="learning-scenario-description-input"
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
                    name="additionalInstructions"
                    control={control}
                    {...createLearningScenarioFieldValidationConfig(t).additionalInstructions}
                    label={t('instructions-label')}
                    labelAction={
                      <CustomChatInstructionsExampleDialog
                        descriptionContent={
                          <div className="whitespace-pre-line">
                            <RichText>
                              {(tags) => t.rich('instructions-placeholder', tags)}
                            </RichText>
                          </div>
                        }
                      />
                    }
                    placeholder={stripRichTextTags(t.raw('instructions-placeholder'))}
                    testId="learning-scenario-instructions-input"
                    onBlur={handleAutoSave}
                    type="textArea"
                    className="h-125"
                  />
                  <FormField
                    name="studentExercise"
                    control={control}
                    {...createLearningScenarioFieldValidationConfig(t).studentExercise}
                    label={t('student-exercise-label')}
                    tooltip={t('student-exercise-tooltip')}
                    placeholder={t('student-exercise-placeholder')}
                    testId="learning-scenario-student-exercise-input"
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

            {isSpeechAvailable && (
              <CustomChatSpeechEditView
                control={control}
                onCheckedChange={() => {
                  void flushAutoSave();
                }}
              />
            )}

            <CustomShareSection
              control={control}
              schoolSharingName="isSchoolShared"
              communitySharingName="isCommunityShared"
              linkSharingName="hasLinkAccess"
              linkToShare={`/learning-scenarios/${learningScenario.id}`}
              onShareChange={handleSharingChange}
              suspended={learningScenario.suspended}
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
        </div>
      </CustomChatLayoutContainer>
    </>
  );
}
