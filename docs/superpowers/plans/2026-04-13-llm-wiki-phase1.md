# LLM Wiki Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI pipeline that fetches RSS articles, uses LLM to generate structured wiki pages, runs structural lint, and auto-publishes via Quartz on GitHub Pages.

**Architecture:** Node.js CLI scripts in `scripts/` using `tsx`. Two-step Chain-of-Thought ingest adapted from nashsu/llm_wiki. Multi-provider LLM client (Claude API + OpenAI API) via direct `fetch`. Weekly GitHub Actions cron triggers the full pipeline.

**Tech Stack:** TypeScript, tsx, fast-xml-parser, @mozilla/readability, linkedom, Quartz v4

**Spec:** `docs/superpowers/specs/2026-04-13-llm-wiki-phase1-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/config.ts` | Create | Read env vars, export typed config |
| `scripts/lib/utils.ts` | Create | File I/O, wikilink extraction, slug helpers |
| `scripts/lib/llm-client.ts` | Create | Multi-provider LLM chat (Claude + OpenAI) |
| `scripts/lib/fetch-sources.ts` | Create | RSS fetch, article extraction, dedup cache |
| `scripts/lib/ingest.ts` | Create | Two-step CoT ingest pipeline |
| `scripts/lib/lint.ts` | Create | Structural wiki lint (orphans, broken links) |
| `scripts/lib/migrate.ts` | Create | One-time migration of existing notes |
| `scripts/evolve.ts` | Create | CLI entry point with subcommands |
| `SCHEMA.md` | Create | Wiki structure rules |
| `PURPOSE.md` | Create | Wiki directional intent |
| `raw/feeds.json` | Create | RSS subscription list (empty template) |
| `.github/workflows/evolve.yml` | Create | Weekly cron workflow |
| `quartz.config.ts` | Modify | Add `raw` and `scripts` to ignorePatterns |
| `.gitignore` | Modify | Add `raw/sources/` |
| `package.json` | Modify | Add 3 new dependencies |

---

### Task 1: Install Dependencies and Scaffold Directories

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `raw/feeds.json`
- Create: `raw/sources/.gitkeep`
- Create: `scripts/lib/.gitkeep` (placeholder, removed in later tasks)

- [ ] **Step 1: Install new dependencies**

```bash
npm install fast-xml-parser @mozilla/readability linkedom
```

- [ ] **Step 2: Create raw directory with empty feeds.json**

Create `raw/feeds.json`:
```json
[
  {
    "url": "https://blog.openai.com/rss/",
    "category": "AI"
  },
  {
    "url": "https://lilianweng.github.io/index.xml",
    "category": "AI"
  }
]
```

Create `raw/sources/.gitkeep` (empty file).

- [ ] **Step 3: Update .gitignore**

Append to `.gitignore`:
```
# LLM Wiki
raw/sources/**/*.md
raw/.ingest-cache.json
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json raw/feeds.json raw/sources/.gitkeep .gitignore
git commit -m "chore: add llm-wiki dependencies and scaffold raw/ directory"
```

---

### Task 2: Create SCHEMA.md and PURPOSE.md

**Files:**
- Create: `SCHEMA.md`
- Create: `PURPOSE.md`

- [ ] **Step 1: Create SCHEMA.md**

Create `SCHEMA.md`:
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
```yaml
---
type: entity | concept | source | synthesis
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["original filename"]
---
```

Source pages also include:
```yaml
url: "https://..."
date: YYYY-MM-DD
```

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

- [ ] **Step 2: Create PURPOSE.md**

Create `PURPOSE.md`:
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

- [ ] **Step 3: Commit**

```bash
git add SCHEMA.md PURPOSE.md
git commit -m "docs: add SCHEMA.md and PURPOSE.md for LLM wiki"
```

---

### Task 3: Create config.ts and utils.ts

**Files:**
- Create: `scripts/config.ts`
- Create: `scripts/lib/utils.ts`

- [ ] **Step 1: Create scripts/config.ts**

