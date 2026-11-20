import { afterEach, describe, expect, it, vi } from 'vitest';

import { anonymizeText, applyEntities } from './anonymize';
import { analyzeWithPresidio } from './presidio';
import { isValidIban, recognizePiiEntities } from './recognizers';

describe('recognizePiiEntities', () => {
  it('detects e-mail addresses', () => {
    const text = 'Bitte an max.mustermann@schule-beispiel.de senden.';
    const entities = recognizePiiEntities(text);
    expect(entities).toHaveLength(1);
    expect(entities[0]?.type).toBe('EMAIL_ADDRESS');
    expect(text.slice(entities[0]?.start, entities[0]?.end)).toBe(
      'max.mustermann@schule-beispiel.de',
    );
  });

  it('detects German phone numbers in common formats', () => {
    for (const phone of ['+49 89 1234567', '089/123456-78', '0170 1234567', '004930123456']) {
      const entities = recognizePiiEntities(`Rückruf unter ${phone} bitte.`);
      expect(entities.map((e) => e.type)).toContain('PHONE_NUMBER');
    }
  });

  it('does not treat dates or short numbers as phone numbers', () => {
    expect(recognizePiiEntities('Am 01.02.2026 in Klasse 7b.')).toEqual([]);
  });

  it('detects checksum-valid IBANs only', () => {
    const valid = 'DE89 3704 0044 0532 0130 00';
    const invalid = 'DE89 3704 0044 0532 0130 01';
    expect(recognizePiiEntities(`IBAN: ${valid}`).map((e) => e.type)).toContain('IBAN_CODE');
    expect(recognizePiiEntities(`IBAN: ${invalid}`).map((e) => e.type)).not.toContain('IBAN_CODE');
  });
});

describe('isValidIban', () => {
  it('accepts valid IBANs with and without spaces', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
  });

  it('rejects invalid checksums and malformed input', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('DE8937')).toBe(false);
  });
});

describe('applyEntities', () => {
  const text = 'Anna Schmidt wohnt in München.';

  it('replaces entities with German placeholders', () => {
    const result = applyEntities({
      text,
      entities: [
        { type: 'PERSON', start: 0, end: 12, score: 0.9 },
        { type: 'LOCATION', start: 22, end: 29, score: 0.9 },
      ],
      mode: 'placeholder',
    });
    expect(result).toBe('[PERSON] wohnt in [ORT].');
  });

  it('replaces persons with deterministic pseudonyms in pseudonym mode', () => {
    const entities = [{ type: 'PERSON', start: 0, end: 12, score: 0.9 }];
    const first = applyEntities({ text, entities, mode: 'pseudonym' });
    const second = applyEntities({ text, entities, mode: 'pseudonym' });
    expect(first).toBe(second);
    expect(first).not.toContain('Anna Schmidt');
    expect(first).not.toContain('[PERSON]');
  });

  it('resolves overlapping entities by score', () => {
    const result = applyEntities({
      text,
      entities: [
        { type: 'LOCATION', start: 0, end: 12, score: 0.4 },
        { type: 'PERSON', start: 0, end: 12, score: 0.9 },
      ],
      mode: 'placeholder',
    });
    expect(result).toBe('[PERSON] wohnt in München.');
  });

  it('uses a generic placeholder for unknown entity types', () => {
    const result = applyEntities({
      text: 'Kennung X123',
      entities: [{ type: 'CUSTOM_ID', start: 8, end: 12, score: 1 }],
      mode: 'placeholder',
    });
    expect(result).toBe('Kennung [CUSTOM_ID]');
  });
});

describe('anonymizeText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anonymizes structured PII without a Presidio service', async () => {
    const result = await anonymizeText({
      text: 'Kontakt: maria@example.org oder +49 89 1234567.',
    });
    expect(result).toBe('Kontakt: [E-MAIL] oder [TELEFONNUMMER].');
  });

  it('prefers the IBAN over phone-number matches inside the IBAN digits', async () => {
    const result = await anonymizeText({ text: 'IBAN: DE89 3704 0044 0532 0130 00' });
    expect(result).toBe('IBAN: [IBAN]');
  });

  it('merges Presidio entities when a service URL is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ entity_type: 'PERSON', start: 0, end: 4, score: 0.85 }]), {
          status: 200,
        }),
      ),
    );

    const result = await anonymizeText({
      text: 'Anna schreibt an maria@example.org.',
      presidioUrl: 'http://localhost:5002',
    });
    expect(result).toBe('[PERSON] schreibt an [E-MAIL].');
  });

  it('fails closed when the Presidio service returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    await expect(
      anonymizeText({ text: 'Anna', presidioUrl: 'http://localhost:5002' }),
    ).rejects.toThrow('Presidio analyzer request failed with status 500');
  });

  it('ignores entity types outside the allowlist and low-score entities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { entity_type: 'DATE_TIME', start: 5, end: 15, score: 0.9 },
            { entity_type: 'PERSON', start: 0, end: 4, score: 0.1 },
          ]),
          { status: 200 },
        ),
      ),
    );

    const text = 'Anna 01.02.2026';
    const result = await anonymizeText({ text, presidioUrl: 'http://localhost:5002' });
    expect(result).toBe(text);
  });
});

describe('analyzeWithPresidio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts text and language and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ entity_type: 'PERSON', start: 0, end: 4, score: 0.85 }]), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const entities = await analyzeWithPresidio({
      text: 'Anna',
      url: 'http://localhost:5002',
      language: 'de',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:5002/analyze'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'Anna', language: 'de' }),
      }),
    );
    expect(entities).toEqual([{ type: 'PERSON', start: 0, end: 4, score: 0.85 }]);
  });
});
