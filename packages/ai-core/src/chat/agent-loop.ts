import { metrics } from '@opentelemetry/api';
import * as Sentry from '@sentry/core';
import type {
  Message as AiCoreMessage,
  ModelSelection,
  TokenUsage,
  ToolCall,
  ToolRegistry,
} from './types';
import { EmptyResponseError } from '../errors';

export const MAX_AGENTIC_ITERATIONS = 3;
export const MAX_TOOL_CALLS_PER_ITERATION = 2;

const toolCallDuration = metrics
  .getMeter('ais-chat.tools', '0.0.1')
  .createHistogram('tool_call_duration', {
    description: 'Duration of executed AI tool calls',
    unit: 'ms',
  });

function logError(message: string, error: unknown) {
  console.error(message, error);
}

type RunAgentLoopParams = {
  modelSelection: ModelSelection;
  apiKeyId: string;
  messages: AiCoreMessage[];
  toolRegistry?: ToolRegistry;
  agentName: string;
  /** Tears down the upstream provider stream when the client goes away or the generation times out. */
  abortSignal?: AbortSignal;
  onTextChunk: (delta: string) => void;
  onComplete: (result: {
    fullText: string;
    usage: TokenUsage;
    priceInCents: number;
    modelId: string;
    modelUsages: Array<{ modelId: string; usage: TokenUsage; priceInCents: number }>;
    agentLoopMessages: AiCoreMessage[];
  }) => void;
  /**
   * Receives whatever was billed before the failure, so a partially completed generation is
   * still accounted for.
   */
  onError: (
    error: Error,
    billedUsage: {
      usage: TokenUsage;
      priceInCents: number;
      modelUsages: Array<{ modelId: string; usage: TokenUsage; priceInCents: number }>;
    },
  ) => void;
};