```typescript
import path from "path"

export interface LlmConfig {
  provider: "anthropic" | "openai"
  apiKey: string
  model: string
}

export interface EvolveConfig {
  llm: LlmConfig
  paths: {
    root: string
    content: string
    raw: string
    schema: string
    purpose: string
    cache: string
  }
}

export function loadConfig(): EvolveConfig {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic") as "anthropic" | "openai"

  const apiKeyMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  }

  const modelMap: Record<string, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
  }

  const apiKey = apiKeyMap[provider]
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider}". Set ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} environment variable.`,
    )
  }

  const root = path.resolve(process.cwd())

  return {
    llm: {
      provider,
      apiKey,
      model: process.env.LLM_MODEL ?? modelMap[provider],
    },
    paths: {
      root,
      content: path.join(root, "content"),
      raw: path.join(root, "raw"),
      schema: path.join(root, "SCHEMA.md"),
      purpose: path.join(root, "PURPOSE.md"),
      cache: path.join(root, "raw", ".ingest-cache.json"),
    },
  }
}
```

- [ ] **Step 2: Create scripts/lib/utils.ts**

```typescript
import fs from "fs/promises"
import path from "path"
import crypto from "crypto"

export async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return ""
  }
}

export async function writeFileWithDirs(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")
}

export async function appendToFile(filePath: string, content: string): Promise<void> {
  const existing = await readFileOrEmpty(filePath)
  const appended = existing ? `${existing}\n\n${content.trim()}` : content.trim()
  await writeFileWithDirs(filePath, appended)
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

export function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
}

export async function listMdFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(currentDir: string): Promise<void> {
    let entries: import("fs").Dirent[]
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath)
      }
    }
  }

  await walk(dir)
  return results
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit scripts/config.ts scripts/lib/utils.ts 2>&1 || true
```

This may show errors about missing tsconfig paths — that's expected since these files are outside the main `quartz/` source. We run them via `tsx` which handles this.

- [ ] **Step 4: Commit**

```bash
git add scripts/config.ts scripts/lib/utils.ts
git commit -m "feat: add config and utils modules for llm-wiki scripts"
```

---

### Task 4: Create llm-client.ts

**Files:**
- Create: `scripts/lib/llm-client.ts`

- [ ] **Step 1: Create scripts/lib/llm-client.ts**

```typescript
import type { LlmConfig } from "../config"

export interface Message {
  role: "system" | "user" | "assistant"
  content: string
}

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

export async function chat(config: LlmConfig, messages: Message[]): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await callProvider(config, messages)
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1
      if (isLast) throw err

      const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      console.log(`  LLM call failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${waitMs}ms...`)
      await sleep(waitMs)
    }
  }

  throw new Error("Unreachable")
}

async function callProvider(config: LlmConfig, messages: Message[]): Promise<string> {
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, messages)
    case "openai":
      return callOpenAI(config, messages)
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
}

async function callAnthropic(config: LlmConfig, messages: Message[]): Promise<string> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const conversationMessages = messages.filter((m) => m.role !== "system")
  const system = systemMessages.map((m) => m.content).join("\n") || undefined

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      ...(system !== undefined ? { system } : {}),
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Anthropic API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>
  }

  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
}

async function callOpenAI(config: LlmConfig, messages: Message[]): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenAI API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  return data.choices[0]?.message?.content ?? ""
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/llm-client.ts
git commit -m "feat: add multi-provider LLM client (Claude + OpenAI)"
```

---

### Task 5: Create fetch-sources.ts

**Files:**
- Create: `scripts/lib/fetch-sources.ts`

- [ ] **Step 1: Create scripts/lib/fetch-sources.ts**

```typescript
import { XMLParser } from "fast-xml-parser"
import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import path from "path"
import { readFileOrEmpty, writeFileWithDirs, sha256, toSlug } from "./utils"

interface FeedEntry {
  url: string
  category: string
}

interface FeedItem {
  title: string
  link: string
  pubDate: string
  category: string
}

interface IngestCache {
  [sha: string]: { file: string; date: string }
}

