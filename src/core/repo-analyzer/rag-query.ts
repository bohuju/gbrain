// RAG 查询处理器 - 负责处理与项目相关的问题查询
import { WikiStructure, WikiPage, RepositoryAnalysis } from './types.ts';
import { db } from '../db.ts';
import { hybridSearch } from '../search/hybrid.ts';

export interface QueryResult {
  answer: string;
  confidence: number;
  sources: string[];
  relatedPages: string[];
  reasoning: string;
  responseTime: number;
}

export interface QueryOptions {
  maxResults?: number;
  minConfidence?: number;
  includeExamples?: boolean;
  includeImplementationDetails?: boolean;
  allowDeepResearch?: boolean;
  confidenceThreshold?: number;
}

const DEFAULT_OPTIONS: QueryOptions = {
  maxResults: 3,
  minConfidence: 0.5,
  includeExamples: true,
  includeImplementationDetails: true,
  allowDeepResearch: true,
  confidenceThreshold: 0.6,
};

export async function processQuery(
  query: string,
  structure: WikiStructure,
  analysis: RepositoryAnalysis,
  options: QueryOptions = {},
): Promise<QueryResult> {
  const finalOptions = { ...DEFAULT_OPTIONS, ...options };

  const startTime = Date.now();
  const pages = Array.from(structure.pages.values());

  try {
    // 1. 对查询进行分类
    const queryType = classifyQuery(query);

    // 2. 基于查询类型选择最佳的搜索策略
    let relevantPages: WikiPage[];

    switch (queryType) {
      case 'language':
        relevantPages = findLanguageRelatedPages(query, pages);
        break;
      case 'architecture':
        relevantPages = findArchitecturePages(pages);
        break;
      case 'api':
        relevantPages = findAPIPages(query, pages);
        break;
      case 'file':
        relevantPages = findFilePages(query, pages);
        break;
      case 'dependency':
        relevantPages = findDependencyPages(pages);
        break;
      default:
        relevantPages = findGeneralRelatedPages(query, pages, finalOptions.maxResults!);
    }

    if (relevantPages.length === 0) {
      return createNoResultsResponse(query, Date.now() - startTime);
    }

    // 3. 使用 RAG 生成答案
    const context = await collectContext(relevantPages, analysis, finalOptions);
    const answer = await generateAnswer(query, context, finalOptions);
    const relatedPages = relevantPages.map(p => p.title);

    // 4. 执行向量搜索以找到更多相关内容
    const searchResults = await searchRelatedContent(query, analysis, finalOptions);

    // 5. 组合结果
    const combinedSources = new Set([
      ...relevantPages.map(p => p.title),
      ...searchResults.map(r => r.page),
    ]);

    return {
      answer,
      confidence: calculateConfidence(relevantPages, searchResults, query),
      sources: Array.from(combinedSources),
      relatedPages: relatedPages.slice(0, 5),
      reasoning: `基于 ${relevantPages.length} 个相关页面和 ${searchResults.length} 个搜索结果生成`,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Query processing error:', error);
    return {
      answer: '很抱歉，处理您的查询时遇到了错误。请尝试用不同的方式表述您的问题。',
      confidence: 0.3,
      sources: [],
      relatedPages: [],
      reasoning: `Error: ${error}`,
      responseTime: Date.now() - startTime,
    };
  }
}

function classifyQuery(query: string): string {
  const q = query.toLowerCase();

  if (/language|programming language|code style|syntax|typing/.test(q)) {
    return 'language';
  }

  if (/architecture|structure|design|system|component/.test(q)) {
    return 'architecture';
  }

  if (/api|interface|method|function|class/.test(q)) {
    return 'api';
  }

  if (/file|import|export|module/.test(q)) {
    return 'file';
  }

  if (/dependency|require|import|depend/.test(q)) {
    return 'dependency';
  }

  return 'general';
}

async function searchRelatedContent(
  query: string,
  analysis: RepositoryAnalysis,
  options: QueryOptions,
): Promise<any[]> {
  const allChunks = [];

  for (const fileAnalysis of analysis.files) {
    const symbolsChunk = fileAnalysis.symbols
      .map(s => `${s.name} ${s.signature} ${s.docComment}`)
      .join(' ');

    const contentChunk = fileAnalysis.file.content.slice(0, 500);

    allChunks.push({
      page: fileAnalysis.file.relativePath,
      content: symbolsChunk + ' ' + contentChunk,
    });
  }

  // 简单的基于文本匹配的搜索
  const results = allChunks
    .map(chunk => ({
      ...chunk,
      score: calculateTextSimilarity(query, chunk.content),
    }))
    .filter(r => r.score > options.confidenceThreshold! - 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxResults!);

  return results;
}

function calculateTextSimilarity(query: string, content: string): number {
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const cTokens = new Set(content.toLowerCase().split(/\W+/).filter(t => t.length > 2));

  const common = new Set([...qTokens].filter(x => cTokens.has(x)));
  const union = new Set([...qTokens, ...cTokens]);

  return common.size / union.size;
}

function findLanguageRelatedPages(query: string, pages: WikiPage[]): WikiPage[] {
  const languages = ['javascript', 'typescript', 'python', 'java', 'go', 'cpp', 'rust', 'php', 'ruby'];

  const matches = languages.filter(l => query.toLowerCase().includes(l));

  if (matches.length > 0) {
    return pages.filter(p => matches.some(l => p.tags.includes(l)));
  }

  return pages.filter(p => p.type === 'overview' && p.tags.includes('language'));
}

function findArchitecturePages(pages: WikiPage[]): WikiPage[] {
  return pages.filter(p =>
    p.type === 'overview' && (p.tags.includes('architecture') || p.tags.includes('structure'))
  );
}

function findAPIPages(query: string, pages: WikiPage[]): WikiPage[] {
  return pages.filter(p =>
    p.content.toLowerCase().includes(query.toLowerCase()) ||
    p.tags.some(t => query.toLowerCase().includes(t))
  );
}

function findFilePages(query: string, pages: WikiPage[]): WikiPage[] {
  return pages.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.relatedFiles.some(f => f.toLowerCase().includes(query.toLowerCase()))
  );
}

