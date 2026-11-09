# External Data Validation

## Rule

Data that enters the system from outside must be validated with a Zod schema before it is used.
Never use a type assertion (`as SomeType`) to give external data a type.

A cast tells TypeScript to assume a shape without checking it. If the external shape differs, the
error surfaces later and far from its origin — for example a string flowing into a field typed as
`number` and silently corrupting a calculation, or an unrelated `TypeError` deep inside a consumer.

## What counts as external

- Request bodies, query params, headers, and route params (Fastify implicit validation is disabled)
- Responses from LLM and other third-party providers, including SSE/streamed events
- Webhook payloads and anything read from `JSON.parse`
- Values read from storage written by another system

Data produced and typed inside the monorepo (e.g. Drizzle query results) does not need re-validation.

## How

Derive the TypeScript types from the schema so there is a single source of truth:

```ts
const payloadSchema = z.object({
  id: z.string(),
  count: z.number().nullish(),
});

type Payload = z.infer<typeof payloadSchema>;

function parsePayload(raw: string): Payload {
  try {
    return payloadSchema.parse(JSON.parse(raw));
  } catch {
    throw new DomainError('Received a malformed payload');
  }
}
```

- Use `.parse` inside a `try`/`catch` when malformed JSON and an unexpected shape should fail the
  same way; use `.safeParse` when the two cases need different handling or a fallback.
- Translate validation failures into a domain error rather than letting a `ZodError` escape.
- Keep schemas permissive where the source legitimately varies: `z.object` strips unknown keys, so
  added fields won't break parsing. Use `.nullish()` for fields the source may send as `null` or
  omit entirely.
