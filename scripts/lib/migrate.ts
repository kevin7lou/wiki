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
