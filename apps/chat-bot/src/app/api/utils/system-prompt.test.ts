import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '@ais-chat/ai-core';
import { TOOL_NAMES } from '@/types/tool-names';
import { constructToolGuidelines } from './system-prompt';

function tool(name: string): ToolDefinition {
  return { name, description: '', parameters: {} };
}

const toolNames = Object.values(TOOL_NAMES);

describe('constructToolGuidelines', () => {
  const baseGuidelines = constructToolGuidelines([]);

  it.each(toolNames)('adds a guideline section when %s is active', (toolName) => {
    expect(constructToolGuidelines([tool(toolName)]).length).toBeGreaterThan(baseGuidelines.length);
  });
});
