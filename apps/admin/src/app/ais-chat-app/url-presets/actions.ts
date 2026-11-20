'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { UrlPresetInsert, UrlPresetUpdate } from '@shared/web-search/url-presets/types';
import {
  deleteUrlPreset,
  insertUrlPreset,
  updateUrlPreset,
} from '@shared/web-search/url-presets/url-preset-admin-service';
import { getAllUrlPresets } from '@shared/web-search/url-presets/url-preset-service';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function getUrlPresetsAction() {
  await requireAdminAuth();

  return runServerAction('getAllUrlPresets', getAllUrlPresets)();
}

export async function insertUrlPresetAction(data: UrlPresetInsert) {
  await requireAdminAuth();

  return runServerAction('insertUrlPreset', insertUrlPreset)(data);
}

export async function updateUrlPresetAction(id: string, data: UrlPresetUpdate) {
  await requireAdminAuth();

  return runServerAction('updateUrlPreset', updateUrlPreset)(id, data);
}

export async function deleteUrlPresetAction(id: string) {
  await requireAdminAuth();

  return runServerAction('deleteUrlPreset', deleteUrlPreset)(id);
}
