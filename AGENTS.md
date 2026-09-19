# Agent Instructions

Use github issues for issue tracking.

Do not make commits without dev approval.

# Architecture Overview

Single-page portfolio site — Astro 7 static output + Tailwind CSS 4, deployed to Cloudflare as static assets (see `wrangler.jsonc`, serves `dist/`). All content is YAML-driven from `src/data/`.

```text
pages (index, 404, blogs/[slug])
  → BaseLayout (SEO, OG, JSON-LD, no-flash theme script)
    → components (one per section)
lib/data.ts (YAML loader, build-time, cached) | lib/types.ts (TS interfaces = YAML contract)
src/data/*.yaml (content) | src/scripts/toys/*.ts (client canvas toys) | public/scripts/main.js (scroll reveal, dark toggle, tilt)
```

## Key files

- `src/lib/data.ts` — `load<T>(file)` parses `src/data/*.yaml` at build time (js-yaml + node:fs, cached; throws on parse failure).
- `src/lib/types.ts` — interfaces for every YAML file; the contract when editing content or components.
- `src/pages/index.astro` — section composition: Navbar → Hero → CanvasToy → About → Experience → Publications → Skills → Education → Contact → Footer (Projects section deferred).
- `src/layouts/BaseLayout.astro` — head/meta, canonical URL, JSON-LD Person schema, theme bootstrap, loads `/scripts/main.js`.
- `src/components/CanvasToy.astro` — "museum exhibit" panel (right half of viewport, desktop only). Toys are `CanvasToy` objects (`{id, headerHtml, footerHtml, start(canvas) → cleanup, renderHeaderControls?}`). Toy imports are duplicated in both frontmatter (SSR default) and `<script>` (client rotation) — keep in sync when adding toys. Open honors `data-toy-id` continuity from the hero toggle.
- `src/pages/blogs/[slug].astro` + `src/content.config.ts` — Astro content collection (`blogs`) with zod schema (title, date, description?, tags?, draft?), glob loader over `src/content/blogs/`, GFM markdown.
- `src/styles/global.css` — Tailwind v4 `@theme` tokens (teal accent, rust CTA, Chakra Petch/IBM Plex fonts); dark mode is `.dark`-class based with custom variant.

## Conventions

- Content changes go in `src/data/*.yaml` (types in `src/lib/types.ts`); no component edits needed for content-only changes.
- No test suite; use `npm run check` (astro check), `npm run build` for validation, `npm run format` for prettier.
