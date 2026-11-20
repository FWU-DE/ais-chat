import { FEDERAL_STATE_NAMES } from '@/utils/vidis/const';

/**
 * States which federal state the user works in, so answers can account for regional differences.
 *
 * Deliberately stops short of asserting curriculum knowledge. Curricula are state-specific and
 * models reproduce them unreliably, so a confidently wrong Lehrplan reference is worse for a
 * school product than no reference at all. Authoritative curriculum data is expected to arrive
 * through the planned MEM MCP server; until then the model only learns *where* it is being used.
 */
export function constructFederalStateContext(federalStateId: string) {
  const federalStateName = (FEDERAL_STATE_NAMES as Record<string, string>)[federalStateId];

  if (federalStateName === undefined) return '';

  return `
## Regionaler Kontext
Dein Gegenüber nutzt AIS.chat in ${federalStateName}.
- Lehrpläne, Fächerbezeichnungen, Schularten und Prüfungsformate sind in Deutschland Ländersache. Richte dich nach den Gepflogenheiten dieses Landes, wenn du Unterrichtsmaterial, Aufgaben oder Bewertungshinweise erstellst.
- Nenne konkrete Lehrplaninhalte, Kompetenzbereiche oder Jahrgangszuordnungen nur, wenn du sie sicher weißt. Andernfalls benenne die Unsicherheit und weise darauf hin, dass die Angaben am aktuellen Lehrplan des Landes zu prüfen sind.
- Erfinde keine Lehrplanbezeichnungen, Paragrafen oder Vorschriften.`;
}
