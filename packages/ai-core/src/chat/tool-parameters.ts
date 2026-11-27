// Type-only marker (never exists at runtime): only `toolParameters()` produces it,
// so a hand-written schema object is not assignable to `ToolParameters`.
declare const builtByToolParameters: unique symbol;

type PropertyDescription = { description?: string };

type PrimitiveType = 'string' | 'number' | 'integer' | 'boolean';

type PrimitiveProperty = PropertyDescription & {
  type: PrimitiveType;
  enum?: readonly (string | number)[];
  minLength?: number;
  maxLength?: number;
};

// No `enum`: Anthropic rejects enums on multi-type fields, use `anyOf` for nullable enums.
type NullablePrimitiveProperty = Omit<PrimitiveProperty, 'type' | 'enum'> & {
  type: readonly [PrimitiveType, 'null'];
};

type AnyOfProperty = PropertyDescription & {
  anyOf: readonly (Omit<PrimitiveProperty, 'description'> | { type: 'null' })[];
};

type ScalarProperty = PrimitiveProperty | NullablePrimitiveProperty | AnyOfProperty;

type ArrayProperty = PropertyDescription & {
  type: 'array';
  items: ScalarProperty;
  minItems?: number;
  maxItems?: number;
};

/** Property schemas that OpenAI strict mode accepts. Optional fields are nullable and still required. */
export type ToolProperty = ScalarProperty | ArrayProperty;

/** Root schema of a tool; only constructible through `toolParameters`. */
export type ToolParameters = {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required: string[];
  additionalProperties: false;
  readonly [builtByToolParameters]: true;
};

/** Builds a strict-mode-safe root schema: every property is required, no additional properties. */
export function toolParameters(properties: Record<string, ToolProperty>): ToolParameters {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    // `builtByToolParameters` only exists in the type, the runtime object must not have it.
    // The cast is what makes TypeScript accept this object as `ToolParameters`.
  } as ToolParameters;
}
