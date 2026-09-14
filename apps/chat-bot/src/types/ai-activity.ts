import { z } from 'zod';

/**
 * Tools whose calls are surfaced to the user in the "KI-Aktivität" section.
 * Calls of any other tool are not displayed.
 */
export const AI_ACTIVITY_TOOL_NAMES = [
  'web_search',
  'web_scraper',
  'retrieve_text_chunks',
  'retrieve_entire_file',
  'mundo_search',
  'math_calculate',
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
