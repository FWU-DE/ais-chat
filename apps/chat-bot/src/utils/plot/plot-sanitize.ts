import { z } from 'zod';
import he from 'he';

// JSXGraph parses string parents with JessieCode, which can call methods on any object reachable
// through a property chain (e.g. `$board`'s real DOM container), so only allowlisted,
// side-effect-free math calls are permitted; everything else is rejected. Statements, comments,
// assignments, and indirect/chained calls (that bypass the direct-name check below) are blocked
// too. This is still regex-based, not a real JessieCode parser, so it raises the bar rather than
// guaranteeing a watertight sandbox.
const UNSAFE_STRING_PATTERN = /[;{}"'`=]|\/\*|\/\/|[)\]]\s*\(/;
const CALL_PATTERN = /([A-Za-z_$][\w$]*)\s*\(/g;
export const ALLOWED_CALLS = new Set([
  'abs',
  'acos',
  'acosh',
  'acot',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'binomial',
  'cbrt',
  'ceil',
  'cos',
  'cosh',
  'cot',
  'exp',
  'factorial',
  'floor',
  'gcd',
  'lcm',
  'log',
  'log2',
  'log10',
  'ln',
  'max',
  'min',
  'nthroot',
  'pow',
  'round',
  'sign',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'trunc',
]);

function hasUnsafeCall(value: string): boolean {
  return Array.from(value.matchAll(CALL_PATTERN)).some(
    ([, name]) => name === undefined || !ALLOWED_CALLS.has(name),
  );
}

export type PlotParent = number | string | PlotParent[];

export const parentSchema: z.ZodType<PlotParent> = z.lazy(() =>
  z.union([z.number(), z.string(), z.array(parentSchema)]),
);

export function hasUnsafeString(parent: PlotParent): boolean {
  if (typeof parent === 'string') {
    return UNSAFE_STRING_PATTERN.test(parent) || hasUnsafeCall(parent);
  }
  return Array.isArray(parent) && parent.some(hasUnsafeString);
}

// `display: 'html'` writes via innerHTML and `parse` evaluates JessieCode, so both let an
// attribute override execute arbitrary HTML/code instead of being a passive style value; the
// rest have similar side effects (resource loading, prototype pollution). Checked at any nesting
// depth, e.g. a per-element `label: { display: 'html' }` override, since JSXGraph applies an
// attribute's `display`/`parse` regardless of where in the attribute tree it's set.
// Resource/DOS-style attributes (e.g. `numberPointsHigh`, surface step counts) aren't covered
// here: plots render client-side only, so an oversized spec only costs the viewer performance,
// not worth the extra complexity.
const FORBIDDEN_ATTRIBUTES = new Set([
  'display',
  'parse',
  'usemathjax',
  'usekatex',
  'url',
  'constructor',
  'prototype',
  // JSXGraph stores a supplied `id` directly in `board.objects` without checking uniqueness, so
  // colliding IDs overwrite another element's registry entry instead of erroring.
  'id',
]);

// Arbitrary JSXGraph attributes (name, label text, legend labels, …). String values are decoded
// the same way as the text payload below; any forbidden key (above) fails the whole spec instead
// of being silently dropped, since it indicates an attempt at code execution rather than a
// harmless styling mistake.
export const attributesSchema = z
  .record(z.string(), z.json())
  .optional()
  .transform((attributes, ctx): Record<string, unknown> | undefined => {
    if (attributes === undefined) {
      return attributes;
    }
    function sanitize(value: unknown, path: (string | number)[]): unknown {
      if (typeof value === 'string') {
        return he.decode(value);
      }
      if (Array.isArray(value)) {
        return value.map((entry, index) => sanitize(entry, [...path, index]));
      }
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => {
            if (FORBIDDEN_ATTRIBUTES.has(key.toLowerCase())) {
              ctx.addIssue({
                code: 'custom',
                message: `Forbidden attribute "${[...path, key].join('.')}"`,
              });
            }
            return [key, sanitize(entry, [...path, key])];
          }),
        );
      }
      return value;
    }
    return sanitize(attributes, []) as Record<string, unknown>;
  });
