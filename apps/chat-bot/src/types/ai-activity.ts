import { z } from 'zod';

import { GENERATED_DOCUMENT_FORMATS } from '@/utils/files/generated-document';

import { TOOL_NAMES } from './tool-names';

/**
 * Tools whose calls are surfaced to the user in the "AI Activity" section.
 * Calls of any other tool are not displayed.
 */
export const AI_ACTIVITY_TOOL_NAMES = [
  TOOL_NAMES.webSearch,
  TOOL_NAMES.webScraper,
  TOOL_NAMES.retrieveTextChunks,
  TOOL_NAMES.retrieveEntireFile,
  TOOL_NAMES.mundoSearch,
  TOOL_NAMES.mathCalculate,
  TOOL_NAMES.createPlot,
  TOOL_NAMES.generateDocument,
] as const;

export type AiActivityToolName = (typeof AI_ACTIVITY_TOOL_NAMES)[number];

const aiActivityLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  failed: z.boolean().optional(),
});

const aiActivityDocumentSchema = z.object({
  fileName: z.string(),
  format: z.enum(GENERATED_DOCUMENT_FORMATS),
  content: z.string(),
});

export const aiActivityStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('analysis'), summary: z.string().optional() }),
  z.object({ kind: z.literal('analysis-summary'), content: z.string() }),
  z.object({ kind: z.literal('done') }),
  z.object({
    kind: z.literal('tool'),
    id: z.string(),
    tool: z.enum(AI_ACTIVITY_TOOL_NAMES),
    detail: z.string().optional(),
    detailPlacement: z.enum(['inline', 'below']).optional(),
    result: z.string().optional(),
    links: z.array(aiActivityLinkSchema).optional(),
    document: aiActivityDocumentSchema.optional(),
    failed: z.boolean().optional(),
  }),
]);

export type AiActivityLink = z.infer<typeof aiActivityLinkSchema>;
export type AiActivityDocument = z.infer<typeof aiActivityDocumentSchema>;
export type AiActivityStep = z.infer<typeof aiActivityStepSchema>;
export type AiActivityToolStep = Extract<AiActivityStep, { kind: 'tool' }>;

export function isAiActivityToolName(name: string): name is AiActivityToolName {
  return AI_ACTIVITY_TOOL_NAMES.includes(name as AiActivityToolName);
}
