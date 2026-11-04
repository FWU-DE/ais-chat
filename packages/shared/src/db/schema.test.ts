import { describe, expect, it } from 'vitest';
import {
  assistantInsertSchema,
  assistantUpdateSchema,
  characterInsertSchema,
  characterUpdateSchema,
  learningScenarioInsertSchema,
  learningScenarioUpdateSchema,
} from './schema';

const validId = '00000000-0000-0000-0000-000000000000';
const validInsertValues = {
  character: { name: 'Character', userId: validId, modelId: validId },
  learningScenario: { name: 'Scenario', userId: validId, modelId: validId },
  assistant: { name: 'Assistant', systemPrompt: 'Prompt' },
};

const schemas = [
  ['character insert', characterInsertSchema, validInsertValues.character],
  ['character update', characterUpdateSchema, { id: validId }],
  ['learning scenario insert', learningScenarioInsertSchema, validInsertValues.learningScenario],
  ['learning scenario update', learningScenarioUpdateSchema, { id: validId }],
  ['assistant insert', assistantInsertSchema, validInsertValues.assistant],
  ['assistant update', assistantUpdateSchema, { id: validId }],
] as const;

describe('didactic commentary validation', () => {
  it.each(schemas)('%s allows omitted commentary', (_name, schema, values) => {
    expect(schema.safeParse(values).success).toBe(true);
  });

  it.each(schemas)('%s allows empty commentary', (_name, schema, values) => {
    expect(schema.safeParse({ ...values, didacticCommentary: '' }).success).toBe(true);
  });

  it.each(schemas)('%s allows commentary at the limit', (_name, schema, values) => {
    expect(schema.safeParse({ ...values, didacticCommentary: 'a'.repeat(2000) }).success).toBe(
      true,
    );
  });

  it.each(schemas)('%s rejects commentary over the limit', (_name, schema, values) => {
    expect(schema.safeParse({ ...values, didacticCommentary: 'a'.repeat(2001) }).success).toBe(
      false,
    );
  });
});
