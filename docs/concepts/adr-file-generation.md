# ADR: Dateigenerierung im Chat

- **Status:** DOCX und HTML umgesetzt (#1690, #1691), PDF über Gotenberg in Review (#1713); der
  `pdfmake`-Prototyp liegt auf einem separaten Branch und wird nicht weiterverfolgt
- **Ticket:** TD-1541
- **Scope:** DOCX, PDF und HTML; PPTX und ODT sind zunächst zurückgestellt

## Kontext

Der Chatbot soll auf Anfrage Dateien wie Arbeitsblätter, Zusammenfassungen und Unterrichtsmaterial
anbieten. Vor der Generierung soll das LLM Format und Inhalt klären. Die Datei wird unterhalb der
Assistentenantwort mit Dateiname, Dateiformat und Download-Button angezeigt.

Die erste Umsetzung erzeugt die Dateien clientseitig. Das LLM liefert den Inhalt als Markdown oder
bei interaktivem HTML als vollständiges HTML-Dokument. Der Client erzeugt daraus beim Klick auf den
Download-Button einen `Blob`.

## Aktuelle Architektur

```text
Nutzeranfrage
→ Top-Level-LLM ruft generate_document auf
→ Tool-Call enthält Format, Titel und Inhalt
→ AI Activity speichert die Dokumentdaten
→ Client zeigt Dateianhang
→ Client erzeugt DOCX/HTML; für PDF sendet er Markdown, Bilder und Plots an den Server
→ Download
```

Das LLM erzeugt den fachlichen Inhalt, weil es den Gesprächskontext, Zielgruppe, Sprache und
hochgeladene Dateien kennt. Der Tool-Handler validiert die Argumente mit Zod und liefert Metadaten.
Er rendert den Inhalt nicht selbst.

Der Markdown-Inhalt wird im Tool-Call beziehungsweise in der AI Activity gespeichert, weil der Client
ihn für die spätere Dateierzeugung benötigt. Das Tool-Ergebnis enthält nur kleine Metadaten wie Status,
Dateiname und Format. So wird der vollständige Inhalt nicht zusätzlich als Tool-Ergebnis dupliziert.

Die erzeugte Datei wird derzeit nicht in S3 gespeichert. Nach einem Reload wird sie erneut erzeugt.

## Umsetzungsstand

### Tool und AI Activity

- `generate_document` ist eine normale `ToolRegistration` in
  `apps/chat-bot/src/app/api/chat/tools/generate-document-tool.ts` (Definition, Handler, Activity).
- Zod-Schema: `format` aus `GENERATED_DOCUMENT_FORMATS` (`docx`, `pdf`, `html`), `title` getrimmt mit
  1–80 Zeichen, `content` getrimmt mit 1–100.000 Zeichen. Für `html` muss der Inhalt mit
  `<!doctype html>` beginnen und ein vollständiges `<html>...</html>`-Dokument enthalten.
- Der Handler liefert nur `{ status: 'created', fileName, format }` oder
  `{ error: 'Invalid arguments (...)' }`.
- `createStep` der Activity läuft vor dem Tool-Ergebnis und legt `document: { fileName, title, format, content }` im AI-Activity-Step ab. `title` ist optional,
  so dass ältere gespeicherte Steps weiter gelesen werden; PDF nutzt ihn als Dokumenttitel. Bei ungültigen Argumenten entsteht ein Step ohne Dokument.
- Dateinamen werden in `generated-document-format.ts` serverseitig und clientseitig identisch
  bereinigt; unbrauchbare Titel fallen auf `Dokument` zurück. Die Datei ist ohne Browser-APIs
  importierbar, damit Server-Code (Tool, Typen) nicht den DOCX-Stack lädt.
- Die Tool-Anleitung für das LLM steht in `constructToolGuidelines`
  (`apps/chat-bot/src/app/api/utils/system-prompt.ts`).

### Client-Erzeugung

- `createGeneratedDocumentBlob` importiert die Renderer für DOCX, HTML und PDF statisch. Die
  Aufteilung in `generated-document-format.ts` (serverfähig) und `generated-document.ts`
  (nur Client) verhindert, dass Server-Code den DOCX-Stack lädt; ein dynamischer Import ist dafür
  nicht mehr nötig. Optionen wie Titel und Shared-Chat-Kontext werden als Objekt übergeben.
- `generated-document-attachment.tsx` zeigt den Anhang, baut die Bildreferenzen auf und meldet
  Fehler per Toast (`files.toasts.download-error`).

### DOCX-Pipeline

```text
unified → remark-parse → remark-math-extended → remark-gfm → remark-docx
  Plugins: html, latex, image, plot, paddedCodeBlock (Shiki), styledBlocks, symbolFont
```

- Derselbe Renderer (`markdown-docx.ts`) wird für generierte Dokumente und für den
  Konversationsexport (`formatConversationExport`) verwendet.
- Code-Blöcke werden mit Shiki eingefärbt und als gepolsterte Tabellenzelle dargestellt; Tabellen
  und Trennlinien erhalten eigene Styles.
- `jsxgraph-json`-Blöcke werden vor dem Rendern erkannt. Die betroffenen Plots werden über
  `activateLivePlots` temporär aktiviert und nach dem Export wieder freigegeben. `renderPlotImage`
  bevorzugt das bereits sichtbare SVG und rendert sonst ein temporäres Offscreen-Board. Schlägt das
  fehl, bleibt der Block als Code erhalten und es wird eine Warnung geloggt.
- Bilder werden über `loadDocumentImage` geladen, auf maximal 240 px skaliert und bei Bedarf nach
  PNG konvertiert.
- Standardschrift ist Barlow. Ein einfacher `font`-String in `docx` setzt nur `ascii`/`hAnsi`.
  Für Zeichen ohne Glyph in Barlow (z. B. Checkboxen, Pfeile) setzt `symbolFontPlugin` eine
  Symbolschrift. Word wählt Ersatzschriften trotzdem nicht in allen Fällen konsistent; das ist
  noch nicht vollständig gelöst.

### HTML

- `markdown-html.ts` übernimmt das vom LLM gelieferte vollständige HTML-Dokument und gibt es ohne
  iframe-Wrapper als HTML-Blob aus.
- `<img src="attachment://...">` wird während des Downloads geladen und durch eingebettete
  Base64-Daten ersetzt. Dadurch bleiben Upload-Bilder auch beim späteren Öffnen der gespeicherten
  Datei über `file://` sichtbar. Andere Inhalte, einschließlich Inline-JavaScript, werden nicht
  umgeschrieben.
- Der Titel stammt aus dem vom LLM erzeugten HTML-Dokument; der Dateiname wird weiterhin separat
  aus dem Tool-Argument `title` erzeugt.
- Interaktives HTML kann Schadcode enthalten. Der System-Prompt weist das Modell an, in der Antwort
  immer kurz auf dieses Risiko hinzuweisen (umgesetzt auf `feat/TD-1541-add-warning-to-html-generation`).
  Das ist eine Bitte an das Modell und keine technische Absicherung.

### Bildreferenzen

- Hochgeladene Bilder werden dem LLM als `<attachment ref="attachment://<fileId>">Name</attachment>`
  angekündigt (`annotateMessageAttachmentNames`). Die `fileId` wird mit `encodeURIComponent`
  kodiert.
- Das LLM verwendet diese Referenz statt des Dateinamens. Damit sind gleichnamige Dateien
  eindeutig und das LLM sieht keine internen URLs.
- Der Client löst `attachment://`-Referenzen über das Datei-Mapping des Chats in Bild-URLs auf.
  Für DOCX lädt der Renderer diese URLs direkt. Für HTML werden sie vor dem Download als Base64-
  Daten eingebettet; in Shared Chats wird `getSharedChatImageUrl({ forExport: true })` verwendet.
- Der System-Prompt unterscheidet die Bildsyntax nach Format: DOCX verwendet Markdown-Ziele wie
  `![Beschreibung](attachment://...)`, HTML verwendet `<img src="attachment://..." alt="...">`.
- Im Konversationsexport werden Bild-URLs als Markdown-Bildziel kodiert (`encodeURI`, Klammern als
  `%28`/`%29`), damit Dateinamen das Markdown nicht brechen.

### PDF (Chromium und Gotenberg)

```text
Download-Klick → Client (markdown-pdf.ts) → POST /api/generate-document/pdf
→ pdf-service.ts (Markdown → sicheres HTML) → Gotenberg (Chromium) → PDF-Blob → Download
```

**Client (`markdown-pdf.ts`)**

- Das Markdown wird einmal mit `remark-parse` geparst. Aus dem Baum werden die referenzierten
  Bildziele (`image` und `definition`, also auch Referenz-Bilder) und die `jsxgraph-json`-Blöcke
  gelesen.
- Nur Bilder, die im Markdown vorkommen, werden geladen (`loadDocumentImage`, höchstens 240 px) und
  als Base64 mitgeschickt. Sonst würde ein unbenutztes, nicht ladbares Bild oder mehr als 20
  Uploads im Chat das PDF scheitern lassen.
- Plots lassen sich nur im Browser zeichnen. `renderPlots` rendert jede gültige, verschiedene Spec
  (höchstens 10) zu PNG und schickt sie mit dem Block-Code als Schlüssel mit. Die Spec-Prüfung
  (`getValidPlotSpec` in `plot-spec.ts`) wird von DOCX und PDF gemeinsam genutzt.
- Die Adresse hängt vom Kontext ab: `/api/generate-document/pdf` (angemeldet) oder
  `/api/v1/shared-chat/generate-document/pdf` (Shared Chat, mit Einladungscode, Entität und Session).

**Server (`pdf-service.ts`, `route.ts`, `pdf-response.ts`)**

- Die Route verlangt eine Anmeldung (`getUser`) und validiert den Body mit `pdfRequestSchema`:
  Markdown bis 100.000 Zeichen, Titel 1–120 Zeichen, höchstens 20 Bilder (PNG/JPEG, Base64 bis
  2 MB) und 10 Plots.
- Pipeline: `remark-parse`, `remark-gfm`, `remark-math-extended`, dann zwei eigene Plugins.
  `resolveImageReferences` ersetzt `attachment://` durch die mitgesendeten Data-URLs (auch bei
  Referenz-Bildern) und entfernt unbekannte Bilder. `embedPlots` ersetzt Plot-Codeblöcke durch das
  Bild mit demselben Code. Danach `remark-rehype`, `rehype-sanitize`, `rehype-katex` (MathML) und
  `rehype-stringify`.
- `rehype-sanitize` läuft vor `rehype-katex`. Das Schema erlaubt für `src` nur `data:` und die
  Formel-Klassen von `remark-math-extended`. Externe Bild-URLs kommen deshalb nicht ins PDF; im
  Container könnte Chromium sie ohnehin nicht laden.
- Das HTML wird als `index.html` an `POST /forms/chromium/convert/html` geschickt, mit
  `preferCssPageSize` (A4 und Rand aus dem CSS), `printBackground` (Tabellen- und Codehintergründe)
  und `nativeTaggedPdf` (getaggtes PDF für Barrierefreiheit). Ein Timeout von 30 Sekunden verhindert,
  dass die Anfrage bei einem hängenden Container offen bleibt.
- Der Titel wird in `<title>` maskiert eingesetzt (`&`, `<`, `>`), weil er aus dem Request-Body kommt.
- Die Antwort setzt `Content-Type: application/pdf`, `Content-Disposition: attachment` und
  `Cache-Control: no-store`; der Dateiname im Browser kommt aus dem AI-Activity-Step.

**Shared Chats (`shared-chat-document-service.ts`)**

- Es gibt keine angemeldete Nutzerin. Die eigene Route prüft deshalb, dass der Shared Chat existiert
  und weder gelöscht noch gesperrt ist, dass die Session zu Einladungscode und Entität gehört und
  dass das Markdown aus einem erfolgreichen `generate_document`-Aufruf dieser Unterhaltung stammt.
- Dazu werden die gespeicherten `toolCalls` der Assistenten-Nachrichten mit den gespeicherten
  Tool-Ergebnissen (Rolle `tool`, gleiche `toolCallId`, `status: 'created'`) abgeglichen. Die
  Argumente werden mit `generateDocumentArgsSchema` normalisiert (getrimmt) und der Inhalt muss dem
  gesendeten Markdown entsprechen. Der Prototyp suchte stattdessen nach ```document-Blöcken im
  Nachrichtentext; das passte nicht zum Tool-Weg und hätte jeden Download mit 403 abgelehnt.
- Bilder und Plots im Body werden nicht gegen die Unterhaltung geprüft. Sie sind durch Größe und
  Anzahl begrenzt und gelangen nur als Data-URLs durch den Sanitizer.

**Betrieb**

- Gotenberg läuft als eigener Container (`gotenberg/gotenberg:9.5.1-chromium`, Port 8002), in
  `docker-compose.local.yml` nur auf `127.0.0.1`, in `docker-compose.yml` ohne veröffentlichten Port.
  Die URL kommt aus `GOTENBERG_URL` (`env.ts`, `turbo.json`, `.env.example`).
- Die Startoptionen schalten JavaScript und jeden Netzwerkzugriff von Chromium ab.
- `ais-chat-app` wartet in `docker-compose.yml` auf einen gesunden Gotenberg-Container. Fällt er
  aus, startet die App nicht; das ist eine bewusste Kopplung, die man auf `service_started`
  lockern könnte.

**Schrift**

- Das PDF verwendet `Arial, sans-serif`. Im Gotenberg-Image ist Arial in der Regel nicht installiert,
  sodass Chromium auf eine metrisch kompatible Schrift (Liberation Sans) ausweicht. Die App-Schrift
  Barlow ist nicht eingebunden. Wer das PDF an das App-Layout angleichen will, muss die Schrift
  per `@font-face` einbetten oder in den Container bringen.

## Entscheidungen

- **Clientseitige Erzeugung:** DOCX und HTML werden im Browser erzeugt, weil Plot-Rendering, Canvas
  und die vorhandenen Bild-URLs mit Session bereits dort verfügbar sind. Es entsteht keine neue
  Serverinfrastruktur.
- **HTML als vollständiges Dokument:** Das LLM liefert bei `format: html` ein vollständiges
  HTML-Dokument. Der Client muss kein Markdown rendern und keinen iframe-Wrapper erzeugen.
- **Portabilität von HTML-Bildern:** Aufgelöste Upload-Bilder werden als Base64-Daten eingebettet,
  weil relative API-URLs beim Öffnen über `file://` nicht funktionieren und Blob-URLs nur während
  der ursprünglichen Browsersitzung gültig sind.
- **Inhalt im Tool-Call statt im Tool-Ergebnis:** Der Inhalt wird nicht doppelt gespeichert und ist
  nach einem Reload aus der AI Activity wiederherstellbar.
- **Opake `attachment://`-Referenzen statt Dateinamen:** löst Mehrdeutigkeiten bei gleichen
  Dateinamen und vermeidet das Durchreichen interner URLs an das LLM.
- **Keine Allowlist für Bild-URLs in DOCX:** Die frühere Allowlist mit HTML-Normalisierung war
  komplex und fehleranfällig. Nicht aufgelöste Referenzen werden direkt per `fetch` geladen; damit
  können auch externe Bilder eingebettet werden. Das Risiko ist begrenzt, weil der Abruf im Browser
  der Nutzerin oder des Nutzers stattfindet und nur Bilddaten eingebettet werden. Ein Abruf
  externer URLs kann jedoch die IP-Adresse gegenüber Dritten offenlegen.
- **Ein Renderer für Export und Generierung:** Konversationsexport und `generate_document` teilen
  sich `markdownToDocxBlob`, damit Styles, Formeln, Plots und Bilder einheitlich bleiben.
- **Antwortverhalten steht im System-Prompt, nicht im Tool-Ergebnis:** Nach einem erfolgreichen
  Aufruf soll das Modell nur kurz bestätigen und keinen Download-Link schreiben. Die Regel steht im
  `generate_document`-Abschnitt des System-Prompts; das Tool-Ergebnis bleibt auf `status`,
  `fileName` und `format` beschränkt. Die Tool-Beschreibung ist bewusst kurz (Zweck, Formate,
  unterstützte Inhalte). Beobachtung: Modelle schreiben trotz der Regel gelegentlich weiterhin
  Links wie `sandbox:/mnt/data/<Datei>.docx`, weil der Dateiname im Tool-Ergebnis dazu einlädt. Ein
  Hinweis im Tool-Ergebnis wirkte in Tests zuverlässiger, wurde aber nicht übernommen. Falls das
  Problem bestehen bleibt, ist das die nächste Stellschraube (alternativ: Dateiname aus dem
  Ergebnis entfernen).
- **Formeln, Plots und Symbole im Dokument:** LaTeX wird über `remark-math-extended` übernommen.
  Plots (`jsxgraph-json`) werden im Browser zu PNG gerendert und als Bild eingebettet. Wenn die
  Plot-Anleitung im System-Prompt steht, soll das Modell das Ergebnis von `create_plot`
  unverändert als Codeblock in den Dokumentinhalt übernehmen und Werte nicht nur als Tabelle
  beschreiben.

- **PDF serverseitig über Gotenberg:** Chromium liefert die beste Tabellen-, CSS- und
  Seitenumbruchqualität und rendert MathML ohne Schriften. Die Alternativen `remark-pdf` und
  `pdfmake` (clientseitig) blieben bei Tabellen, Formeln und Seitenumbrüchen zurück. Gotenberg läuft
  als eigener Container ohne App-Secrets (siehe Betriebsvarianten).
- **Plots und Bilder kommen vom Client:** JSXGraph und Canvas laufen nur im Browser, und die
  Bild-URLs mit Session sind dort verfügbar. Der Server bekommt Markdown plus Data-URLs und führt
  nie Client-HTML aus.
- **Nur referenzierte Bilder werden übertragen:** verhindert Fehler durch unbenutzte Uploads und
  hält die Anfrage unter den Limits.
- **Autorisierung in Shared Chats über gespeicherte Tool-Aufrufe:** Ein Dokument gilt nur dann als
  zur Unterhaltung gehörig, wenn ein erfolgreicher `generate_document`-Aufruf mit demselben Inhalt
  gespeichert ist. Das verhindert, dass der anonyme Endpunkt als freier PDF-Dienst genutzt wird.
- **Trennlinien über den Prompt, nicht über Server-Code:** Eine frühere Funktion entfernte `---`
  und Linien vor Überschriften aus dem Syntaxbaum und hängte Schreiblinien an Listenpunkte. Sie
  wurde zugunsten einer Prompt-Regel entfernt. Hält sich das Modell nicht daran, erscheinen die
  Linien im PDF, und Schreiblinien nach Listen stehen nicht mehr eingerückt.
- **Titel im AI-Activity-Step:** `title` wird zusätzlich zum Dateinamen gespeichert, statt ihn aus
  dem bereinigten und gekürzten Dateinamen zurückzurechnen.
- **Statische Imports der Renderer:** Nach der Trennung von `generated-document-format.ts` und
  `generated-document.ts` ist der dynamische Import nicht mehr nötig. Die Auswirkung auf die
  Bundle-Größe ist nicht gemessen.
- **Gemeinsame Hilfsfunktion `getValidPlotSpec`:** ersetzt dieselbe Prüfung an mehreren Stellen in
  DOCX und PDF. `parsePlotSpec` bleibt für Aufrufer erhalten, die die Fehlermeldung brauchen.

## Variantenvergleich

### DOCX

**Bestehender Package-Ansatz (`remark-docx`/`docx`)**

```text
Markdown → Remark/MDAST → remark-docx → DOCX-Blob
```

Vorteile:

- bereits im Projekt vorhanden
- Tabellen, Bilder, Formeln, Code und Plots werden unterstützt
- clientseitig möglich
- keine externen Prozesse

Nachteile:

- Teile des bestehenden Exports verwenden Browser-APIs
- Word kann bei unbekannten Fonts Ersatzschriften verwenden
- DOCX- und PDF-Layout können voneinander abweichen
- Bilder müssen über erlaubte Upload-Referenzen geprüft werden

**Serverseitige DOCX-Erzeugung** wäre langfristig möglich, erfordert aber eine serverfähige Pipeline
für DOM, Canvas und Plot-Rendering.

### PDF: `remark-pdf`

```text
Markdown → Remark/MDAST → remark-pdf/PDFKit → PDF-Blob
```

Vorteile:

- clientseitig möglich
- passt direkt zum Remark-Stack
- kein Chromium und kein Serverprozess
- wenig eigener Renderer-Code
- MIT-Lizenz

Nachteile:

- unter Node 24 in der verwendeten Version problematisch
- Tabellen mit unterschiedlich hohen Zellen können Layoutlücken erzeugen
- eingeschränkte Kontrolle über Codeblöcke, Seitenumbrüche und Tabellen
- Fonts müssen als TTF/Buffer eingebettet werden
- weniger etabliertes Projekt

### PDF: `pdfmake`

```text
Markdown → MDAST/DocumentModel → pdfmake → PDF-Blob
```

Vorteile:

- clientseitig möglich
- bessere Tabellenkontrolle
- Zellhöhen, Rahmen und Spalten können gesteuert werden
- Kopf-/Fußzeilen, Seitenzahlen und Inhaltsverzeichnisse möglich
- MIT-Lizenz und etablierter als `remark-pdf`

Nachteile:

- eigener MDAST-zu-pdfmake-Konverter erforderlich
- mehr eigener Code und Tests
- DOCX und PDF müssen separat interpretiert werden
- Fonts und Sonderzeichen müssen weiterhin behandelt werden

`pdfmake` ist die beste rein clientseitige Alternative, wenn die Tabellenqualität von
`remark-pdf` nicht ausreicht.

### PDF: HTML + Chromium

```text
Markdown → serverseitig kontrolliertes HTML → Chromium → PDF
```

Vorteile:

- sehr gute CSS- und Tabellenunterstützung
- gute Seitenumbrüche und Print-CSS
- HTML- und PDF-Darstellung können dieselbe Stylingbasis verwenden
- geeignet für hochwertige Arbeitsblätter

Nachteile:

- Chromium und `playwright-core` benötigen zusätzliche Runtime-Infrastruktur
- größeres Docker-Image oder eigener PDF-Service
- höherer RAM-/CPU-Verbrauch
- Browserprozesse, Timeouts und Parallelität müssen verwaltet werden
- Client darf nicht beliebiges HTML an das Backend senden

Die aktuelle Chromium-Variante sendet daher nur Markdown, Titel und geprüfte Bilddaten an den
Backend-Service. Das HTML wird erst serverseitig mit Remark/Rehype erzeugt und anschließend von
Chromium gerendert.

### PDF: Betriebsvarianten für Chromium

|                 | Chromium im App-Container                                                | Eigener Playwright-Container                     | Gotenberg                               |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------- |
| Aufwand         | gering, `playwright-core` plus `chromium` im Image                       | Service, Pooling, Timeouts selbst bauen          | fertiges Image, nur konfigurieren       |
| Image/Isolation | App-Image deutlich größer, Browser teilt Prozess und Secrets mit der App | eigener Container ohne App-Secrets               | eigener Container ohne App-Secrets      |
| Kontrolle       | volle Kontrolle (z. B. Seitenkontext, Requests abfangen)                 | volle Kontrolle                                  | nur die angebotenen Optionen            |
| Betrieb         | keine neue Komponente                                                    | eigener Dienst mit Updates und Absturzbehandlung | eigener Dienst, Updates über Image-Tag  |
| Skalierung      | an die App gekoppelt                                                     | unabhängig                                       | unabhängig, Parallelität konfigurierbar |

Empfehlung des Prototyps: Gotenberg als eigener Container, solange das HTML wie bisher fertig beim
Service ankommt (Formeln als MathML, Plots als PNG). Ein eigener Playwright-Service lohnt sich nur,
wenn serverseitiges Rendering im Seitenkontext nötig wird.

### PDF: Erkenntnisse aus den Prototypen

Die Prototypen liegen auf den Branches `feat/TD-1541-generate-docx-html-chromium-pdf` (Chromium,
Gotenberg) und `feat/TD-1541-generate-docx-html-pdfmake`.

**Gotenberg (getestet mit `gotenberg/gotenberg:9.5.1-chromium`)**

- Route `POST /forms/chromium/convert/html`; die Datei muss als `index.html` übergeben werden.
- In Version 9 heißt das Formularfeld für getaggte PDFs `nativeTaggedPdf` (`generateTaggedPdf` wird
  mit 400 abgelehnt).
- Der Service hat keine eigene Authentifizierung und darf nur im internen Netz erreichbar sein.
- Härtung über Startoptionen: `--chromium-disable-javascript=true` sowie
  `--chromium-deny-private-ips=true` und `--chromium-deny-public-ips=true`, damit aus dem HTML keine
  Netzwerkzugriffe möglich sind. Standardmäßig sind lokale Dateien außer `/tmp` gesperrt.
- Die App ruft den Dienst per `fetch` mit Timeout auf; die URL kommt aus einer Umgebungsvariable.

**Inhalt im PDF**

- Formeln: `remark-math-extended` plus `rehype-katex` mit `output: 'mathml'`. Chromium rendert MathML
  im Gotenberg-Image mit der Schrift DejaVu Math TeX Gyre; weder KaTeX-CSS noch eingebettete
  Schriften sind nötig.
- Plots: Der Browser rendert sie zu PNG (`renderPlotImage`) und sendet sie als zusätzliche Bilder
  mit. Der Server ersetzt den Codeblock durch das Bild. Der Server selbst führt kein JSXGraph aus.
- Bilder: Der Service akzeptiert nur Data-URLs aus den mitgesendeten Bilddaten.
  `rehype-sanitize` entfernt `data:` standardmäßig und muss dafür für `src` erweitert werden.
- Sonderzeichen: Fehlt einem Zeichen wie ☐ die Glyphe, erscheint im PDF ein Platzhalter. Beim
  Prototyp mit `pdfmake` hilft eine eingebettete Symbolschrift für diese Abschnitte, bei Chromium
  die Schriftausstattung des Containers.
- Markdown-Eigenheiten: Eine Zeile aus `___` ist für Markdown eine Trennlinie. Schreiblinien für
  Arbeitsblätter erscheinen deshalb als Linien und brauchen eigenes Styling. `---` zwischen
  Abschnitten und Linien direkt vor Überschriften wirken schnell störend. Der Prototyp entfernte sie
  serverseitig; die aktuelle Umsetzung bittet das Modell stattdessen im Prompt, sie zu vermeiden.

**`pdfmake`**

- Läuft im Browser, ein eigener MDAST-Konverter ist nötig. Formeln wären nur als Bild möglich,
  Sonderzeichen brauchen eine eigene Schrift. Dafür entfällt jeder Serverprozess, und Shared Chats
  benötigen keine zusätzliche Server-Route.
- Gut für einfache Dokumente; die Qualität für Tabellen, Formeln und Seitenumbrüche bleibt hinter
  der Chromium-Variante zurück.

### PDF: DOCX-Konvertierung

```text
Markdown → DOCX → LibreOffice/Collabora → PDF
```

Vorteile:

- PDF kann sehr ähnlich zum DOCX aussehen
- gute Office-Kompatibilität
- Tabellen und Seitenumbrüche werden von der Office-Engine verarbeitet

Nachteile:

- nicht rein clientseitig
- LibreOffice benötigt große Images, Temp-Dateien und Prozesslimits
- Collabora ist für reine Konvertierung wahrscheinlich überdimensioniert
- zusätzlicher Service oder Binary-Betrieb

### PDF: Browser-Druckdialog

```text
HTML → window.print() → Nutzer speichert als PDF
```

Vorteile:

- vollständig clientseitig
- nutzt die Browser-Fonts und CSS-Darstellung
- keine PDF-Bibliothek notwendig

Nachteile:

- kein automatischer Download
- Nutzer muss den Druckdialog bedienen
- Browser-/Druckereinstellungen beeinflussen das Ergebnis

## HTML

### Statisches HTML

Statisches HTML wird ohne JavaScript erzeugt und kann lokal geöffnet werden. Es eignet sich für
Text, Tabellen, Bilder und CSS, aber nicht für interaktive Apps.

### Interaktives HTML

Interaktives HTML wird als vollständiges HTML-Dokument mit Inline-JavaScript erzeugt und ohne
zusätzlichen Wrapper heruntergeladen. Beim lokalen Öffnen wird JavaScript ausgeführt. Das Format ist
deshalb nicht vollständig vertrauenswürdig; die Nutzerin oder der Nutzer muss vor dem Öffnen
unbekannter Dateien gewarnt werden.

#### Offene Sandbox- und Sicherheitsfragen

- `sandbox="allow-scripts"` ohne `allow-same-origin` verhindert den Zugriff auf `localStorage` und
  `sessionStorage` (`DOMException`). Ein generierter Vokabeltrainer brach dadurch beim Start ab. Ein
  kleiner In-Memory-Ersatz für beide Speicher, der vor dem eigenen Code eingefügt wird, behebt das,
  ohne die Sandbox zu lockern. Daten bleiben nur bis zum Schließen der Datei erhalten.
- Ein Sandbox-Iframe verhindert nicht, dass der eigene Code navigiert, etwa mit
  `location.replace('https://…?d=' + …)`. Damit könnten Dokument- und Bilddaten abfließen. Auch
  `<meta http-equiv="refresh">` kann navigieren und sollte entfernt werden.
- Die CSP-Direktive `navigate-to` ist nach unserem Kenntnisstand in den gängigen Browsern nicht
  umgesetzt und deshalb keine verlässliche Maßnahme. Eine tragfähige Navigationsgrenze muss
  zuerst browserseitig verifiziert werden; bis dahin ist das Risiko zu dokumentieren oder die
  Ausführung von Skripten einzuschränken.
- Große Bilder dürfen nicht mit `String.fromCharCode(...bytes)` in Base64 umgewandelt werden (zu
  viele Argumente, `RangeError`); die Umwandlung erfolgt in Blöcken.

## Weitere Formate

### PPTX

`PptxGenJS` ist eine mögliche Package-Lösung:

```text
Markdown → Folienmodell → PptxGenJS → PPTX
```

Vorteile: normale TypeScript-Abhängigkeit, präzise Layouts, Bilder und feste Designs.

Nachteile: eigenes Folienmodell, Textüberlauf und Seitenaufteilung müssen implementiert werden.

`OfficeCLI` bietet mehr Office-Steuerung und Validierung, benötigt aber ein natives Binary und ist
für den ersten Scope überdimensioniert.

### ODT

Gotenberg hilft nicht weiter: Die LibreOffice-Route wandelt nach unserem Kenntnisstand nur in PDF
um (in der verwendeten Version 9.5.1 noch zu prüfen). Eine Umwandlung von DOCX nach ODT braucht
eine Office-Engine, also einen eigenen LibreOffice-Dienst (z. B. unoserver), Pandoc oder
`libreoffice-convert` im App-Image. Letzteres vergrößert das Image stark und startet pro Umwandlung
einen Prozess; `docker exec` in den Gotenberg-Container scheidet aus, weil dafür der Docker-Socket
nötig wäre.

Bevorzugt wäre ein eigener clientseitiger Writer, der den Markdown-Syntaxbaum in ODF-XML
(`content.xml`, `styles.xml`, `Pictures/`) abbildet und als ZIP verpackt. Formeln (eingebettete
MathML-Objekte) wären der aufwendigste Teil. Ein erster Schritt ohne Formeln wäre deutlich kleiner.
Ein serverseitiger Dienst käme nur in Frage, wenn die Qualität bei Formeln und Layout wichtiger ist
als weniger Infrastruktur; er braucht dieselben Schutzmaßnahmen wie Gotenberg und für Shared Chats
dieselbe Verifikation.

### Pandoc

Pandoc unterstützt viele Formate und ist für DOCX/ODT interessant. Es benötigt aber ein Binary,
Temp-Dateien und je nach PDF-Engine zusätzliche Infrastruktur. Für die reine clientseitige
DOCX/PDF-Generierung passt es nicht gut.

## Sicherheitsregeln

Umgesetzt:

- LLM-Daten werden mit Zod validiert.
- Dateinamen werden bereinigt und begrenzt.
- Upload-Bilder werden über opake `attachment://`-Referenzen aufgelöst und skaliert.
- Plot-Specs werden vor dem Rendern mit `parsePlotSpec` validiert.
- PDF: Zod-Limits pro Feld, `rehype-sanitize` mit `data:`-only-`src`, Gotenberg ohne JavaScript und
  ohne Netzwerkzugriff, nur im internen Netz erreichbar, Timeout pro Anfrage.

Noch offen beziehungsweise Ziel:

- DOCX lädt nicht aufgelöste Bildziele aktuell direkt, also auch externe URLs. Falls nur
  Chat-Uploads erlaubt sein sollen, muss das in `createDocxOptions` eingeschränkt werden.
- HTML wird aktuell nicht sanitisiert und darf Inline-Scripts enthalten. Beim lokalen Öffnen können
  diese Scripts ausgeführt werden. Eine Sanitization für statisches HTML oder eine belastbare
  Sandbox für interaktives HTML ist noch offen.
- Der PDF-Service soll Markdown und geprüfte Bilddaten akzeptieren, nicht fertiges Client-HTML.
- Für persistente Dateien sind zusätzlich Ownership, S3-Upload, Download-Autorisierung und Cleanup
  bei Chatlöschung erforderlich.

Für den serverseitigen PDF-Dienst gilt zusätzlich:

- Die Route verlangt eine angemeldete Nutzerin oder einen angemeldeten Nutzer.
- Das HTML wird auf dem Server aus Markdown erzeugt und bereinigt; Client-HTML wird nicht
  akzeptiert. Die Bereinigung läuft vor `rehype-katex`, dessen Ausgabe mit Standardeinstellungen
  keine aktiven Inhalte erzeugt.
- Größenlimits gelten pro Feld und insgesamt; ein Rate-Limit pro Nutzerin oder Nutzer fehlt noch.
- Der Konverter ist ohne ausgehende Verbindungen zu betreiben (Container im internen Netz, kein
  veröffentlichter Port).
- Shared Chats haben keine angemeldete Nutzerin. Die eigene Route prüft Einladungscode, Session
  und, dass das Markdown aus einem erfolgreichen, gespeicherten `generate_document`-Aufruf dieser
  Unterhaltung stammt (siehe PDF-Abschnitt).

## Offene Punkte

- Sollen generierte Dateien dauerhaft in S3 gespeichert werden?
- Rate-Limit pro Nutzerin, Nutzer oder Einladungscode für die PDF-Routen fehlt; jede Anfrage
  belegt Chromium bis zu 30 Sekunden.
- Soll das PDF dieselbe Schrift wie die App (Barlow) erhalten, und wie kommt sie in den Container?
- Sollen externe Bild-URLs im PDF unterstützt werden (Abruf im Browser per `fetch` und Einbetten,
  begrenzt durch CORS)?
- Soll interaktives HTML dauerhaft unterstützt oder als experimentelles Format gekennzeichnet werden?
- Sollen externe Bild-URLs in DOCX erlaubt bleiben?
- Wie werden Sonderzeichen in Word zuverlässig dargestellt (Symbolschrift, eingebettete Schrift,
  `w:sym` oder Prompt-Regel für Checkboxen wie `[ ]`/`[x]`)?
- Unit-Tests decken Tool, Dateinamen, Bildreferenzen, DOCX-Erzeugung und Plot-Export mit Mocks ab.
  Browser- und Integrationstests für Download, Shared Chat, Word-Darstellung und PDF-Service fehlen
  noch. Für `pdf-service.ts` (Sanitizer, Bild- und Plot-Einbettung) und die
  Shared-Chat-Verifikation gibt es keine Tests.
- Wie verhindern wir, dass Modelle nach dem Tool-Aufruf trotzdem Download-Links schreiben (siehe
  Entscheidung zum Antwortverhalten)?
- Wie begrenzen wir Navigation und Datenabfluss in interaktivem HTML verlässlich, wenn
  `navigate-to` nicht greift?
- Shared Chats bieten `generate_document` an; die Verifikation für PDF ist umgesetzt. Offen ist,
  ob ältere Unterhaltungen ohne gespeicherte Tool-Ergebnisse (Rolle `tool`) PDFs erzeugen können;
  sie würden mit 403 abgelehnt.
- Reicht bei Symbolen die Symbolschrift für Text und Inline-Code, oder müssen auch Codeblöcke
  (Shiki) abgedeckt werden?
