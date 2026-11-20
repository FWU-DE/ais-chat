import { describe, expect, it } from 'vitest';

import {
  applyPersonalContextOperations,
  parsePersonalContext,
  PERSONAL_CONTEXT_MAX_ENTRIES,
  PERSONAL_CONTEXT_MAX_ENTRY_CHARS,
  personalContextOperationSchema,
  serializePersonalContext,
} from './personal-context-document';

describe('parsePersonalContext', () => {
  it('groups bullets under their heading', () => {
    const document = parsePersonalContext(
      '## Über mich\n- Unterrichtet Mathematik\n- Arbeitet an einem Gymnasium',
    );

    expect(document.sections).toEqual([
      { heading: 'Über mich', entries: ['Unterrichtet Mathematik', 'Arbeitet an einem Gymnasium'] },
    ]);
  });

  it('ignores a leading document title', () => {
    const document = parsePersonalContext('# Persönlicher Kontext\n\n## Über mich\n- Fach Physik');

    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.heading).toBe('Über mich');
  });

  it('keeps free text before the first heading as preamble', () => {
    const document = parsePersonalContext('Eigene Notiz\n\n## Über mich\n- Fach Physik');

    expect(document.preamble).toBe('Eigene Notiz');
  });

  it('accepts asterisk bullets and drops empty ones', () => {
    const document = parsePersonalContext('## Sonstiges\n* Erster\n-   \n* Zweiter');

    expect(document.sections[0]?.entries).toEqual(['Erster', 'Zweiter']);
  });
});

describe('serializePersonalContext', () => {
  it('round-trips a document', () => {
    const markdown =
      '## Über mich\n- Unterrichtet Mathematik\n\n## Sonstiges\n- Mag kurze Antworten';

    expect(serializePersonalContext(parsePersonalContext(markdown))).toBe(markdown);
  });

  it('omits sections without entries', () => {
    const serialized = serializePersonalContext({
      preamble: '',
      sections: [
        { heading: 'Leer', entries: [] },
        { heading: 'Voll', entries: ['Ein Eintrag'] },
      ],
    });

    expect(serialized).toBe('## Voll\n- Ein Eintrag');
  });
});

