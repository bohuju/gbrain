/**
 * Embedding Service
 * Ported from production Ruby implementation (embedding_service.rb, 190 LOC)
 *
 * Supports two backends:
 *   - OpenAI (default): text-embedding-3-large, 1536 dims
 *   - MiniMax (EMBEDDING_BACKEND=minimax): embo-01, 1536 dims
 *
 * Retry with exponential backoff + jitter (4s base, 120s cap, 5 retries).
 * 8000 character input truncation.
 */

import OpenAI from 'openai';

const MAX_CHARS = 8000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 4000;
const MAX_DELAY_MS = 120000;
const BATCH_SIZE = 100;

// Backend selection via env var (read at module load time; for dynamic config
// use getEmbeddingModel() / getEmbeddingDimensions() instead)
const BACKEND = process.env.EMBEDDING_BACKEND || 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

/**
 * MiniMax embedding API.
 * Returns Float32Array of 1536 floats.
 */
async function minimaxEmbed(texts: string[]): Promise<Float32Array[]> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      'MINIMAX_API_KEY must be set when EMBEDDING_BACKEND=minimax',
    );
  }

  const truncated = texts.map(t => t.slice(0, MAX_CHARS));

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.minimax.chat/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'embo-01',
          texts: truncated,
          type: 'db',
        }),
      });

      // Non-retryable HTTP errors → fail fast
      if (response.status === 401 || response.status === 403) {
        const errText = await response.text();
        throw new Error(
          `MiniMax embedding auth error (${response.status}): ${errText}`,
        );
      }
      if (response.status === 400) {
        const errText = await response.text();
        throw new Error(
          `MiniMax embedding bad request (400): ${errText}`,
        );
      }
      if (!response.ok) {
        // 429 / 5xx → retry
        if (attempt === MAX_RETRIES - 1) {
          const errText = await response.text();
          throw new Error(
            `MiniMax embedding HTTP ${response.status} (exhausted retries): ${errText}`,
          );
        }
        await sleep(jitteredDelay(attempt));
        continue;
      }

      const raw = await response.json() as {
        vectors?: number[][];
        base_resp?: { status_code?: number; status_msg?: string };
      };

      // Validate response shape
      if (!Array.isArray(raw?.vectors)) {
        throw new Error(
          `MiniMax embedding: unexpected response shape (vectors missing or not an array): ${JSON.stringify(raw).slice(0, 200)}`,
        );
      }
      if (raw.base_resp?.status_code && raw.base_resp.status_code !== 0) {
        throw new Error(
          `MiniMax embedding API error: ${raw.base_resp.status_msg || `code ${raw.base_resp.status_code}`}`,
        );
      }

      return raw.vectors.map(v => new Float32Array(v));
    } catch (e: unknown) {
      // Rethrow non-retryable errors (auth, bad request, shape validation)
      if (
        e instanceof Error &&
        (e.message.includes('auth error') ||
          e.message.includes('bad request') ||
          e.message.includes('unexpected response shape') ||
          e.message.includes('API error'))
      ) {
        throw e;
      }
      // Transient error → retry
      if (attempt === MAX_RETRIES - 1) throw e;
      await sleep(jitteredDelay(attempt));
    }
  }

  throw new Error('MiniMax embedding failed after all retries');
}

/**
 * OpenAI embedding API (original implementation, unchanged behavior).
 */
async function openaiEmbedBatchWithRetry(texts: string[]): Promise<Float32Array[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await getOpenAIClient().embeddings.create({
        model: 'text-embedding-3-large',
        input: texts,
        dimensions: 1536,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => new Float32Array(d.embedding));
    } catch (e: unknown) {
      if (attempt === MAX_RETRIES - 1) throw e;

      let delay = jitteredDelay(attempt);

      if (e instanceof OpenAI.APIError && e.status === 429) {
        const retryAfter = (e as any).headers?.['retry-after'];
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) {
            delay = parsed * 1000;
          }
        }
      }

      await sleep(delay);
    }
  }

  throw new Error('OpenAI embedding failed after all retries');
}

export async function embed(text: string): Promise<Float32Array> {
  const result = await embedBatch([text]);
  return result[0];
}

export interface EmbedBatchOptions {
  /**
   * Optional callback fired after each 100-item sub-batch completes.
   * CLI wrappers tick a reporter; Minion handlers can call
   * job.updateProgress here instead of hooking the per-page callback.
   */
  onBatchComplete?: (done: number, total: number) => void;
}

export async function embedBatch(
  texts: string[],
  options: EmbedBatchOptions = {},
): Promise<Float32Array[]> {
  const truncated = texts.map(t => t.slice(0, MAX_CHARS));
  const results: Float32Array[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < truncated.length; i += BATCH_SIZE) {
    const batch = truncated.slice(i, i + BATCH_SIZE);
    const batchResults = BACKEND === 'minimax'
      ? await minimaxEmbed(batch)
      : await openaiEmbedBatchWithRetry(batch);
    results.push(...batchResults);
    options.onBatchComplete?.(results.length, truncated.length);
  }

  return results;
}

/**
 * Exponential backoff with randomized jitter to avoid thundering herd.
 * delay = min(BASE * 2^attempt * (0.5 + random * 0.5), MAX)
 */
function jitteredDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
  return Math.min(delay, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Module-level constants (evaluated at import time).
// For dynamic config, use the getter functions below.
export const EMBEDDING_MODEL = BACKEND === 'minimax' ? 'embo-01' : 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;

/** Dynamic getter for embedding model name (reads env var at call time). */
export function getEmbeddingModel(): string {
  const backend = process.env.EMBEDDING_BACKEND || 'openai';
  return backend === 'minimax' ? 'embo-01' : 'text-embedding-3-large';
}

/** Dynamic getter for embedding dimensions. */
export function getEmbeddingDimensions(): number {
  return 1536;
}
