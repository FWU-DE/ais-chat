import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';

import CharacterOverview from './character-overview';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('characters.page-titles');
  return {
    title: t('list'),
  };
}

export default async function Page() {
  const { user } = await requireAuth();

  return (
    <DefaultPageLayout>
      <CharacterOverview currentUserId={user.id} />
    </DefaultPageLayout>
  );
}
