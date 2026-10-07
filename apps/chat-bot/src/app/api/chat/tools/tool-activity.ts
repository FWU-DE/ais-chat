import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import type { AiActivityToolStep } from '@/types/ai-activity';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/ai-activity';
import type {
  MundoSearchToolResponse,
  ToolActivity,
  ToolResult,
  WebSearchToolResponse,
  WebScraperToolResult,
} from './types';
import { mathCalculateActivity } from './math-calculate-tool';
import { mundoSearchActivity } from './mundo-search-tool';
import { retrieveEntireFileActivity } from './retrieve-entire-file-tool';
import { retrieveTextChunksActivity } from './retrieve-text-chunks-tool';
import { webScraperActivity } from './web-scraper-tool';
import { webSearchActivity } from './web-search-tool';
import type { CalculatorResponse } from '../calculator';

export function createToolActivityStep(toolCall: ToolCall): AiActivityToolStep | undefined {
  switch (toolCall.name) {
    case TOOL_NAMES.mathCalculate:
      return mathCalculateActivity.createStep(toolCall);
    case TOOL_NAMES.mundoSearch:
      return mundoSearchActivity.createStep(toolCall);
    case TOOL_NAMES.retrieveEntireFile:
      return retrieveEntireFileActivity.createStep(toolCall);
    case TOOL_NAMES.retrieveTextChunks:
      return retrieveTextChunksActivity.createStep(toolCall);
    case TOOL_NAMES.webScraper:
      return webScraperActivity.createStep(toolCall);
    case TOOL_NAMES.webSearch:
      return webSearchActivity.createStep(toolCall);
    default:
      return undefined;
  }
}

function applyResult<TResult extends ToolResult>(
  activity: ToolActivity<TResult>,
  step: AiActivityToolStep,
  content: string,
): AiActivityToolStep {
  return activity.applyResult?.(step, parseJsonRecord(content) as TResult) ?? step;
}

export function applyToolActivityResult(
  step: AiActivityToolStep,
  content: string,
): AiActivityToolStep {
  switch (step.tool) {
    case TOOL_NAMES.mathCalculate:
      return applyResult<CalculatorResponse>(mathCalculateActivity, step, content);
    case TOOL_NAMES.mundoSearch:
      return applyResult<MundoSearchToolResponse>(mundoSearchActivity, step, content);
    case TOOL_NAMES.webScraper:
      return applyResult<WebScraperToolResult[] | string>(webScraperActivity, step, content);
    case TOOL_NAMES.webSearch:
      return applyResult<WebSearchToolResponse>(webSearchActivity, step, content);
    default:
      return step;
  }
}
