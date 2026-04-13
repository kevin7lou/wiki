# LLM Wiki Phase 1 — Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Author:** Kevin Lou + Claude

## Overview

Transform the existing Quartz wiki into a self-evolving LLM-powered knowledge base. Phase 1 delivers the core pipeline: RSS fetch → LLM ingest → structural lint → auto-publish via Quartz on GitHub Pages.

**Reference implementation:** [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) — we extract prompt templates, two-step CoT ingest logic, and file parsing from its `src/lib/` modules while replacing the Tauri desktop shell with a Node.js CLI for CI.

## Requirements

- **Raw sources:** RSS feeds and article URLs, automatically fetched
- **Wiki scope:** AI/ML + broader tech (software engineering, products, startups, industry trends)
- **LLM providers:** Claude API (Anthropic) + OpenAI API, switchable via env vars
- **Existing content:** 49 markdown notes (ML/DS/Statistics) migrated into the new wiki structure
- **Language:** Chinese/English mixed, matching the source material
- **Publishing:** Weekly cron via GitHub Actions → Quartz build → GitHub Pages
- **Output format:** Obsidian-flavored Markdown with `[[wikilink]]` + YAML frontmatter (native Quartz OFM support)

## Architecture: Node.js CLI Scripts

### Decision

Use TypeScript scripts executed via `tsx` (already a project dependency). This allows direct extraction of nashsu's TypeScript prompt templates and parsing logic with minimal adaptation.

### Alternatives Considered

- **Python scripts:** Better RSS/PDF libraries, but introduces a second language and can't reuse nashsu TS code.
- **Claude Code as orchestrator:** Maximum flexibility, but non-deterministic behavior and uncontrollable cost.

## Directory Structure

```
wiki/                           (project root = Quartz repo)
├── scripts/                    LLM Wiki evolution engine
│   ├── evolve.ts               CLI entry: fetch | ingest | lint | run | migrate
│   ├── config.ts               Provider/key/model config (reads env vars)
│   └── lib/
│       ├── llm-client.ts       Multi-provider unified interface (Claude / OpenAI)
│       ├── fetch-sources.ts    RSS subscription fetch + URL article extraction
│       ├── ingest.ts           Two-step CoT: analyze → generate wiki pages
│       ├── lint.ts             Structural checks (orphans, broken links, no outlinks)
│       ├── migrate.ts          One-time: existing notes → raw/ → ingest
│       └── utils.ts            File I/O, path helpers, wikilink parsing
├── raw/
│   ├── feeds.json              RSS subscription list [{url, category}]
│   ├── sources/                Fetched raw articles (markdown)
│   └── .ingest-cache.json      SHA256 dedup cache
├── content/                    Quartz content directory
│   ├── index.md                LLM-maintained catalog index
│   ├── log.md                  Operation log (append-only)
│   ├── overview.md             Wiki-wide summary
│   ├── sources/                Source summary pages
│   ├── entities/               Entity pages (people, orgs, tools)
│   ├── concepts/               Concept pages (techniques, methods, theories)
│   └── synthesis/              Cross-topic synthesis pages
├── SCHEMA.md                   Wiki structure rules (for LLM + humans)
├── PURPOSE.md                  Wiki directional intent
├── .github/workflows/
│   ├── deploy.yml              Existing: push-triggered Quartz build+deploy
│   └── evolve.yml              New: weekly cron evolution pipeline
└── quartz.config.ts            Quartz config (existing)
```

## Data Flow

```
Weekly cron (GitHub Actions)
        │
        ▼
┌─ fetch ────────────────────────────────┐
│ Read raw/feeds.json                     │
│ Fetch new articles from each RSS feed   │
│ SHA256 dedup, skip already-ingested     │
│ Save to raw/sources/{category}/{slug}.md│
└──────────────┬─────────────────────────┘
               │ list of new articles
               ▼
┌─ ingest (per article) ─────────────────┐
│ Step 1: LLM Analysis                    │
│   input: article + PURPOSE + index      │
│   output: entities/concepts/claims/links│
│                                         │
│ Step 2: LLM Generation                  │
│   input: analysis + SCHEMA + index      │
│   output: ---FILE: content/xxx.md---    │
│                                         │
│ Step 3: Write files                     │
│   Parse FILE blocks → content/xxx.md    │
│   log.md append, index.md update        │
│                                         │
│ Step 4: Update cache                    │
│   SHA256(article) → .ingest-cache.json  │
└──────────────┬─────────────────────────┘
               │
               ▼
┌─ lint ─────────────────────────────────┐
│ Structural: orphan pages, broken links, │
│ no-outlink pages                        │
│ Output: warning list to console         │
└──────────────┬─────────────────────────┘
               │
               ▼
┌─ publish ──────────────────────────────┐
│ git add + commit + push                 │
│ Triggers deploy.yml → Quartz build      │
│ → GitHub Pages                          │
└────────────────────────────────────────┘
```

