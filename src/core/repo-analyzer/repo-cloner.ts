// 仓库克隆器 - 负责下载和管理仓库
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { RepoInfo } from './types.ts';

function getConfigDir() {
  return join(homedir(), '.gbrain');
}

export function getClonedReposDir(): string {
  const baseDir = getConfigDir();
  const reposDir = join(baseDir, 'cloned-repos');
  if (!existsSync(reposDir)) {
    mkdirSync(reposDir, { recursive: true });
    try {
      chmodSync(reposDir, 0o700);
    } catch { /* ignore */ }
  }
  return reposDir;
}

export function getRepoStoragePath(info: RepoInfo): string {
  const baseDir = getClonedReposDir();
  if (info.type === 'local') {
    return info.localPath!;
  }
  const repoDir = join(baseDir, info.type, info.owner!, info.repo!);
  if (!existsSync(dirname(repoDir))) {
    mkdirSync(dirname(repoDir), { recursive: true });
  }
  return repoDir;
}

export async function cloneOrUpdateRepo(info: RepoInfo, accessToken?: string, onProgress?: (phase: string, progress: number) => void): Promise<string> {
  const storagePath = getRepoStoragePath(info);

  if (info.type === 'local') {
    onProgress?.('reading', 100);
    return storagePath;
  }

  const cloneUrl = buildCloneUrl(info, accessToken);

  try {
    if (existsSync(storagePath)) {
      onProgress?.('updating', 30);
      console.log(`更新仓库: ${info.owner}/${info.repo}`);
      execSync('git pull', { cwd: storagePath, stdio: 'inherit' });
    } else {
      onProgress?.('cloning', 0);
      console.log(`克隆仓库: ${info.owner}/${info.repo}`);
      if (!existsSync(dirname(storagePath))) {
        mkdirSync(dirname(storagePath), { recursive: true });
      }
      execSync(`git clone --depth 1 ${cloneUrl} ${storagePath}`, { stdio: 'inherit' });
    }

    if (existsSync(join(storagePath, '.gitmodules'))) {
      onProgress?.('submodules', 90);
      console.log('初始化子模块');
      execSync('git submodule update --init --recursive', { cwd: storagePath, stdio: 'inherit' });
    }

    onProgress?.('complete', 100);
    return storagePath;
  } catch (error) {
    console.error('仓库操作失败:', error);
    if (existsSync(storagePath)) {
      console.log('清理失败的克隆');
      rmSync(storagePath, { recursive: true, force: true });
    }
    throw error;
  }
}

function buildCloneUrl(info: RepoInfo, accessToken?: string): string {
  if (!accessToken) {
    switch (info.type) {
      case 'github':
        return `https://github.com/${info.owner}/${info.repo}.git`;
      case 'gitlab':
        return `https://gitlab.com/${info.owner}/${info.repo}.git`;
      case 'bitbucket':
        return `https://bitbucket.org/${info.owner}/${info.repo}.git`;
    }
  }

  switch (info.type) {
    case 'github':
      return `https://${accessToken}:x-oauth-basic@github.com/${info.owner}/${info.repo}.git`;
    case 'gitlab':
      return `https://oauth2:${accessToken}@gitlab.com/${info.owner}/${info.repo}.git`;
    case 'bitbucket':
      return `https://x-token-auth:${accessToken}@bitbucket.org/${info.owner}/${info.repo}.git`;
  }
}

export function deleteRepo(info: RepoInfo): void {
  if (info.type === 'local') {
    return;
  }

  const storagePath = getRepoStoragePath(info);
  if (existsSync(storagePath)) {
    rmSync(storagePath, { recursive: true, force: true });
  }
}
