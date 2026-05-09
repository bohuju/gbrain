import { readFileSync, statSync, lstatSync } from 'fs';
import { createHash } from 'crypto';
import type { BrainEngine } from './engine.ts';
import { parseMarkdown } from './markdown.ts';
import { chunkText } from './chunkers/recursive.ts';
import { chunkCode } from './chunkers/code.ts';
import { detectCodeLanguage } from './code/languages.ts';
import { extractSymbols } from './code/symbol-extractor.ts';
import { extractReferences } from './code/reference-extractor.ts';
import { embedBatch } from './embedding.ts';
import { slugifyCodePath, slugifyPath } from './sync.ts';
import type { ChunkInput, PageType } from './types.ts';

/**
 * The parsed page metadata returned by importFromContent. Callers (specifically
 * the put_page operation handler running auto-link post-hook) can reuse this to
 * avoid re-parsing the same content.
 */
export interface ParsedPage {
  type: PageType;
  title: string;
  compiled_truth: string;
  timeline: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
}

export interface ImportResult {
  slug: string;
  status: 'imported' | 'skipped' | 'error';
  chunks: number;
  error?: string;
  /**
   * Parsed page content. Present for status='imported' AND status='skipped'
   * (skip happens when content is identical to existing page; auto-link still
   * needs to run for reconciliation in case links table drifted from page text).
   * Absent only on status='error' (early payload-size rejection).
   */
  parsedPage?: ParsedPage;
}

export interface CodeImportResult {
  slug: string;
  status: 'imported' | 'skipped' | 'error';
  chunks: number;
  language: string;
  error?: string;
}

const MAX_FILE_SIZE = 5_000_000; // 5MB

export function codePathToSlug(relativePath: string): string {
  return `code/${slugifyCodePath(relativePath)}`;
}

function pushCodeChunks(
  chunks: ChunkInput[],
  text: string,
  opts: {
    startLineOffset?: number;
    symbolName?: string;
    symbolKind?: string;
  } = {},
): void {
  const startLineOffset = opts.startLineOffset ?? 0;
  for (const chunk of chunkCode(text, { maxLines: 80, overlapLines: 5 })) {
    chunks.push({
      chunk_index: chunks.length,
      chunk_text: chunk.text,
      chunk_source: 'source_code',
      start_line: startLineOffset + chunk.startLine,
      end_line: startLineOffset + chunk.endLine,
      symbol_name: opts.symbolName,
      symbol_kind: opts.symbolKind,
    });
  }
}

/**
 * Import content from a string. Core pipeline:
 * parse -> hash -> embed (external) -> transaction(version + putPage + tags + chunks)
 *
 * Used by put_page operation and importFromFile.
 *
 * Size guard: content is rejected if its UTF-8 byte length exceeds MAX_FILE_SIZE.
 * importFromFile already enforces this against disk size before calling here, but
 * the remote MCP put_page operation passes caller-supplied content straight in,
 * so the guard has to live on this function — otherwise an authenticated caller
 * can spend the owner's OpenAI budget at will by shipping a megabyte-sized page.
 */