## CLI Interface

```bash
npx tsx scripts/evolve.ts fetch      # Fetch new articles from RSS feeds
npx tsx scripts/evolve.ts ingest     # Ingest unprocessed raw sources
npx tsx scripts/evolve.ts lint       # Run structural lint checks
npx tsx scripts/evolve.ts run        # Full pipeline: fetch → ingest → lint
npx tsx scripts/evolve.ts migrate    # One-time: migrate existing notes
```

## Module Design

### `config.ts`

Reads environment variables, exports typed config:

```typescript
interface EvolveConfig {
  llm: {
    provider: "anthropic" | "openai"
    apiKey: string
    model: string
  }
  tavily?: {             // Phase 2: Deep Research
    apiKey: string
  }
  paths: {
    root: string         // project root
    content: string      // content/ directory
    raw: string          // raw/ directory
    schema: string       // SCHEMA.md path
    purpose: string      // PURPOSE.md path
  }
}
```

- `LLM_PROVIDER` env var selects provider (default: `anthropic`)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` for credentials
- `LLM_MODEL` optional override (defaults: `claude-sonnet-4-20250514` / `gpt-4o`)

### `llm-client.ts`

Unified LLM call interface, no streaming (CI doesn't need it):

```typescript
interface Message {
  role: "system" | "user" | "assistant"
  content: string
}

