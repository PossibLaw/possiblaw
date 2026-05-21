/**
 * PossibLaw — Ollama HTTP client.
 * Uses built-in fetch (Node 18+). No additional dependencies.
 */

const OLLAMA_HOST = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.1:8b';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: { temperature?: number };
  format?: 'json';
}

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
}

interface OllamaVersionResponse {
  version?: string;
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as OllamaVersionResponse;
    return typeof data.version === 'string';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { temperature?: number; format?: 'json' }
): Promise<string> {
  const body: OllamaChatRequest = {
    model: OLLAMA_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: true,
    options: opts?.temperature != null ? { temperature: opts.temperature } : undefined,
    format: opts?.format,
  };

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('network')) {
      throw new Error(
        `Ollama is not running at ${OLLAMA_HOST}. Start Ollama with "ollama serve" before using the privacy filter in LLM mode.`
      );
    }
    throw new Error(`Ollama request failed: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404 && text.includes('model')) {
      throw new Error(
        `Ollama model '${OLLAMA_MODEL}' not found. Run "ollama pull ${OLLAMA_MODEL}" to install it.`
      );
    }
    throw new Error(`Ollama HTTP ${res.status}: ${text}`);
  }

  // Parse NDJSON streaming response
  const rawText = await res.text();
  const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
  let assembled = '';
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line) as OllamaChatChunk;
      if (chunk.message?.content) {
        assembled += chunk.message.content;
      }
    } catch {
      // skip malformed lines
    }
  }
  return assembled;
}
