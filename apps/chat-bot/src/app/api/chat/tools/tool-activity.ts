import type { AiActivityToolStep } from '@/types/ai-activity';
import type { ToolName } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/ai-activity';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { toolActivities } from '../build-tools';

export function createToolActivityStep(toolCall: ToolCall): AiActivityToolStep | undefined {
  return toolActivities[toolCall.name as ToolName]?.createStep(toolCall);
}

export function applyToolActivityResult(
  step: AiActivityToolStep,
  content: string,
): AiActivityToolStep {
  const activity = toolActivities[step.tool];
  // TODO: Use zod here to parse the actual result type for the respective tool step
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return activity?.applyResult?.(step, parseJsonRecord(content) as unknown as any) ?? step;
}