export async function fetchFeeds(rawDir: string, cacheFile: string): Promise<string[]> {
  const feedsPath = path.join(rawDir, "feeds.json")
  const feedsJson = await readFileOrEmpty(feedsPath)
  if (!feedsJson) {
    console.log("No feeds.json found, skipping fetch.")
    return []
  }

  const feeds: FeedEntry[] = JSON.parse(feedsJson)
  const cache = await loadCache(cacheFile)
  const written: string[] = []

  for (const feed of feeds) {
    console.log(`Fetching feed: ${feed.url}`)
    try {
      const items = await parseFeed(feed.url, feed.category)
      console.log(`  Found ${items.length} items`)

      for (const item of items) {
        const contentHash = sha256(item.link)
        if (cache[contentHash]) {
          continue
        }

        try {
          const article = await fetchArticle(item)
          if (!article) continue

          const slug = toSlug(item.title)
          const fileName = `${slug}.md`
          const filePath = path.join(rawDir, "sources", feed.category, fileName)

          await writeFileWithDirs(filePath, article)
          written.push(filePath)

          cache[contentHash] = {
            file: path.relative(rawDir, filePath),
            date: new Date().toISOString().slice(0, 10),
          }

          console.log(`  Saved: ${feed.category}/${fileName}`)
        } catch (err) {
          console.error(`  Failed to fetch article: ${item.link}`, err)
        }
      }
    } catch (err) {
      console.error(`  Failed to parse feed: ${feed.url}`, err)
    }
  }

  await saveCache(cacheFile, cache)
  console.log(`Fetch complete: ${written.length} new articles`)
  return written
}

async function parseFeed(url: string, category: string): Promise<FeedItem[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status}`)
  }
  const xml = await response.text()
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xml)

  const items: FeedItem[] = []

  // RSS 2.0
  const rssItems = parsed?.rss?.channel?.item
  if (rssItems) {
    const list = Array.isArray(rssItems) ? rssItems : [rssItems]
    for (const item of list) {
      items.push({
        title: item.title ?? "Untitled",
        link: item.link ?? "",
        pubDate: item.pubDate ?? "",
        category,
      })
    }
    return items
  }

  // Atom
  const atomEntries = parsed?.feed?.entry
  if (atomEntries) {
    const list = Array.isArray(atomEntries) ? atomEntries : [atomEntries]
    for (const entry of list) {
      const link = typeof entry.link === "string"
        ? entry.link
        : entry.link?.["@_href"] ?? ""
      items.push({
        title: entry.title ?? "Untitled",
        link,
        pubDate: entry.published ?? entry.updated ?? "",
        category,
      })
    }
    return items
  }

  return items
}

async function fetchArticle(item: FeedItem): Promise<string | null> {
  if (!item.link) return null

  const response = await fetch(item.link)
  if (!response.ok) return null
  const html = await response.text()

  const { document } = parseHTML(html)
  const reader = new Readability(document)
  const article = reader.parse()
  if (!article?.textContent) return null

  const date = item.pubDate
    ? new Date(item.pubDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const frontmatter = [
    "---",
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `url: "${item.link}"`,
    `date: ${date}`,
    `category: ${item.category}`,
    "---",
  ].join("\n")

  return `${frontmatter}\n\n# ${item.title}\n\n${article.textContent.trim()}`
}

async function loadCache(cacheFile: string): Promise<IngestCache> {
  const raw = await readFileOrEmpty(cacheFile)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as IngestCache
  } catch {
    return {}
  }
}

