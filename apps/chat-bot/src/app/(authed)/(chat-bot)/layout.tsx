import SessionWatcher from '@/auth/SessionWatcher';
import { getUser, userHasCompletedTraining } from '@/auth/utils';
import { ApplicationLayout } from '@/components/layout/application-layout';
import { federalStateDisclaimers, VERSION } from '@/components/modals/const';
import ProductAccessModal from '@/components/modals/product-access';
import TermsConditionsModal from '@/components/modals/terms-conditions-initial';
import AppSidebar from '@/components/navigation/sidebar/app-sidebar';
import { FederalStateProvider } from '@/components/providers/federal-state-provider';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { UserSettingsProvider } from '@/components/providers/user-settings-provider';
import { checkProductAccess } from '@/utils/vidis/access';
import { FederalStateId } from '@/utils/vidis/const';
import { SidebarProvider } from '@ais-chat/ui/components/sidebar';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getFederalStateById } from '@shared/federal-states/federal-state-service';
import { getActiveBannersForUser } from '@shared/info-banners/info-banner-service';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import {
  getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser,
} from '@shared/users/user-budget-service';
import { getUserSettings } from '@shared/users/user-settings-service';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import { setUserAcceptConditions } from './actions';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('errors');
  const user = await getUser();
  if (!user.federalState.hasApiKeyAssigned) throw new Error(t('no-api-key'));

  const [
    federalState,
    models,
    usedBudget,
    maxBudget,
    hasCompletedTraining,
    activeBanners,
    settings,
  ] = await Promise.all([
    getFederalStateById(user.federalState.id),
    dbGetLlmModelsByFederalStateId({ federalStateId: user.federalState.id }),
    getUsedBudgetInCentByUser({ user }),
    getMaxBudgetInCentByUser({ user, federalState: user.federalState }),
    userHasCompletedTraining(),
    getActiveBannersForUser({
      federalStateId: user.federalState.id,
      userId: user.id,
    }),
    getUserSettings({ userId: user.id }),
  ]);

  const productAccess = checkProductAccess({ ...user, hasCompletedTraining });
  const defaultModelName = await getDefaultModelNameByFederalStateId(user.federalState.id, models);
  const userAndContext = {
    ...user,
    userRole: user.userRole,
    federalState,
  };
  const federalStateDisclaimer =
    federalStateDisclaimers[(user.federalStateId ?? user.federalState.id) as FederalStateId];
  const userMustAccept =
    federalStateDisclaimer !== undefined &&
    (user.versionAcceptedConditions === null || user.versionAcceptedConditions < VERSION);

  return (
    <SessionWatcher redirectTo="/api/auth/logout-callback">
      <FederalStateProvider federalState={federalState}>
        <UserSettingsProvider settings={settings ?? {}}>
          <SidebarProvider className="min-h-0">
            <LlmModelsProvider
              models={models}
              initialModelName={user.lastUsedModel ?? defaultModelName}
              defaultModelName={defaultModelName}
            >
              <AppSidebar
                user={user}
                federalState={federalState}
                usedBudget={usedBudget ?? 0}
                maxBudget={maxBudget ?? 500}
              />
              <ApplicationLayout userAndContext={userAndContext} infoBanners={activeBanners}>
                {children}
              </ApplicationLayout>
            </LlmModelsProvider>
          </SidebarProvider>
        </UserSettingsProvider>
        {!productAccess.hasAccess && (
          <ProductAccessModal modalTitle="Nutzung nicht möglich">
            {productAccess.errorMessage}
          </ProductAccessModal>
        )}
        {userMustAccept ? (
          <TermsConditionsModal
            handleAccept={setUserAcceptConditions}
            disclaimerConfig={federalStateDisclaimer}
          ></TermsConditionsModal>
        ) : null}
      </FederalStateProvider>
    </SessionWatcher>
  );
}
