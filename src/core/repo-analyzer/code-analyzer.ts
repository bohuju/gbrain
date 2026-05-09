// 代码分析器 - 负责分析代码内容
import { CodeFile, CodeSnippet } from './types.ts';
import { extractSymbols, CodeSymbol } from '../code/symbol-extractor.ts';
import { extractReferences, CodeReference } from '../code/reference-extractor.ts';

export interface FileAnalysis {
  file: CodeFile;
  symbols: CodeSymbol[];
  references: CodeReference[];
  summary?: string;
  complexityScore: number;
  isTestFile: boolean;
}

export interface RepositoryAnalysis {
  files: FileAnalysis[];
  totalFiles: number;
  languages: Map<string, number>;
  symbolCount: number;
  structure: DirectoryStructure;
}

export interface DirectoryStructure {
  name: string;
  path: string;
  files: string[];
  subdirectories: DirectoryStructure[];
}

/**
 * 分析代码文件
 */
export async function analyzeCodeFiles(files: CodeFile[]): Promise<RepositoryAnalysis> {
  const results: FileAnalysis[] = [];
  const languages = new Map<string, number>();
  let totalSymbols = 0;

  for (const file of files) {
    const symbols = await extractSymbols(file.content, file.language);
    const localNames = new Set(symbols.map(s => s.name));
    const references = await extractReferences(file.content, file.language, file.relativePath, localNames);

    const analysis: FileAnalysis = {
      file,
      symbols,
      references,
      complexityScore: calculateComplexity(symbols, file),
      isTestFile: isTestFile(file),
    };

    results.push(analysis);
    totalSymbols += symbols.length;

    const langCount = languages.get(file.language) || 0;
    languages.set(file.language, langCount + 1);
  }

  return {
    files: results,
    totalFiles: files.length,
    languages,
    symbolCount: totalSymbols,
    structure: buildDirectoryStructure(files),
  };
}

/**
 * 计算文件复杂度
 */
function calculateComplexity(symbols: CodeSymbol[], file: CodeFile): number {
  let score = 0;

  score += symbols.length;

  const lineCount = (file.content.match(/\n/g) || []).length;
  score += Math.floor(lineCount / 100);

  const functionSymbols = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
  score += functionSymbols.length * 2;

  const classSymbols = symbols.filter(s => s.kind === 'class');
  score += classSymbols.length * 3;

  return score;
}

/**
 * 判断是否为测试文件
 */
function isTestFile(file: CodeFile): boolean {
  return /(test|spec|__tests__|tests?)/i.test(file.relativePath);
}

/**
 * 构建目录结构
 */
function buildDirectoryStructure(files: CodeFile[]): DirectoryStructure {
  const root: DirectoryStructure = {
    name: '',
    path: '',
    files: [],
    subdirectories: [],
  };

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let dir = current.subdirectories.find(d => d.name === part);
      if (!dir) {
        dir = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          files: [],
          subdirectories: [],
        };
        current.subdirectories.push(dir);
      }
      current = dir;
    }

    if (parts.length === 1) {
      root.files.push(file.relativePath);
    } else {
      current.files.push(file.relativePath);
    }
  }

  return root;
}

/**
 * 提取重要代码片段
 */
export function extractImportantSnippets(analysis: FileAnalysis, maxSnippets: number = 10): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];

  for (const symbol of analysis.symbols) {
    if (['function', 'class', 'method'].includes(symbol.kind)) {
      const startLine = Math.max(0, symbol.startLine - 1);
      const endLine = symbol.endLine;
      const lines = analysis.file.content.split('\n');
      const snippetContent = lines.slice(startLine, endLine).join('\n');

      snippets.push({
        id: `${analysis.file.relativePath}:${symbol.name}`,
        file: analysis.file.relativePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        content: snippetContent,
      });
    }
  }

  return snippets
    .sort((a, b) => b.endLine - b.startLine)
    .slice(0, maxSnippets);
}
