import { describe, expect, it } from 'vitest';

import { constructFederalStateContext } from './federal-state-context';

describe('constructFederalStateContext', () => {
  it('names the federal state the user works in', () => {
    expect(constructFederalStateContext('DE-BY')).toContain('Bayern (Freistaat)');
  });

  it('resolves each supported federal state to a readable name', () => {
    expect(constructFederalStateContext('DE-NW')).toContain('Nordrhein-Westfalen');
    expect(constructFederalStateContext('DE-SH')).toContain('Schleswig-Holstein');
  });

  it('returns nothing for an unknown federal state rather than a placeholder', () => {
    expect(constructFederalStateContext('DE-XX')).toBe('');
    expect(constructFederalStateContext('')).toBe('');
  });

  it('never leaks the unknown-state fallback wording into a prompt', () => {
    expect(constructFederalStateContext('nonsense')).not.toContain('Unbekanntes Bundesland');
  });

  it('instructs the model not to assert curriculum details it is unsure about', () => {
    const context = constructFederalStateContext('DE-BY');

    expect(context).toContain('nur, wenn du sie sicher weißt');
    expect(context).toContain('Erfinde keine Lehrplanbezeichnungen');
  });

  it('explains that curricula are a state matter', () => {
    expect(constructFederalStateContext('DE-HE')).toContain('Ländersache');
  });
});
