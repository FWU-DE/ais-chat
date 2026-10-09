import { z } from 'zod';
import { generateTextWithBilling } from '@ais-chat/ai-core';
import type { ModelSelection, ToolCall } from '@ais-chat/ai-core/chat/types';
import { ALLOWED_CALLS, ALLOWED_ELEMENT_TYPES, parsePlotSpec } from '@/utils/plot/plot-spec';
import type { ToolDefinition, ToolRegistration } from './types';
import { TOOL_NAMES } from '@/types/tool-names';

export const createPlotArgsSchema = z.object({
  description: z.string().trim().min(1),
});

const ALLOWED_ELEMENT_TYPES_LIST = [...ALLOWED_ELEMENT_TYPES].sort().join(', ');
// Generated from the sanitizer's allowlist so the prompt cannot drift from what passes validation.
const ALLOWED_CALLS_LIST = [...ALLOWED_CALLS].sort().join(', ');

// System prompt for the sub-model that turns a natural-language drawing request into a single
// JSXGraph JSON spec. The "hard requirements" mirror what `parsePlotSpec` rejects; the bullets
// below them encode model mistakes seen in practice, so keep the explicit counter-examples.
const JSXGRAPH_SYSTEM_PROMPT = `You turn a description of a drawing (function graph, chart, geometry, 3D surface) into a single JSON object for JSXGraph. Respond with pure JSON only: no announcement, no explanation, no markdown code block, no text before or after the JSON. Do all reasoning silently before you start writing.

Write any user-visible text inside the JSON (labels, prefixes, axis names, chart category texts) in the same language as the input description. Everything else below (JSON structure, element types, function syntax) stays exactly as specified, regardless of the input language.

Format:
\`\`\`ts
type Plot = { board: { boundingBox: [xMin, yMax, xMax, yMin]; axis?: boolean; grid?: boolean; keepAspectRatio?: boolean; defaultAxes?: { x?: object; y?: object } }; elements: [type: string, parents: Parent[], attributes?: object][] };
type Parent = number | string | Parent[];
\`\`\`

## Hard requirements (the output is rejected if one of these is violated)
- The entire content must be readable with \`JSON.parse\`: pure JSON, no expressions/variables/comments outside of strings. Numbers outside of strings are plain JSON numbers (e.g. \`6.283185307179586\`), never expressions like \`2*PI\`; expressions belong in quotes, e.g. \`"2*PI"\`.
- \`board.boundingBox\` is required and must show all elements.
- \`elements\` holds between 1 and 200 entries. Each element is exactly \`[type, parents]\` or \`[type, parents, attributes]\` — \`attributes\` is its own third tuple entry, never part of the \`parents\` array. \`type\` and \`attributes\` are as in \`board.create(type, parents, attributes)\`.
- Only these \`type\`s are allowed (anything else, e.g. \`image\`, \`foreignobject\`/\`fo\`, \`button\`, \`input\`, \`checkbox\`, \`htmlslider\`, is rejected): ${ALLOWED_ELEMENT_TYPES_LIST}.
- Parents are numbers, coordinates \`[x, y]\`, or names of earlier elements, e.g. \`["segment", ["A", "B"]]\`, never coordinates as a string. Except in \`text\`/\`text3d\`, string parents must not contain \`;\`, \`{\`, \`}\`, \`"\`, \`'\`, or a backtick.
- Inside strings only these functions may be called: ${ALLOWED_CALLS_LIST}. Anything else — JavaScript, property access, other function names — is rejected, in texts and names too.
- There is only ever one coordinate system per output: never build multiple panels, subplots, or a grid of separate drawings sharing one \`boundingBox\`. If the description asks for a layout with several panels, draw only the single most relevant one instead of overlaying everything into one coordinate system.
- HTML is forbidden in texts (\`text\`, \`legend\` \`labels\`, \`chart\` \`labels\`, \`measurement\` \`prefix\` …). Use suitable Unicode characters or plain text instead.

## Syntax of the individual element types
- Elements are created in order; later elements reference earlier ones via their \`name\` as a string.
- Expressions use \`+ - * / ^ %\`, comparisons, \`c ? a : b\`, \`PI\` (never \`pi\` or π), \`E\`, and the allowed functions above. The variable is \`x\` (also for \`curve\`, e.g. \`3*cos(x)\`/\`3*sin(x)\` instead of \`t\`; for \`functiongraph3d\` \`x\` and \`y\`, for \`parametricsurface3d\` \`u\` and \`v\`, for \`curve3d\` \`u\`), plus slider names. Always multiply with \`*\` (\`2*x\`, never \`2x\`).
- Parametric curve: \`["curve", ["3*cos(x)", "3*sin(x)", "-2*PI", "2*PI"]]\` — exactly 4 separate parents (fx, fy, xMin, xMax), do NOT combine the bounds into an array (unlike \`implicitcurve\`); expressions like \`-2*PI\` always in quotes, otherwise it is not valid JSON.
- Implicit curve \`f(x, y) = 0\`: \`["implicitcurve", ["x^2+y^2-9", [xMin, xMax], [yMin, yMax]]]\`, variables \`x\` and \`y\`, both ranges are arrays, not single numbers.
- Sliders always only in this simple form \`["slider", [min, start, max], {"name": "a"}]\`; they appear below the graph.
- Live values that change while dragging: \`["measurement", [x, y, ["Area", "Q"]], {"prefix": "Area: "}]\` with \`Area\`, \`Perimeter\`, \`L\` (segment length), \`Radius\`, \`V\` (slider) and the name of the element. A \`text\` is static.
- 3D elements (\`point3d\`, \`functiongraph3d\` …) need a 3D view as the first element: \`["view3d", [[-4, -3], [8, 8], [[-5, 5], [-5, 5], [-5, 5]]]]\` with \`board\` \`{"boundingBox": [-8, 8, 8, -8], "axis": false}\`; keep x, y, and z between -5 and 5. Surface z = f(x, y): \`["functiongraph3d", ["x^2-y^2", [-3, 3], [-3, 3]]]\`. Space curve: \`["curve3d", ["3*cos(u)", "3*sin(u)", "u/2", ["0", "4*PI"]]]\` — exactly 4 parents (fx, fy, fz, range), the range as a real JSON array of two values \`["0", "4*PI"]\`, not as two separate parents and not as a string \`"[0, 4*PI]"\`.
- Charts: \`chart\` with \`[[x-positions], [heights]]\` (x first) or \`[[heights]]\` (x = 1, 2, …), \`chartStyle\` \`bar\`, \`line\`, or \`pie\` (\`pie\`: \`[[shares]]\`, default radius 4 around [0, 0]; set \`radius: 3\` and in \`board\` \`axis: false\` and \`boundingBox\` \`[-5, 5, 5, -5]\`). Set category names with \`text\` elements just below 0. For horizontal bars, set \`dir: "horizontal"\` and swap \`boundingBox\` accordingly.
- Axes are labeled "x", "y" by default (3D additionally "z"); a different label is set via \`board.defaultAxes\` (e.g. \`{"x": {"name": "Time (s)"}}\`) or, for \`view3d\`, via \`xAxis\`/\`yAxis\`/\`zAxis\` in its \`attributes\`.

## Quality of the drawing
- If two elements overlap exactly, they should look visually distinct (e.g. \`"dash": 2\`), otherwise one hides the other.
- Surfaces (\`functiongraph3d\`/\`parametricsurface3d\`) are shaded blue by default; use a different color via \`{"polyhedron": {"shader": {"hue": 0}}}\` (0–360, e.g. 0 red, 120 green, 280 purple) instead of \`strokeColor\`/\`fillColor\`.
- Legend: from two named function graphs/curves/implicit functions/3D surfaces onward, add \`["legend", [x, y], {"labels": [...], "colors": [...]}]\` instead of misusing \`text\` elements for it; \`colors\` must exactly match the explicitly set \`strokeColor\` values of the graphs.
- For geometric constructions: only make points freely draggable that should really be freely movable, not e.g. three points with arbitrary coordinates that just "happen" to form a right angle. Derive all other points/elements from relationships to already-created elements, never from fixed coordinates, so that every stated property still holds while dragging or moving sliders.

Examples:
{"board": {"boundingBox": [-7, 4, 7, -4]}, "elements": [["slider", [0, 1, 3], {"name": "a"}], ["functiongraph", ["a*sin(x)"], {"name": "f"}], ["integral", [[0, 3], "f"], {"fillColor": "#3b82f6", "fillOpacity": 0.4}]]}
{"board": {"boundingBox": [-2, 8, 8, -2]}, "elements": [["point", [0, 0], {"name": "A"}], ["point", [6, 0], {"name": "B"}], ["point", [6, 5], {"name": "C"}], ["point", [1, 5], {"name": "D"}], ["polygon", ["A", "B", "C", "D"], {"name": "Q"}], ["measurement", [-1, 7, ["Area", "Q"]], {"prefix": "Area: ", "digits": 2}]]}
{"board": {"boundingBox": [-0.5, 6, 4.5, -1.5]}, "elements": [["chart", [[3, 5, 2]], {"chartStyle": "bar", "width": 0.6, "labels": ["3", "5", "2"]}], ["text", [1, -0.6, "Mon"]], ["text", [2, -0.6, "Tue"]], ["text", [3, -0.6, "Wed"]]]}
{"board": {"boundingBox": [-5, 5, 5, -5], "axis": false}, "elements": [["chart", [[50, 30, 20]], {"chartStyle": "pie", "radius": 3}], ["text", [2, 2, "A (50%)"]], ["text", [-3.5, 0.5, "B (30%)"]], ["text", [0.5, -3.5, "C (20%)"]]]}`;

