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

export type AiActivityOptions = {
  hideSensitiveDetails?: boolean;
};

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

      // Widened to generic `ToolActivity`: `applyResult`'s `result` type can't narrow by `step.tool`.
      const activity: ToolActivity | undefined = toolActivityRegistry[step.tool];
      const enrichedStep =
        'error' in result ? step : (activity?.applyResult?.(step, result) ?? step);

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
