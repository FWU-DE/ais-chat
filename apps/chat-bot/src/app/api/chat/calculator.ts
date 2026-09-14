import { z } from 'zod';
import { env } from '@/env';

export const CALCULATOR_MAX_EXPRESSION_LENGTH = 4_096;
export const CALCULATOR_MAX_REQUEST_BODY_BYTES = 8_192;
export const CALCULATOR_MAX_OUTPUT_LENGTH = 16_000;
export const CALCULATOR_TIMEOUT_MS = 5_000;

const calculatorResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    result: z.string().min(1),
    error: z.never().optional(),
  }),
  z.object({
    status: z.literal('invalid_input'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('overload'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('timeout'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('crashed_worker'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('malformed_output'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('upstream_failure'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
  z.object({
    status: z.literal('internal_failure'),
    result: z.never().optional(),
    error: z.string().min(1),
  }),
]);

type CalculatorStatus =
  | 'success'
  | 'invalid_input'
  | 'overload'
  | 'timeout'
  | 'crashed_worker'
  | 'malformed_output'
  | 'upstream_failure'
  | 'internal_failure';
type CalculatorSuccessResponse = { status: 'success'; result: string; error: null };
type CalculatorFailureResponse = {
  status: Exclude<CalculatorStatus, 'success'>;
  result: null;
  error: string;
};
export type CalculatorResponse = CalculatorSuccessResponse | CalculatorFailureResponse;

// A JSON string can expand each one-byte control character to a six-byte escape sequence.
// Keep the body bound safely above the largest serialized result while retaining the result limit.
const calculatorResponseEnvelopeBytes = Buffer.byteLength(
  JSON.stringify({ status: 'success', result: '', error: null }),
);
const CALCULATOR_MAX_RESPONSE_BYTES =
  CALCULATOR_MAX_OUTPUT_LENGTH * 6 + calculatorResponseEnvelopeBytes;

function stableResponse(input: z.infer<typeof calculatorResponseSchema>): CalculatorResponse {
  if (input.status === 'success') {
    return { status: input.status, result: input.result, error: null };
  }

  return { status: input.status, result: null, error: input.error };
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > CALCULATOR_MAX_RESPONSE_BYTES) {
      throw new Error('response body too large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CALCULATOR_MAX_RESPONSE_BYTES) {
        throw new Error('response body too large');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function calculate(expression: string): Promise<CalculatorResponse> {
  const parsedExpression = z
    .string()
    .trim()
    .min(1)
    .max(CALCULATOR_MAX_EXPRESSION_LENGTH)
    .safeParse(expression);
  if (!parsedExpression.success) {
    return { status: 'invalid_input', result: null, error: 'Invalid expression.' };
  }

  const requestBody = JSON.stringify({ expression: parsedExpression.data });
  if (Buffer.byteLength(requestBody) > CALCULATOR_MAX_REQUEST_BODY_BYTES) {
    return { status: 'invalid_input', result: null, error: 'Invalid expression.' };
  }

  try {
    const calculatorUrl = `${env.calculatorUrl.replace(/\/+$/, '')}/v1/calculate`;
    const response = await fetch(calculatorUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(CALCULATOR_TIMEOUT_MS),
    });
    const body = await readBoundedBody(response);
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(body);
    } catch {
      return { status: 'malformed_output', result: null, error: 'Malformed calculator response.' };
    }
    const parsed = calculatorResponseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return response.ok
        ? { status: 'malformed_output', result: null, error: 'Malformed calculator response.' }
        : { status: 'upstream_failure', result: null, error: 'Calculator request failed.' };
    }
    const result = stableResponse(parsed.data);
    if (
      result.result !== null &&
      Buffer.byteLength(result.result, 'utf-8') > CALCULATOR_MAX_OUTPUT_LENGTH
    ) {
      return { status: 'malformed_output', result: null, error: 'Calculator output too large.' };
    }
    if (!response.ok) {
      if (result.status !== 'success') return result;
      return {
        status: 'upstream_failure',
        result: null,
        error: result.error ?? `Calculator request failed (${response.status}).`,
      };
    }
    return result;
  } catch (error) {
    const outputTooLarge =
      error instanceof Error && error.message.includes('response body too large');
    return {
      status: outputTooLarge
        ? 'malformed_output'
        : error instanceof DOMException &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? 'timeout'
          : 'upstream_failure',
      result: null,
      error: outputTooLarge ? 'Calculator response too large.' : 'Calculator unavailable.',
    };
  }
}
