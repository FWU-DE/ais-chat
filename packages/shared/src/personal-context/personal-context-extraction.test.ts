import { generateTextWithBilling } from '@ais-chat/ai-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbGetPersonalContextByUserId } from '../db/functions/personal-context';
import {
  buildExtractionWindow,
  PERSONAL_CONTEXT_EXCHANGE_INTERVAL,
  shouldRunPersonalContextExtraction,
  updatePersonalContextFromConversation,
} from './personal-context-extraction';
import { savePersonalContextContent } from './personal-context-service';

vi.mock('@ais-chat/ai-core', () => ({
  generateTextWithBilling: vi.fn(),
}));

vi.mock('../db/functions/personal-context', () => ({
  dbGetPersonalContextByUserId: vi.fn(),
}));

vi.mock('./personal-context-service', () => ({
  savePersonalContextContent: vi.fn(),
}));

describe('shouldRunPersonalContextExtraction', () => {
  it('does not run before the first interval is complete', () => {
    for (let count = 1; count < PERSONAL_CONTEXT_EXCHANGE_INTERVAL; count++) {
      expect(shouldRunPersonalContextExtraction({ userMessageCount: count })).toBe(false);
    }
  });

  it('runs once the interval is reached', () => {
    expect(
      shouldRunPersonalContextExtraction({ userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL }),
    ).toBe(true);
  });

  it('runs again after each further interval', () => {
    expect(
      shouldRunPersonalContextExtraction({
        userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL * 3,
      }),
    ).toBe(true);
    expect(
      shouldRunPersonalContextExtraction({
        userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL * 3 + 1,
      }),
    ).toBe(false);
  });

  it('does not run on an empty conversation', () => {
    expect(shouldRunPersonalContextExtraction({ userMessageCount: 0 })).toBe(false);
  });
});

describe('buildExtractionWindow', () => {
  it('labels both speakers', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Ich unterrichte Mathematik' },
        { role: 'assistant', content: 'Gut zu wissen' },
      ],
    });

    expect(window).toBe('Lehrkraft: Ich unterrichte Mathematik\nAssistent: Gut zu wissen');
  });

  it('covers the turns that were skipped between runs', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Erste' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Zweite' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Dritte' },
        { role: 'assistant', content: 'A3' },
      ],
      exchanges: 3,
    });

    expect(window).toContain('Lehrkraft: Erste');
    expect(window).toContain('Lehrkraft: Zweite');
    expect(window).toContain('Lehrkraft: Dritte');
  });

  it('keeps only the trailing exchanges', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Alt' },
        { role: 'assistant', content: 'A0' },
        { role: 'user', content: 'Neu' },
        { role: 'assistant', content: 'A1' },
      ],
      exchanges: 1,
    });

    expect(window).not.toContain('Alt');
    expect(window).toContain('Lehrkraft: Neu');
  });

  it('drops tool and system messages', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'system', content: 'Systemanweisung' },
        { role: 'user', content: 'Frage' },
        { role: 'tool', content: 'Werkzeugausgabe' },
        { role: 'assistant', content: 'Antwort' },
      ],
    });

    expect(window).toBe('Lehrkraft: Frage\nAssistent: Antwort');
  });

  it('truncates very long messages', () => {
    const window = buildExtractionWindow({
      messages: [{ role: 'user', content: 'a'.repeat(5000) }],
    });

    expect(window.length).toBeLessThan(2000);
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(buildExtractionWindow({ messages: [{ role: 'tool', content: 'x' }] })).toBe('');
  });
});

describe('updatePersonalContextFromConversation', () => {
  const args = {
    userId: 'user-1',
    conversationWindow: 'Lehrkraft: Ich unterrichte Mathematik in Klasse 8',
    modelId: 'aux-model',
    apiKeyId: 'api-key-1',
  };

  beforeEach(() => {
    vi.mocked(dbGetPersonalContextByUserId).mockReset();
    vi.mocked(generateTextWithBilling).mockReset();
    vi.mocked(savePersonalContextContent).mockReset();
  });

  it('skips extraction when personal context usage is disabled', async () => {
    vi.mocked(dbGetPersonalContextByUserId).mockResolvedValue({
      enabled: false,
      autoUpdateEnabled: true,
      content: '',
    } as Awaited<ReturnType<typeof dbGetPersonalContextByUserId>>);

    await updatePersonalContextFromConversation(args);

    expect(generateTextWithBilling).not.toHaveBeenCalled();
  });

  it('skips extraction when automatic updates are opted out, even while usage stays enabled', async () => {
    vi.mocked(dbGetPersonalContextByUserId).mockResolvedValue({
      enabled: true,
      autoUpdateEnabled: false,
      content: '',
    } as Awaited<ReturnType<typeof dbGetPersonalContextByUserId>>);

    await updatePersonalContextFromConversation(args);

    expect(generateTextWithBilling).not.toHaveBeenCalled();
  });

  it('runs extraction when both usage and automatic updates are enabled', async () => {
    vi.mocked(dbGetPersonalContextByUserId).mockResolvedValue({
      enabled: true,
      autoUpdateEnabled: true,
      content: '',
    } as Awaited<ReturnType<typeof dbGetPersonalContextByUserId>>);
    vi.mocked(generateTextWithBilling).mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateTextWithBilling>>);

    await updatePersonalContextFromConversation(args);

    expect(generateTextWithBilling).toHaveBeenCalled();
  });
});
