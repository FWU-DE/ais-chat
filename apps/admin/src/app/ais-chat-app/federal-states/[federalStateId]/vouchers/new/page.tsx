import React from 'react';

import { auth } from '@/auth';

import VoucherCreateView from './VoucherCreateView';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]/vouchers/new'>,
) {
  const { federalStateId } = await props.params;
  const session = await auth();
  if (
    session === null ||
    session.user === undefined ||
    session.user.name === undefined ||
    session.user.name === null
  ) {
    throw new Error('User not found');
  }
  return (
    <div>
      <VoucherCreateView federalStateId={federalStateId} />
    </div>
  );
}
