import { describe, expect, it } from 'vitest';

import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '../db/schema';
import {
  isPersonalContextAvailable,
  resolvePersonalContextEnabled,
} from './personal-context-availability';

const enabledToggles = { isPersonalContextEnabled: true } as Parameters<
  typeof isPersonalContextAvailable
>[0]['featureToggles'];
const disabledToggles = { isPersonalContextEnabled: false } as typeof enabledToggles;
const unsetToggles = {} as typeof enabledToggles;

const assistant = (isPersonalContextEnabled: boolean) =>
  ({ isPersonalContextEnabled }) as AssistantSelectModel;
const character = {} as CharacterSelectModel;
const learningScenario = {} as LearningScenarioSelectModel;

describe('isPersonalContextAvailable', () => {
  it('is available for a teacher when the federal state enables it', () => {
    expect(
      isPersonalContextAvailable({ featureToggles: enabledToggles, userRole: 'teacher' }),
    ).toBe(true);
  });

  it('is never available for students', () => {
    expect(
      isPersonalContextAvailable({ featureToggles: enabledToggles, userRole: 'student' }),
    ).toBe(false);
  });

  it('is unavailable when the federal state disables it', () => {
    expect(
      isPersonalContextAvailable({ featureToggles: disabledToggles, userRole: 'teacher' }),
    ).toBe(false);
  });

  it('defaults to unavailable when the toggle is unset', () => {
    expect(isPersonalContextAvailable({ featureToggles: unsetToggles, userRole: 'teacher' })).toBe(
      false,
    );
  });
});

describe('resolvePersonalContextEnabled', () => {
  const teacher = { featureToggles: enabledToggles, userRole: 'teacher' as const };

  it('is on by default in the standard chat', () => {
    expect(resolvePersonalContextEnabled({ ...teacher })).toBe(true);
  });

  it('is off for students even in the standard chat', () => {
    expect(
      resolvePersonalContextEnabled({ featureToggles: enabledToggles, userRole: 'student' }),
    ).toBe(false);
  });

  it('is off for characters, which are role-play personas', () => {
    expect(resolvePersonalContextEnabled({ ...teacher, character })).toBe(false);
  });

  it('is off for learning scenarios, which are shared with students', () => {
    expect(resolvePersonalContextEnabled({ ...teacher, learningScenario })).toBe(false);
  });

  it('ignores a per-chat opt-in for characters', () => {
    expect(
      resolvePersonalContextEnabled({
        ...teacher,
        character,
        conversation: { personalContextEnabled: true },
      }),
    ).toBe(false);
  });

  it('is off by default for assistants', () => {
    expect(resolvePersonalContextEnabled({ ...teacher, assistant: assistant(false) })).toBe(false);
  });

  it('is on for an assistant that opted in', () => {
    expect(resolvePersonalContextEnabled({ ...teacher, assistant: assistant(true) })).toBe(true);
  });

  it('lets an explicit per-chat opt-out win over the standard chat default', () => {
    expect(
      resolvePersonalContextEnabled({
        ...teacher,
        conversation: { personalContextEnabled: false },
      }),
    ).toBe(false);
  });

  it('lets an explicit per-chat opt-in win over an assistant that did not opt in', () => {
    expect(
      resolvePersonalContextEnabled({
        ...teacher,
        assistant: assistant(false),
        conversation: { personalContextEnabled: true },
      }),
    ).toBe(true);
  });

  it('falls back to the mode default when the chat has no explicit choice', () => {
    expect(
      resolvePersonalContextEnabled({
        ...teacher,
        assistant: assistant(false),
        conversation: { personalContextEnabled: null },
      }),
    ).toBe(false);
  });

  it('stays off when the federal state disables the feature, whatever the chat says', () => {
    expect(
      resolvePersonalContextEnabled({
        featureToggles: disabledToggles,
        userRole: 'teacher',
        conversation: { personalContextEnabled: true },
      }),
    ).toBe(false);
  });
});
