// 仓库分析器主入口 - 集成所有功能
import { parseRepositoryInput, validateRepoInfo, getRepoCacheKey } from './repo-parser.ts';
import { cloneOrUpdateRepo, getRepoStoragePath } from './repo-cloner.ts';
import { readCodeFiles, getRepoStats } from './code-reader.ts';
import { analyzeCodeFiles, RepositoryAnalysis } from './code-analyzer.ts';
import { generateWikiStructure } from './wiki-generator.ts';
import { processQuery, QueryResult, QueryOptions } from './rag-query.ts';
import { RepoInfo, WikiStructure, AnalyzeProgress } from './types.ts';

export interface AnalyzeOptions {
  includeTests?: boolean;
  includeExamples?: boolean;
  maxPages?: number;
  accessToken?: string;
  queryOptions?: QueryOptions;
  onProgress?: (progress: AnalyzeProgress) => void;
}

/**
 * 仓库分析器
 */
export class RepoAnalyzer {
  private repoInfo: RepoInfo;
  private storagePath: string;
  private analysis: RepositoryAnalysis | null = null;
  private wikiStructure: WikiStructure | null = null;

  constructor(input: string) {
    this.repoInfo = parseRepositoryInput(input);
    this.storagePath = getRepoStoragePath(this.repoInfo);
  }

  /**
   * 执行完整的分析过程
   */
  async analyze(options: AnalyzeOptions = {}): Promise<WikiStructure> {
    const { onProgress } = options;

    onProgress?.({ phase: 'cloning', current: 0, total: 100, message: '准备仓库...' });

    // 1. 验证仓库信息
    const validation = validateRepoInfo(this.repoInfo);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    onProgress?.({ phase: 'cloning', current: 10, total: 100, message: '克隆/读取仓库...' });

    // 2. 克隆或读取仓库
    await cloneOrUpdateRepo(
      this.repoInfo,
      options.accessToken,
      (phase, progress) => {
        if (phase === 'cloning') {
          onProgress?.({ phase: 'cloning', current: Math.floor(progress), total: 100, message: '克隆仓库中...' });
        } else if (phase === 'updating') {
          onProgress?.({ phase: 'cloning', current: Math.floor(progress), total: 100, message: '更新仓库中...' });
        } else if (phase === 'submodules') {
          onProgress?.({ phase: 'cloning', current: Math.floor(progress), total: 100, message: '初始化子模块...' });
        }
      },
    );

    onProgress?.({ phase: 'reading', current: 20, total: 100, message: '读取代码文件...' });

    // 3. 读取代码文件
    const files = readCodeFiles(this.storagePath);
    const stats = getRepoStats(this.storagePath);
    console.log(`找到 ${files.length} 个代码文件，大小 ${(stats.totalSize / 1024).toFixed(1)} KB`);

    onProgress?.({ phase: 'parsing', current: 30, total: 100, message: '解析代码...' });

    // 4. 分析代码
    this.analysis = await analyzeCodeFiles(files);

    onProgress?.({ phase: 'generating', current: 70, total: 100, message: '生成文档结构...' });

    // 5. 生成维基结构
    this.wikiStructure = await generateWikiStructure(this.analysis, {
      includeTests: options.includeTests,
      includeExamples: options.includeExamples,
      maxPages: options.maxPages,
    });

    onProgress?.({ phase: 'complete', current: 100, total: 100, message: '分析完成!' });

    return this.wikiStructure;
  }

  /**
   * 处理查询
   */
  async query(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    if (!this.analysis || !this.wikiStructure) {
      await this.analyze();
    }

    return await processQuery(query, this.wikiStructure!, this.analysis!, options);
  }

  /**
   * 获取仓库信息
   */
  getRepoInfo(): RepoInfo {
    return this.repoInfo;
  }

  /**
   * 获取仓库统计信息
   */
  getStats(): {
    fileCount: number;
    languages: Map<string, number>;
    symbolCount: number;
  } | null {
    if (!this.analysis) {
      return null;
    }
    return {
      fileCount: this.analysis.totalFiles,
      languages: this.analysis.languages,
      symbolCount: this.analysis.symbolCount,
    };
  }

  /**
   * 获取缓存键
   */
  getCacheKey(): string {
    return getRepoCacheKey(this.repoInfo);
  }
}

export * from './types.ts';
export { parseRepositoryInput, validateRepoInfo, getRepoCacheKey } from './repo-parser.ts';
export { cloneOrUpdateRepo, getRepoStoragePath, deleteRepo } from './repo-cloner.ts';
export { readCodeFiles, getRepoStats } from './code-reader.ts';
export {
  analyzeCodeFiles,
  extractImportantSnippets,
  FileAnalysis,
  RepositoryAnalysis,
  DirectoryStructure,
} from './code-analyzer.ts';
export { generateWikiStructure } from './wiki-generator.ts';
export { processQuery, QueryResult, QueryOptions } from './rag-query.ts';
