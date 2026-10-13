import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '@ais-chat/ai-core';
import { constructToolGuidelines } from './system-prompt';

function tool(name: string): ToolDefinition {
  return { name, description: '', parameters: {} };
}

describe('constructToolGuidelines', () => {
  it('includes the create_plot guideline when the tool is active', () => {
    expect(constructToolGuidelines([tool('create_plot')])).toContain('create_plot');
  });

  it('omits the create_plot guideline when the tool is not active', () => {
    expect(constructToolGuidelines([])).not.toContain('create_plot');
  });

  it('instructs separate create_plot calls for multiple independent drawings', () => {
    expect(constructToolGuidelines([tool('create_plot')])).toContain(
      'mehrere eigenständige Zeichnungen',
    );
  });

  it('forbids describing multi-panel layouts in a single create_plot call', () => {
    expect(constructToolGuidelines([tool('create_plot')])).toContain(
      'nie mit einer Beschreibung für ein Mehrpanel-Layout',
    );
  });
});
