import { describe, expect, it } from 'vitest';

import { unwrapTypedArguments } from './tool-arguments';

describe('unwrapTypedArguments', () => {
  it('unwraps values that are wrapped in a typed object', () => {
    expect(unwrapTypedArguments('{"input": {"type": "string", "value": "value"}}')).toBe(
      '{"input":"value"}',
    );
  });

  it('unwraps only the wrapped values of several arguments', () => {
    expect(
      unwrapTypedArguments(
        '{"input": {"type": "string", "value": "value"}, "count": {"type": "integer", "value": 5}, "optional": null}',
      ),
    ).toBe('{"input":"value","count":5,"optional":null}');
  });

  it.each([
    '{"input": "value"}',
    '{}',
    '',
    'not json',
    '[1, 2]',
    '{"options": {"type": "string"}}',
    '{"options": {"type": "string", "value": "x", "extra": 1}}',
    '{"options": {"type": "custom", "value": "x"}}',
    '{"options": {"kind": "string", "value": "x"}}',
  ])('returns %j unchanged', (argumentsJson) => {
    expect(unwrapTypedArguments(argumentsJson)).toBe(argumentsJson);
  });
});
