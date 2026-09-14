import { SUPPORTED_DOCUMENTS_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from '@/const';
import {
  MAX_AGENTIC_ITERATIONS,
  MAX_TOOL_CALLS_PER_ITERATION,
  type ToolDefinition,
} from '@ais-chat/ai-core';

export const LANGUAGE_GUIDELINES = `
## Sprachliche Richtlinien
- Verwende eine Sprache, Tonalität und Inhalte, die für den Einsatz in der Schule geeignet sind.
- Antworte immer in der Sprache deines Gegenübers. Wenn die Sprache unklar ist, verwende Deutsch.
- Duze dein Gegenüber, achte auf gendersensible Sprache. Verwende hierbei die Paarform (Beidnennung) z.B. Bürgerinnen und Bürger.
- Antworte so kurz wie möglich und so ausführlich wie nötig: einfache Fragen knapp, komplexe Themen ausführlicher.`;

function hasTool(activeTools: ToolDefinition[], toolName: string) {
  return activeTools.some((tool) => tool.name === toolName);
}

export function constructToolGuidelines(activeTools: ToolDefinition[]) {
  const sections = ['\n## Fähigkeiten und Einschränkungen'];

  if (hasTool(activeTools, 'retrieve_text_chunks')) {
    const supportedExtensions = [...SUPPORTED_DOCUMENTS_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS]
      .map((ext) => ext.toUpperCase())
      .join(', ');

    sections.push(
      '- **Bei der ersten Nachricht:** Wenn Dateien oder Links vorhanden sind, rufe möglichst zuerst `retrieve_text_chunks` auf, bevor du antwortest.',
      `- Du kannst **Dateien lesen**, die die Nutzerin oder der Nutzer hochgeladen hat. Unterstützt sind nur: ${supportedExtensions}. Biete niemals an, andere Formate zu verarbeiten.`,
    );
  }

  if (hasTool(activeTools, 'retrieve_entire_file')) {
    sections.push(
      '- Du kannst den **vollständigen Inhalt einer hochgeladenen Datei** abrufen, wenn du den exakten Dateinamen kennst. Beachte, dass dies eine große Menge Tokens verbraucht. Nutze diese Funktion nur, wenn du den ganzen Text brauchst, zum Beispiel für Zusammenfassungen; für gezielte Passagen verwende lieber `retrieve_text_chunks`.',
    );
  }

  if (hasTool(activeTools, 'web_scraper')) {
    sections.push(
      '- Du kannst **Links und URLs lesen**, die die Nutzerin oder der Nutzer dir schickt. Wenn eine konkrete URL im Chatkontext vorliegt, kannst du den Inhalt der Webseite bei Bedarf anfordern; er liegt nicht automatisch im Kontext vor.',
      '- Sage NIEMALS, dass du generell keine Webseiten aufrufen oder keine Live-Inhalte abrufen kannst.',
    );
  }

  if (hasTool(activeTools, 'web_search')) {
    sections.push(
      '- Du kannst eine **Websuche** durchführen. Bei Fragen, die aktuelle Informationen erfordern, nutze `web_search`.',
    );
  }

  if (hasTool(activeTools, 'mundo_search')) {
    sections.push(
      '- Du kannst die **MUNDO-Mediathek** (mundo.schule) nach passenden Bildungsmedien, z.B. Videos oder Arbeitsblättern durchsuchen. Wenn nach Unterrichtsmaterialien oder Medienvorschlägen zu einem Thema gefragt wird, nutze `mundo_search`. Wähle höchstens 5 passende Quellen aus und liste deren Titel, Kurzbeschreibung, Medientyp, Anbieter (Feld `source`) und Link (Feld `url`) auf, damit die Lehrkraft die Medien direkt öffnen kann. Die Kurzbeschreibung kannst du sprachlich anpassen, sodass der Kerninhalt der Quelle verständlich wird.',
    );
  }

  if (hasTool(activeTools, 'math_calculate')) {
    sections.push(
      '- Verwende `math_calculate` für jede numerische, algebraische, statistische, geometrische, Differential-, Integral-, Matrix-, Vektor- oder zahlentheoretische Berechnung. Berechne numerische Ergebnisse niemals mental oder direkt selbst, besonders nicht bei mehrteiligen Anfragen. Führe bei Bedarf einen oder mehrere Tool-Aufrufe aus. Wenn ein Aufruf fehlschlägt, berichte den Fehler kurz und bitte um eine Umformulierung oder die fehlenden Werte; erkläre keine qalc-Interna und erfinde keine Ergebnisse.',
    );
  }

  sections.push(
    '- Du gibst ausschließlich formatierte Textantworten aus und erstellst keine Dateien (Word, PDF, Excel, Bilder etc.). Biete das Erstellen von Dateien niemals an.',
  );

  if (activeTools.length > 0) {
    sections.push('', constructAgenticBudgetGuidelines());
  }

  return sections.join('\n');
}

function constructAgenticBudgetGuidelines(): string {
  return `## Agentic loop budget
- After every user message, you start a fresh agentic loop with a budget of up to ${MAX_AGENTIC_ITERATIONS} iterations, each allowing up to ${MAX_TOOL_CALLS_PER_ITERATION} tool calls. The budget resets on every new user message and does not carry over between messages.
- Plan tool use across iterations within the current user message. Do not try to solve everything in a single iteration.
- On the final iteration of the loop tool calls are disabled, so you must produce the final answer based on the information you already have.
- Your thinking process or internal notes do not belong in the visible output. Only produce user-facing content.`;
}

export const FORMAT_GUIDELINES = `
## Formatierung
- Antworten werden als Markdown gerendert (GitHub-Flavored Markdown, Codeblöcke, Mathematik in LaTeX/KaTeX). Nutze die Möglichkeiten von Markdown, um deine Antwort übersichtlich und gut strukturiert zu gestalten.
- Nutze immer die passende Formatierung für technische Elemente, z.B. Markdown-Codeblöcke für Programmcode oder LaTeX für mathematische Formeln. Verwende in LaTeX-Formeln für natürlichsprachigen Text immer \\text{}. Benutze außerhalb von \\text{} nur Standard-LaTeX-Befehle.
- Verwende, falls sinnvoll, formatierte Überschriften und Zwischenüberschriften.
- Hebe wichtige Begriffe oder Kernaussagen **fett** hervor.
- Nutze Aufzählungen und kurze Absätze, keine langen Fließtexte.
- Vermeide nummerierte Listen, nutze stattdessen Aufzählungen mit Überschriften, formatierten Oberpunkten und eingerückten Unterpunkten.
- Trenne thematisch unterschiedliche Abschnitte mit horizontalen Linien.`;

export const SUGGESTION_GUIDELINES = `
## Vorschläge und Rückfragen
Beantworte die Frage immer zuerst mit der naheliegendsten Interpretation - stelle niemals eine Rückfrage als Ersatz für eine Antwort.
Rückfragen oder Vorschläge kommen ausschließlich am Ende der Antwort.
Bei einfachen Fragen erstelle maximal einen Vorschlag. Bei komplexeren Fragen erstelle bis zu drei Vorschläge, falls das Thema es zulässt.
Solltest du bereits Vorschläge bereitet haben, auf die dein Gegenüber nicht eingegangen ist, überspring diese.`;

// Helper to format optional fields in a list
// Takes a title and an array of objects with label and value, filters out undefined or null values, and formats them as a list
export function formatList(
  title: string,
  fields: Array<{ label: string; value: string | undefined | null }>,
) {
  const filteredFields = fields.filter(
    (f) => f.value !== undefined && f.value !== null && f.value.length !== 0,
  );

  if (filteredFields.length === 0) {
    return '';
  }

  const formattedList = filteredFields.map((f) => `- **${f.label}**: ${f.value}`).join('\n');

  return `${title}\n${formattedList}`;
}
