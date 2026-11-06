import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMaybeUser, getSafeCallbackUrl } from '@/auth/utils';
import Footer from '@/components/navigation/footer';
import { getHostByHeaders } from '@/utils/host';

import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.page-titles');
  return {
    title: t('login'),
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const maybeUser = await getMaybeUser();
  const { callbackUrl } = await searchParams;

  if (maybeUser !== null) {
    // User is already logged in, redirect to callbackUrl or home
    redirect(getSafeCallbackUrl(callbackUrl));
  }

  const host = await getHostByHeaders();

  return (
    <div className="h-dvh flex flex-col gap-4 sm:gap-8">
      <LoginForm />
      <div className="px-4 pt-4 sm:px-8 sm:pt-8">
        <hr className="w-full" />
        <Footer host={host} />
      </div>
    </div>
  );
}
