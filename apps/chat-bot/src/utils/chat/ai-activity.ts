import { toolActivityRegistry } from '@/app/api/chat/build-tools';
import type { ToolActivity } from '@/app/api/chat/tools/types';
import {
  type AiActivityStep,
  type AiActivityToolStep,
  isAiActivityToolName,
} from '@/types/ai-activity';
import { TOOL_NAMES } from '@/types/tool-names';
import { ToolCall, type ToolResult } from '@ais-chat/ai-core';
import { type ToolErrorResult } from '@ais-chat/ai-core/chat/types';
import { logError } from '@shared/logging/logging';

export type AiActivityOptions = {
  hideSensitiveDetails?: boolean;
};

/**
 * A result is only treated as a failure when `error` is truthy: some legacy persisted results
 * carry a stale `error: null`/`''` key alongside an otherwise valid success shape.
 */
function isToolErrorResult(result: ToolResult | ToolErrorResult): result is ToolErrorResult {
  return 'error' in result && Boolean(result.error);
}

/**
 * Persisted or live tool results can be malformed (e.g. an older/legacy shape). `applyResult`
 * isn't trusted to handle that defensively, so a throw here is treated like a failed result: the
 * step is left unenriched rather than aborting the whole collector.
 */
function applyResultSafely(
  activity: ToolActivity | undefined,
  step: AiActivityToolStep,
  result: ToolResult,
): AiActivityToolStep {
  if (activity?.applyResult === undefined) {
    return step;
  }

  try {
    return activity.applyResult(step, result);
  } catch (error) {
    logError('Failed to apply tool result to AI activity step', error, { tool: step.tool });
    return step;
  }
}

export function createAiActivityCollector({
  hideSensitiveDetails = false,
}: AiActivityOptions = {}) {
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
        if (!isAiActivityToolName(toolCall.name)) {
          return [];
        }

        const activity = toolActivityRegistry[toolCall.name];
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
    addToolResult(toolCallId: string, result: ToolResult | ToolErrorResult): boolean {
      const step = stepsById.get(toolCallId);

      if (step === undefined) {
        return false;
      }

      const activity = toolActivityRegistry[step.tool];
      const enrichedStep = isToolErrorResult(result)
        ? { ...step, failed: true }
        : applyResultSafely(activity, step, result);

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
