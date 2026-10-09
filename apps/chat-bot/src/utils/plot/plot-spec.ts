import { z } from 'zod';
import he from 'he';
import stripJsonComments from 'strip-json-comments';
import { ALLOWED_ELEMENT_TYPES } from './plot-element-types';
import { type PlotParent, attributesSchema, hasUnsafeString, parentSchema } from './plot-sanitize';
import { ELEMENT_VALIDATORS } from './plot-element-validators';

export type { PlotParent } from './plot-sanitize';
export { ALLOWED_CALLS } from './plot-sanitize';
export { getSliderRange } from './plot-element-validators';
export { ALLOWED_ELEMENT_TYPES } from './plot-element-types';

type RawPlotElement = [string, PlotParent[], Record<string, unknown>?];

const elementSchema = z
  .tuple([
    z.string().toLowerCase().pipe(z.enum(ALLOWED_ELEMENT_TYPES)),
    z.array(parentSchema),
    attributesSchema,
  ])
  .superRefine(([type, parents], ctx) => {
    const message = ELEMENT_VALIDATORS[type]?.(parents);
    if (message !== undefined) {
      ctx.addIssue({ code: 'custom', message: `Invalid "${type}": ${message}` });
    }
  })
  .transform(([type, parents, attributes], ctx): RawPlotElement => {
    // `text` parents are [x, y, content] (content at index 2); `text3d` are [x, y, z, content]
    // (index 3). Other types have no text payload, so nothing here matches and every parent is
    // checked below instead of decoded.
    const textPayloadIndex = type === 'text' ? 2 : type === 'text3d' ? 3 : undefined;
    const decodedParents = parents.map((parent, index) => {
      if (index === textPayloadIndex) {
        // Text is rendered as plain SVG, not through an HTML parser, so entities like `&alpha;`
        // must be decoded here or they'd show up literally instead of as the actual character.
        return typeof parent === 'string' ? he.decode(parent) : parent;
      }
      if (hasUnsafeString(parent)) {
        // Every other parent is still parsed as JessieCode by JSXGraph, so it must pass the
        // same unsafe-character/call check as the rest of this element's parents.
        ctx.addIssue({
          code: 'custom',
          message: `Unsafe expression in parent ${index} of "${type}"`,
        });
      }
      return parent;
    });
    return attributes === undefined ? [type, decodedParents] : [type, decodedParents, attributes];
  });

// Zod schema for a JSXGraph bounding box `[xMin, yMax, xMax, yMin]`.
const boundingBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([xMin, yMax, xMax, yMin]) => xMin < xMax && yMin < yMax);

const plotSpecSchema = z.object({
  board: z
    .object({
      boundingBox: boundingBoxSchema.optional(),
      axis: z.boolean().optional(),
      grid: z.boolean().optional(),
      keepAspectRatio: z.boolean().optional(),
      defaultAxes: z
        .object({
          x: attributesSchema,
          y: attributesSchema,
        })
        .optional(),
    })
    .default({}),
  elements: z.array(elementSchema).min(1).max(200),
});

export type PlotSpec = z.infer<typeof plotSpecSchema>;
export type PlotElement = PlotSpec['elements'][number];
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export class PlotSpecError extends Error {
  name = 'PlotSpecError';
}

// Like `z.prettifyError`, but also includes the offending value per issue.
function formatIssues(error: z.ZodError): string {
  return [...error.issues]
    .sort((a, b) => (a.path ?? []).length - (b.path ?? []).length)
    .map((issue) => {
      const lines = [`✖ ${issue.message}`];
      if (issue.path?.length) {
        lines.push(`  → at ${z.core.toDotPath(issue.path)}`);
      }
      if (issue.input !== undefined) {
        lines.push(`  → value: ${JSON.stringify(issue.input)}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function parsePlotSpec(source: string): { spec: PlotSpec } | { error: PlotSpecError } {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonComments(source, { trailingCommas: true }));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    return { error: new PlotSpecError(`Plot source is not valid JSON${detail}`, { cause: error }) };
  }
  try {
    const result = plotSpecSchema.safeParse(json, { reportInput: true });
    return result.success
      ? { spec: result.data }
      : { error: new PlotSpecError(formatIssues(result.error), { cause: result.error }) };
  } catch (error) {
    return { error: new PlotSpecError('Plot source could not be validated', { cause: error }) };
  }
}