function findDependencyPages(pages: WikiPage[]): WikiPage[] {
  return pages.filter(p => p.tags.includes('dependencies') || p.tags.includes('references'));
}

function findGeneralRelatedPages(
  query: string,
  pages: WikiPage[],
  maxResults: number,
): WikiPage[] {
  const scoredPages = pages.map(page => ({
    page,
    score: calculatePageRelevance(query, page),
  }));

  return scoredPages
    .sort((a, b) => b.score - a.score)
    .filter(p => p.score > 0.1)
    .slice(0, maxResults)
    .map(p => p.page);
}

function calculatePageRelevance(query: string, page: WikiPage): number {
  const q = query.toLowerCase();
  const content = page.content.toLowerCase();

  if (content.includes(q)) return 0.8;

  const qWords = q.split(/\W+/).filter(t => t.length > 2);

  const matchingWords = qWords.filter(word => content.includes(word));
  if (matchingWords.length > 0) return 0.6;

  const tagMatches = page.tags.filter(tag => q.includes(tag));
  if (tagMatches.length > 0) return 0.5;

  const titleMatch = page.title.toLowerCase().includes(q);
  if (titleMatch) return 0.7;

  return 0;
}

async function collectContext(
  pages: WikiPage[],
  analysis: RepositoryAnalysis,
  options: QueryOptions,
): Promise<string> {
  const contexts: string[] = [];

  for (const page of pages) {
    // 1. 页面内容摘要
    contexts.push(page.content.slice(0, 300));

    // 2. 相关代码分析
    const relatedFiles = page.relatedFiles || [];
    for (const filePath of relatedFiles) {
      const fileAnalysis = analysis.files.find(f => f.file.relativePath === filePath);
      if (fileAnalysis) {
        if (options.includeImplementationDetails) {
          contexts.push(`文件 ${filePath} 包含 ${fileAnalysis.symbols.length} 个代码符号`);

          // 添加主要导出符号
          const exportedSymbols = fileAnalysis.symbols
            .filter(s => s.isExported && ['function', 'class', 'interface'].includes(s.kind))
            .map(s => s.signature)
            .join(' ');

          if (exportedSymbols) {
            contexts.push(`主要导出: ${exportedSymbols}`);
          }
        }

        if (options.includeExamples) {
          const exampleCode = findExamples(fileAnalysis.file.content);
          if (exampleCode) {
            contexts.push(`\`\`\`${getFileLanguage(fileAnalysis.file.relativePath)}\n${exampleCode.slice(0, 200)}\n\`\`\``);
          }
        }
      }
    }
  }

  return contexts.join('\n');
}

function findExamples(content: string): string | null {
  const examplePatterns = [
    /\/\/\s*Example|\/\/\s*Usage|\/\/\s*Example:|\/\/\s*Usage:/,
    /#\s*Example|#\s*Usage|#\s*Example:|#\s*Usage:/,
    /\/\*\s*Example|\/\*\s*Usage|\/\*\s*Example:|\/\*\s*Usage:/,
  ];

  for (const pattern of examplePatterns) {
    const match = content.match(pattern);
    if (match) {
      const exampleStart = match.index!;
      const exampleEnd = content.indexOf('\n', exampleStart + 200);
      return content.slice(exampleStart, exampleEnd !== -1 ? exampleEnd : content.length);
    }
  }

  return null;
}

function getFileLanguage(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();

  const extMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'jsx',
    tsx: 'tsx',
    py: 'python',
    java: 'java',
    go: 'go',
    cpp: 'cpp',
    c: 'c',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    cs: 'csharp',
    kt: 'kotlin',
  };

  return extMap[ext] || 'text';
}

async function generateAnswer(
  query: string,
  context: string,
  options: QueryOptions,
): Promise<string> {
  // 这里可以接入实际的 LLM 服务
  return `根据项目分析，${query} 相关的信息如下:\n\n${context}`;
}

function createNoResultsResponse(query: string, responseTime: number): QueryResult {
  return {
    answer: `没有找到关于 "${query}" 的直接信息。请尝试用不同的关键词查询，或者考虑以下建议:\n\n1. 检查查询拼写是否正确\n2. 使用更具体的术语\n3. 尝试查询项目结构或主要功能\n4. 如果您在寻找特定的 API 或组件，请使用该名称\n\n您还可以尝试查询以下主题:\n- 项目架构和结构\n- 主要功能和特性\n- 支持的语言和技术栈\n- 文件和模块组织`,
    confidence: 0.4,
    sources: [],
    relatedPages: [],
    reasoning: 'No relevant pages found in the knowledge base',
    responseTime,
  };
}

function calculateConfidence(relevantPages: WikiPage[], searchResults: any[], query: string): number {
  let baseConfidence = 0;

  // 基于页面匹配的置信度
  if (relevantPages.length > 0) {
    baseConfidence = 0.4 + (0.5 * Math.min(relevantPages.length, 5) / 5);
  }

  // 基于搜索结果的置信度
  if (searchResults.length > 0) {
    const avgScore = searchResults.reduce((sum: number, r: any) => sum + r.score, 0) / searchResults.length;
    baseConfidence += avgScore * 0.1;
  }

  return Math.min(0.95, Math.max(0.3, baseConfidence));
}
