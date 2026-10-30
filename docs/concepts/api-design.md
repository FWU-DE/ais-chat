# API Design

## Where to place request/response schemas

Default: define the Zod schema inline in the `route.ts` file that uses it.

Only extract a schema into a separate `*-request-schemas.ts` file (colocated with the routes that
use it) once it is actually imported by more than one route. Don't extract preemptively — colocate
with the single consumer until reuse is real (YAGNI).

When a schema is extracted because multiple routes share it, place the file in a common folder
that all consuming routes can import from (not inside any single route's own folder).
