import { dirname, join } from 'path';
import { slugifyCodePath } from '../sync.ts';

export type CodeReferenceType = 'imports' | 'calls' | 'extends' | 'implements' | 'tests';

export interface CodeReference {
  fromPath: string;
  toPath: string;
  refType: CodeReferenceType;
  lineNumber: number;
}

interface ImportedBinding {
  localName: string;
  toPath: string;
}

function lineNumberAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function resolveImportPath(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  let rel = specifier;
  const pythonRelative = specifier.match(/^(\.+)([A-Za-z_][\w.]*)$/);
  if (pythonRelative) {
    const up = '../'.repeat(Math.max(0, pythonRelative[1].length - 1));
    rel = `./${up}${pythonRelative[2].replace(/\./g, '/')}`;
  }
  const normalized = join(dirname(filePath), rel).replace(/\\/g, '/');
  return codePathToSlug(normalized);
}

function codePathToSlug(filePath: string): string {
  return `code/${slugifyCodePath(filePath)}`;
}

function pushImportRefs(source: string, filePath: string, refs: CodeReference[], patterns: RegExp[]): void {
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];
      const toPath = resolveImportPath(filePath, specifier);
      if (!toPath) continue;
      refs.push({
        fromPath: codePathToSlug(filePath),
        toPath,
        refType: 'imports',
        lineNumber: lineNumberAt(source, match.index),
      });
    }
  }
}

function collectImportedBindings(source: string, filePath: string): ImportedBinding[] {
  const bindings: ImportedBinding[] = [];
  const push = (localName: string, specifier: string) => {
    const toPath = resolveImportPath(filePath, specifier);
    if (!toPath || !localName) return;
    bindings.push({ localName, toPath });
  };

  let match: RegExpExecArray | null;
  const esmRe = /\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = esmRe.exec(source)) !== null) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (!specifier.startsWith('.')) continue;

    const namedMatch = clause.match(/\{([^}]+)\}/);
    if (namedMatch) {
      for (const entry of namedMatch[1].split(',')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const alias = trimmed.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!alias) continue;
        push(alias[2] || alias[1], specifier);
      }
    }

    const defaultClause = clause.replace(/\{[\s\S]*\}/, '').split(',')[0]?.trim();
    if (defaultClause && defaultClause !== '*' && /^[A-Za-z_$][\w$]*$/.test(defaultClause)) {
      push(defaultClause, specifier);
    }
  }

  const requireRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(source)) !== null) {
    push(match[1], match[2]);
  }

  return bindings;
}

function pushLocalCallRefs(source: string, filePath: string, refs: CodeReference[], localSymbols: Set<string>): void {
  if (localSymbols.size === 0) return;

  const reserved = new Set([
    'catch', 'describe', 'for', 'function', 'if', 'it', 'new', 'return', 'switch', 'test', 'while',
  ]);
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(source)) !== null) {
    const name = match[1];
    if (!localSymbols.has(name) || reserved.has(name)) continue;

    const nameOffset = match.index;
    const prevChar = source[nameOffset - 1];
    if (prevChar === '.' || prevChar === ':') continue;

    const lineStart = source.lastIndexOf('\n', nameOffset) + 1;
    const beforeName = source.slice(lineStart, nameOffset);
    if (/\b(function|def|func|class|interface|type)\s+$/.test(beforeName)) continue;

    refs.push({
      fromPath: codePathToSlug(filePath),
      toPath: codePathToSlug(filePath),
      refType: 'calls',
      lineNumber: lineNumberAt(source, match.index),
    });
  }
}

function pushImportedCallRefs(
  source: string,
  filePath: string,
  refs: CodeReference[],
  importedBindings: ImportedBinding[],
  localSymbols: Set<string>,
): void {
  if (importedBindings.length === 0) return;

  const bindingMap = new Map(importedBindings.map(binding => [binding.localName, binding.toPath]));
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(source)) !== null) {
    const name = match[1];
    const toPath = bindingMap.get(name);
    if (!toPath || localSymbols.has(name)) continue;

    const nameOffset = match.index;
    const prevChar = source[nameOffset - 1];
    if (prevChar === '.' || prevChar === ':') continue;

    const lineStart = source.lastIndexOf('\n', nameOffset) + 1;
    const beforeName = source.slice(lineStart, nameOffset);
    if (/\b(import|function|def|func|class|interface|type)\s+$/.test(beforeName)) continue;

    refs.push({
      fromPath: codePathToSlug(filePath),
      toPath,
      refType: 'calls',
      lineNumber: lineNumberAt(source, match.index),
    });
  }
}

export async function extractReferences(
  source: string,
  language: string,
  filePath: string,
  localSymbols: Set<string>,
): Promise<CodeReference[]> {
  const refs: CodeReference[] = [];
  const lang = language.toLowerCase();
  const importedBindings = ['typescript', 'javascript', 'tsx', 'jsx'].includes(lang)
    ? collectImportedBindings(source, filePath)
    : [];

  if (['typescript', 'javascript', 'tsx', 'jsx'].includes(lang)) {
    pushImportRefs(source, filePath, refs, [
      /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
      /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]);

    let match: RegExpExecArray | null;
    const extendsRe = /\bclass\s+\w+\s+extends\s+([A-Za-z_$][\w$]*)/g;
    while ((match = extendsRe.exec(source)) !== null) {
      if (!localSymbols.has(match[1])) continue;
      refs.push({ fromPath: codePathToSlug(filePath), toPath: codePathToSlug(filePath), refType: 'extends', lineNumber: lineNumberAt(source, match.index) });
    }

    const implementsRe = /\bclass\s+\w+[^{]*\simplements\s+([A-Za-z_$][\w$]*)/g;
    while ((match = implementsRe.exec(source)) !== null) {
      if (!localSymbols.has(match[1])) continue;
      refs.push({ fromPath: codePathToSlug(filePath), toPath: codePathToSlug(filePath), refType: 'implements', lineNumber: lineNumberAt(source, match.index) });
    }
    pushImportedCallRefs(source, filePath, refs, importedBindings, localSymbols);
    pushLocalCallRefs(source, filePath, refs, localSymbols);
  } else if (lang === 'python') {
    pushImportRefs(source, filePath, refs, [
      /^\s*from\s+(\.[\w.]+)\s+import\s+/gm,
      /^\s*import\s+(\.[\w.]+)/gm,
    ]);
    pushLocalCallRefs(source, filePath, refs, localSymbols);
  } else if (lang === 'go') {
    pushImportRefs(source, filePath, refs, [
      /^\s*import\s+"(\.[^"]+)"/gm,
    ]);
    pushLocalCallRefs(source, filePath, refs, localSymbols);
  }

  if (/\.(test|spec)\.[^.]+$/.test(filePath) || /(^|\/)(__tests__|test|tests)\//.test(filePath)) {
    for (const ref of refs) {
      if (ref.refType === 'imports') ref.refType = 'tests';
    }
  }

  const seen = new Set<string>();
  return refs.filter(ref => {
    const key = `${ref.fromPath}\0${ref.toPath}\0${ref.refType}\0${ref.lineNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
