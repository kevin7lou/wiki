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
