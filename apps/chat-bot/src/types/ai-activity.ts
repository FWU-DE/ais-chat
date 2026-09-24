import { z } from 'zod';
import { TOOL_NAMES } from './tool-names';

/**
 * Tools whose calls are surfaced to the user in the "KI-Aktivität" section.
 * Calls of any other tool are not displayed.
 */
export const AI_ACTIVITY_TOOL_NAMES = [
  TOOL_NAMES.webSearch,
  TOOL_NAMES.webScraper,
  TOOL_NAMES.retrieveTextChunks,
  TOOL_NAMES.retrieveEntireFile,
  TOOL_NAMES.mundoSearch,
  TOOL_NAMES.mathCalculate,
] as const;

export type AiActivityToolName = (typeof AI_ACTIVITY_TOOL_NAMES)[number];

const aiActivityLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export const aiActivityStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('analysis') }),
  z.object({ kind: z.literal('done') }),
  z.object({
    kind: z.literal('tool'),
    id: z.string(),
    tool: z.enum(AI_ACTIVITY_TOOL_NAMES),
    detail: z.string().optional(),
    result: z.string().optional(),
    links: z.array(aiActivityLinkSchema).optional(),
  }),
]);

export type AiActivityLink = z.infer<typeof aiActivityLinkSchema>;
export type AiActivityStep = z.infer<typeof aiActivityStepSchema>;
export type AiActivityToolStep = Extract<AiActivityStep, { kind: 'tool' }>;

export function isAiActivityToolName(name: string): name is AiActivityToolName {
  return AI_ACTIVITY_TOOL_NAMES.includes(name as AiActivityToolName);
}
