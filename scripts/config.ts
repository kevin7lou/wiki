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
