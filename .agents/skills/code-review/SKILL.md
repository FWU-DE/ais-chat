---
name: code-review
description: Guidelines for reviewing code in this repository. Apply when performing or assisting with code reviews.
---

# Code Review Guidelines

## Next.js RSC → Client Component Serialization

**Do NOT flag `Date` objects passed as props from Server Components to Client Components as a serialization bug.**

React's RSC wire format (used by Next.js App Router) natively supports `Date` objects and reconstructs them as proper `Date` instances on the client.

A real serialization concern only applies when data crosses a plain JSON boundary (e.g., a REST API response parsed with `JSON.parse`, `localStorage`, or `URLSearchParams`).

## Single-Organization Deployment

**Do NOT flag cross-organization isolation/collision concerns as bugs.**

Although the schema models multiple organizations, this app is deployed and
operated for a single organization only. Concerns about behavior across
different organizations (e.g. name/id collisions, data isolation between
tenants) are not applicable and should not be raised in review or acted on.
