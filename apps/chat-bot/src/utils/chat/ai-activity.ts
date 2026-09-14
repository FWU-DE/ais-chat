import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import {
  isAiActivityToolName,
  type AiActivityLink,
  type AiActivityStep,
  type AiActivityToolStep,
} from '@/types/ai-activity';

const MAX_DETAIL_LENGTH = 300;
const MAX_LINKS = 10;

function parseJsonRecord(value: string | undefined): unknown {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readString(source: unknown, key: string): string | undefined {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function truncate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}

function toLinks(entries: unknown): AiActivityLink[] | undefined {
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
 * Builds the displayable step for a tool call. Returns null for tools that are not surfaced.
 */
export function createToolActivityStep(toolCall: ToolCall): AiActivityToolStep | null {
  if (!isAiActivityToolName(toolCall.name)) {
    return null;
  }

  const args = parseJsonRecord(toolCall.arguments);
  const step: AiActivityToolStep = { kind: 'tool', id: toolCall.id, tool: toolCall.name };

  switch (toolCall.name) {
    case 'web_search':
    case 'mundo_search':
      step.detail = truncate(readString(args, 'query'));
      break;
    case 'retrieve_text_chunks':
      step.detail = truncate(readString(args, 'search'));
      break;
    case 'retrieve_entire_file':
      step.detail = truncate(readString(args, 'fileName'));
      break;
    case 'math_calculate':
      step.detail = truncate(readString(args, 'expression'));
      break;
    case 'web_scraper': {
      const urls =
        args !== null && typeof args === 'object' ? (args as { urls?: unknown }).urls : [];
      step.links = toLinks(Array.isArray(urls) ? urls.map((url) => ({ url })) : []);
      break;
    }
  }

  return step;
}

/**
 * Enriches a tool step with the parts of the tool result that are shown to the user.
 * Only small display values are extracted — tool results themselves never reach the client.
 */
export function applyToolResultToActivityStep(
  step: AiActivityToolStep,
  result: string,
): AiActivityToolStep {
  const parsed = parseJsonRecord(result);

  switch (step.tool) {
    case 'web_search': {
      const links = toLinks(
        parsed !== null && typeof parsed === 'object'
          ? (parsed as { results?: unknown }).results
          : undefined,
      );
      return links === undefined ? step : { ...step, links };
    }
    case 'web_scraper': {
      const links = toLinks(parsed);
      return links === undefined ? step : { ...step, links };
    }
    case 'math_calculate': {
      const calculated = readString(parsed, 'result');
      return calculated === undefined ? step : { ...step, result: truncate(calculated) };
    }
    default:
      return step;
  }
}

/**
 * Collects the activity of an agent run so it can be streamed to the client and persisted
 * with the assistant message.
 */
export function createAiActivityCollector() {
  const steps: AiActivityStep[] = [];
  const stepsById = new Map<string, AiActivityToolStep>();

  return {
    addToolCalls(toolCalls: ToolCall[]): boolean {
      const toolSteps = toolCalls
        .map(createToolActivityStep)
        .filter((step): step is AiActivityToolStep => step !== null);

      if (toolSteps.length === 0) {
        return false;
      }

      steps.push({ kind: 'analysis' }, ...toolSteps);

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

      const enrichedStep = applyToolResultToActivityStep(step, result);

      if (enrichedStep === step) {
        return false;
      }

      steps[steps.indexOf(step)] = enrichedStep;
      stepsById.set(toolCallId, enrichedStep);
      return true;
    },
    finish(): boolean {
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
