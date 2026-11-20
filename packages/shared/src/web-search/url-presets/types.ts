import { utils } from '@shared/utils';
import z from 'zod';

export const domainSchema = z.string().transform((value, ctx) => {
  const parsedUrl = utils.url.normalizeDomain(value);
  if (parsedUrl === null) {
    ctx.issues.push({
      format: 'url',
      code: 'invalid_format',
      message: 'Invalid domain format',
      input: value,
    });
    return z.NEVER;
  }
  return parsedUrl;
});

export const urlPresetSchema = z.object({
  id: z.uuid(),
  name: z.string().nonempty(),
  orderNumber: z.number().int().nonnegative(),
  urls: z.array(domainSchema),
});

export const urlPresetInsertSchema = urlPresetSchema.omit({ id: true });
export const urlPresetUpdateSchema = urlPresetSchema.omit({ id: true });

export type UrlPreset = z.infer<typeof urlPresetSchema>;
export type UrlPresetInsert = z.infer<typeof urlPresetInsertSchema>;
export type UrlPresetUpdate = z.infer<typeof urlPresetUpdateSchema>;
