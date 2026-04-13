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
