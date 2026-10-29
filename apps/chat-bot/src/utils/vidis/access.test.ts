import { describe, it, expect } from 'vitest';
import { checkProductAccess } from './access';
import { UserAndContext } from '@/auth/types';
import { UserSelectModel, UserRole } from '@shared/db/schema';
import { ObscuredFederalState } from '@/auth/utils';
import { getFederalStateNameById } from './const';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function renderErrorMessage(result: ReturnType<typeof checkProductAccess>) {
  if (result.hasAccess) throw new Error('Expected access to be denied');
  return renderToStaticMarkup(createElement(Fragment, null, result.errorMessage));
}

describe('checkProductAccess', () => {
  // Base test data
  const baseDate = new Date();
  const baseFederalState: ObscuredFederalState = {
    id: 'DE-BY',
    createdAt: baseDate,
    teacherPriceLimit: 500,
    studentPriceLimit: 200,
    mandatoryCertificationTeacher: null,
    chatStorageTime: 120,
    supportContacts: null,
    trainingLink: null,
    designConfiguration: null,
    appName: 'AIS.chat',
    featureToggles: {
      isStudentAccessEnabled: true,
      isCharacterEnabled: true,
      isCustomGptEnabled: true,
      isSharedChatEnabled: true,
      isShareTemplateWithSchoolEnabled: true,
    },
    pictureUrls: null,
    hasApiKeyAssigned: true,
  };

  const baseSchool = {
    id: 'school-1',
    createdAt: baseDate,
    federalStateId: 'DE-BY',
    userRole: 'teacher' as UserRole,
  };

  const baseUser = {
    id: 'user-1',
    createdAt: new Date(),
    lastUsedModel: null,
    versionAcceptedConditions: null,
    schoolIds: [baseSchool.id],
    federalStateId: baseSchool.federalStateId,
    userRole: baseSchool.userRole,
  } satisfies UserSelectModel;

  it('should allow access when all conditions are met', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: baseFederalState,
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result.hasAccess).toBe(true);
  });

  it('should deny access to students when studentAccess is false', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        featureToggles: {
          ...baseFederalState.featureToggles,
          isStudentAccessEnabled: false,
        },
      },
      userRole: 'student',
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result).toMatchObject({ hasAccess: false, errorType: 'RESTRICTED_ROLE' });
  });

  it('should allow access to students when studentAccess is true', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        featureToggles: {
          ...baseFederalState.featureToggles,
          isStudentAccessEnabled: true,
        },
      },
      userRole: 'student',
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result.hasAccess).toBe(true);
  });

  it('should deny access when training is required', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        mandatoryCertificationTeacher: true,
      },
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: false });
    expect(result).toMatchObject({ hasAccess: false, errorType: 'TRAINING_NEEDED' });
    const html = renderErrorMessage(result);
    expect(html).toContain(getFederalStateNameById('DE-BY'));
    expect(html).not.toContain('href=');
  });

  it('should include training link in error message when available', () => {
    const trainingLink = 'https://training.example.com';
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        mandatoryCertificationTeacher: true,
        trainingLink,
      },
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: false });
    expect(result).toMatchObject({ hasAccess: false, errorType: 'TRAINING_NEEDED' });
    const html = renderErrorMessage(result);
    expect(html).toContain(trainingLink);
  });

  it('should use the federal state specific disclaimer instead of the training link', () => {
    const trainingLink = 'https://training.example.com';
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        id: 'DE-SL',
        mandatoryCertificationTeacher: true,
        trainingLink,
      },
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: false });
    expect(result).toMatchObject({ hasAccess: false, errorType: 'TRAINING_NEEDED' });
    const html = renderErrorMessage(result);
    expect(html).not.toContain(trainingLink);
  });

  it('should allow access when training is required and completed', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: { ...baseFederalState, mandatoryCertificationTeacher: true },
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result.hasAccess).toBe(true);
  });

  it('should default hasCompletedTraining to true', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: { ...baseFederalState, mandatoryCertificationTeacher: true },
    };

    expect(checkProductAccess(context).hasAccess).toBe(true);
  });

  it('should allow access without training when training is not required', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: baseFederalState,
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: false });
    expect(result.hasAccess).toBe(true);
  });

  it('should prioritize role-based restrictions over training requirements', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        featureToggles: {
          ...baseFederalState.featureToggles,
          isStudentAccessEnabled: false,
        },
        mandatoryCertificationTeacher: true,
      },
      userRole: 'student',
    };

    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result.hasAccess).toBe(false);
    if (!result.hasAccess) {
      expect(result.errorType).toBe('RESTRICTED_ROLE'); // Should be role error, not training
    }
  });

  it('should not check training requirements for students when studentAccess is false', () => {
    const context: UserAndContext = {
      ...baseUser,
      federalState: {
        ...baseFederalState,
        featureToggles: {
          ...baseFederalState.featureToggles,
          isStudentAccessEnabled: false,
        },
        mandatoryCertificationTeacher: true,
      },
      userRole: 'student',
    };

    // We're testing the implementation detail that training is not checked for students
    // when studentAccess is false, as they're already restricted by role
    const result = checkProductAccess({ ...context, hasCompletedTraining: true });
    expect(result.hasAccess).toBe(false);
    if (!result.hasAccess) {
      expect(result.errorType).toBe('RESTRICTED_ROLE');
      // expect(result.errorMessage).not.toContain('vorgeschriebene Schulung');
    }
  });

  it('should handle non-student roles correctly', () => {
    const nonStudentRoles = ['teacher'] as const;

    nonStudentRoles.forEach((role) => {
      const context: UserAndContext = {
        ...baseUser,
        federalState: baseFederalState,
        userRole: role,
      };

      const result = checkProductAccess({ ...context, hasCompletedTraining: true });
      expect(result.hasAccess).toBe(true);
    });
  });

  it('should handle different federal states appropriately', () => {
    const federalStates = [
      { id: 'DE-BY', studentAccess: true }, // Bavaria
      { id: 'DE-BW', studentAccess: false }, // Baden-Württemberg
      { id: 'DE-BE', studentAccess: true }, // Berlin
    ];

    federalStates.forEach((state) => {
      const context: UserAndContext = {
        ...baseUser,
        federalState: {
          ...baseFederalState,
          id: state.id,
          featureToggles: {
            ...baseFederalState.featureToggles,
            isStudentAccessEnabled: state.studentAccess,
          },
        },
        userRole: 'student',
      };

      const result = checkProductAccess({ ...context, hasCompletedTraining: true });

      if (state.studentAccess) {
        expect(result.hasAccess).toBe(true);
      } else {
        expect(result.hasAccess).toBe(false);
        if (!result.hasAccess) {
          expect(result.errorType).toBe('RESTRICTED_ROLE');
        }
      }
    });
  });
});
