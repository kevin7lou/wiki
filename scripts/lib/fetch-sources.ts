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
