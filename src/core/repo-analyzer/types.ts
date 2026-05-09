// 仓库分析相关类型定义

export type RepoType = 'github' | 'gitlab' | 'bitbucket' | 'local';

export interface RepoInfo {
  type: RepoType;
  owner?: string;
  repo?: string;
  localPath?: string;
  url?: string;
  ref?: string;
}

export interface CodeFile {
  path: string;
  relativePath: string;
  name: string;
  language: string;
  content: string;
  size: number;
  lastModified?: Date;
}

export interface CodeSnippet {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  summary?: string;
}

export interface WikiPage {
  slug: string;
  title: string;
  type: 'overview' | 'module' | 'file' | 'api' | 'guide';
  content: string;
  parent?: string;
  children: string[];
  tags: string[];
  relatedFiles: string[];
  references: string[];
}

export interface WikiStructure {
  root: WikiPage;
  pages: Map<string, WikiPage>;
  structure: {
    modules: { [key: string]: string[] };
    files: { [key: string]: string[] };
  };
}

export interface AnalyzeProgress {
  phase: 'cloning' | 'reading' | 'parsing' | 'analyzing' | 'vectorizing' | 'generating' | 'complete';
  current: number;
  total: number;
  message: string;
}
