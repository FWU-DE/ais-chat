'use client';
import { CreateVoucherParams, Voucher } from '@ais-chat/shared/vouchers/voucher';
import { BusinessError } from '@shared/error';
import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { Textarea } from '@ui/components/textarea';
import React, { useState } from 'react';
import { CSVLink } from 'react-csv';
import { toast } from 'sonner';

import { createVouchersAction } from '../actions';
import VoucherList from '../VoucherList';

export default function VoucherCreateView({ federalStateId }: { federalStateId: string }) {
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1'); // default 1 code
  const [comment, setComment] = useState('');
  const [months, setMonths] = useState('3'); // default 3 months

  const [createdVouchers, setCreatedVouchers] = useState<Voucher[]>([]);

  const handleVoucherRevoked = (voucherCode: string) => {
    setCreatedVouchers((prev) =>
      prev.map((voucher) =>
        voucher.code === voucherCode ? { ...voucher, status: 'revoked' as const } : voucher,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseInt(amount);
    if (!parsedAmount || parsedAmount < 1 || parsedAmount > 20000) {
      toast.error('Bitte einen gültigen Guthabenbetrag zwischen 1 und 20000 Cent angeben.');
      return;
    }
    const parsedCount = parseInt(count);
    if (parsedCount < 1) {
      toast.error('Bitte eine gültige Anzahl von Codes angeben.');
      return;
    }
    const parsedMonths = parseInt(months);
    if (parsedMonths < 1 || parsedMonths > 12) {
      toast.error('Bitte eine gültige Anzahl von Monaten zwischen 1 und 12 angeben.');
      return;
    }
    if (comment.length < 1) {
      toast.error('Bitte einen Grund für die Erstellung angeben.');
      return;
    }
    try {
      const voucherData: CreateVoucherParams = {
        increaseAmount: parsedAmount,
        durationMonths: parsedMonths,
        createReason: comment,
        numberOfCodes: parsedCount,
      };
      const result = await createVouchersAction(federalStateId, voucherData);
      setCreatedVouchers((prev) => [...prev, ...result]);
    } catch (err) {
      const errorMessage =
        err instanceof BusinessError ? err.message : 'Ein unbekannter Fehler ist aufgetreten';
      toast.error('Fehler beim Erstellen der Guthaben Codes: ' + errorMessage);
    }
  };
  return (
    <div>
      <h1 className="text-2xl font-bold">
        Neue Guthaben Codes erstellen für Bundesland {federalStateId}
      </h1>
      <div className="grid grid-cols-[auto_minmax(0,_1fr)] gap-4 mt-4">
        <label>Guthabenbetrag (in Cent): </label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={100}
          max={20000}
          required
        />
        <label>Dauer (in Monaten): </label>
        <Input
          type="number"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          min={1}
          max={12}
          required
        />
        <label>Anzahl der Codes: </label>
        <Input
          type="number"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          min={1}
          max={100}
          required
        />
        <label>Grund für die Erstellung: </label>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} required />
        <div className="col-span-2">
          <Button onClick={handleSubmit}>Codes erstellen</Button>
        </div>
      </div>
      {createdVouchers.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-bold">Erstellte Guthaben Codes</h2>
            <CSVLink
              data={createdVouchers.map((voucher) => ({
                Code: voucher.code,
                Betrag: voucher.increaseAmount,
                DauerInMonaten: voucher.durationMonths,
                GültigBis: new Date(voucher.validUntil).toLocaleDateString('de-DE'),
                ErstelltDatum: new Date(voucher.createdAt).toLocaleDateString('de-DE'),
                ErstelltVon: voucher.createdBy,
                Status: voucher.status,
              }))}
              separator=";"
              filename="created_vouchers.csv"
            >
              <Button>Erstellte Codes als CSV herunterladen</Button>
            </CSVLink>
          </div>
          <VoucherList vouchers={createdVouchers} onVoucherRevoked={handleVoucherRevoked} />
        </div>
      )}
    </div>
  );
}
