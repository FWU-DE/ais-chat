'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TrashSimpleIcon } from '@phosphor-icons/react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import { Voucher } from '@ais-chat/shared/vouchers/voucher';
import { revokeVoucherAction } from './actions';
import { Button } from '@ui/components/button';
import { BusinessError } from '@shared/error';

interface VoucherListProps {
  vouchers: Voucher[];
  onVoucherRevoked?: (voucherCode: string) => void;
}

export default function VoucherList({ vouchers, onVoucherRevoked }: VoucherListProps) {
  const router = useRouter();

  const handleRevoke = async (voucher: Voucher) => {
    const reason = prompt('Bitte Grund für das Widerrufen des Codes angeben:');
    if (!reason || reason.trim().length === 0) {
      toast.error('Widerrufen abgebrochen: Grund ist erforderlich.');
      return;
    }
    try {
      await revokeVoucherAction(voucher.code, voucher.federalStateId, reason);
      toast.success('Gutschein wurde erfolgreich widerrufen.');

      // If callback is provided (client state), use it; otherwise refresh from server
      if (onVoucherRevoked) {
        onVoucherRevoked(voucher.code);
      } else {
        router.refresh();
      }
    } catch (err) {
      const errorMessage =
        err instanceof BusinessError ? err.message : 'Ein unbekannter Fehler ist aufgetreten';
      toast.error('Fehler beim Widerrufen des Gutscheins: ' + errorMessage);
    }
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Betrag (in Cent)</TableHead>
          <TableHead>Dauer (in Monaten)</TableHead>
          <TableHead>Gültig bis</TableHead>
          <TableHead>Erstellt am</TableHead>
          <TableHead>Erstellt von</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vouchers.map((voucher) => (
          <TableRow key={voucher.code}>
            <TableCell>{voucher.code}</TableCell>
            <TableCell>{voucher.increaseAmount}</TableCell>
            <TableCell>{voucher.durationMonths}</TableCell>
            <TableCell>{new Date(voucher.validUntil).toLocaleDateString('de-DE')}</TableCell>
            <TableCell>{new Date(voucher.createdAt).toLocaleDateString('de-DE')}</TableCell>
            <TableCell>{voucher.createdBy}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {voucher.status}
                {voucher.status === 'created' && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="rounded-full"
                    aria-label={`Gutschein ${voucher.code} widerrufen`}
                    onClick={() => handleRevoke(voucher)}
                  >
                    <TrashSimpleIcon />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
