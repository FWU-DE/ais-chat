import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentLoop } from './agent-loop';
import type { Message, TokenUsage, StreamEvent } from './types';

// Mock the generateAgenticStreamWithBilling import
const mockGenerateAgenticStreamWithBilling = vi.fn();

vi.mock('./agentic-stream', () => ({
  generateAgenticStreamWithBilling: (...args: unknown[]) =>
    mockGenerateAgenticStreamWithBilling(...args),
}));

// Mock Sentry to verify spans are created
const mockStartSpan = vi.fn((options, callback) => callback({ setAttribute: vi.fn() }));

vi.mock('@sentry/core', () => ({
  startSpan: (options: unknown, callback: unknown) => mockStartSpan(options, callback),
}));

describe('agent-loop', () => {
  const usage: TokenUsage = {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
  };

  // Lets the fire-and-forget loop settle so "callback was never called" assertions are reliable.
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts double newlines between iterations when both produce text', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Iteration 1: produces text "Hello world." then a tool call
    // Iteration 2: produces text "More info." with no tool calls
    let callCount = 0;
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        // First iteration
        yield { type: 'text', delta: 'Hello ' } satisfies StreamEvent;
        yield { type: 'text', delta: 'world.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: {
            id: 'call_123',
            name: 'test_tool',
            arguments: '{}',
          },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else {
        // Second iteration
        yield { type: 'text', delta: 'More ' } satisfies StreamEvent;
        yield { type: 'text', delta: 'info.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      }
    });

    const toolRegistry = {
      test_tool: {
        definition: { name: 'test_tool', description: 'Test', parameters: {} },
        handler: async () => 'tool result',
      },
    };

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      toolRegistry,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    // Wait for async completion
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();

    // Verify onTextChunk received the separator
    const allChunks = onTextChunk.mock.calls.map((call) => call[0]).join('');
    expect(allChunks).toBe('Hello world.\n\nMore info.');

    // Verify onComplete received the correct fullText
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: 'Hello world.\n\nMore info.',
      }),
    );
  });

  it('calls onError with EmptyResponseError when the model produces no text', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      yield { type: 'finish', usage } satisfies StreamEvent;
    });

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'EmptyResponseError' }));
  });

  it('does not insert separator on first iteration', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Single iteration with no tool calls
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Single response.' } satisfies StreamEvent;
      yield { type: 'finish', usage } satisfies StreamEvent;
    });

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();

    const allChunks = onTextChunk.mock.calls.map((call) => call[0]).join('');
    expect(allChunks).toBe('Single response.');

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: 'Single response.',
      }),
    );
  });

  it('does not insert separator when first iteration produces no text (tool-only)', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Iteration 1: tool call only, no text
    // Iteration 2: produces text
    let callCount = 0;
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_call',
          call: {
            id: 'call_123',
            name: 'test_tool',
            arguments: '{}',
          },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else {
        yield { type: 'text', delta: 'Result after tool.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      }
    });

    const toolRegistry = {
      test_tool: {
        definition: { name: 'test_tool', description: 'Test', parameters: {} },
        handler: async () => 'tool result',
      },
    };

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      toolRegistry,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();

    const allChunks = onTextChunk.mock.calls.map((call) => call[0]).join('');
    expect(allChunks).toBe('Result after tool.');

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: 'Result after tool.',
      }),
    );
  });

  it('does not double-space when model already ends with double newlines', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Iteration 1: produces text ending with \n\n, then a tool call
    // Iteration 2: produces text
    let callCount = 0;
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield { type: 'text', delta: 'First response.\n\n' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: {
            id: 'call_123',
            name: 'test_tool',
            arguments: '{}',
          },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else {
        yield { type: 'text', delta: 'Second response.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      }
    });

    const toolRegistry = {
      test_tool: {
        definition: { name: 'test_tool', description: 'Test', parameters: {} },
        handler: async () => 'tool result',
      },
    };

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      toolRegistry,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();

    const allChunks = onTextChunk.mock.calls.map((call) => call[0]).join('');
    // Should NOT have quadruple newlines
    expect(allChunks).toBe('First response.\n\nSecond response.');

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: 'First response.\n\nSecond response.',
      }),
    );
  });

  it('inserts separators between all three iterations when all produce text', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Three iterations, each producing text and a tool call (except the last)
    let callCount = 0;
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield { type: 'text', delta: 'First.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_1', name: 'test_tool', arguments: '{}' },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else if (callCount === 2) {
        yield { type: 'text', delta: 'Second.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_2', name: 'test_tool', arguments: '{}' },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else {
        yield { type: 'text', delta: 'Third.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      }
    });

    const toolRegistry = {
      test_tool: {
        definition: { name: 'test_tool', description: 'Test', parameters: {} },
        handler: async () => 'tool result',
      },
    };

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      toolRegistry,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();

    const allChunks = onTextChunk.mock.calls.map((call) => call[0]).join('');
    expect(allChunks).toBe('First.\n\nSecond.\n\nThird.');

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: 'First.\n\nSecond.\n\nThird.',
      }),
    );
  });

  it('returns error responses for over-budget tool calls', async () => {
    const messages: Message[] = [{ role: 'user', content: 'Test query' }];
    const onTextChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    // Iteration 1: Emit 4 tool calls (exceeds MAX_TOOL_CALLS_PER_ITERATION = 2)
    // Iteration 2: Return final text with no more tool calls
    let callCount = 0;
    mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield { type: 'text', delta: 'Response text.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_1', name: 'tool1', arguments: '{}' },
        } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_2', name: 'tool2', arguments: '{}' },
        } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_3', name: 'tool3', arguments: '{}' },
        } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_4', name: 'tool4', arguments: '{}' },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      } else {
        yield { type: 'text', delta: 'Final answer.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      }
    });

    const toolRegistry = {
      tool1: {
        definition: { name: 'tool1', description: '', parameters: {} },
        handler: async () => 'result1',
      },
      tool2: {
        definition: { name: 'tool2', description: '', parameters: {} },
        handler: async () => 'result2',
      },
      tool3: {
        definition: { name: 'tool3', description: '', parameters: {} },
        handler: async () => 'result3',
      },
      tool4: {
        definition: { name: 'tool4', description: '', parameters: {} },
        handler: async () => 'result4',
      },
    };

    runAgentLoop({
      modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
      apiKeyId: 'test-key',
      messages,
      toolRegistry,
      agentName: 'Test Agent',
      onTextChunk,
      onComplete,
      onError,
    });

    await expect.poll(() => onComplete).toHaveBeenCalled();

    expect(onError).not.toHaveBeenCalled();

    // Verify onComplete received agentLoopMessages with tool results
    const agentLoopMessages = onComplete.mock.calls[0]?.[0].agentLoopMessages;

    // Find the first assistant message with tool calls (iteration 1)
    const firstAssistant = agentLoopMessages.find((msg: Message) => msg.role === 'assistant');
    expect(firstAssistant).toBeDefined();
    expect(firstAssistant.toolCalls).toHaveLength(4);

    // Find tool result messages after the first assistant message
    const firstAssistantIndex = agentLoopMessages.indexOf(firstAssistant);
    const toolResultMessages = agentLoopMessages.slice(
      firstAssistantIndex + 1,
      firstAssistantIndex + 5,
    );
    expect(toolResultMessages).toHaveLength(4);

    // First two tool calls should execute normally
    expect(toolResultMessages[0].content).toBe('result1');
    expect(toolResultMessages[1].content).toBe('result2');

    // Last two should get budget error
    expect(toolResultMessages[2].content).toContain('Tool call budget exceeded');
    expect(toolResultMessages[3].content).toContain('Tool call budget exceeded');
  });

  describe('Sentry instrumentation', () => {
    it('creates Sentry span for agent invocation', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'text', delta: 'Response' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        agentName: 'Test Agent',
        onTextChunk,
        onComplete,
        onError,
      });

      await expect.poll(() => onComplete).toHaveBeenCalled();

      expect(onError).not.toHaveBeenCalled();
      expect(mockStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'gen_ai.invoke_agent' }),
        expect.any(Function),
      );
    });

    it('creates Sentry spans for tool executions', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'text', delta: 'Using tool.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_1', name: 'test_tool', arguments: '{}' },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      const toolRegistry = {
        test_tool: {
          definition: { name: 'test_tool', description: 'Test', parameters: {} },
          handler: async () => 'result',
        },
      };

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        toolRegistry,
        agentName: 'Test Agent',
        onTextChunk,
        onComplete,
        onError,
      });

      await expect.poll(() => onComplete).toHaveBeenCalled();

      expect(onError).not.toHaveBeenCalled();
      expect(mockStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'gen_ai.execute_tool' }),
        expect.any(Function),
      );
    });

    it('creates correct number of Sentry spans for multiple tool calls', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      let callCount = 0;
      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_call',
            call: { id: 'call_1', name: 'tool1', arguments: '{}' },
          } satisfies StreamEvent;
          yield {
            type: 'tool_call',
            call: { id: 'call_2', name: 'tool2', arguments: '{}' },
          } satisfies StreamEvent;
          yield { type: 'finish', usage } satisfies StreamEvent;
        } else {
          yield { type: 'text', delta: 'Done' } satisfies StreamEvent;
          yield { type: 'finish', usage } satisfies StreamEvent;
        }
      });

      const toolRegistry = {
        tool1: {
          definition: { name: 'tool1', description: '', parameters: {} },
          handler: async () => 'r1',
        },
        tool2: {
          definition: { name: 'tool2', description: '', parameters: {} },
          handler: async () => 'r2',
        },
      };

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        toolRegistry,
        agentName: 'Test Agent',
        onTextChunk,
        onComplete,
        onError,
      });

      await expect.poll(() => onComplete).toHaveBeenCalled();

      expect(onError).not.toHaveBeenCalled();

      // Verify: 1 agent span + 2 tool spans = 3 total
      expect(mockStartSpan).toHaveBeenCalledTimes(3);

      const agentSpanCalls = mockStartSpan.mock.calls.filter(
        (call) => call[0]?.op === 'gen_ai.invoke_agent',
      );
      const toolSpanCalls = mockStartSpan.mock.calls.filter(
        (call) => call[0]?.op === 'gen_ai.execute_tool',
      );

      expect(agentSpanCalls).toHaveLength(1);
      expect(toolSpanCalls).toHaveLength(2);
    });
  });

  describe('abortSignal', () => {
    it('forwards the signal to the stream with and without tools', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const abortController = new AbortController();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'text', delta: 'Response.' } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      const toolRegistry = {
        test_tool: {
          definition: { name: 'test_tool', description: 'Test', parameters: {} },
          handler: async () => 'tool result',
        },
      };

      const onComplete = vi.fn();

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        toolRegistry,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk: vi.fn(),
        onComplete,
        onError: vi.fn(),
      });

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      expect(mockGenerateAgenticStreamWithBilling).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-key',
        expect.any(Function),
        expect.objectContaining({ tools: expect.anything(), abortSignal: abortController.signal }),
      );

      mockGenerateAgenticStreamWithBilling.mockClear();
      const onCompleteWithoutTools = vi.fn();

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk: vi.fn(),
        onComplete: onCompleteWithoutTools,
        onError: vi.fn(),
      });

      await vi.waitFor(() => {
        expect(onCompleteWithoutTools).toHaveBeenCalled();
      });

      expect(mockGenerateAgenticStreamWithBilling).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-key',
        expect.any(Function),
        { abortSignal: abortController.signal },
      );
    });

    it('stops before the next iteration once aborted and keeps the partial text', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onTextChunk = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();
      const abortController = new AbortController();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'text', delta: 'Partial answer.' } satisfies StreamEvent;
        yield {
          type: 'tool_call',
          call: { id: 'call_123', name: 'test_tool', arguments: '{}' },
        } satisfies StreamEvent;
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      const toolRegistry = {
        test_tool: {
          definition: { name: 'test_tool', description: 'Test', parameters: {} },
          handler: async () => {
            abortController.abort();
            return 'tool result';
          },
        },
      };

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        toolRegistry,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk,
        onComplete,
        onError,
      });

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      expect(onError).not.toHaveBeenCalled();
      expect(mockGenerateAgenticStreamWithBilling).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ fullText: 'Partial answer.' }),
      );
    });

    it('does not report an EmptyResponseError when aborted before any text', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onComplete = vi.fn();
      const onError = vi.fn();
      const abortController = new AbortController();
      abortController.abort();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk: vi.fn(),
        onComplete,
        onError,
      });

      await vi.waitFor(() => {
        expect(mockStartSpan).toHaveBeenCalled();
      });
      await flushAsync();

      expect(mockGenerateAgenticStreamWithBilling).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('keeps the partial text when the stream throws because of the abort', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onComplete = vi.fn();
      const onError = vi.fn();
      const abortController = new AbortController();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        yield { type: 'text', delta: 'Partial.' } satisfies StreamEvent;
        abortController.abort();
        throw new Error('The operation was aborted');
      });

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk: vi.fn(),
        onComplete,
        onError,
      });

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ fullText: 'Partial.' }));
    });

    it('reports nothing when the stream throws after an abort without any text', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Test query' }];
      const onComplete = vi.fn();
      const onError = vi.fn();
      const abortController = new AbortController();

      mockGenerateAgenticStreamWithBilling.mockImplementation(async function* () {
        abortController.abort();
        if (abortController.signal.aborted) {
          throw new Error('The operation was aborted');
        }
        yield { type: 'finish', usage } satisfies StreamEvent;
      });

      runAgentLoop({
        modelSelection: { modelIds: ['test-model'], modelName: 'Test Model' },
        apiKeyId: 'test-key',
        messages,
        agentName: 'Test Agent',
        abortSignal: abortController.signal,
        onTextChunk: vi.fn(),
        onComplete,
        onError,
      });

      await vi.waitFor(() => {
        expect(abortController.signal.aborted).toBe(true);
      });
      await flushAsync();

      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
