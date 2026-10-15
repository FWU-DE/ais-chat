# UI Layout Concepts & Best Practices

This document describes concepts and best practices for building responsive UI layouts in this repository. It is intended for both agents and developers.

## Breakpoints

The repository defines exactly two breakpoints (see
[`globals.css`](/packages/ui/src/styles/globals.css)):

- `sm` — 640px
- `lg` — 1024px

All other default Tailwind breakpoints (`md`, `xl`, `2xl`, …) are reset and **must not be used**.
Only `sm:` and `lg:` prefixes are allowed in responsive class names.

## Mobile-first design

Styling follows Tailwind's mobile-first convention:

- Unprefixed utility classes define the **mobile** layout (the default/base case).
- `sm:`-prefixed classes override the base layout for viewports ≥ 640px.
- `lg:`-prefixed classes override further for viewports ≥ 1024px.

Always start by designing and implementing the mobile layout first, then layer on `sm:` (and, if needed, `lg:`) utilities for larger viewports. Avoid designing desktop-first and trying to retrofit mobile behavior with overrides.

## Reordering elements between breakpoints: the `flex-wrap` + `order-*` + `basis-full` trick

A common UI need is to show the same set of elements in a different order/row arrangement on mobile vs. larger viewports, without duplicating markup (which would duplicate text content, `data-testid`s, and accessibility nodes).

### Example scenario

Given three elements in a flex row — `title`, `Chip`, `caret icon` — the desired layouts are:

- **Mobile**: row 1 = `title` + `caret`, row 2 = `Chip` (on its own line)
- **`sm:` and above**: single row = `title` → `Chip` → `caret`

### The trick

1. Make the container wrap on mobile and stay a single row from `sm:` up:

   ```
   flex flex-wrap sm:flex-nowrap items-center gap-2
   ```

2. Use `order-*` utilities to control visual order per breakpoint. Keep the DOM order as `title`, `Chip`, `caret` (DOM order should match the desktop reading order and is what accessibility tools/tab order will use), and only reorder visually for mobile:

   ```tsx
   <span>{title}</span>
   <Chip className="order-2 sm:order-none basis-full sm:basis-auto">{chip}</Chip>
   <span className="order-1 sm:order-none ml-auto">{caret}</span>
   ```

3. Force the `Chip` onto its own line on mobile with `basis-full`. In a wrapping flex container, a
   flex item with `flex-basis: 100%` always starts a new line, pushing any subsequent items to the
   next row. Reset it with `sm:basis-auto` so it behaves as a normal inline item once the
   container switches to `nowrap`.

4. Keep existing alignment utilities (like `ml-auto` on the caret) — they keep working within
   whichever row the element ends up on.

Why this works:

- `order-*` only changes the **visual** order (box ordering), not the DOM order — screen readers
  and keyboard navigation still follow DOM order, which should match the desktop reading order.
- `basis-full` forces a flex-wrap line break before/after that item without needing a separate
  wrapper `<div>` per row.
- No markup is duplicated, so there is exactly one instance of each element, its text, and any
  `data-testid`, preserving unique test selectors and a single accessibility tree node.

### When to use this approach

Prefer this trick when:

- The same elements need to appear in a different visual order and/or row grouping across the two
  breakpoints.
- The elements carry `data-testid`s, translated text, or other content that must not be
  duplicated.

Consider alternatives (e.g. CSS grid with named `grid-template-areas`, or a restructured
nested-flex layout) only if the ordering logic becomes too complex to express with `order-*` and
`basis-full` alone — but keep in mind Tailwind has no first-class utility for custom
`grid-template-areas`, so that approach typically requires arbitrary-value classes and is more
verbose. Avoid duplicating markup per breakpoint purely to achieve a different order, since it
duplicates text content, test selectors, and accessibility nodes.
