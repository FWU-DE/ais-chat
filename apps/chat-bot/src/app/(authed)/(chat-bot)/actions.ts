'use server';

import { requireAuth } from '@/auth/requireAuth';
import { VERSION } from '@/components/modals/const';
import { runServerAction } from '@shared/actions/run-server-action';
import deleteConversation, {
  getConversation,
  updateConversationTitle,
} from '@shared/conversation/conversation-service';
import { dbGetRelatedFiles } from '@shared/db/functions/files';
import { dbUpdateUserTermsVersion } from '@shared/db/functions/user';
import { UserSettings, userSettingsSchema } from '@shared/db/schema';
import { trackInfoBannerView } from '@shared/info-banners/info-banner-service';
import { updateUserSettings } from '@shared/users/user-settings-service';

export async function deleteConversationAction({ conversationId }: { conversationId: string }) {
  const { user } = await requireAuth();

  return runServerAction(
    'deleteConversationAction',
    deleteConversation,
  )({
    conversationId,
    userId: user.id,
  });
}

/** Triggered by the user if they want to update the name of a conversation */
export async function updateConversationTitleAction({
  conversationId,
  name,
}: {
  conversationId: string;
  name: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateConversationTitleAction',
    updateConversationTitle,
  )({
    conversationId,
    name,
    userId: user.id,
  });
}

export async function setUserAcceptConditions() {
  const { user } = await requireAuth();
  return runServerAction('setUserAcceptConditions', async () => {
    const updated = await dbUpdateUserTermsVersion({
      userId: user.id,
      versionAcceptedConditions: VERSION,
    });
    return updated?.versionAcceptedConditions === VERSION;
  })();
}

export async function refetchFileMapping(conversationId: string) {
  const { user } = await requireAuth();
  return runServerAction('refetchFileMapping', async () => {
    // Verify the user owns this conversation before returning file data
    await getConversation({ conversationId, userId: user.id });
    return dbGetRelatedFiles(conversationId);
  })();
}

export async function trackInfoBannerViewAction(infoBannerId: string): Promise<void> {
  const { user } = await requireAuth();

  await runServerAction(
    'trackInfoBannerViewAction',
    trackInfoBannerView,
  )({
    infoBannerId,
    userId: user.id,
  });
}

export async function updateUserSettingsAction({ settings }: { settings: UserSettings }) {
  const { user } = await requireAuth();

  return runServerAction('updateUserSettingsAction', async () => {
    const parsedSettings = userSettingsSchema.parse(settings);
    return updateUserSettings({ userId: user.id, settings: parsedSettings });
  })();
}
