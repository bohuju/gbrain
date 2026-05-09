// 仓库解析器 - 负责解析仓库地址和验证
import { RepoInfo } from './types.ts';

const GITHUB_PATTERNS = [
  /^https?:\/\/github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?\/?$/,
  /^git@github\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?$/,
  /^github:([^\/]+)\/([^\/\.]+)$/,
];

const GITLAB_PATTERNS = [
  /^https?:\/\/gitlab\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?\/?$/,
  /^git@gitlab\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?$/,
];

const BITBUCKET_PATTERNS = [
  /^https?:\/\/bitbucket\.org\/([^\/]+)\/([^\/\.]+)(?:\.git)?\/?$/,
];

const OWNER_REPO_PATTERN = /^([^\/]+)\/([^\/\.]+)$/;

/**
 * 解析仓库输入
 */
export function parseRepositoryInput(input: string): RepoInfo {
  input = input.trim();

  // 检查是否为本地路径
  if (input.startsWith('/') || input.startsWith('./') || input.startsWith('../') || /^[A-Z]:\\/i.test(input)) {
    return { type: 'local', localPath: input };
  }

  // 检查 GitHub
  for (const pattern of GITHUB_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      let ref: string | undefined;
      let pathParts = match[2].split('#');
      let repo = match[2];
      if (pathParts.length > 1) {
        repo = pathParts[0];
        ref = pathParts[1];
      }
      return { type: 'github', owner: match[1], repo, url: `https://github.com/${match[1]}/${repo}` };
    }
  }

  // 检查 GitLab
  for (const pattern of GITLAB_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      return { type: 'gitlab', owner: match[1], repo: match[2], url: `https://gitlab.com/${match[1]}/${match[2]}` };
    }
  }

  // 检查 Bitbucket
  for (const pattern of BITBUCKET_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      return { type: 'bitbucket', owner: match[1], repo: match[2], url: `https://bitbucket.org/${match[1]}/${match[2]}` };
    }
  }

  // 检查 owner/repo 格式
  const ownerRepoMatch = input.match(OWNER_REPO_PATTERN);
  if (ownerRepoMatch) {
    return { type: 'github', owner: ownerRepoMatch[1], repo: ownerRepoMatch[2], url: `https://github.com/${ownerRepoMatch[1]}/${ownerRepoMatch[2]}` };
  }

  throw new Error(`无法解析仓库地址: ${input}`);
}

/**
 * 验证仓库信息
 */
export function validateRepoInfo(info: RepoInfo): { valid: boolean; error?: string } {
  if (info.type === 'local') {
    if (!info.localPath) {
      return { valid: false, error: '本地路径不能为空' };
    }
    return { valid: true };
  } else {
    if (!info.owner || !info.repo) {
      return { valid: false, error: '仓库所有者和名称不能为空' };
    }
    return { valid: true };
  }
}

/**
 * 获取默认缓存键
 */
export function getRepoCacheKey(info: RepoInfo): string {
  if (info.type === 'local') {
    return `local:${info.localPath?.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  return `${info.type}:${info.owner}:${info.repo}`;
}
