import { ConversationMessageModel } from '@shared/db/types';
import { type ChatMessage } from '@/types/chat';
import {
  isAiActivityToolName,
  type AiActivityStep,
  type AiActivityToolStep,
} from '@/types/ai-activity';
import { parseJsonRecord, readString, readValue, toLinks } from './ai-activity';
import { TOOL_NAMES } from '@/types/tool-names';
import { webSearchArgsSchema } from '@/app/api/chat/tools/web-search-tool';
import { webScraperArgsSchema } from '@/app/api/chat/tools/web-scraper-tool';
import { retrieveEntireFileArgsSchema } from '@/app/api/chat/tools/retrieve-entire-file-tool';
import { mundoSearchArgsSchema } from '@/app/api/chat/tools/mundo-search-tool';

function createActivityStep(
  toolCall: NonNullable<ConversationMessageModel['toolCalls']>[number],
): AiActivityToolStep | undefined {
  if (!isAiActivityToolName(toolCall.name)) {
    return undefined;
  }

  const args = parseJsonRecord(toolCall.arguments);
  let detail: string | undefined;
  let links: ReturnType<typeof toLinks>;

  switch (toolCall.name) {
    case TOOL_NAMES.webSearch: {
      const parsed = webSearchArgsSchema.safeParse(args);
      detail = parsed.success ? parsed.data.query : undefined;
      break;
    }
    case TOOL_NAMES.mundoSearch: {
      const parsed = mundoSearchArgsSchema.safeParse(args);
      detail = parsed.success ? parsed.data.query : undefined;
      break;
    }
    case TOOL_NAMES.retrieveEntireFile: {
      const parsed = retrieveEntireFileArgsSchema.safeParse(args);
      detail = parsed.success ? parsed.data.fileName : undefined;
      break;
    }
    case TOOL_NAMES.webScraper: {
      const parsed = webScraperArgsSchema.safeParse(args);
      links = parsed.success ? toLinks(parsed.data.urls.map((url) => ({ url }))) : undefined;
      break;
    }
  }

  return {
    kind: 'tool',
    id: toolCall.id,
    tool: toolCall.name,
    ...(detail === undefined ? {} : { detail }),
    ...(links === undefined ? {} : { links }),
  };
}

function applyActivityResult(step: AiActivityToolStep, content: string): AiActivityToolStep {
  const parsed = parseJsonRecord(content);

  if (step.tool === TOOL_NAMES.mathCalculate) {
    const value = readString(parsed, 'result');
    return value === undefined ? step : { ...step, result: value };
  }

  const links =
    step.tool === TOOL_NAMES.webScraper
      ? toLinks(Array.isArray(parsed) ? parsed : [])
      : step.tool === TOOL_NAMES.webSearch || step.tool === TOOL_NAMES.mundoSearch
        ? toLinks(readValue(parsed, 'results'))
        : undefined;

  return links === undefined ? step : { ...step, links };
}

function getActivitySteps(
  messages: Array<ConversationMessageModel>,
): Map<string, AiActivityStep[]> {
  const activityByMessageId = new Map<string, AiActivityStep[]>();
  const steps: AiActivityStep[] = [];
  const stepsByToolCallId = new Map<string, AiActivityToolStep>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      if (steps.length === 0) {
        steps.push({ kind: 'analysis' });
      }

      for (const toolCall of message.toolCalls) {
        const step = createActivityStep(toolCall);
        if (step === undefined) {
          continue;
        }

        steps.push(step);
        stepsByToolCallId.set(step.id, step);
      }
      continue;
    }

    if (message.role === 'tool' && message.toolCallId !== null) {
      const step = stepsByToolCallId.get(message.toolCallId);
      if (step !== undefined) {
        const updatedStep = applyActivityResult(step, message.content);
        steps[steps.indexOf(step)] = updatedStep;
        stepsByToolCallId.set(message.toolCallId, updatedStep);
      }
      continue;
    }

    if (message.role === 'assistant' && steps.length > 0) {
      steps.push({ kind: 'done' });
      activityByMessageId.set(message.id, [...steps]);
      steps.length = 0;
      stepsByToolCallId.clear();
    }
  }

  return activityByMessageId;
}

/**
 * Converts database conversation message models to frontend message format.
 *
 * @param messages - Array of conversation messages from the database
 * @returns Array of messages compatible with the chat format
 */
export function convertMessageModelToMessage(
  messages: Array<ConversationMessageModel>,
): Array<ChatMessage> {
  const activityByMessageId = getActivitySteps(messages);

  return messages.map((message) => {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      webSearchResults: message.webSearchResults ?? undefined,
      activitySteps: activityByMessageId.get(message.id),
      toolCalls: message.toolCalls ?? undefined,
      toolCallId: message.toolCallId ?? undefined,
    };
  });
}
