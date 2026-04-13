# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal wiki built on **Quartz v4** (forked from [jackyzha0/quartz](https://github.com/jackyzha0/quartz)). Quartz is a static site generator that turns Obsidian-flavored Markdown into a browsable website with features like backlinks, graph view, full-text search, and popovers.

- **Site URL**: kevin7lou.github.io/wiki
- **Content source**: `content/` directory (Obsidian vault)
- **Deploys**: GitHub Pages via GitHub Actions on push to `v4` branch

## Commands

```bash
# Development (build + hot-reload server)
npx quartz build --serve

# Production build (outputs to public/)
npx quartz build

# Type check + format check
npm run check

# Format code
npm run format

# Run tests
npm test

# Serve the docs site locally
npm run docs
```

The CLI (`quartz/bootstrap-cli.mjs`) also supports: `quartz create`, `quartz update`, `quartz sync`, `quartz restore`.

## Architecture

### Build Pipeline

Content flows through three plugin stages in order:

1. **Transformers** (`quartz/plugins/transformers/`) — Modify content during parsing. Each transformer can hook into three phases:
   - `textTransform`: raw text → text (before parsing)
   - `markdownPlugins`: remark plugins (MD AST → MD AST)
   - `htmlPlugins`: rehype plugins (HTML AST → HTML AST)

2. **Filters** (`quartz/plugins/filters/`) — Decide whether content should be published (e.g., `RemoveDrafts` excludes frontmatter `draft: true`)

3. **Emitters** (`quartz/plugins/emitters/`) — Generate output files (HTML pages, sitemap, RSS, OG images, static assets). Emitters support `partialEmit` for incremental rebuilds.

Processing is parallelized via `workerpool` — markdown files are chunked and processed in worker threads (`quartz/worker.ts`).

### Component System

Components in `quartz/components/` are **Preact** (not React) server-rendered components using JSX. Each `QuartzComponent` can optionally declare:
- `css` — stylesheet injected into the page
- `beforeDOMLoaded` — script that runs before DOM is ready
- `afterDOMLoaded` — script that runs after DOM is ready

Client-side scripts live in `quartz/components/scripts/*.inline.ts` and are bundled by esbuild as text.

### Configuration Files (root-level)

- **`quartz.config.ts`** — Global config: site title, theme, plugin pipeline (which transformers/filters/emitters to use and their options)
- **`quartz.layout.ts`** — Page layout: which components appear in left sidebar, right sidebar, before/after body

### Path System

`quartz/util/path.ts` defines branded string types to prevent slug/path confusion:
- `FilePath` — absolute file path with extension
- `FullSlug` — normalized slug (no leading slash, no trailing slash)
- `SimpleSlug` — display slug (no `index` suffix, no extension)
- `RelativeURL` — starts with `.` or `..`

Always use the appropriate type and conversion functions rather than raw string manipulation.

### Key Directories

- `quartz/util/` — Shared utilities (path handling, theming, perf timing, file trie)
- `quartz/processors/` — Orchestrates parse, filter, emit stages
- `quartz/i18n/` — Locale translations
- `quartz/styles/` — Global SCSS styles
- `quartz/static/` — Static assets (fonts, icons)

## Formatting

Prettier with: no semicolons, trailing commas, 100 char width, 2-space indent. Run `npm run format` to auto-fix.

## Testing

Tests use Node's built-in test runner via `tsx --test`. Existing test files:
- `quartz/util/path.test.ts`
- `quartz/util/fileTrie.test.ts`

## Custom Configuration in This Fork

- SPA mode disabled (`enableSPA: false`)
- Popovers enabled
- Obsidian-flavored Markdown with highlights and in-HTML embeds
- Custom OG image generation enabled (slows build — can be commented out)
- Content ignores: `Private`, `Templates`, `.obsidian`
- Date priority: frontmatter → git → filesystem
