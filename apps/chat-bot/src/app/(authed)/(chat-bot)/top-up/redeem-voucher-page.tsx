'use client';
import SimpleTextInput from '@/components/common/simple-text-input';
import CopyToClipboardButton from '@/components/common/clipboard-button';
import { useToast } from '@/components/common/toast';
import { createBudgetTransferAction, redeemVoucherAction } from './actions';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import React from 'react';
import z from 'zod';

type RedeemVoucherPageProps = {
  /** Set when the teacher may pass on budget to colleagues of the same school. */
  transfer?: { availableInCent: number; monthlyLimitInCent: number };
};

export default function RedeemVoucherPage({ transfer }: RedeemVoucherPageProps) {
  const t = useTranslations('top-up');
  const tToast = useTranslations('top-up.toasts');
  const toast = useToast();
  const router = useRouter();

  const [voucherCode, setVoucherCode] = React.useState('');
  const voucherSchema = z.string().length(16);

  const handleRedeem = async () => {
    if (voucherSchema.validate(voucherCode)) {
      const result = await redeemVoucherAction(voucherCode);
      if (!result.success) {
        toast.error(tToast('redeem-invalid'));
        return;
      }
      toast.success(tToast('redeem-success'));
      setVoucherCode('');
      router.refresh();
    }
  };

  return (
    <>
      <h1 className="text-3xl">{t('title')}</h1>
      <p className="text-sm text-gray-300 mb-6">{t('description')}</p>
      <div className="flex flex-row gap-4">
        <SimpleTextInput
          id="voucher"
          /* eslint-disable-next-line jsx-a11y/no-autofocus */
          autoFocus
          placeholder={t('voucher-placeholder')}
          maxLength={16}
          required
          className="grow"
          value={voucherCode}
          onChange={(e) => setVoucherCode(e.target.value.trim().toUpperCase())}
        />
        <button
          className="bg-primary text-white px-4 rounded-enterprise-md"
          type="button"
          onClick={handleRedeem}
          disabled={!voucherSchema.validate(voucherCode)}
        >
          {t('redeem-button')}
        </button>
      </div>
      {transfer && <BudgetTransferSection {...transfer} />}
    </>
  );
}

function BudgetTransferSection({
  availableInCent,
  monthlyLimitInCent,
}: NonNullable<RedeemVoucherPageProps['transfer']>) {
  const t = useTranslations('top-up.transfer');
  const tToast = useTranslations('top-up.toasts');
  const toast = useToast();
  const router = useRouter();

  // Shown as a share of the monthly volume, like the budget bar (no money amounts in the UI)
  const availablePercent = Math.floor((availableInCent / monthlyLimitInCent) * 100);
  const [percent, setPercent] = React.useState('');
  const [created, setCreated] = React.useState<{ code: string; validUntil: Date } | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const percentValue = Number(percent);
  const isValid =
    Number.isInteger(percentValue) && percentValue >= 1 && percentValue <= availablePercent;

  const handleTransfer = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    const amountInCent = Math.min(
      Math.floor((percentValue / 100) * monthlyLimitInCent),
      availableInCent,
    );
    const result = await createBudgetTransferAction(amountInCent);
    setIsSubmitting(false);
    if (!result.success) {
      toast.error(tToast('transfer-failed'));
      return;
    }
    setCreated({ code: result.value.code, validUntil: new Date(result.value.validUntil) });
    setPercent('');
    toast.success(tToast('transfer-success', { percent: percentValue }));
    router.refresh();
  };

  return (
    <section className="mt-10" aria-labelledby="budget-transfer-title">
      <h2 id="budget-transfer-title" className="text-xl">
        {t('title')}
      </h2>
      <p className="text-sm text-gray-300 mb-4">{t('description')}</p>
      {availablePercent < 1 ? (
        <p className="text-sm">{t('nothing-left')}</p>
      ) : (
        <>
          <p className="text-sm mb-2">{t('available', { percent: availablePercent })}</p>
          <div className="flex flex-row gap-4 items-center">
            <SimpleTextInput
              id="transfer-percent"
              type="number"
              inputMode="numeric"
              min={1}
              max={availablePercent}
              aria-label={t('amount-label')}
              placeholder={t('amount-placeholder', { max: availablePercent })}
              className="w-56"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
            <span aria-hidden="true">%</span>
            <button
              className="bg-primary text-white px-4 py-2 rounded-enterprise-md"
              type="button"
              onClick={handleTransfer}
              disabled={!isValid || isSubmitting}
            >
              {t('button')}
            </button>
          </div>
        </>
      )}
      {created && (
        <div className="mt-6 p-4 rounded-enterprise-md bg-secondary text-secondary-foreground">
          <p className="text-sm mb-2">
            {t('result', { date: created.validUntil.toLocaleDateString('de-DE') })}
          </p>
          <div className="flex flex-row items-center gap-2">
            <code className="text-2xl tracking-widest">{created.code}</code>
            <CopyToClipboardButton text={created.code} aria-label={t('copy')} />
          </div>
        </div>
      )}
    </section>
  );
}
