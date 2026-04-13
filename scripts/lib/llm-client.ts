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
