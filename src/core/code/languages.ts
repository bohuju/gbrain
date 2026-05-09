const CODE_LANGUAGE_BY_EXTENSION = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sh': 'shell',
  '.sql': 'sql',
} as const satisfies Record<string, string>;

export const CODE_EXTENSIONS = new Set(Object.keys(CODE_LANGUAGE_BY_EXTENSION));

export function detectCodeLanguage(filePath: string): string {
  const extIndex = filePath.lastIndexOf('.');
  const ext = extIndex >= 0 ? filePath.slice(extIndex).toLowerCase() : '';
  return CODE_LANGUAGE_BY_EXTENSION[ext] || 'code';
}

export function isCodePath(filePath: string): boolean {
  const extIndex = filePath.lastIndexOf('.');
  const ext = extIndex >= 0 ? filePath.slice(extIndex).toLowerCase() : '';
  return CODE_EXTENSIONS.has(ext);
}
