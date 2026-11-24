import { describe, expect, it } from 'vitest';

import {
  buildGenerateDocumentTool,
  generateDocumentActivity,
  generateDocumentArgsSchema,
} from './generate-document-tool';

describe('generateDocumentArgsSchema', () => {
  it('trims title and content', () => {
    const parsed = generateDocumentArgsSchema.parse({
      format: 'docx',
      title: '  Titel  ',
      content: '  # Inhalt  ',
    });

    expect(parsed).toEqual({ format: 'docx', title: 'Titel', content: '# Inhalt' });
  });

  it.each([
    { format: 'pdf', title: 'a', content: 'b' },
    { format: 'docx', title: '   ', content: 'b' },
    { format: 'docx', title: 'a', content: '' },
    { format: 'docx', title: 'a'.repeat(81), content: 'b' },
    { format: 'docx', title: 'a', content: 'b'.repeat(100_001) },
    { format: 'html', title: 'a', content: '# Not HTML' },
  ])('rejects invalid args %#', (args) => {
    expect(generateDocumentArgsSchema.safeParse(args).success).toBe(false);
  });

  it('accepts a complete HTML document for html output', () => {
    expect(
      generateDocumentArgsSchema.safeParse({
        format: 'html',
        title: 'Interaktiv',
        content: '<!doctype html><html><body><p>Hallo</p></body></html>',
      }).success,
    ).toBe(true);
  });
});

describe('buildGenerateDocumentTool', () => {
  it('exposes the tool definition', () => {
    const { definition } = buildGenerateDocumentTool();

    expect(definition.name).toBe('generate_document');
    expect(definition.description).toContain('docx');
    expect(definition.parameters).toMatchObject({
      required: ['format', 'title', 'content'],
      additionalProperties: false,
      properties: {
        format: { enum: ['docx', 'html'] },
        title: { minLength: 1, maxLength: 80 },
        content: { minLength: 1, maxLength: 100_000 },
      },
    });
    expect(definition.parameters).toMatchObject({
      properties: {
        content: { description: expect.stringContaining('<!doctype html>') },
      },
    });
  });

  it('returns the created file name', async () => {
    const result = await buildGenerateDocumentTool().handler({
      format: 'docx',
      title: ' Mein Bericht ',
      content: '# Hallo',
    });

    expect(result).toEqual({ status: 'created', fileName: 'Mein Bericht.docx', format: 'docx' });
  });

  it('falls back to a default file name for unusable titles', async () => {
    const result = await buildGenerateDocumentTool().handler({
      format: 'docx',
      title: '../',
      content: '# Hallo',
    });

    expect(result).toEqual({ status: 'created', fileName: 'Dokument.docx', format: 'docx' });
  });

  it('returns an error describing invalid arguments', async () => {
    const result = await buildGenerateDocumentTool().handler({ format: 'pdf', title: '' });

    expect(result).toEqual({
      error: expect.stringMatching(/^Invalid arguments \(.*format.*title.*content.*\)\.$/),
    });
  });
});

describe('generateDocumentActivity', () => {
  it('creates a step with the document payload', () => {
    const step = generateDocumentActivity.createStep({
      id: 'call-1',
      name: 'generate_document',
      arguments: JSON.stringify({ format: 'docx', title: 'Bericht', content: '# Hallo' }),
    });

    expect(step).toEqual({
      kind: 'tool',
      id: 'call-1',
      tool: 'generate_document',
      detail: 'Bericht.docx',
      document: { fileName: 'Bericht.docx', format: 'docx', content: '# Hallo' },
    });
  });

  it.each(['{"format":"docx"}', 'not json', ''])(
    'creates a plain step for unusable arguments %j',
    (args) => {
      const step = generateDocumentActivity.createStep({
        id: 'call-2',
        name: 'generate_document',
        arguments: args,
      });

      expect(step).toEqual({ kind: 'tool', id: 'call-2', tool: 'generate_document' });
    },
  );

  it('parses persisted results', () => {
    const result = { status: 'created', fileName: 'Bericht.docx', format: 'docx' };

    expect(generateDocumentActivity.parsePersistedResult(result)).toEqual(result);
  });

  it('normalizes persisted errors', () => {
    expect(generateDocumentActivity.parsePersistedResult({ error: 'boom' })).toEqual({
      error: 'boom',
    });
    expect(generateDocumentActivity.parsePersistedResult('boom')).toEqual({ error: 'boom' });
  });

  it('ignores unparseable persisted results', () => {
    expect(generateDocumentActivity.parsePersistedResult(null)).toBeUndefined();
  });
});
