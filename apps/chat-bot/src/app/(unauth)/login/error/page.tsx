import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import { getAuthErrorFromUrl, getFieldErrorsFromUrl } from '@shared/auth/authentication-service';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import LogoutButton from '@/app/(authed)/logout-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.page-titles');
  return {
    title: t('login-error'),
  };
}

const fieldNameMappings = {
  rolle: 'Rolle',
  schulkennung: 'Schulkennung',
  bundesland: 'Bundesland',
};

export default async function Page(props: PageProps<'/login/error'>) {
  const searchParams = await props.searchParams;
  const missingFieldsInProfile = getFieldErrorsFromUrl(searchParams);
  const authError = getAuthErrorFromUrl(searchParams);
  const t = await getTranslations('authentication.login-error');

  return (
    <div className="flex justify-center min-h-screen items-center">
      <div className="p-6 flex flex-col gap-4 items-center rounded-xl border bg-light-gray max-w-fit">
        <WarningIcon className="size-12 text-primary" aria-hidden="true" />
        <div>{t('description')}</div>
        {authError === 'federal_state_not_found' ? <div>{t('federal-state-not-found')}</div> : null}
        <ul>
          {missingFieldsInProfile.map((field) => {
            return (
              <li key={field}>
                {fieldNameMappings[field as keyof typeof fieldNameMappings] ?? field}
              </li>
            );
          })}
        </ul>
        {/* we cannot logout because there is no valid token but it works as intended */}
        <LogoutButton />
      </div>
    </div>
  );
}