async function saveCache(cacheFile: string, cache: IngestCache): Promise<void> {
  await writeFileWithDirs(cacheFile, JSON.stringify(cache, null, 2))
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/fetch-sources.ts
git commit -m "feat: add RSS feed fetcher with article extraction and dedup"
```

---

### Task 6: Create ingest.ts

**Files:**
- Create: `scripts/lib/ingest.ts`

- [ ] **Step 1: Create scripts/lib/ingest.ts**

```typescript
import path from "path"
import { chat, type Message } from "./llm-client"
import { readFileOrEmpty, writeFileWithDirs, appendToFile, sha256 } from "./utils"
import type { LlmConfig } from "../config"

const FILE_BLOCK_REGEX = /---FILE:\s*([^\n-]+?)\s*---\n([\s\S]*?)---END FILE---/g

const LANGUAGE_RULE =
  "## Language Rule\n- ALWAYS match the language of the source document. If the source is in Chinese, write in Chinese. If in English, write in English. Wiki page titles, content, and descriptions should all be in the same language as the source material."

const MAX_SOURCE_LENGTH = 50000

export async function autoIngest(
  projectPath: string,
  sourcePath: string,
  llmConfig: LlmConfig,
): Promise<string[]> {
  const fileName = path.basename(sourcePath)
  console.log(`Ingesting: ${fileName}`)

  const [sourceContent, schema, purpose, index, overview] = await Promise.all([
    readFileOrEmpty(sourcePath),
    readFileOrEmpty(path.join(projectPath, "SCHEMA.md")),
    readFileOrEmpty(path.join(projectPath, "PURPOSE.md")),
    readFileOrEmpty(path.join(projectPath, "content", "index.md")),
    readFileOrEmpty(path.join(projectPath, "content", "overview.md")),
  ])

  if (!sourceContent) {
    console.log(`  Skipped: empty source file`)
    return []
  }

  const truncatedContent =
    sourceContent.length > MAX_SOURCE_LENGTH
      ? sourceContent.slice(0, MAX_SOURCE_LENGTH) + "\n\n[...truncated...]"
      : sourceContent

  // Step 1: Analysis
  console.log(`  Step 1/2: Analyzing...`)
  const analysisPrompt = buildAnalysisPrompt(purpose, index)
  const analysis = await chat(llmConfig, [
    { role: "system", content: analysisPrompt },
    {
      role: "user",
      content: `Analyze this source document:\n\n**File:** ${fileName}\n\n---\n\n${truncatedContent}`,
    },
  ])

  // Step 2: Generation
  console.log(`  Step 2/2: Generating wiki pages...`)
  const generationPrompt = buildGenerationPrompt(schema, purpose, index, fileName, overview)
  const generation = await chat(llmConfig, [
    { role: "system", content: generationPrompt },
    {
      role: "user",
      content: [
        `Based on the following analysis of **${fileName}**, generate the wiki files.`,
        "",
        "## Source Analysis",
        "",
        analysis,
        "",
        "## Original Source Content",
        "",
        truncatedContent,
      ].join("\n"),
    },
  ])

  // Step 3: Write files
  console.log(`  Writing files...`)
  const writtenPaths = await writeFileBlocks(projectPath, generation)

  // Ensure source summary page exists
  const sourceBaseName = fileName.replace(/\.[^.]+$/, "")
  const hasSourceSummary = writtenPaths.some((p) => p.includes("sources/"))
  if (!hasSourceSummary) {
    const date = new Date().toISOString().slice(0, 10)
    const fallbackPath = path.join(projectPath, "content", "sources", `${sourceBaseName}.md`)
    const fallbackContent = [
      "---",
      `type: source`,
      `title: "Source: ${fileName}"`,
      `created: ${date}`,
      `updated: ${date}`,
      `sources: ["${fileName}"]`,
      `tags: []`,
      `related: []`,
      "---",
      "",
      `# Source: ${fileName}`,
      "",
      analysis.slice(0, 3000),
      "",
    ].join("\n")
    await writeFileWithDirs(fallbackPath, fallbackContent)
    writtenPaths.push(`content/sources/${sourceBaseName}.md`)
  }

  console.log(`  Done: ${writtenPaths.length} files written`)
  return writtenPaths
}

async function writeFileBlocks(projectPath: string, text: string): Promise<string[]> {
  const writtenPaths: string[] = []
  const matches = text.matchAll(FILE_BLOCK_REGEX)

  for (const match of matches) {
    const relativePath = match[1].trim()
    const content = match[2]
    if (!relativePath) continue

    const fullPath = path.join(projectPath, relativePath)

    try {
      if (relativePath.endsWith("log.md")) {
        await appendToFile(fullPath, content.trim())
      } else {
        await writeFileWithDirs(fullPath, content)
      }
      writtenPaths.push(relativePath)
    } catch (err) {
      console.error(`  Failed to write ${fullPath}:`, err)
    }
  }

  return writtenPaths
}

function buildAnalysisPrompt(purpose: string, index: string): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "",
    LANGUAGE_RULE,
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "List people, organizations, products, datasets, tools mentioned. For each:",
    "- Name and type",
    "- Role in the source (central vs. peripheral)",
    "- Whether it likely already exists in the wiki (check the index)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists in the wiki",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Does anything in this source conflict with existing wiki content?",
    "- Are there internal tensions or caveats?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildGenerationPrompt(
  schema: string,
  purpose: string,
  index: string,
  sourceFileName: string,
  overview?: string,
): string {
  const sourceBaseName = sourceFileName.replace(/\.[^.]+$/, "")

  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "",
    LANGUAGE_RULE,
    "",
    "## IMPORTANT: Source File",
    `The original source file is: **${sourceFileName}**`,
    "All wiki pages generated from this source MUST include this filename in their frontmatter `sources` field.",
    "",
    "## Output Format",
    "",
    "Output each wiki file in this exact format:",
    "",
    "---FILE: content/sources/filename.md---",
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Generate:",
    `1. A source summary page at **content/sources/${sourceBaseName}.md** (MUST use this exact path)`,
    "2. Entity pages in content/entities/ for key entities identified in the analysis",
    "3. Concept pages in content/concepts/ for key concepts identified in the analysis",
    "4. An updated content/index.md — add new entries to existing categories, preserve all existing entries",
    "5. A log entry for content/log.md (just the new entry to append, format: ## [YYYY-MM-DD] ingest | Title)",
    "6. An updated content/overview.md — a high-level summary of what the entire wiki covers, updated to reflect the newly ingested source.",
    "",
    "## Frontmatter Rules (CRITICAL)",
    "",
    "Every page MUST have YAML frontmatter with these fields:",
    "```yaml",
    "---",
    "type: source | entity | concept | synthesis",
    "title: Human-readable title",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    `The \`sources\` field MUST always contain "${sourceFileName}".`,
    "",
    "Other rules:",
    "- Use [[wikilink]] syntax for cross-references between pages",
    "- Use kebab-case filenames",
    "- Follow the analysis recommendations on what to emphasize",
    "- If the analysis found connections to existing pages, add cross-references",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
    index ? `## Current Wiki Index (preserve all existing entries, add new ones)\n${index}` : "",
    overview
      ? `## Current Overview (update this to reflect the new source)\n${overview}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/ingest.ts
git commit -m "feat: add two-step CoT ingest pipeline adapted from nashsu/llm_wiki"
```

---

### Task 7: Create lint.ts

**Files:**
- Create: `scripts/lib/lint.ts`

- [ ] **Step 1: Create scripts/lib/lint.ts**

```typescript
import path from "path"
import { readFileOrEmpty, extractWikilinks, listMdFiles } from "./utils"

export interface LintResult {
  type: "orphan" | "broken-link" | "no-outlinks"
  severity: "warning" | "info"
  page: string
  detail: string
}

const EXCLUDED_FROM_ORPHAN_CHECK = new Set(["index.md", "log.md", "overview.md"])

export async function runStructuralLint(contentDir: string): Promise<LintResult[]> {
  const allFiles = await listMdFiles(contentDir)
  if (allFiles.length === 0) return []

  // Build slug map: slug → absolute path
  const slugMap = new Map<string, string>()
  for (const filePath of allFiles) {
    const slug = path.basename(filePath, ".md")
    slugMap.set(slug, filePath)
  }

  // Read all pages and extract outlinks
  const pages: Array<{
    path: string
    name: string
    slug: string
    outlinks: string[]
  }> = []

  for (const filePath of allFiles) {
    const content = await readFileOrEmpty(filePath)
    const name = path.relative(contentDir, filePath)
    const slug = path.basename(filePath, ".md")
    const outlinks = extractWikilinks(content)
    pages.push({ path: filePath, name, slug, outlinks })
  }

  // Build inbound link counts
  const inboundCounts = new Map<string, number>()
  for (const page of pages) {
    for (const link of page.outlinks) {
      const targetSlug = resolveSlug(link, slugMap)
      if (targetSlug) {
        inboundCounts.set(targetSlug, (inboundCounts.get(targetSlug) ?? 0) + 1)
      }
    }
  }

  const results: LintResult[] = []

  for (const page of pages) {
    const baseName = path.basename(page.path)

    // Orphan: no inbound links (skip structural pages)
    if (!EXCLUDED_FROM_ORPHAN_CHECK.has(baseName)) {
      const inbound = inboundCounts.get(page.slug) ?? 0
      if (inbound === 0) {
        results.push({
          type: "orphan",
          severity: "info",
          page: page.name,
          detail: "No other pages link to this page.",
        })
      }
    }

    // No outbound links
    if (page.outlinks.length === 0 && !EXCLUDED_FROM_ORPHAN_CHECK.has(baseName)) {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: page.name,
        detail: "This page has no [[wikilink]] references to other pages.",
      })
    }

    // Broken links
    for (const link of page.outlinks) {
      const resolved = resolveSlug(link, slugMap)
      if (!resolved) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: page.name,
          detail: `Broken link: [[${link}]] — target page not found.`,
        })
      }
    }
  }

  return results
}

function resolveSlug(raw: string, slugMap: Map<string, string>): string | null {
  if (slugMap.has(raw)) return raw

  const normalized = raw.toLowerCase().replace(/\s+/g, "-")
  for (const slug of slugMap.keys()) {
    if (slug.toLowerCase() === normalized) return slug
    if (slug.toLowerCase() === raw.toLowerCase()) return slug
  }

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/lint.ts
git commit -m "feat: add structural wiki lint (orphans, broken links, no-outlinks)"
```

---

### Task 8: Create migrate.ts

**Files:**
- Create: `scripts/lib/migrate.ts`

- [ ] **Step 1: Create scripts/lib/migrate.ts**

```typescript
import path from "path"
import fs from "fs/promises"
import { autoIngest } from "./ingest"
import { writeFileWithDirs, listMdFiles } from "./utils"
import type { LlmConfig } from "../config"

const SKIP_FILES = new Set(["index.md", "log.md", "overview.md"])

export async function migrateExisting(
  projectPath: string,
  contentDir: string,
  rawDir: string,
  llmConfig: LlmConfig,
): Promise<void> {
  const allFiles = await listMdFiles(contentDir)
  const toMigrate = allFiles.filter(
    (f) => !SKIP_FILES.has(path.basename(f)),
  )

  if (toMigrate.length === 0) {
    console.log("No files to migrate.")
    return
  }

  console.log(`Found ${toMigrate.length} files to migrate.`)

  for (const filePath of toMigrate) {
    const relativeName = path.relative(contentDir, filePath)
    const legacyPath = path.join(rawDir, "sources", "legacy", relativeName)

    // Copy to raw/sources/legacy/
    const content = await fs.readFile(filePath, "utf-8")
    await writeFileWithDirs(legacyPath, content)
    console.log(`Copied to raw: ${relativeName}`)

    // Ingest through the pipeline
    try {
      await autoIngest(projectPath, legacyPath, llmConfig)
    } catch (err) {
      console.error(`Failed to ingest ${relativeName}:`, err)
    }
  }

  console.log("Migration complete. Original files preserved — verify and remove manually.")
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/migrate.ts
git commit -m "feat: add one-time migration script for existing notes"
```

---

### Task 9: Create CLI Entry Point evolve.ts

**Files:**
- Create: `scripts/evolve.ts`

- [ ] **Step 1: Create scripts/evolve.ts**

```typescript
import path from "path"
import { loadConfig } from "./config"
import { fetchFeeds } from "./lib/fetch-sources"
import { autoIngest } from "./lib/ingest"
import { runStructuralLint } from "./lib/lint"
import { migrateExisting } from "./lib/migrate"
import { listMdFiles, readFileOrEmpty } from "./lib/utils"

const COMMANDS = ["fetch", "ingest", "lint", "run", "migrate"] as const
type Command = (typeof COMMANDS)[number]

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined

  if (!command || !COMMANDS.includes(command)) {
    console.log("Usage: npx tsx scripts/evolve.ts <command>")
    console.log("")
    console.log("Commands:")
    console.log("  fetch    Fetch new articles from RSS feeds")
    console.log("  ingest   Ingest unprocessed raw sources")
    console.log("  lint     Run structural lint checks")
    console.log("  run      Full pipeline: fetch → ingest → lint")
    console.log("  migrate  One-time: migrate existing notes")
    process.exit(1)
  }

  switch (command) {
    case "fetch":
      await runFetch()
      break
    case "ingest":
      await runIngest()
      break
    case "lint":
      await runLint()
      break
    case "run":
      await runFetch()
      await runIngest()
      await runLint()
      break
    case "migrate":
      await runMigrate()
      break
  }
}

async function runFetch(): Promise<void> {
  const config = loadConfig()
  console.log("=== Fetch ===")
  const newFiles = await fetchFeeds(config.paths.raw, config.paths.cache)
  console.log(`Fetched ${newFiles.length} new articles.\n`)
}

async function runIngest(): Promise<void> {
  const config = loadConfig()
  console.log("=== Ingest ===")

  // Find all raw source files
  const rawSourcesDir = path.join(config.paths.raw, "sources")
  const allRawFiles = await listMdFiles(rawSourcesDir)

  // Load cache to find unprocessed files
  const cacheRaw = await readFileOrEmpty(config.paths.cache)
  const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
  const processedFiles = new Set(Object.values(cache).map((v: any) => v.file))

  const unprocessed = allRawFiles.filter((f) => {
    const relative = path.relative(config.paths.raw, f)
    return !processedFiles.has(relative)
  })

  if (unprocessed.length === 0) {
    console.log("No unprocessed sources found.\n")
    return
  }

  console.log(`Found ${unprocessed.length} sources to ingest.`)

  let totalWritten = 0
  for (const sourcePath of unprocessed) {
    try {
      const written = await autoIngest(config.paths.root, sourcePath, config.llm)
      totalWritten += written.length
    } catch (err) {
      console.error(`Failed to ingest ${sourcePath}:`, err)
    }
  }

  console.log(`Ingest complete: ${totalWritten} wiki pages written.\n`)
}

async function runLint(): Promise<void> {
  const config = loadConfig()
  console.log("=== Lint ===")
  const results = await runStructuralLint(config.paths.content)

  if (results.length === 0) {
    console.log("No issues found.\n")
    return
  }

  const warnings = results.filter((r) => r.severity === "warning")
  const infos = results.filter((r) => r.severity === "info")

  for (const result of warnings) {
    console.log(`  WARNING [${result.type}] ${result.page}: ${result.detail}`)
  }
  for (const result of infos) {
    console.log(`  INFO    [${result.type}] ${result.page}: ${result.detail}`)
  }

  console.log(`\nLint: ${warnings.length} warnings, ${infos.length} info.\n`)
}

async function runMigrate(): Promise<void> {
  const config = loadConfig()
  console.log("=== Migrate ===")
  await migrateExisting(config.paths.root, config.paths.content, config.paths.raw, config.llm)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Test CLI help output**

```bash
npx tsx scripts/evolve.ts
```

Expected output:
```
Usage: npx tsx scripts/evolve.ts <command>

Commands:
  fetch    Fetch new articles from RSS feeds
  ingest   Ingest unprocessed raw sources
  lint     Run structural lint checks
  run      Full pipeline: fetch → ingest → lint
  migrate  One-time: migrate existing notes
```

- [ ] **Step 3: Test lint on existing content**

```bash
npx tsx scripts/evolve.ts lint
```

This should run structural lint on the existing 49 markdown files and report results.

- [ ] **Step 4: Commit**

```bash
git add scripts/evolve.ts
git commit -m "feat: add CLI entry point for llm-wiki evolution pipeline"
```

---

### Task 10: Update Quartz Config

**Files:**
- Modify: `quartz.config.ts`

- [ ] **Step 1: Add scripts and raw to ignorePatterns**

In `quartz.config.ts`, add `"scripts"` and `"raw"` to the `ignorePatterns` array so Quartz doesn't try to process them as content:

Find:
```typescript
ignorePatterns: ["Private", "Templates", ".obsidian"],
```

Replace with:
```typescript
ignorePatterns: ["Private", "Templates", ".obsidian", "scripts", "raw"],
```

- [ ] **Step 2: Verify Quartz still builds**

```bash
npx quartz build
```

Expected: successful build with no errors.

- [ ] **Step 3: Commit**

```bash
git add quartz.config.ts
git commit -m "fix: add scripts and raw to Quartz ignorePatterns"
```

---

### Task 11: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/evolve.yml`

- [ ] **Step 1: Create .github/workflows/evolve.yml**

```yaml
name: Wiki-Evolve

on:
  schedule:
    - cron: '0 2 * * 1'
  workflow_dispatch:

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

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/evolve.yml
git commit -m "ci: add weekly wiki evolution workflow"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Run fetch to test RSS fetching**

```bash
npx tsx scripts/evolve.ts fetch
```

Verify that articles appear in `raw/sources/AI/` (or whatever categories are in feeds.json).

- [ ] **Step 2: Run ingest on a fetched article**

```bash
ANTHROPIC_API_KEY=your-key-here npx tsx scripts/evolve.ts ingest
```

Verify that wiki pages appear in `content/entities/`, `content/concepts/`, `content/sources/`.

- [ ] **Step 3: Run lint on generated content**

```bash
npx tsx scripts/evolve.ts lint
```

Verify lint output reports orphans, broken links, etc.

- [ ] **Step 4: Run Quartz build**

```bash
npx quartz build
```

Verify: no build errors, generated wiki pages are included in output.

- [ ] **Step 5: Run full pipeline**

```bash
ANTHROPIC_API_KEY=your-key-here npx tsx scripts/evolve.ts run
```

Verify the complete flow works end-to-end.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: LLM Wiki Phase 1 complete — fetch, ingest, lint, CI pipeline"
```
