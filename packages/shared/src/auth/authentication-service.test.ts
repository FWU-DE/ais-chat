import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateErrorUrl,
  getAuthErrorFromUrl,
  getFieldErrorsFromUrl,
  type OidcProfile,
  validateOidcProfile,
} from './authentication-service';

const buildValidProfile = (overrides: Partial<OidcProfile> = {}): OidcProfile => ({
  sub: 'user-123',
  sid: 'session-123',
  rolle: 'LEHR',
  schulkennung: 'school-123',
  bundesland: 'DE-TEST',
  ...overrides,
});

describe('authentication-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateOidcProfile', () => {
    it('should return success true for valid profile', () => {
      const profile = buildValidProfile();
      const result = validateOidcProfile(profile);
      expect(result).toEqual({
        success: true,
        value: {
          bundesland: profile.bundesland,
          rolle: profile.rolle,
          schulkennung: profile.schulkennung,
          sid: profile.sid,
          sub: profile.sub,
        },
      });
    });

    it('should return missing fields for invalid profile', () => {
      const profile = {
        sub: 'user-123',
        sid: 'session-123',
      };
      const result = validateOidcProfile(profile);
      expect(result).toEqual({
        success: false,
        fieldErrors: ['rolle', 'schulkennung', 'bundesland'],
      });
    });

    it('should return error when rolle is an empty string', () => {
      const result = validateOidcProfile(buildValidProfile({ rolle: '  ' }));
      expect(result).toEqual({ success: false, fieldErrors: ['rolle'] });
    });

    it('should return error when bundesland is an empty string', () => {
      const result = validateOidcProfile(buildValidProfile({ bundesland: '   ' }));
      expect(result).toEqual({ success: false, fieldErrors: ['bundesland'] });
    });

    it('should return error when schulkennung is an empty string', () => {
      const result = validateOidcProfile(buildValidProfile({ schulkennung: '   ' }));
      expect(result).toEqual({ success: false, fieldErrors: ['schulkennung'] });
    });

    it('should return error when schulkennung array has only empty values', () => {
      const result = validateOidcProfile(buildValidProfile({ schulkennung: [' ', ''] }));
      expect(result).toEqual({ success: false, fieldErrors: ['schulkennung'] });
    });
  });

  describe('generateErrorUrl', () => {
    it('should generate correct error URL', () => {
      const fieldErrors = ['rolle', 'schulkennung'];
      const errorUrl = generateErrorUrl(fieldErrors);
      expect(errorUrl).toBe('/login/error?profile_error=rolle%2Cschulkennung');
    });

    it('should generate auth error URL without field errors', () => {
      const errorUrl = generateErrorUrl([], 'federal_state_not_found');
      expect(errorUrl).toBe('/login/error?auth_error=federal_state_not_found');
    });

    it('should generate URL with field and auth errors', () => {
      const errorUrl = generateErrorUrl(['rolle'], 'federal_state_not_found');
      expect(errorUrl).toBe('/login/error?profile_error=rolle&auth_error=federal_state_not_found');
    });

    it('should generate empty error URL if no missing fields are provided', () => {
      const fieldErrors: string[] = [];
      const errorUrl = generateErrorUrl(fieldErrors);
      expect(errorUrl).toBe('/login/error');
    });
  });

  describe('getFieldErrorsFromUrl', () => {
    it('should return field errors from encoded URL search params', () => {
      const searchParams = {
        profile_error: 'rolle%2Cschulkennung',
      };
      const fieldErrors = getFieldErrorsFromUrl(searchParams);
      expect(fieldErrors).toEqual(['rolle', 'schulkennung']);
    });
    it('should return field errors from decoded URL search params', () => {
      const searchParams = {
        profile_error: 'rolle,schulkennung',
      };
      const fieldErrors = getFieldErrorsFromUrl(searchParams);
      expect(fieldErrors).toEqual(['rolle', 'schulkennung']);
    });

    it('should return empty array if no profile_error param is present', () => {
      const searchParams = {
        other_param: 'value',
      };
      const fieldErrors = getFieldErrorsFromUrl(searchParams);
      expect(fieldErrors).toEqual([]);
    });

    it('should return empty array if profile_error is undefined', () => {
      const fieldErrors = getFieldErrorsFromUrl({ profile_error: undefined });
      expect(fieldErrors).toEqual([]);
    });
  });

  describe('getAuthErrorFromUrl', () => {
    it('should return auth error from search params', () => {
      const authError = getAuthErrorFromUrl({ auth_error: 'federal_state_not_found' });
      expect(authError).toBe('federal_state_not_found');
    });

    it('should return undefined for invalid auth_error values', () => {
      const authError = getAuthErrorFromUrl({ auth_error: 'invalid_code' });
      expect(authError).toBeUndefined();
    });

    it('should return undefined if auth_error is missing', () => {
      const authError = getAuthErrorFromUrl({ profile_error: 'rolle' });
      expect(authError).toBeUndefined();
    });
  });
});