export async function importFromContent(
  engine: BrainEngine,
  slug: string,
  content: string,
  opts: { noEmbed?: boolean } = {},
): Promise<ImportResult> {
  // Reject oversized payloads before any parsing, chunking, or embedding happens.
  // Uses Buffer.byteLength to count UTF-8 bytes the same way disk size would,
  // so the network path behaves identically to the file path.
  const byteLength = Buffer.byteLength(content, 'utf-8');
  if (byteLength > MAX_FILE_SIZE) {
    return {
      slug,
      status: 'skipped',
      chunks: 0,
      error: `Content too large (${byteLength} bytes, max ${MAX_FILE_SIZE}). Split the content into smaller files or remove large embedded assets.`,
    };
  }

  const parsed = parseMarkdown(content, slug + '.md');

  // Hash includes ALL fields for idempotency (not just compiled_truth + timeline)
  const hash = createHash('sha256')
    .update(JSON.stringify({
      title: parsed.title,
      type: parsed.type,
      compiled_truth: parsed.compiled_truth,
      timeline: parsed.timeline,
      frontmatter: parsed.frontmatter,
      tags: parsed.tags.sort(),
    }))
    .digest('hex');

  const parsedPage: ParsedPage = {
    type: parsed.type,
    title: parsed.title,
    compiled_truth: parsed.compiled_truth,
    timeline: parsed.timeline || '',
    frontmatter: parsed.frontmatter,
    tags: parsed.tags,
  };

  const existing = await engine.getPage(slug);
  if (existing?.content_hash === hash) {
    return { slug, status: 'skipped', chunks: 0, parsedPage };
  }

  // Chunk compiled_truth and timeline
  const chunks: ChunkInput[] = [];
  if (parsed.compiled_truth.trim()) {
    for (const c of chunkText(parsed.compiled_truth)) {
      chunks.push({ chunk_index: chunks.length, chunk_text: c.text, chunk_source: 'compiled_truth' });
    }
  }
  if (parsed.timeline?.trim()) {
    for (const c of chunkText(parsed.timeline)) {
      chunks.push({ chunk_index: chunks.length, chunk_text: c.text, chunk_source: 'timeline' });
    }
  }

  // Embed BEFORE the transaction (external API call)
  if (!opts.noEmbed && chunks.length > 0) {
    try {
      const embeddings = await embedBatch(chunks.map(c => c.chunk_text));
      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i];
        chunks[i].token_count = Math.ceil(chunks[i].chunk_text.length / 4);
      }
    } catch (e: unknown) {
      console.warn(`[gbrain] embedding failed for ${slug} (${chunks.length} chunks): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Transaction wraps all DB writes
  await engine.transaction(async (tx) => {
    if (existing) await tx.createVersion(slug);

    await tx.putPage(slug, {
      type: parsed.type,
      title: parsed.title,
      compiled_truth: parsed.compiled_truth,
      timeline: parsed.timeline || '',
      frontmatter: parsed.frontmatter,
      content_hash: hash,
    });

    // Tag reconciliation: remove stale, add current
    const existingTags = await tx.getTags(slug);
    const newTags = new Set(parsed.tags);
    for (const old of existingTags) {
      if (!newTags.has(old)) await tx.removeTag(slug, old);
    }
    for (const tag of parsed.tags) {
      await tx.addTag(slug, tag);
    }

    if (chunks.length > 0) {
      await tx.upsertChunks(slug, chunks);
    } else {
      // Content is empty — delete stale chunks so they don't ghost in search results
      await tx.deleteChunks(slug);
    }
  });

  return { slug, status: 'imported', chunks: chunks.length, parsedPage };
}

/**
 * Import from a file path. Validates size, reads content, delegates to importFromContent.
 *
 * Slug authority: the path on disk is the source of truth. `frontmatter.slug`
 * is only accepted when it matches `slugifyPath(relativePath)`. A mismatch is
 * rejected rather than silently honored — otherwise a file at `notes/random.md`
 * could declare `slug: people/elon` in frontmatter and overwrite the legitimate
 * `people/elon` page on the next `gbrain sync` or `gbrain import`. In shared
 * brains where PRs are mergeable, this is a silent page-hijack primitive.
 */
export async function importFromFile(
  engine: BrainEngine,
  filePath: string,
  relativePath: string,
  opts: { noEmbed?: boolean } = {},
): Promise<ImportResult> {
  // Defense-in-depth: reject symlinks before reading content.
  const lstat = lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    return { slug: relativePath, status: 'skipped', chunks: 0, error: `Skipping symlink: ${filePath}` };
  }

  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    return { slug: relativePath, status: 'skipped', chunks: 0, error: `File too large (${stat.size} bytes)` };
  }

  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseMarkdown(content, relativePath);

  // Enforce path-authoritative slug. parseMarkdown prefers frontmatter.slug over
  // the path-derived slug, so a mismatch here means the frontmatter is trying
  // to rewrite a page whose filesystem location says something different.
  const expectedSlug = slugifyPath(relativePath);
  if (parsed.slug !== expectedSlug) {
    return {
      slug: expectedSlug,
      status: 'skipped',
      chunks: 0,
      error:
        `Frontmatter slug "${parsed.slug}" does not match path-derived slug "${expectedSlug}" ` +
        `(from ${relativePath}). Remove the frontmatter "slug:" line or move the file.`,
    };
  }

  // Pass the path-derived slug explicitly so that any future change to
  // parseMarkdown's precedence rules cannot re-introduce this bug.
  return importFromContent(engine, expectedSlug, content, opts);
}

export async function importCodeFile(
  engine: BrainEngine,
  filePath: string,
  relativePath: string,
  opts: { noEmbed?: boolean } = {},
): Promise<CodeImportResult> {
  const lstat = lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    return { slug: codePathToSlug(relativePath), status: 'skipped', chunks: 0, language: 'code', error: `Skipping symlink: ${filePath}` };
  }

  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    return { slug: codePathToSlug(relativePath), status: 'skipped', chunks: 0, language: 'code', error: `File too large (${stat.size} bytes)` };
  }

  const content = readFileSync(filePath, 'utf-8');
  const byteLength = Buffer.byteLength(content, 'utf-8');
  const slug = codePathToSlug(relativePath);
  const language = detectCodeLanguage(relativePath);
  const frontmatter = {
    language,
    file_path: relativePath.replace(/\\/g, '/'),
    size_bytes: byteLength,
  };

  const hash = createHash('sha256')
    .update(JSON.stringify({
      title: relativePath,
      type: 'code_file',
      compiled_truth: content,
      timeline: '',
      frontmatter,
      tags: [language],
    }))
    .digest('hex');

  const existing = await engine.getPage(slug);
  if (existing?.content_hash === hash) {
    return { slug, status: 'skipped', chunks: 0, language };
  }

  const symbols = await extractSymbols(content, language);
  const references = await extractReferences(
    content,
    language,
    relativePath,
    new Set(symbols.map(s => s.name)),
  );
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const chunks: ChunkInput[] = [];
  if (symbols.length > 0) {
    const covered = new Array(lines.length).fill(false);
    for (const symbol of symbols) {
      for (let line = symbol.startLine; line <= Math.min(symbol.endLine, lines.length); line++) {
        covered[line - 1] = true;
      }
      const symbolText = lines.slice(symbol.startLine - 1, symbol.endLine).join('\n');
      pushCodeChunks(chunks, symbolText, {
        startLineOffset: symbol.startLine - 1,
        symbolName: symbol.name,
        symbolKind: symbol.kind,
      });
    }

    let runStart: number | null = null;
    for (let i = 0; i <= lines.length; i++) {
      const isCovered = i < lines.length ? covered[i] : true;
      if (!isCovered) {
        runStart ??= i;
        continue;
      }
      if (runStart === null) continue;
      const runText = lines.slice(runStart, i).join('\n');
      if (runText.trim()) {
        pushCodeChunks(chunks, runText, { startLineOffset: runStart });
      }
      runStart = null;
    }
  } else {
    pushCodeChunks(chunks, content);
  }

  if (!opts.noEmbed && chunks.length > 0) {
    try {
      const embeddings = await embedBatch(chunks.map(c => c.chunk_text));
      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i];
        chunks[i].token_count = Math.ceil(chunks[i].chunk_text.length / 4);
      }
    } catch (e: unknown) {
      console.warn(`[gbrain] embedding failed for ${slug} (${chunks.length} chunks): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await engine.transaction(async (tx) => {
    if (existing) await tx.createVersion(slug);

    await tx.putPage(slug, {
      type: 'code_file',
      title: relativePath,
      compiled_truth: content,
      timeline: '',
      frontmatter,
      content_hash: hash,
    });

    const existingTags = await tx.getTags(slug);
    for (const old of existingTags) {
      if (old !== language) await tx.removeTag(slug, old);
    }
    await tx.addTag(slug, language);

    if (chunks.length > 0) {
      await tx.upsertChunks(slug, chunks);
    } else {
      await tx.deleteChunks(slug);
    }

    // Match the engine's removeLink pattern: slug-only subquery (no source_id filter)
    // so the DELETE works regardless of which source the page belongs to.
    await tx.executeRaw(
      `DELETE FROM links
       WHERE link_source = 'code_import'
         AND from_page_id = (SELECT id FROM pages WHERE slug = $1)`,
      [slug],
    );
    if (references.length > 0) {
      await tx.addLinksBatch(references.map(ref => ({
        from_slug: slug,
        to_slug: ref.toPath,
        link_type: ref.refType,
        context: `${relativePath}:${ref.lineNumber}`,
        link_source: 'code_import',
        origin_slug: slug,
      })));
    }
  });

  return { slug, status: 'imported', chunks: chunks.length, language };
}

// Backward compat
export const importFile = importFromFile;
export type ImportFileResult = ImportResult;
