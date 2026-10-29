import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { VidisProfile } from './vidis-schema';
import { validateAndSyncVidisUser } from './validate-and-sync-vidis-user';
import { handleVidisJWTCallback } from './vidis-provider';

vi.mock('@/env', () => ({
  env: {
    vidisClientId: 'chat-client',
    vidisClientSecret: 'client-secret',
    vidisIssuerUri: 'http://localhost:8080/realms/ais-chat-local',
    vidisAllowInsecureDiscovery: false,
  },
}));

vi.mock('next-auth', () => ({
  customFetch: Symbol('customFetch'),
}));

const { mockDbGetFederalStateById, mockDbGetUserById, mockDbCreateUser, mockDbUpdateUserById } =
  vi.hoisted(() => {
    return {
      mockDbGetFederalStateById: vi.fn(),
      mockDbGetUserById: vi.fn(),
      mockDbCreateUser: vi.fn(),
      mockDbUpdateUserById: vi.fn(),
    };
  });

vi.mock('@shared/db/functions/federal-state', () => ({
  dbGetFederalStateById: mockDbGetFederalStateById,
}));

vi.mock('@ais-chat/shared/db/functions/user', () => ({
  dbGetUserById: mockDbGetUserById,
  dbCreateUser: mockDbCreateUser,
  dbUpdateUserById: mockDbUpdateUserById,
}));

const buildValidProfile = (overrides: Partial<VidisProfile> = {}): VidisProfile => ({
  sub: 'user-123',
  sid: 'session-123',
  rolle: 'LEHR',
  schulkennung: 'school-123',
  bundesland: 'DE-TEST',
  ...overrides,
});

describe('vidis provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleVidisJWTCallback', () => {
    const account = {
      token_type: 'bearer',
      id_token: 'id-token',
      provider: 'vidis',
      type: 'oidc',
    } as unknown as Account;

    it.each([
      { claim: true, expected: true },
      { claim: false, expected: false },
      { claim: undefined, expected: false },
    ])('should set hasCompletedTraining=$expected for is_ai_chat_eligible=$claim', async (c) => {
      mockDbGetUserById.mockResolvedValue({ id: 'user-123' });

      const token = await handleVidisJWTCallback({
        profile: buildValidProfile({ is_ai_chat_eligible: c.claim }) as Profile,
        token: {} as JWT,
        account,
      });

      expect(token.hasCompletedTraining).toBe(c.expected);
    });
  });

  describe('validateAndSyncVidisUser', () => {
    it('should return field errors for invalid profile payload', async () => {
      const result = await validateAndSyncVidisUser({ sid: 'session-123' });

      expect(result).toEqual({
        success: false,
        fieldErrors: ['sub', 'rolle', 'schulkennung', 'bundesland'],
      });
      expect(mockDbGetFederalStateById).not.toHaveBeenCalled();
    });

    it('should return auth error when federal state does not exist', async () => {
      mockDbGetFederalStateById.mockResolvedValue(undefined);

      const result = await validateAndSyncVidisUser(buildValidProfile());

      expect(result).toEqual({ success: false, authError: 'federal_state_not_found' });
      expect(mockDbCreateUser).not.toHaveBeenCalled();
      expect(mockDbUpdateUserById).not.toHaveBeenCalled();
    });

    it('should create a user when it does not exist', async () => {
      mockDbGetFederalStateById.mockResolvedValue({ id: 'DE-TEST' });
      mockDbGetUserById.mockResolvedValue(undefined);

      const result = await validateAndSyncVidisUser(
        buildValidProfile({ schulkennung: [' A ', 'B'] }),
      );

      expect(result).toEqual({ success: true });
      expect(mockDbCreateUser).toHaveBeenCalledWith({
        id: 'user-123',
        schoolIds: ['A', 'B'],
        federalStateId: 'DE-TEST',
        userRole: 'teacher',
      });
      expect(mockDbUpdateUserById).not.toHaveBeenCalled();
    });

    it('should update an existing user when federal state changed', async () => {
      mockDbGetFederalStateById.mockResolvedValue({ id: 'DE-TEST' });
      mockDbGetUserById.mockResolvedValue({
        id: 'user-123',
        federalStateId: 'BY',
      });

      const result = await validateAndSyncVidisUser(buildValidProfile());

      expect(result).toEqual({ success: true });
      expect(mockDbCreateUser).not.toHaveBeenCalled();
      expect(mockDbUpdateUserById).toHaveBeenCalledWith({
        id: 'user-123',
        schoolIds: ['school-123'],
        federalStateId: 'DE-TEST',
        userRole: 'teacher',
      });
    });

    it('should update an existing user without changing federal state', async () => {
      mockDbGetFederalStateById.mockResolvedValue({ id: 'DE-TEST' });
      mockDbGetUserById.mockResolvedValue({
        id: 'user-123',
        federalStateId: 'DE-TEST',
      });

      const result = await validateAndSyncVidisUser(
        buildValidProfile({ rolle: 'LERN', schulkennung: [' school-1 ', ''] }),
      );

      expect(result).toEqual({ success: true });
      expect(mockDbUpdateUserById).toHaveBeenCalledWith({
        id: 'user-123',
        schoolIds: ['school-1'],
        federalStateId: 'DE-TEST',
        userRole: 'student',
      });
      expect(mockDbCreateUser).not.toHaveBeenCalled();
    });
  });
});
