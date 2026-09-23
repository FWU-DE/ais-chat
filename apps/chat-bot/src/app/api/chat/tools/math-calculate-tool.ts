import { z } from 'zod';
import {
  calculate,
  CALCULATOR_MAX_EXPRESSION_LENGTH,
  type CalculatorResponse,
} from '../calculator';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { parseJsonRecord } from '@/utils/chat/ai-activity';
import type { ToolDefinition, ToolRegistration } from './types';
import { TOOL_NAMES } from '@/types/tool-names';

export const expressionSchema = z.object({
  expression: z.string().trim().min(1).max(CALCULATOR_MAX_EXPRESSION_LENGTH),
});

export function buildMathCalculateTool(): ToolRegistration {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.mathCalculate,
    description:
      'Use this tool for every numerical, algebraic, statistical, geometric, calculus, matrix/vector, or number-theory calculation; never calculate results mentally or directly, especially for multi-part requests. Make one or more calls as needed. Calculate exactly one mathematical expression per call. The expression must use qalc syntax. Translate the user request into qalc syntax before calling this tool. Return only the expression, never a question or explanation. Use semicolons for function arguments. If a calculation fails, report the error briefly and ask the user to rephrase or provide values; do not explain qalc internals or invent results. Examples: arithmetic: "2 + 2"; fraction: "1/3 to fraction"; percentage: "25% * 200"; factorization: "factor(x^2 - 4)"; equation: "solve(2x^2 + 3x - 5 = 0; x)"; second derivative: "diff(x^4; x; 2)"; indefinite integral: "integrate(2x)" — do not append the variable as a second argument; definite integral: "integrate(x^2; 0; 1)"; limit: "limit(1/x; infinity)"; statistics: "varp([1 2 3])" or "var([1 2 3])"; binomial coefficient: "binomial(5; 2)"; matrix: "[1 2; 3 4]"; circle area: "pi * 5^2"; triangle area: "1/2 * 3 * 4"; right-triangle side: "sqrt(3^2 + 4^2)"; square root: "sqrt(16)"; unit calculation: "12 km / 3 h".',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'A single qalc expression (not a question or explanation).',
          minLength: 1,
          maxLength: CALCULATOR_MAX_EXPRESSION_LENGTH,
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  };

  const handler = async (args: Record<string, unknown>): Promise<string> => {
    const parsed = expressionSchema.safeParse(args);
    if (!parsed.success) {
      const response: CalculatorResponse = {
        status: 'invalid_input',
        result: null,
        error: 'Invalid expression.',
      };
      return JSON.stringify(response);
    }
    return JSON.stringify(await calculate(parsed.data.expression));
  };

  return {
    definition,
    handler,
    activity: {
      createStep: (toolCall: ToolCall) => {
        const parsed = expressionSchema.safeParse(parseJsonRecord(toolCall.arguments));
        return {
          kind: 'tool',
          id: toolCall.id,
          tool: TOOL_NAMES.mathCalculate,
          detail: parsed.success ? parsed.data.expression : undefined,
        };
      },
    },
  };
}
