import type { CodeNode } from './types';

/**
 * Build a stable GBrain page slug from a GitNexus code node.
 *
 * Format: code/{repo}/{kind}/{sanitized-name}
 *
 * Examples:
 *   File:src/auth.py → code/my-repo/file/src-auth-py
 *   Class:AuthMiddleware → code/my-repo/class/authmiddleware
 *   Method:AuthMiddleware.authenticate#2 → code/my-repo/method/authmiddleware-authenticate-2
 */
export function buildCodeSlug(repo: string, node: CodeNode): string {
  const kind = nodeLabelToSlugKind(node.label);
  const name = sanitizeName(node.properties.name ?? 'unknown');
  // Repo name is the basename of the repo path
  const repoName = sanitizeName(repo.split('/').pop() ?? repo);
  return `code/${repoName}/${kind}/${name}`;
}

function nodeLabelToSlugKind(label: string): string {
  const map: Record<string, string> = {
    'File': 'file',
    'Folder': 'file',
    'Class': 'class',
    'Function': 'function',
    'Method': 'method',
    'Interface': 'interface',
    'Struct': 'class',
    'Enum': 'class',
    'Trait': 'interface',
    'TypeAlias': 'function',
    'Module': 'module',
    'Namespace': 'module',
    'Constructor': 'method',
    'CodeElement': 'element',
  };
  return map[label] ?? 'symbol';
}

/**
 * Normalize a symbol name into a slug-safe form.
 * "AuthMiddleware.authenticate#2" → "authmiddleware-authenticate-2"
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.@#]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a reverse lookup: from page_slug back to node display info.
 * Stored in page frontmatter for code_context resolution.
 */
export function buildCodeFrontmatter(
  repo: string,
  node: CodeNode,
): Record<string, unknown> {
  return {
    repo,
    original_id: node.id,
    kind: node.label,
    file: node.properties.file ?? '',
    line: node.properties.line ?? 1,
    language: node.properties.language ?? '',
    exported: node.properties.exported ?? true,
    signature: node.properties.signature ?? '',
  };
}
