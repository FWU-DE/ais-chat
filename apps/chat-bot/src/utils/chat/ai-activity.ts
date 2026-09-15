import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { ToolRegistration } from '@/app/api/chat/tools/types';
import {
  type AiActivityLink,
  type AiActivityStep,
  type AiActivityToolStep,
} from '@/types/ai-activity';

const MAX_DETAIL_LENGTH = 300;
const MAX_LINKS = 10;

export function parseJsonRecord(value: string | undefined): unknown {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function readString(source: unknown, key: string): string | undefined {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function truncate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}

export function toLinks(entries: unknown): AiActivityLink[] | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }

  const links = entries
    .map((entry) => {
      const url = readString(entry, 'url');
      if (url === undefined) {
        return undefined;
      }

      return { title: readString(entry, 'title') ?? url, url };
    })
    .filter((link): link is AiActivityLink => link !== undefined)
    .slice(0, MAX_LINKS);

  return links.length > 0 ? links : undefined;
}

/**
 * Collects the activity of an agent run so it can be streamed to the client and persisted
 * with the assistant message.
 */
export function createAiActivityCollector(toolRegistry: Record<string, ToolRegistration>) {
  const steps: AiActivityStep[] = [];
  const stepsById = new Map<string, AiActivityToolStep>();
  let hasToolActivity = false;

  return {
    start(): boolean {
      if (steps.length > 0) {
        return false;
      }

      steps.push({ kind: 'analysis' });
      return true;
    },
    addToolCalls(toolCalls: ToolCall[]): boolean {
      const toolSteps = toolCalls.flatMap((toolCall) => {
        const activity = toolRegistry[toolCall.name]?.activity;
        return activity === undefined ? [] : [activity.createStep(toolCall)];
      });

      if (toolSteps.length === 0) {
        return false;
      }

      hasToolActivity = true;
      if (steps.at(-1)?.kind !== 'analysis') {
        steps.push({ kind: 'analysis' });
      }
      steps.push(...toolSteps);

      for (const step of toolSteps) {
        stepsById.set(step.id, step);
      }

      return true;
    },
    addToolResult(toolCallId: string, result: string): boolean {
      const step = stepsById.get(toolCallId);

      if (step === undefined) {
        return false;
      }

      const activity = toolRegistry[step.tool]?.activity;
      const enrichedStep = activity?.applyResult?.(step, result) ?? step;

      if (enrichedStep === step) {
        return false;
      }

      steps[steps.indexOf(step)] = enrichedStep;
      stepsById.set(toolCallId, enrichedStep);
      return true;
    },
    finish(): boolean {
      if (!hasToolActivity) {
        steps.length = 0;
        return false;
      }

      if (steps.length === 0) {
        return false;
      }

      steps.push({ kind: 'done' });
      return true;
    },
    getSteps(): AiActivityStep[] {
      return [...steps];
    },
  };
}
