import path from "path"
import { loadConfig, loadPaths } from "./config"
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
  const paths = loadPaths()
  console.log("=== Fetch ===")
  const newFiles = await fetchFeeds(paths.raw, paths.cache)
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
  const paths = loadPaths()
  console.log("=== Lint ===")
  const results = await runStructuralLint(paths.content)

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
