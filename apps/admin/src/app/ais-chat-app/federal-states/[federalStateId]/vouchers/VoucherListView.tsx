'use client';
import { Voucher } from '@ais-chat/shared/vouchers/voucher';
import { Button } from '@ui/components/button';
import Link from 'next/link';
import React from 'react';

import { ROUTES } from '../../../../../consts/routes';
import VoucherList from './VoucherList';

export default function VoucherListView({
  vouchers,
  federalStateId,
}: {
  vouchers: Voucher[];
  federalStateId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between w-full gap-4 mb-4">
        <h1>Guthaben Codes Übersicht</h1>
        <Link href={ROUTES.app.voucherNew(federalStateId)}>
          <Button>Neue erstellen</Button>
        </Link>
      </div>
      <VoucherList vouchers={vouchers} />
    </div>
  );
}
