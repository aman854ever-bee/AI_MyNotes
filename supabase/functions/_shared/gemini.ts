// Shared Gemini API caller for edge functions (analyze, chat).
//
// Both functions used to call Anthropic's Messages API directly, each with
// its own copy of the request/response plumbing. This file is the one
// place that knows how to talk to an LLM provider — a future provider
// swap (back to Anthropic, to OpenAI, whatever) means changing this file,
// not every function that needs a model.
//
// Deploy secret: supabase secrets set GEMINI_API_KEY=your-key-here
// Model:         optionally supabase secrets set GEMINI_MODEL=... to
//                override the default below — check
//                https://ai.google.dev/gemini-api/docs/models for the
//                current recommended fast/cheap model if this one 404s.
//
// Free-tier note (Aman, 2026-09-12): running on Gemini's free tier is a
// deliberate choice for now (R&D, not production) — Google may review
// free-tier prompts/responses to improve their products. Revisit if this
// app ever handles someone else's meeting content, not just Aman's own.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY)
}

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CallGeminiOptions {
  /** System instruction — equivalent to Anthropic's top-level `system` param. */
  system: string
  messages: LlmMessage[]
  maxOutputTokens: number
  /** Ask Gemini to return `application/json`. Still parse defensively on the
   *  caller side — a JSON mime type doesn't guarantee the model never adds
   *  stray text, just makes it much less likely. */
  jsonMode?: boolean
}

export class GeminiApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(`Gemini API error ${status}`)
    this.status = status
    this.detail = detail
  }
}

export async function callGemini(opts: CallGeminiOptions): Promise<{ text: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const body = {
    contents: opts.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    systemInstruction: { parts: [{ text: opts.system }] },
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new GeminiApiError(response.status, detail)
  }

  const result = await response.json()
  const candidate = result?.candidates?.[0]
  const parts: Array<{ text?: string }> = candidate?.content?.parts ?? []
  const text = parts.map((p) => p.text ?? '').join('')

  if (!text) {
    const finishReason = candidate?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      // e.g. SAFETY, MAX_TOKENS, RECITATION — worth a clearer error than a blank reply.
      throw new Error(`Gemini stopped without a full answer (finishReason: ${finishReason})`)
    }
  }

  return { text }
}