export function runAgentLoop({
  modelSelection,
  apiKeyId,
  messages,
  toolRegistry,
  agentName,
  abortSignal,
  onTextChunk,
  onComplete,
  onError,
}: RunAgentLoopParams): void {
  void (async () => {
    const { generateAgenticStreamWithBilling } = await import('./agentic-stream');

    let fullText = '';
    let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let totalPriceInCents = 0;
    let lastModelId = modelSelection.modelIds[0];
    const modelUsages: Array<{ modelId: string; usage: TokenUsage; priceInCents: number }> = [];
    const loopMessages = [...messages];
    const tools = toolRegistry ? Object.values(toolRegistry).map((entry) => entry.definition) : [];

    const complete = () =>
      onComplete({
        fullText,
        usage: totalUsage,
        priceInCents: totalPriceInCents,
        modelId: lastModelId,
        modelUsages,
        agentLoopMessages: loopMessages.slice(messages.length),
      });

    const fail = (error: Error) =>
      onError(error, {
        usage: totalUsage,
        priceInCents: totalPriceInCents,
        modelUsages,
      });

    try {
      await Sentry.startSpan(
        {
          op: 'gen_ai.invoke_agent',
          name: `invoke_agent ${agentName}`,
          attributes: {
            'gen_ai.operation.name': 'invoke_agent',
            'gen_ai.operation.type': 'agent',
            'gen_ai.request.model': modelSelection.modelName,
            'gen_ai.agent.name': agentName,
          },
        },
        async (agentSpan) => {
          for (let iteration = 0; iteration < MAX_AGENTIC_ITERATIONS; iteration++) {
            if (abortSignal?.aborted) {
              break;
            }

            const pendingToolCalls: ToolCall[] = [];
            const overBudgetToolCalls: ToolCall[] = [];
            let iterationText = '';

            // Add separator before starting a new iteration if the previous iteration produced text
            if (iteration > 0 && fullText && !fullText.endsWith('\n\n')) {
              fullText += '\n\n';
              onTextChunk('\n\n');
            }

            const isLastIteration = iteration === MAX_AGENTIC_ITERATIONS - 1;
            const stream = generateAgenticStreamWithBilling(
              modelSelection,
              loopMessages,
              apiKeyId,
              async ({ usage, priceInCents, modelId: usedModelId }) => {
                await modelSelection.onModelUsed?.(usedModelId);
                lastModelId = usedModelId;
                modelUsages.push({ modelId: usedModelId, usage, priceInCents });
                totalUsage = {
                  promptTokens: totalUsage.promptTokens + usage.promptTokens,
                  completionTokens: totalUsage.completionTokens + usage.completionTokens,
                  totalTokens: totalUsage.totalTokens + usage.totalTokens,
                };
                totalPriceInCents += priceInCents;
                if (usage.estimated) {
                  agentSpan.setAttribute('gen_ai.usage.estimated', true);
                }
              },
              tools.length > 0 && !isLastIteration
                ? { tools, toolChoice: 'auto', abortSignal }
                : { abortSignal },
            );

            try {
              for await (const event of stream) {
                if (event.type === 'text') {
                  iterationText += event.delta;
                  onTextChunk(event.delta);
                } else if (event.type === 'tool_call') {
                  if (pendingToolCalls.length < MAX_TOOL_CALLS_PER_ITERATION) {
                    // On last iteration, tools are disabled but model might still emit tool calls
                    if (!isLastIteration) {
                      pendingToolCalls.push(event.call);
                    }
                  } else {
                    overBudgetToolCalls.push(event.call);
                  }
                }
              }
            } finally {
              // An interrupted stream still produced text; keep it instead of discarding it.
              fullText += iterationText;
            }

            if (pendingToolCalls.length === 0 && overBudgetToolCalls.length === 0) {
              break;
            }

            if (abortSignal?.aborted) {
              break;
            }

            loopMessages.push({
              role: 'assistant',
              content: iterationText,
              toolCalls: [...pendingToolCalls, ...overBudgetToolCalls],
            });

            const toolResults = await Promise.all([
              ...pendingToolCalls.map((toolCall) =>
                Sentry.startSpan(
                  {
                    op: 'gen_ai.execute_tool',
                    name: `execute_tool ${toolCall.name}`,
                    attributes: {
                      'gen_ai.operation.name': 'execute_tool',
                      'gen_ai.operation.type': 'tool',
                      'gen_ai.tool.name': toolCall.name,
                    },
                  },
                  async (toolSpan) => {
                    const registryEntry = toolRegistry?.[toolCall.name];
                    const startedAt = performance.now();
                    let status = registryEntry ? 'success' : 'unknown_tool';
                    let result: string;

                    try {
                      if (registryEntry) {
                        const args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
                        result = await registryEntry.handler(args);
                      } else {
                        const message = `Unknown tool "${toolCall.name}"`;
                        toolSpan.setStatus({ code: 2, message });
                        result = `Error: ${message}`;
                      }
                    } catch (error) {
                      status = 'error';
                      // TODO: see tech debt (refactoring of tool calls for error handling). The catch clause is usually never executed, because tool handlers return errors as plain string or in the 'error' key of a stringified json
                      const message =
                        error instanceof Error ? error.message : 'Tool execution failed';
                      toolSpan.setStatus({ code: 2, message });
                      logError(`Error executing tool ${toolCall.name}:`, error);
                      result = `Error: ${message}`;
                    } finally {
                      toolCallDuration.record(performance.now() - startedAt, {
                        'gen_ai.tool.name': registryEntry ? toolCall.name : 'unknown',
                        'tool.status': status,
                      });
                    }

                    return { toolCallId: toolCall.id, result };
                  },
                ),
              ),
              ...overBudgetToolCalls.map(async (toolCall) => ({
                toolCallId: toolCall.id,
                result: `Error: Tool call budget exceeded. Maximum ${MAX_TOOL_CALLS_PER_ITERATION} tool calls per iteration. Do not mention this error to the user. Continue answering with the information you already have.`,
              })),
            ]);

            for (const { toolCallId, result } of toolResults) {
              loopMessages.push({ role: 'tool', content: result, toolCallId });
            }
          }

          agentSpan.setAttribute('gen_ai.usage.input_tokens', totalUsage.promptTokens);
          agentSpan.setAttribute('gen_ai.usage.output_tokens', totalUsage.completionTokens);
          agentSpan.setAttribute('gen_ai.usage.total_tokens', totalUsage.totalTokens);
        },
      );

      if (fullText.trim().length === 0) {
        // An abort before any output is a teardown, not an empty-response failure.
        if (!abortSignal?.aborted) {
          fail(new EmptyResponseError({ modelId: lastModelId }));
          return;
        }

        // Nothing was generated and nothing was billed, so there is nothing to report.
        if (modelUsages.length === 0) {
          return;
        }
      }

      complete();
    } catch (error) {
      // An aborted generation is an expected teardown, not a failure to report, but whatever
      // was already generated must still reach the caller so it can be persisted and billed.
      if (abortSignal?.aborted) {
        if (fullText.trim().length > 0 || modelUsages.length > 0) {
          complete();
        }
        return;
      }
      logError('Error during agent loop:', error);
      fail(error instanceof Error ? error : new Error('Unknown error'));
    }
  })();
}
