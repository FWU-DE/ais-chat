import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import {
  createAiActivityCollector,
  parseJsonRecord,
  readString,
  readValue,
  toLinks,
  truncate,
} from './ai-activity';
import type { ToolRegistration } from '@/app/api/chat/tools/types';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

function createToolRegistry(overrides: Partial<ToolRegistration['activity']> = {}) {
  return {
    math_calculate: {
      definition: { name: 'math_calculate', description: '', parameters: {} },
      handler: vi.fn(),
      activity: {
        createStep: () => ({
          kind: 'tool' as const,
          id: 'call-1',
          tool: 'math_calculate' as const,
        }),
        ...overrides,
      },
    },
  } satisfies Record<string, ToolRegistration>;
}

describe('activity helpers', () => {
  it('parses valid JSON and rejects missing, blank, and invalid values', () => {
    expect(parseJsonRecord('{"query":"test"}')).toEqual({ query: 'test' });
    expect(parseJsonRecord(undefined)).toBeUndefined();
    expect(parseJsonRecord('   ')).toBeUndefined();
    expect(parseJsonRecord('{')).toBeUndefined();
  });

  it('reads trimmed strings and arbitrary object values safely', () => {
    const source = { value: '  text  ', number: 42 };
    expect(readString(source, 'value')).toBe('text');
    expect(readString(source, 'number')).toBeUndefined();
    expect(readString(source, 'missing')).toBeUndefined();
    expect(readString(null, 'value')).toBeUndefined();
    expect(readValue(source, 'number')).toBe(42);
    expect(readValue(null, 'number')).toBeUndefined();
  });

  it('normalizes valid links, skips invalid links, and limits the result', () => {
    const links = toLinks([
      { title: 'Example', url: 'https://example.com/path' },
      { url: 'http://example.org' },
      { url: 'javascript:alert(1)' },
      { url: 'not-a-url' },
      { title: 'Empty' },
      null,
    ]);

    expect(links).toEqual([
      { title: 'Example', url: 'https://example.com/path' },
      { title: 'http://example.org', url: 'http://example.org/' },
    ]);
    expect(toLinks(undefined)).toBeUndefined();
    expect(toLinks([])).toBeUndefined();

    const manyLinks = toLinks(
      Array.from({ length: 12 }, (_, index) => ({ url: `https://example.com/${index}` })),
    );
    expect(manyLinks).toHaveLength(10);
  });

  it('truncates long values while preserving short and missing values', () => {
    expect(truncate('short')).toBe('short');
    expect(truncate(undefined)).toBeUndefined();
    expect(truncate('a'.repeat(301))).toBe(`${'a'.repeat(300)}…`);
  });
});

describe('createAiActivityCollector', () => {
  it('starts, adds tool calls, applies results, and finishes', () => {
    const applyResult = vi.fn((step, result: string) => ({ ...step, result }));
    const collector = createAiActivityCollector(createToolRegistry({ applyResult }));

    expect(collector.start()).toBe(true);
    expect(collector.start()).toBe(false);
    expect(collector.addToolCalls([toolCall])).toBe(true);
    expect(collector.getSteps()).toEqual([
      { kind: 'analysis' },
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
    ]);
    expect(collector.addToolResult('unknown', 'ignored')).toBe(false);
    expect(collector.addToolResult('call-1', '42')).toBe(true);
    expect(applyResult).toHaveBeenCalledWith(
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
      '42',
    );
    expect(collector.finish()).toBe(true);
    expect(collector.finish()).toBe(true);
    expect(collector.getSteps()).toEqual([
      { kind: 'analysis' },
      { kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '42' },
      { kind: 'done' },
      { kind: 'done' },
    ]);
  });

  it('ignores calls without registered activity and handles activity without result enrichment', () => {
    const collector = createAiActivityCollector({});
    expect(collector.start()).toBe(true);
    expect(collector.addToolCalls([toolCall])).toBe(false);
    expect(collector.addToolResult('call-1', 'ignored')).toBe(false);
    expect(collector.finish()).toBe(false);
    expect(collector.getSteps()).toEqual([]);

    const noResultCollector = createAiActivityCollector(
      createToolRegistry({ applyResult: undefined }),
    );
    expect(noResultCollector.addToolCalls([toolCall])).toBe(true);
    expect(noResultCollector.addToolResult('call-1', 'ignored')).toBe(false);
    expect(noResultCollector.finish()).toBe(true);
  });

  it('does not publish when an activity result is unchanged', () => {
    const collector = createAiActivityCollector(
      createToolRegistry({ applyResult: (step) => step }),
    );
    collector.addToolCalls([toolCall]);
    expect(collector.addToolResult('call-1', 'same')).toBe(false);
    expect(collector.getSteps()).toHaveLength(2);
  });
});
