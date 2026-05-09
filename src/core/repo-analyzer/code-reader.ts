// 代码读取器 - 负责遍历和读取代码文件
import { readdirSync, readFileSync, lstatSync } from 'fs';
import { join } from 'path';
import { CodeFile } from './types.ts';

const CODE_EXTENSIONS = new Map([
  // JavaScript/TypeScript
  ['.js', 'javascript'],
  ['.ts', 'typescript'],
  ['.jsx', 'jsx'],
  ['.tsx', 'tsx'],
  // Python
  ['.py', 'python'],
  // Java
  ['.java', 'java'],
  // Go
  ['.go', 'go'],
  // C/C++
  ['.c', 'c'],
  ['.cpp', 'cpp'],
  ['.h', 'c'],
  ['.hpp', 'cpp'],
  // Rust
  ['.rs', 'rust'],
  // PHP
  ['.php', 'php'],
  // Ruby
  ['.rb', 'ruby'],
  // Swift
  ['.swift', 'swift'],
  // C#
  ['.cs', 'csharp'],
  // Kotlin
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
]);

const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.cache/,
  /coverage/,
  /test-coverage/,
  /tmp/,
  /\.DS_Store/,
  /__pycache__/,
  /\.venv/,
  /env/,
  /target/,
];

const DEFAULT_EXCLUDE_PATTERNS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  'coverage',
  'test-coverage',
  'tmp',
  '.DS_Store',
  '__pycache__',
  '.venv',
  'env',
  'target',
]);

export interface ReadOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
}

/**
 * 读取仓库中的代码文件
 */
export function readCodeFiles(directory: string, options: ReadOptions = {}): CodeFile[] {
  const files: CodeFile[] = [];
  const visitedDirs = new Set<string>();

  function traverse(dir: string) {
    if (visitedDirs.has(dir)) {
      return;
    }
    visitedDirs.add(dir);

    const entries = readdirSync(dir).filter(name => shouldIncludeEntry(dir, name, options));

    for (const name of entries) {
      const fullPath = join(dir, name);
      const stats = lstatSync(fullPath);

      if (stats.isDirectory()) {
        traverse(fullPath);
        continue;
      }

      const fileExt = name.slice(name.lastIndexOf('.')).toLowerCase();
      const language = CODE_EXTENSIONS.get(fileExt);
      if (language) {
        const content = readFileSync(fullPath, 'utf8');
        const relativePath = fullPath.slice(directory.length + 1);

        files.push({
          path: fullPath,
          relativePath,
          name,
          language,
          content,
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }
  }

  traverse(directory);
  return files;
}

/**
 * 判断是否应该包含条目
 */
function shouldIncludeEntry(dir: string, name: string, options: ReadOptions): boolean {
  const fullPath = join(dir, name);

  // 默认排除模式
  if (EXCLUDE_PATTERNS.some(pattern => pattern.test(fullPath))) {
    return false;
  }

  // 用户自定义排除模式
  if (options.excludePatterns) {
    for (const pattern of options.excludePatterns) {
      if (fullPath.includes(pattern) || name.includes(pattern)) {
        return false;
      }
    }
  }

  // 用户自定义包含模式（只有匹配到的才会被包含）
  if (options.includePatterns) {
    const shouldInclude = options.includePatterns.some(pattern =>
      fullPath.includes(pattern) || name.includes(pattern)
    );
    if (!shouldInclude) {
      return false;
    }
  }

  return true;
}

/**
 * 获取仓库统计信息
 */
export function getRepoStats(directory: string, options: ReadOptions = {}): {
  fileCount: number;
  totalSize: number;
  languages: { [key: string]: number };
  extensionCount: { [key: string]: number };
} {
  const files = readCodeFiles(directory, options);

  const languages: { [key: string]: number } = {};
  const extensions: { [key: string]: number } = {};
  let totalSize = 0;

  for (const file of files) {
    languages[file.language] = (languages[file.language] || 0) + 1;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    extensions[ext] = (extensions[ext] || 0) + 1;

    totalSize += file.size;
  }

  return {
    fileCount: files.length,
    totalSize,
    languages,
    extensionCount: extensions,
  };
}
