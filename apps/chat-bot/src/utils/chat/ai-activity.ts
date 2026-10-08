import type { ToolRegistration } from '@/app/api/chat/tools/types';
import {
  type AiActivityLink,
  type AiActivityStep,
  type AiActivityToolStep,
} from '@/types/ai-activity';
import { TOOL_NAMES } from '@/types/tool-names';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';

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
  const value = readValue(source, key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function readValue(source: unknown, key: string): unknown {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }

  return (source as Record<string, unknown>)[key];
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

      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return undefined;
        }

        return { title: readString(entry, 'title') ?? url, url: parsedUrl.toString() };
      } catch {
        return undefined;
      }
    })
    .filter((link): link is AiActivityLink => link !== undefined)
    .slice(0, MAX_LINKS);

  return links.length > 0 ? links : undefined;
}

export type AiActivityOptions = {
  hideSensitiveDetails?: boolean;
};

export function createAiActivityCollector(
  toolRegistry: Record<string, ToolRegistration>,
  { hideSensitiveDetails = false }: AiActivityOptions = {},
) {
  const steps: AiActivityStep[] = [];
  const stepsById = new Map<string, AiActivityToolStep>();
  let hasToolActivity = false;
  let reasoningSummary = '';

  return {
    addReasoningSummary(summary: string): boolean {
      if (typeof summary !== 'string' || summary.length === 0) {
        return false;
      }

      reasoningSummary += summary;
      return true;
    },
    addToolCalls(toolCalls: ToolCall[]): boolean {
      const toolSteps = toolCalls.flatMap((toolCall) => {
        const activity = toolRegistry[toolCall.name]?.activity;
        if (activity === undefined) {
          return [];
        }

        const step = activity.createStep(toolCall);
        return [
          hideSensitiveDetails && step.tool === TOOL_NAMES.retrieveEntireFile
            ? { ...step, detail: undefined }
            : step,
        ];
      });

      if (toolSteps.length === 0) {
        return false;
      }

      hasToolActivity = true;
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

      if (enrichedStep !== step) {
        steps[steps.indexOf(step)] = enrichedStep;
        stepsById.set(toolCallId, enrichedStep);
      }

      return true;
    },
    finish(): boolean {
      const hasReasoningActivity = reasoningSummary.length > 0;

      if (!hasToolActivity && !hasReasoningActivity) {
        steps.length = 0;
        return false;
      }

      if (hasReasoningActivity) {
        steps.push({ kind: 'analysis-summary', content: reasoningSummary });
      }

      steps.push({ kind: 'done' });
      return true;
    },
    getSteps(): AiActivityStep[] {
      return [...steps];
    },
    getReasoningSummary(): string | undefined {
      return reasoningSummary.length > 0 ? reasoningSummary : undefined;
    },
  };
}
