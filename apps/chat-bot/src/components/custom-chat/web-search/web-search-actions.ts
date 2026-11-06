'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { getAllUrlPresets } from '@shared/web-search/url-presets/url-preset-service';

import { requireAuth } from '@/auth/requireAuth';

export async function getAllUrlPresetsAction() {
  await requireAuth();

  return runServerAction('getAllUrlPresetsAction', getAllUrlPresets)();
}
