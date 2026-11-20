import {
  getPersonalContextForUser,
  isPersonalContextAvailable,
} from '@shared/personal-context/personal-context-service';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';

import { PersonalContextEditor } from './personal-context-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('personal-context');
  return {
    title: t('heading'),
  };
}

export default async function Page() {
  const { user, federalState } = await requireAuth();

  if (
    !isPersonalContextAvailable({
      featureToggles: federalState.featureToggles,
      userRole: user.userRole,
    })
  ) {
    notFound();
  }

  const personalContext = await getPersonalContextForUser({
    actor: {
      userId: user.id,
      userRole: user.userRole,
      featureToggles: federalState.featureToggles,
    },
  });

  return (
    <DefaultPageLayout layoutConfig={{ layout: 'form' }}>
      <PersonalContextEditor
        initialContent={personalContext.content}
        initialEnabled={personalContext.enabled}
      />
    </DefaultPageLayout>
  );
}