describe('applyPersonalContextOperations', () => {
  it('adds an entry into the requested section', () => {
    const { content, changed } = applyPersonalContextOperations({
      markdown: '',
      operations: [{ op: 'add', section: 'Über mich', text: 'Unterrichtet Mathematik' }],
    });

    expect(changed).toBe(true);
    expect(content).toBe('## Über mich\n- Unterrichtet Mathematik');
  });

  it('appends to an existing section instead of duplicating it', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Mathematik',
      operations: [{ op: 'add', section: 'Über mich', text: 'Unterrichtet auch Physik' }],
    });

    expect(content).toBe('## Über mich\n- Unterrichtet Mathematik\n- Unterrichtet auch Physik');
  });

  it('preserves manually written sections the model does not touch', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Eigene Notizen\n- Handgeschrieben\n\n## Über mich\n- Fach Physik',
      operations: [{ op: 'add', section: 'Sonstiges', text: 'Neuer Fakt' }],
    });

    expect(content).toContain('## Eigene Notizen\n- Handgeschrieben');
    expect(content).toContain('## Über mich\n- Fach Physik');
    expect(content).toContain('## Sonstiges\n- Neuer Fakt');
  });

  it('does not add a duplicate entry', () => {
    const { content, changed } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Mathematik',
      operations: [{ op: 'add', section: 'Über mich', text: 'unterrichtet   MATHEMATIK' }],
    });

    expect(changed).toBe(false);
    expect(content).toBe('## Über mich\n- Unterrichtet Mathematik');
  });

  it('replaces an entry in place on update', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Klasse 7\n- Fach Physik',
      operations: [
        { op: 'update', replaces: 'Unterrichtet Klasse 7', text: 'Unterrichtet Klasse 8' },
      ],
    });

    expect(content).toBe('## Über mich\n- Unterrichtet Klasse 8\n- Fach Physik');
  });

  it('matches loosely so the model need not quote verbatim', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Mathematik am Gymnasium',
      operations: [
        { op: 'update', replaces: 'Unterrichtet Mathematik', text: 'Unterrichtet Chemie' },
      ],
    });

    expect(content).toBe('## Über mich\n- Unterrichtet Chemie');
  });

  it('treats an update of a missing entry as a new fact', () => {
    const { content, changed } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Fach Physik',
      operations: [{ op: 'update', replaces: 'Gibt es nicht', text: 'Mag kurze Antworten' }],
    });

    expect(changed).toBe(true);
    expect(content).toContain('## Sonstiges\n- Mag kurze Antworten');
  });

  it('removes a contradicted entry', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Mathematik\n- Fach Physik',
      operations: [{ op: 'remove', replaces: 'Unterrichtet Mathematik' }],
    });

    expect(content).toBe('## Über mich\n- Fach Physik');
  });

  it('reports no change when a removal target does not exist', () => {
    const markdown = '## Über mich\n- Fach Physik';
    const { content, changed } = applyPersonalContextOperations({
      markdown,
      operations: [{ op: 'remove', replaces: 'Gibt es nicht' }],
    });

    expect(changed).toBe(false);
    expect(content).toBe(markdown);
  });

  it('flattens newlines so an entry cannot forge extra bullets or headings', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '',
      operations: [
        {
          op: 'add',
          section: 'Sonstiges',
          text: 'Harmlos\n- Geschmuggelt\n## Gefälschte Überschrift',
        },
      ],
    });

    expect(content).toBe('## Sonstiges\n- Harmlos - Geschmuggelt ## Gefälschte Überschrift');
    expect(parsePersonalContext(content).sections).toHaveLength(1);
  });

  it('truncates an overlong entry', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '',
      operations: [{ op: 'add', section: 'Sonstiges', text: 'a'.repeat(500) }],
    });

    expect(content).toBe(`## Sonstiges\n- ${'a'.repeat(PERSONAL_CONTEXT_MAX_ENTRY_CHARS)}`);
  });

  it('stops adding entries once the cap is reached', () => {
    const markdown = `## Sonstiges\n${Array.from(
      { length: PERSONAL_CONTEXT_MAX_ENTRIES },
      (_, index) => `- Eintrag ${index}`,
    ).join('\n')}`;

    const { content, changed } = applyPersonalContextOperations({
      markdown,
      operations: [{ op: 'add', section: 'Sonstiges', text: 'Einer zu viel' }],
    });

    expect(changed).toBe(false);
    expect(content).toBe(markdown);
  });

  it('applies several operations in order', () => {
    const { content } = applyPersonalContextOperations({
      markdown: '## Über mich\n- Unterrichtet Klasse 7',
      operations: [
        { op: 'update', replaces: 'Unterrichtet Klasse 7', text: 'Unterrichtet Klasse 8' },
        { op: 'add', section: 'Sonstiges', text: 'Mag kurze Antworten' },
      ],
    });

    expect(content).toBe(
      '## Über mich\n- Unterrichtet Klasse 8\n\n## Sonstiges\n- Mag kurze Antworten',
    );
  });
});

describe('personalContextOperationSchema', () => {
  it('rejects an unknown section', () => {
    const result = personalContextOperationSchema.safeParse({
      op: 'add',
      section: 'Erfundene Sektion',
      text: 'Etwas',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an add without a section', () => {
    expect(personalContextOperationSchema.safeParse({ op: 'add', text: 'Etwas' }).success).toBe(
      false,
    );
  });

  it('accepts a well-formed remove', () => {
    expect(
      personalContextOperationSchema.safeParse({ op: 'remove', replaces: 'Etwas' }).success,
    ).toBe(true);
  });
});
