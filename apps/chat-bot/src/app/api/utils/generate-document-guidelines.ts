import { TOOL_NAMES } from '@/types/tool-names';

const OVERVIEW = `- Du kannst **Dokumente als Word-Datei (DOCX), PDF, HTML-Datei oder PowerPoint-Präsentation (PPTX)** bereitstellen, zum Beispiel Arbeitsblätter, Zusammenfassungen oder Unterrichtsmaterial. Wenn die Nutzerin oder der Nutzer eine Datei möchte, kläre bei unklarem Inhalt oder Format zuerst nach und rufe dann \`${TOOL_NAMES.generateDocument}\` mit Format, aussagekräftigem Titel und dem passenden vollständigen Inhalt auf.`;

const PLOT_HINT =
  ' Du kannst Zeichnungen einbetten: Rufe zuerst `' +
  TOOL_NAMES.createPlot +
  '` auf und füge das Ergebnis unverändert als Codeblock ```jsxgraph-json title="Kurzer Titel" ... ``` in den Inhalt ein, statt Werte nur als Tabelle zu beschreiben.';

const DOCX_AND_PDF = `- Für **DOCX und PDF**: Verwende vollständiges Markdown als Inhalt. Verwende LaTeX für mathematische Formeln in Markdown: Inline-Formeln zwischen \`$...$\` und abgesetzte Formeln zwischen \`$$...$$\`. Für PDF keine Trennlinien (\`---\`) oder Linien direkt vor Überschriften verwenden.${PLOT_HINT}`;

const PPTX = `- Für **PPTX**: Verwende Markdown. Jede Überschrift der Ebene 1 oder 2 (\`#\`, \`##\`) beginnt eine neue Folie und wird deren Titel; zusätzlich beginnt \`---\` eine Folie ohne Titel. Halte jede Folie knapp (wenige Stichpunkte, Tabellen oder ein Bild), statt lange Fließtexte zu schreiben.
  - Titelfolie: Eine erste \`#\`-Überschrift mit höchstens einem Textabsatz wird zur Titelfolie mit Untertitel. Soll ein hochgeladenes Bild den Hintergrund der Titelfolie bilden, setze es direkt unter die erste \`#\`-Überschrift (danach höchstens ein Untertitel-Absatz, sonst nichts); beginne erst danach mit \`##\`. Ein Bild an anderer Stelle erscheint als normales Bild auf der Folie.
  - Design: Das Design (\`design\`) wählst du passend zur Anfrage: classic = blau/sachlich, dark = dunkel, ais = AIS.chat-Farben (Violett/Mint), minimal = schlicht schwarz-weiß. Nennt die Nutzerin oder der Nutzer einen Stil, richte dich danach; passt keiner, lass es leer.
  - Diagramme und Graphen: Wie bei DOCX und PDF: Rufe \`${TOOL_NAMES.createPlot}\` auf und füge den Codeblock \`\`\`jsxgraph-json\`\`\` unverändert auf der Folie ein (am besten eine Folie nur mit Überschrift und Zeichnung). Baue Diagramme niemals aus Textzeichen wie █ oder Sternchen.
  - Formeln werden als Text dargestellt: Schreibe sie lesbar mit Unicode (z. B. \`x² + y² = r²\`) statt mit LaTeX-Befehlen.`;

const HTML = `- Für **HTML**: Verwende ein vollständiges HTML-Dokument, das mit \`<!doctype html>\` beginnt und ein \`<html>\`-Element enthält. Verwende Inline-JavaScript, wenn Interaktivität benötigt wird.   Weise in deiner Antwort nach dem Erstellen immer kurz darauf hin, dass HTML-Dateien mit JavaScript schädlichen Code enthalten können und nur mit Vorsicht geöffnet werden sollten.`;

const IMAGES_AND_RESULT = `- Verwende für hochgeladene Bilder exakt die Referenz aus dem jeweiligen \`<attachment ref="...">\`-Attribut: für DOCX, PDF und PPTX als Markdown-Bildziel, z. B. \`![Beschreibung](attachment://...)\`, und für HTML als \`src\` eines \`<img>\`-Elements, z. B. \`<img src="attachment://..." alt="Beschreibung">\`; verwende nicht den Dateinamen als Bildziel. Das Ergebnis des Tools enthält den Dateinamen der erstellten Datei. Der Download-Button wird in der Oberfläche automatisch direkt unter deiner Antwort angezeigt. Erzeuge daher KEINEN Download-Link und keinen Platzhalter-Link in deiner Antwort; verweise höchstens kurz auf die bereitgestellte Datei unter Nennung des Dateinamens. Schlägt der Aufruf fehl, korrigiere die Eingabe oder erkläre kurz, was nicht geklappt hat. Erwähne die Technik dahinter niemals. Andere Dateiformate (Excel, Bilder etc.) kannst du nicht erstellen und bietest sie nicht an.`;

export function constructGenerateDocumentGuidelines() {
  return [OVERVIEW, DOCX_AND_PDF, PPTX, HTML, IMAGES_AND_RESULT].join('\n');
}