type BuildJsxgraphToolParams = {
  modelSelection: ModelSelection;
  apiKeyId: string;
};

export function buildJsxgraphTool({
  modelSelection,
  apiKeyId,
}: BuildJsxgraphToolParams): ToolRegistration {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.createPlot,
    description:
      'Creates a graphical drawing (function graph, chart, geometry, 3D surface) from a text description. Each call produces exactly one drawing; call it once per drawing. Write the description in the language of the conversation, so that labels and captions in the drawing match it.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Precise description of the desired drawing: which elements, values, and relationships it should contain.',
          minLength: 1,
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>): Promise<string> => {
    const parsedArgs = createPlotArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return 'Error: Invalid description.';
    }

    const { description } = parsedArgs.data;

    try {
      const first = await generateTextWithBilling(
        modelSelection,
        [
          { role: 'system', content: JSXGRAPH_SYSTEM_PROMPT },
          { role: 'user', content: description },
        ],
        apiKeyId,
      );
      const firstResult = parsePlotSpec(first.text);
      if ('spec' in firstResult) {
        return JSON.stringify(firstResult.spec);
      }

      const { text: retryText } = await generateTextWithBilling(
        modelSelection,
        [
          { role: 'system', content: JSXGRAPH_SYSTEM_PROMPT },
          { role: 'user', content: description },
          { role: 'assistant', content: first.text },
          {
            role: 'user',
            content: `The JSON was invalid: ${firstResult.error.message}\nReturn the corrected version as pure JSON, without explanation.`,
          },
        ],
        apiKeyId,
      );
      const retryResult = parsePlotSpec(retryText);
      if ('spec' in retryResult) {
        return JSON.stringify(retryResult.spec);
      }

      return `Error: Could not create a valid plot (${retryResult.error.message}). Explain briefly to the user that the drawing could not be created and suggest an alternative.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plot generation failed';
      return `Error: ${message}`;
    }
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => ({
        kind: 'tool',
        id: toolCall.id,
        tool: TOOL_NAMES.createPlot,
      }),
    },
  };
}
