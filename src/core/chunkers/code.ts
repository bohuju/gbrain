export interface CodeChunk {
  text: string;
  index: number;
  startLine: number;
  endLine: number;
}

export interface CodeChunkOptions {
  maxLines?: number;
  overlapLines?: number;
}

interface Block {
  start: number;
  end: number;
}

function countIndent(line: string): number {
  const match = line.match(/^[\t ]*/);
  return match ? match[0].replace(/\t/g, '  ').length : 0;
}

function splitBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let start: number | null = null;
  let baseIndent = 0;
  let lastNonBlank = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const indent = countIndent(line);
    if (start === null) {
      start = i;
      baseIndent = indent;
    } else if (lastNonBlank >= 0 && lines[lastNonBlank + 1]?.trim() === '' && indent <= baseIndent) {
      blocks.push({ start, end: lastNonBlank });
      start = i;
      baseIndent = indent;
    }
    lastNonBlank = i;
  }

  if (start !== null && lastNonBlank >= start) {
    blocks.push({ start, end: lastNonBlank });
  }

  return blocks;
}

export function chunkCode(source: string, opts: CodeChunkOptions = {}): CodeChunk[] {
  if (source.trim() === '') return [];

  const maxLines = Math.max(1, opts.maxLines ?? 80);
  const overlapLines = Math.max(0, Math.min(opts.overlapLines ?? 5, maxLines - 1));
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks = splitBlocks(lines);
  const chunks: CodeChunk[] = [];

  for (const block of blocks) {
    let start = block.start;
    while (start <= block.end) {
      const end = Math.min(block.end, start + maxLines - 1);
      chunks.push({
        text: lines.slice(start, end + 1).join('\n'),
        index: chunks.length,
        startLine: start + 1,
        endLine: end + 1,
      });
      if (end >= block.end) break;
      start = Math.max(start + 1, end - overlapLines + 1);
    }
  }

  return chunks.filter(c => c.text.trim() !== '').map((chunk, index) => ({ ...chunk, index }));
}