async function chat(config: LlmConfig, messages: Message[]): Promise<string>
```

- Direct `fetch` to REST APIs — no SDK dependency
- Anthropic: `POST https://api.anthropic.com/v1/messages`
- OpenAI: `POST https://api.openai.com/v1/chat/completions`
- Retry with exponential backoff (3 attempts max)
- 50,000 char input truncation (matching nashsu's limit)

### `fetch-sources.ts`

```typescript
async function fetchFeeds(rawDir: string, cacheFile: string): Promise<string[]>
```

- Parses RSS/Atom XML with `fast-xml-parser`
- Extracts article body with `@mozilla/readability` + `linkedom`
- Converts to markdown, prepends YAML frontmatter: `title`, `url`, `date`, `category`
- SHA256 of article content for dedup against `.ingest-cache.json`
- Returns list of new file paths saved to `raw/sources/`

### `ingest.ts`

**Directly adapted from nashsu `src/lib/ingest.ts`.**

Key changes from nashsu:
1. Remove Zustand store dependency → pure function `(projectPath, sourcePath, llmConfig) → string[]`
2. Replace Tauri `readFile`/`writeFile` → Node.js `fs.promises`
3. Remove activity/review stores → `console.log` output
4. Retain `---FILE: xxx---` / `---END FILE---` block parsing verbatim
5. Retain two-step CoT prompt templates (analysis + generation)
6. Retain SHA256 ingest cache logic
7. Adapt FILE block paths: nashsu uses `wiki/` prefix, we use `content/` prefix (matching Quartz's content directory)

**Prompt templates** are extracted from nashsu's `buildAnalysisPrompt()` and `buildGenerationPrompt()` functions with path prefixes adjusted from `wiki/` to `content/`. The `LANGUAGE_RULE` ("match source language") is kept as-is for Chinese/English mixed content.

### `lint.ts`

**Phase 1: structural checks only (no LLM needed).**

Adapted from nashsu `src/lib/lint.ts` `runStructuralLint()`:

```typescript
interface LintResult {
  type: "orphan" | "broken-link" | "no-outlinks"
  severity: "warning" | "info"
  page: string
  detail: string
}

async function runStructuralLint(contentDir: string): Promise<LintResult[]>
```

- Scans all `.md` files in `content/`
- Builds slug map from filenames
- Extracts `[[wikilink]]` references
- Checks: orphan pages (no inbound links), broken links (target not found), no-outlink pages
- Excludes `index.md`, `log.md`, `overview.md` from orphan checks

### `migrate.ts`

One-time script for existing content:

```typescript
async function migrateExisting(projectPath: string, llmConfig: LlmConfig): Promise<void>
```

1. Scan `content/` for existing `.md` files (excluding `index.md`, `log.md`)
2. Copy each to `raw/sources/legacy/{filename}.md`
3. Run each through the ingest pipeline
4. LLM reorganizes into `content/entities/`, `content/concepts/`, etc.
5. Original files remain until user manually verifies and removes

## SCHEMA.md

```markdown
# Wiki Schema

## Page Types
| Type       | Directory          | Purpose                              |
|------------|--------------------|--------------------------------------|
| entity     | content/entities/  | People, organizations, products, tools, datasets |
| concept    | content/concepts/  | Techniques, methods, theories, frameworks |
| source     | content/sources/   | Article summaries with link to original |
| synthesis  | content/synthesis/ | Cross-topic analysis and conclusions |

## Frontmatter
All pages must include YAML frontmatter:
  type: entity | concept | source | synthesis
  title: Human-readable title
  tags: []
  related: []
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  sources: ["original filename"]

Source pages also include:
  url: "https://..."
  date: YYYY-MM-DD

## Naming Conventions
- Filenames: kebab-case.md
- Entities: official name (e.g., openai.md, claude.md)
- Concepts: descriptive noun phrase (e.g., chain-of-thought.md)
- Sources: origin-date-slug (e.g., arxiv-2024-03-attention.md)

## Cross-referencing
- Use [[wikilink]] syntax between wiki pages
- Every entity and concept must appear in index.md
- Link on first mention only, don't repeat
- Source pages link to entities and concepts they discuss

## Contradiction Handling
When sources contradict:
1. Note the contradiction in the relevant concept/entity page
2. Link both sources
3. Resolve in a synthesis page when sufficient evidence exists
```

## PURPOSE.md

```markdown
# Project Purpose — AI & Tech Knowledge Wiki

## Goal
Build a continuously evolving AI and tech knowledge base that automatically
tracks cutting-edge developments, organizes core concepts, key people, and
important tools into an organically linked knowledge network.

## Domains
- AI/ML: LLM, deep learning, reinforcement learning, computer vision, NLP
- Data Science: statistics, data engineering, visualization
- Software Engineering: system design, programming languages, DevOps
- Tech Industry: products, startups, investment, industry trends

## Information Sources
RSS subscriptions + manually imported articles and papers

## Language
Chinese/English mixed, matching the language of source material
```

## GitHub Actions

### `evolve.yml`

```yaml
name: Wiki-Evolve

on:
  schedule:
    - cron: '0 2 * * 1'     # Every Monday UTC 02:00 (Beijing 10:00)
  workflow_dispatch:          # Manual trigger

jobs:
  evolve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci

      - name: Evolve Wiki
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx tsx scripts/evolve.ts run

      - name: Commit & Push
        run: |
          git config user.name "llm-wiki-bot"
          git config user.email "bot@wiki.local"
          git add content/ raw/.ingest-cache.json
          git diff --staged --quiet || git commit -m "chore: weekly wiki evolution"
          git push
```

### New Dependencies

3 new packages (all pure Node.js, no native bindings):

- `fast-xml-parser` — RSS/Atom XML parsing
- `@mozilla/readability` — article body extraction
- `linkedom` — DOM implementation for Readability (no browser needed)

## Scope

### In Scope (Phase 1)
- `scripts/` directory with 4 core modules (llm-client, fetch-sources, ingest, lint)
- `migrate.ts` one-time existing notes migration
- `SCHEMA.md` + `PURPOSE.md`
- `raw/feeds.json` initial RSS subscription list (user populates)
- `evolve.yml` GitHub Actions automation
- CLI entry `evolve.ts` supporting `fetch | ingest | lint | run | migrate`

### Out of Scope (Phase 2+)
- Deep Research (Tavily web search → auto-fill knowledge gaps)
- Graph Insights (Louvain community detection, knowledge gap discovery)
- LLM semantic lint (contradiction detection, stale content checks)
- Wikilink auto-enrichment (`enrich-wikilinks.ts`)
- Vector search / embeddings
- Review queue UI

## Acceptance Criteria

1. `npx tsx scripts/evolve.ts fetch` fetches RSS articles to `raw/sources/`
2. `npx tsx scripts/evolve.ts ingest` calls LLM and generates wiki pages in `content/`
3. `npx tsx scripts/evolve.ts lint` detects orphan pages and broken links
4. `npx tsx scripts/evolve.ts run` executes the full pipeline end-to-end
5. `npx quartz build` successfully builds with newly generated wiki pages
6. GitHub Actions weekly cron executes the full pipeline and deploys
