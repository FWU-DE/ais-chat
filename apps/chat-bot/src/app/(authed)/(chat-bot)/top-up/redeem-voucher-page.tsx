'use client';
import SimpleTextInput from '@/components/common/simple-text-input';
import { useToast } from '@/components/common/toast';
import { redeemVoucherAction } from './actions';
import { useTranslations } from 'next-intl';
import React from 'react';
import z from 'zod';

export default function RedeemVoucherPage() {
  const t = useTranslations('top-up');
  const tToast = useTranslations('top-up.toasts');
  const toast = useToast();

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
          onChange={(e) => setVoucherCode(e.target.value)}
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
    </>
  );
}
