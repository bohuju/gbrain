export type CodeSymbolKind = 'function' | 'class' | 'method' | 'interface' | 'type' | 'const' | 'variable';

export interface CodeSymbol {
  name: string;
  kind: CodeSymbolKind;
  qualifiedName?: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
  visibility: 'public' | 'private' | 'protected';
  isExported: boolean;
}

interface Candidate {
  name: string;
  kind: CodeSymbolKind;
  offset: number;
  signature: string;
  visibility?: 'public' | 'private' | 'protected';
  isExported: boolean;
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineNumberForOffset(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (starts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

function lineEndOffset(source: string, offset: number): number {
  const end = source.indexOf('\n', offset);
  return end === -1 ? source.length : end;
}

function braceEndOffset(source: string, openBrace: number): number {
  if (openBrace < 0) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function indentationRangeEnd(source: string, starts: number[], startLine: number): number {
  const startOffset = starts[startLine - 1] ?? 0;
  const line = source.slice(startOffset, lineEndOffset(source, startOffset));
  const baseIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
  for (let lineNo = startLine + 1; lineNo <= starts.length; lineNo++) {
    const offset = starts[lineNo - 1];
    const text = source.slice(offset, lineEndOffset(source, offset));
    if (text.trim() === '') continue;
    const indent = text.match(/^[ \t]*/)?.[0].length ?? 0;
    if (indent <= baseIndent) return lineNo - 1;
  }
  return starts.length;
}

function docCommentBefore(source: string, starts: number[], startLine: number): string | undefined {
  const lineIdx = startLine - 2;
  if (lineIdx < 0) return undefined;
  const before = source.slice(0, starts[startLine - 1]);
  const block = before.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  if (block) return block[0].trim();

  const lines: string[] = [];
  for (let i = lineIdx; i >= 0; i--) {
    const text = source.slice(starts[i], lineEndOffset(source, starts[i]));
    if (/^\s*\/\/\/?\s?/.test(text)) {
      lines.unshift(text.replace(/^\s*\/\/\/?\s?/, ''));
      continue;
    }
    if (text.trim() === '') continue;
    break;
  }
  return lines.length ? lines.join('\n').trim() : undefined;
}

function addMatches(source: string, candidates: Candidate[], re: RegExp, kind: CodeSymbolKind, nameGroup = 2): void {
  const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'constructor']);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const signature = match[0].trim();
    const name = match[nameGroup];
    if (!name) continue;
    if (reserved.has(name)) continue;
    candidates.push({
      name,
      kind,
      offset: match.index + match[0].indexOf(name),
      signature,
      visibility: signature.includes('private ') ? 'private' : signature.includes('protected ') ? 'protected' : 'public',
      isExported: /\bexport\b/.test(signature),
    });
  }
}

export async function extractSymbols(source: string, language: string): Promise<CodeSymbol[]> {
  const candidates: Candidate[] = [];
  const lang = language.toLowerCase();

  if (['typescript', 'javascript', 'tsx', 'jsx'].includes(lang)) {
    addMatches(source, candidates, /^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)[^{;]*\{/gm, 'function');
    addMatches(source, candidates, /^\s*(export\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/gm, 'class');
    addMatches(source, candidates, /^\s*(export\s+)?interface\s+([A-Za-z_$][\w$]*)[^{]*\{/gm, 'interface');
    addMatches(source, candidates, /^\s*(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/gm, 'type');
    addMatches(source, candidates, /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm, 'const');
    addMatches(source, candidates, /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:\w<>,\s\[\]|&?]*\{/gm, 'method', 1);
  } else if (lang === 'python') {
    addMatches(source, candidates, /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\([^)]*\)\s*:/gm, 'function', 1);
    addMatches(source, candidates, /^\s*class\s+([A-Za-z_][\w]*)[^:]*:/gm, 'class', 1);
  } else if (lang === 'go') {
    addMatches(source, candidates, /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\([^)]*\)[^{]*\{/gm, 'function', 1);
    addMatches(source, candidates, /^\s*type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\s*\{/gm, 'type', 1);
  }

  const starts = lineStarts(source);
  const seen = new Set<string>();
  const symbols: CodeSymbol[] = [];
  for (const c of candidates) {
    const startLine = lineNumberForOffset(starts, c.offset);
    const lineStart = starts[startLine - 1] ?? c.offset;
    const lineEnd = lineEndOffset(source, lineStart);
    const line = source.slice(lineStart, lineEnd);
    const openBrace = source.indexOf('{', lineStart);
    const endOffset = openBrace >= 0 && openBrace < lineEnd + 1
      ? braceEndOffset(source, openBrace)
      : -1;
    const endLine = endOffset >= 0
      ? lineNumberForOffset(starts, endOffset)
      : (lang === 'python' ? indentationRangeEnd(source, starts, startLine) : startLine);
    const key = `${c.name}:${c.kind}:${startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    symbols.push({
      name: c.name,
      kind: c.kind,
      startLine,
      endLine,
      signature: c.signature || line.trim(),
      docComment: docCommentBefore(source, starts, startLine),
      visibility: c.visibility ?? 'public',
      isExported: c.isExported,
    });
  }

  return symbols.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}
