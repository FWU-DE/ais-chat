import { DOMParser, type Element, type Node, XMLSerializer } from '@xmldom/xmldom';

import { AiGenerationError } from '../../errors';

const SSML_NAMESPACE = 'http://www.w3.org/2001/10/synthesis';
const MSTTS_NAMESPACE = 'https://www.w3.org/2001/mstts';
const DEFAULT_SSML_LOCALE = 'de-DE';

// The document wrapper and voice (incl. personal voice embeddings) are owned by the server; `audio`,
// background audio, `lexicon` and voice conversion would make the speech service fetch arbitrary URLs.
const FORBIDDEN_ELEMENTS = new Set([
  'speak',
  'voice',
  'ttsembedding',
  'audio',
  'backgroundaudio',
  'lexicon',
  'voiceconversion',
]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Derives the base locale of the SSML document from voice names like `de-DE-Seraphina:...`. */
export function getVoiceLocale(voice: string): string {
  return /^([a-z]{2,3}-[A-Z]{2})-/.exec(voice)?.[1] ?? DEFAULT_SSML_LOCALE;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseSsmlBody(body: string): Element {
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') throw new Error(message);
      },
    }).parseFromString(`<root xmlns:mstts="${MSTTS_NAMESPACE}">${body}</root>`, 'text/xml');
    return document.documentElement as Element;
  } catch (error) {
    throw new AiGenerationError(
      `Invalid SSML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertNoForbiddenElements(root: Element) {
  for (const element of Array.from(root.getElementsByTagName('*'))) {
    if (element.localName && FORBIDDEN_ELEMENTS.has(element.localName)) {
      throw new AiGenerationError(`Invalid SSML: element <${element.nodeName}> is not allowed`);
    }
  }
}

function isBlankText(node: Node): boolean {
  return node.nodeType === TEXT_NODE && (node.nodeValue ?? '').trim() === '';
}

function getContentNodes(parent: Node): Node[] {
  return Array.from(parent.childNodes).filter((node) => !isBlankText(node));
}

/**
 * A body consisting of a single `<lang>` element is split at its children, so every segment keeps
 * the language the model detected for the whole text.
 */
function getBlocks(root: Element): { wrapper?: Element; blocks: Node[] } {
  const topLevel = getContentNodes(root);
  const [onlyNode] = topLevel;
  if (topLevel.length === 1 && onlyNode?.nodeType === ELEMENT_NODE) {
    const element = onlyNode as Element;
    if (element.localName === 'lang') {
      return { wrapper: element, blocks: getContentNodes(element) };
    }
  }
  return { blocks: topLevel };
}

function serializeSegment(blocks: Node[], wrapper: Element | undefined): string {
  const serializer = new XMLSerializer();
  if (!wrapper) {
    return blocks.map((block) => serializer.serializeToString(block)).join('');
  }
  const segmentWrapper = wrapper.cloneNode(false);
  // Keeps an empty wrapper from serializing self-closing, so its length matches a filled one.
  const emptyText = wrapper.ownerDocument?.createTextNode('');
  if (emptyText) segmentWrapper.appendChild(emptyText);
  for (const block of blocks) {
    segmentWrapper.appendChild(block.cloneNode(true));
  }
  return serializer.serializeToString(segmentWrapper);
}

function wrapInSpeakDocument(content: string, voice: string): string {
  const locale = escapeXmlAttribute(getVoiceLocale(voice));
  return (
    `<speak version="1.0" xmlns="${SSML_NAMESPACE}" xmlns:mstts="${MSTTS_NAMESPACE}" xml:lang="${locale}">` +
    `<voice name="${escapeXmlAttribute(voice)}">${content}</voice></speak>`
  );
}

/**
 * Validates a generated SSML body (the content of the `<voice>` element) and splits it into
 * complete SSML documents of at most `maxChars` characters each. Splits only happen between
 * top-level blocks (usually `<p>` elements), so no element is cut apart.
 */
export function buildSsmlSegments({
  body,
  voice,
  maxChars,
}: {
  body: string;
  voice: string;
  maxChars: number;
}): string[] {
  const root = parseSsmlBody(body);
  assertNoForbiddenElements(root);

  const { wrapper, blocks } = getBlocks(root);
  if (blocks.length === 0) {
    throw new AiGenerationError('Invalid SSML: no content to synthesize');
  }

  const overhead = wrapInSpeakDocument(serializeSegment([], wrapper), voice).length;
  const serializer = new XMLSerializer();
  const segments: string[] = [];
  let current: Node[] = [];
  let currentLength = overhead;

  for (const block of blocks) {
    const blockLength = serializer.serializeToString(block).length;
    if (overhead + blockLength > maxChars) {
      throw new AiGenerationError(
        `Invalid SSML: a single block exceeds the segment limit of ${maxChars} characters`,
      );
    }
    if (currentLength + blockLength > maxChars && current.length > 0) {
      segments.push(wrapInSpeakDocument(serializeSegment(current, wrapper), voice));
      current = [];
      currentLength = overhead;
    }
    current.push(block);
    currentLength += blockLength;
  }
  segments.push(wrapInSpeakDocument(serializeSegment(current, wrapper), voice));

  return segments;
}
