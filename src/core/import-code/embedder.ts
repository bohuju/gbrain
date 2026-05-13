import { embedBatch } from '../embedding';
import type { BrainEngine } from '../engine';

export interface EmbedResult {
  total: number;
  embedded: number;
  failed: number;
}

/**
 * Generate embeddings for code chunks that were inserted without embeddings.
 *
 * Does NOT insert chunks — assumes chunks are already in GBrain via
 * importFromContent (called by the import orchestrator).
 *
 * Strategy:
 * 1. Query all code chunks with NULL embedding
 * 2. Batch-embed their chunk_text via MiniMax
 * 3. Update each chunk's embedding column
 */
export async function embedCodeChunks(
  engine: BrainEngine,
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<EmbedResult> {
  // Find code chunks without embeddings
  const raw = await engine.executeRaw<{ id: number; chunk_text: string }>(`
    SELECT cc.id, cc.chunk_text
    FROM content_chunks cc
    JOIN pages p ON p.id = cc.page_id
    WHERE p.source_id = 'code'
      AND cc.embedding IS NULL
      AND cc.chunk_text != ''
    ORDER BY cc.id
  `);

  if (raw.length === 0) return { total: 0, embedded: 0, failed: 0 };

  const texts = raw.map(r => r.chunk_text);

  // Batch embed (MiniMax via existing embedBatch)
  let failed = 0;
  const embeddings: Float32Array[] = [];
  try {
    const results = await embedBatch(texts, {
      onBatchComplete: (done, total) => options.onProgress?.(done, total),
    });
    embeddings.push(...results);
  } catch (e) {
    console.error('[gbrain] Embed batch failed:', e instanceof Error ? e.message : String(e));
    failed = texts.length;
    return { total: texts.length, embedded: 0, failed };
  }

  // Update embeddings in DB (batch UPDATE via pgvector)
  // Postgres vector format: '[1.2,3.4,...]'
  for (let i = 0; i < raw.length; i++) {
    const emb = embeddings[i];
    if (!emb) { failed++; continue; }
    const vectorStr = '[' + Array.from(emb).join(',') + ']';
    try {
      await engine.executeRaw(
        `UPDATE content_chunks SET embedding = $1::vector, embedded_at = now() WHERE id = $2`,
        [vectorStr, raw[i].id],
      );
    } catch (e) {
      console.error(`[gbrain] Failed to update embedding for chunk ${raw[i].id}:`, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  return { total: texts.length, embedded: texts.length - failed, failed };
}
