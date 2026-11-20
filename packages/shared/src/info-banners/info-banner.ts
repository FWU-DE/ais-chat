import { infoBannerSelectSchema, infoBannerTypeSchema } from '@shared/db/schema';
import z from 'zod';

const nullableString = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }, z.string().max(maxLength).nullable());

export const infoBannerSchema = infoBannerSelectSchema;
export type InfoBanner = z.infer<typeof infoBannerSchema>;

export const infoBannerToFederalStateMappingSchema = z.object({
  federalStateId: z.string(),
  isMapped: z.boolean(),
});
export type InfoBannerToFederalStateMapping = z.infer<typeof infoBannerToFederalStateMappingSchema>;

export const manageInfoBannerBaseSchema = z.object({
  type: infoBannerTypeSchema,
  message: z.string().trim().min(1, 'Bitte geben Sie eine Nachricht ein.').max(2000),
  buttonLabel: nullableString(120),
  buttonUrl: z.preprocess((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }, z.url('Bitte geben Sie eine gültige URL ein.').nullable()),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  maxLoginCount: z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number' && Number.isNaN(value)) {
      return null;
    }

    return value;
  }, z.number().int().positive().nullable()),
});

export function validateManageInfoBanner(
  value: {
    startsAt: Date;
    endsAt: Date;
    buttonLabel: string | null;
    buttonUrl: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.endsAt <= value.startsAt) {
    ctx.addIssue({
      code: 'custom',
      message: 'Die Endzeit muss nach der Startzeit liegen.',
      path: ['endsAt'],
    });
  }

  const hasButtonLabel = value.buttonLabel !== null;
  const hasButtonUrl = value.buttonUrl !== null;

  if (hasButtonLabel !== hasButtonUrl) {
    ctx.addIssue({
      code: 'custom',
      message: 'Button-Beschriftung und Link müssen gemeinsam gesetzt werden.',
      path: hasButtonLabel ? ['buttonUrl'] : ['buttonLabel'],
    });
  }
}

export const manageInfoBannerSchema =
  manageInfoBannerBaseSchema.superRefine(validateManageInfoBanner);

export type ManageInfoBannerInput = z.infer<typeof manageInfoBannerSchema>;
export type ManageInfoBannerPayload = z.input<typeof manageInfoBannerSchema>;
