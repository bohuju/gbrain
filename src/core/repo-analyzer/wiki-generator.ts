// 维基结构生成器 - 负责生成文档结构
import { WikiStructure, WikiPage, RepositoryAnalysis } from './types.ts';

interface PageGeneratorConfig {
  includeTests?: boolean;
  includeExamples?: boolean;
  includeInternalFiles?: boolean;
  maxPages?: number;
}

const DEFAULT_CONFIG: PageGeneratorConfig = {
  includeTests: true,
  includeExamples: true,
  includeInternalFiles: false,
  maxPages: 200,
};

export async function generateWikiStructure(
  analysis: RepositoryAnalysis,
  config: PageGeneratorConfig = {},
): Promise<WikiStructure> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const pages = new Map<string, WikiPage>();

  // 1. 生成根页面
  const rootPage = createRootPage(analysis);
  pages.set(rootPage.slug, rootPage);

  // 2. 生成技术栈概览页面
  const techPage = createTechStackPage(analysis);
  pages.set(techPage.slug, techPage);
  rootPage.children.push(techPage.slug);

  // 3. 按语言分组生成页面
  for (const [language, count] of analysis.languages.entries()) {
    const langPage = createLanguagePage(language, analysis, count);
    pages.set(langPage.slug, langPage);
    rootPage.children.push(langPage.slug);

    // 4. 为该语言的每个文件生成页面
    const languageFiles = analysis.files.filter(f => f.file.language === language);

    for (const fileAnalysis of languageFiles) {
      if (shouldIncludeFile(fileAnalysis, finalConfig)) {
        const filePage = await createFilePage(fileAnalysis);
        pages.set(filePage.slug, filePage);
        langPage.children.push(filePage.slug);
      }
    }
  }

  // 5. 生成架构页面
  const archPage = createArchitecturePage(analysis);
  pages.set(archPage.slug, archPage);
  rootPage.children.push(archPage.slug);

  // 6. 生成依赖关系页面
  const depPage = createDependenciesPage(analysis);
  pages.set(depPage.slug, depPage);
  rootPage.children.push(depPage.slug);

  // 7. 生成关键组件页面
  const keyComponentsPage = await createKeyComponentsPage(analysis);
  pages.set(keyComponentsPage.slug, keyComponentsPage);
  rootPage.children.push(keyComponentsPage.slug);

  // 8. 生成测试概览页面
  const testsPage = createTestsPage(analysis);
  pages.set(testsPage.slug, testsPage);
  rootPage.children.push(testsPage.slug);

  return {
    root: rootPage,
    pages,
    structure: {
      modules: groupByModule(pages),
      files: groupByFile(pages),
    },
  };
}

function createRootPage(analysis: RepositoryAnalysis): WikiPage {
  return {
    slug: 'repo-overview',
    title: '项目概览',
    type: 'overview',
    content: `# 项目概览

该项目包含 ${analysis.totalFiles} 个代码文件，使用 ${analysis.languages.size} 种编程语言。共识别到 ${analysis.symbolCount} 个代码符号。

## 主要语言分布

${Array.from(analysis.languages.entries())
  .map(([lang, count]) => `- ${lang}: ${count} 文件`)
  .join('\n')}

## 项目结构

项目采用模块化架构，包含以下主要功能：

- **核心功能**: 实现主要业务逻辑的代码
- **工具和库**: 通用工具和辅助函数
- **测试**: 单元测试、集成测试和端到端测试
- **文档**: README、API 文档和架构说明
`,
    children: [],
    tags: ['overview', 'project'],
    relatedFiles: [],
    references: [],
  };
}

function createTechStackPage(analysis: RepositoryAnalysis): WikiPage {
  const languageStats = Array.from(analysis.languages.entries()).map(
    ([lang, count]) => `- **${lang}**: ${count} 个文件`,
  );

  return {
    slug: 'tech-stack',
    title: '技术栈',
    type: 'overview',
    content: `# 技术栈

项目使用多种编程语言和技术：

## 编程语言

${languageStats.join('\n')}

## 文件统计

- **代码文件总数**: ${analysis.totalFiles}
- **识别到的代码符号**: ${analysis.symbolCount}
- **测试文件比例**: ${(
      (analysis.files.filter(f => f.isTestFile).length / analysis.totalFiles) *
      100
    ).toFixed(1)}%
`,
    children: [],
    tags: ['tech-stack', 'overview'],
    relatedFiles: [],
    references: [],
  };
}

function createLanguagePage(language: string, analysis: RepositoryAnalysis, count: number): WikiPage {
  const files = analysis.files.filter(f => f.file.language === language);
  const symbolCount = files.reduce((sum, f) => sum + f.symbols.length, 0);

  return {
    slug: `lang-${language.toLowerCase()}`,
    title: getLanguageDisplayName(language),
    type: 'overview',
    content: `# ${getLanguageDisplayName(language)} 代码分析

## 统计

- **文件数**: ${count}
- **代码符号**: ${symbolCount}
- **测试文件**: ${files.filter(f => f.isTestFile).length} 个
- **总复杂度**: ${files.reduce((sum, f) => sum + f.complexityScore, 0)}

## 主要特点

${getLanguageDescription(language)}

## 文件列表

${files.map(f => `- ${f.file.relativePath}`).join('\n')}
`,
    children: [],
    tags: ['language', language.toLowerCase()],
    relatedFiles: files.map(f => f.file.relativePath),
    references: [],
  };
}

async function createFilePage(fileAnalysis: any): Promise<WikiPage> {
  const file = fileAnalysis.file;

  return {
    slug: `file-${toSlug(file.relativePath)}`,
    title: file.relativePath,
    type: 'file',
    content: await generateFileContent(fileAnalysis),
    children: [],
    tags: [file.language.toLowerCase(), 'file'],
    relatedFiles: [file.relativePath],
    references: fileAnalysis.references.map((ref: any) => ref.toPath || ref),
  };
}

function createArchitecturePage(analysis: RepositoryAnalysis): WikiPage {
  return {
    slug: 'architecture',
    title: '系统架构',
    type: 'overview',
    content: `# 系统架构

## 目录结构

\`\`\`
${printDirectoryTree(analysis.structure)}
\`\`\`

## 核心功能模块

${findCoreModules(analysis)}
`,
    children: [],
    tags: ['architecture', 'structure'],
    relatedFiles: findCoreFiles(analysis),
    references: [],
  };
}

function createDependenciesPage(analysis: RepositoryAnalysis): WikiPage {
  const uniqueRefs = new Set<string>();

  analysis.files.forEach(file => {
    file.references.forEach((ref: any) => {
      if (typeof ref === 'string') {
        uniqueRefs.add(ref);
      } else if (typeof ref === 'object' && ref.toPath) {
        uniqueRefs.add(ref.toPath);
      }
    });
  });

  return {
    slug: 'dependencies',
    title: '依赖关系',
    type: 'overview',
    content: `# 依赖关系

## 代码引用关系

项目包含以下依赖关系：

${Array.from(uniqueRefs).map(r => `- ${r}`).join('\n')}

## 引用图

\`\`\`mermaid
graph TD
  ${generateDependencyGraph(analysis)}
\`\`\`
`,
    children: [],
    tags: ['dependencies', 'references'],
    relatedFiles: [],
    references: [],
  };
}

async function createKeyComponentsPage(analysis: RepositoryAnalysis): Promise<WikiPage> {
  const keyComponents = findKeyComponents(analysis);

  return {
    slug: 'key-components',
    title: '关键组件',
    type: 'overview',
    content: `# 关键组件

## 高复杂度文件

${keyComponents.highComplexity.map(f => `- **${f.file.relativePath}**: 复杂度 ${f.complexityScore}`).join('\n')}

## 主要功能类/函数

${keyComponents.majorClasses.map(c => `- **${c.symbol.name}**: 在 ${c.file.relativePath}`).join('\n')}

## 核心入口点

${keyComponents.entryPoints.map(f => `- ${f.file.relativePath}`).join('\n')}
`,
    children: [],
    tags: ['key-components', 'architecture'],
    relatedFiles: [],
    references: [],
  };
}

function createTestsPage(analysis: RepositoryAnalysis): WikiPage {
  const testFiles = analysis.files.filter(f => f.isTestFile);

  return {
    slug: 'tests',
    title: '测试覆盖',
    type: 'overview',
    content: `# 测试覆盖

## 统计

- **测试文件数**: ${testFiles.length}
- **占总文件比例**: ${(
      (testFiles.length / analysis.totalFiles) *
      100
    ).toFixed(1)}%
- **平均复杂度**: ${(
      testFiles.reduce((sum, f) => sum + f.complexityScore, 0) / testFiles.length
    ).toFixed(1)}

## 测试文件列表

${testFiles.map(f => `- ${f.file.relativePath}`).join('\n')}
`,
    children: [],
    tags: ['tests', 'coverage'],
    relatedFiles: testFiles.map(f => f.file.relativePath),
    references: [],
  };
}

function getLanguageDisplayName(language: string): string {
  const displayNames: { [key: string]: string } = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    go: 'Go',
    cpp: 'C++',
    c: 'C',
    rust: 'Rust',
    php: 'PHP',
    ruby: 'Ruby',
    swift: 'Swift',
    csharp: 'C#',
    kotlin: 'Kotlin',
  };

  return displayNames[language.toLowerCase()] || language;
}

function getLanguageDescription(language: string): string {
  const descriptions: { [key: string]: string } = {
    javascript: '动态类型脚本语言，常用于前端开发',
    typescript: 'JavaScript 的超集，添加了类型系统',
    python: '解释型语言，以简洁优雅著称，适合数据分析和 AI',
    java: '强类型语言，平台无关，广泛用于企业级开发',
    go: 'Google 开发的语言，注重简洁和并发',
    cpp: '高效的系统语言，支持面向对象和泛型编程',
    rust: '内存安全的系统语言，无垃圾回收',
    php: '服务器端脚本语言，主要用于 web 开发',
    ruby: '面向对象脚本语言，注重开发效率',
    swift: 'Apple 开发的语言，用于 iOS 和 macOS 开发',
    csharp: '.NET 平台的主要语言',
    kotlin: 'Android 开发的官方语言，也是现代 JVM 语言',
  };

  return descriptions[language.toLowerCase()] || '通用编程语言';
}

function shouldIncludeFile(fileAnalysis: any, config: PageGeneratorConfig): boolean {
  if (fileAnalysis.isTestFile && !config.includeTests) {
    return false;
  }

  if (isInternalFile(fileAnalysis.file) && !config.includeInternalFiles) {
    return false;
  }

  return true;
}

function isInternalFile(file: any): boolean {
  const internalPatterns = [/\.d\.ts$/, /.*\.internal\./];
  return internalPatterns.some(pattern => pattern.test(file.relativePath));
}

function findCoreFiles(analysis: RepositoryAnalysis): string[] {
  const corePatterns = [
    /main\.|index\.|app\.|server\.|cli\.|config\.|setup\./i,
    /package\.json$|tsconfig\.json$|webpack\.config/,
  ];

  return analysis.files
    .map(f => f.file.relativePath)
    .filter(path => corePatterns.some(p => p.test(path)));
}

function findCoreModules(analysis: RepositoryAnalysis): string {
  const coreFiles = findCoreFiles(analysis);
  const coreModuleNames = coreFiles
    .map(f => f.split('/')[0])
    .filter((v, i, a) => a.indexOf(v) === i);

  return coreModuleNames
    .map(module => `- **${module}**: 包含 ${coreFiles.filter(f => f.startsWith(module)).length} 个核心文件`)
    .join('\n');
}

function findKeyComponents(analysis: RepositoryAnalysis) {
  const highComplexity = analysis.files
    .sort((a, b) => b.complexityScore - a.complexityScore)
    .slice(0, 10);

  const majorClasses = [];

  for (const fileAnalysis of analysis.files) {
    const majorSymbols = fileAnalysis.symbols
      .filter(s => s.isExported && ['class', 'interface', 'type'].includes(s.kind))
      .slice(0, 3);

    majorClasses.push(...majorSymbols.map(s => ({
      symbol: s,
      file: fileAnalysis.file,
    })));
  }

  const entryPoints = analysis.files.filter(f =>
    /main\.|index\.|app\.|server\.|cli\./i.test(f.file.relativePath)
  );

  return { highComplexity, majorClasses, entryPoints };
}

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^\w-]/g, '-');
}

async function generateFileContent(fileAnalysis: any): Promise<string> {
  const file = fileAnalysis.file;

  let content = `# ${file.relativePath}\n\n`;

  content += `## 文件信息\n\n`;
  content += `- **语言**: ${file.language}\n`;
  content += `- **大小**: ${(file.size / 1024).toFixed(1)} KB\n`;
  content += `- **复杂度**: ${fileAnalysis.complexityScore}\n`;
  content += `- **符号数**: ${fileAnalysis.symbols.length}\n\n`;

  if (fileAnalysis.symbols.length > 0) {
    content += `## 代码符号\n\n`;
    content += generateSymbolsSummary(fileAnalysis.symbols);
  }

  if (fileAnalysis.references.length > 0) {
    content += `## 引用关系\n\n`;
    content += fileAnalysis.references
      .map((ref: any) => {
        const to = typeof ref === 'string' ? ref : ref.toPath;
        return `- ${to}`;
      })
      .join('\n');
  }

  return content;
}

function generateSymbolsSummary(symbols: any[]): string {
  const grouped = symbols.reduce((acc: any, symbol) => {
    if (!acc[symbol.kind]) {
      acc[symbol.kind] = [];
    }
    acc[symbol.kind].push(symbol);
    return acc;
  }, {});

  let summary = '';

  for (const [kind, kindSymbols] of Object.entries(grouped)) {
    summary += `### ${kind.toUpperCase()}\n\n`;

    for (const symbol of kindSymbols) {
      if (symbol.isExported) {
        summary += `- **${symbol.name}**\n`;
        if (symbol.docComment) {
          summary += `  ${symbol.docComment}\n`;
        }
      }
    }

    summary += '\n';
  }

  return summary;
}

function printDirectoryTree(structure: any, level: number = 0): string {
  let tree = '';
  const indent = '  '.repeat(level);

  if (structure.name && level === 0) {
    tree += `${structure.name}/\n`;
  }

  for (const file of structure.files) {
    tree += `${indent}${file}\n`;
  }

  for (const dir of structure.subdirectories) {
    tree += `${indent}${dir.name}/\n`;
    tree += printDirectoryTree(dir, level + 1);
  }

  return tree;
}

function generateDependencyGraph(analysis: RepositoryAnalysis): string {
  const seen = new Set<string>();
  const edges: string[] = [];

  for (const fileAnalysis of analysis.files) {
    for (const ref of fileAnalysis.references) {
      const from = fileAnalysis.file.relativePath;
      const to = typeof ref === 'string' ? ref : ref.toPath;

      const edgeKey = `${from}->${to}`;
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey);
        edges.push(`${from} --> ${to}`);
      }
    }
  }

  return edges.join('\n');
}

function groupByModule(pages: Map<string, WikiPage>): { [key: string]: string[] } {
  const result: { [key: string]: string[] } = {};

  for (const [slug, page] of pages.entries()) {
    if (page.type === 'file' && page.tags.includes('language')) {
      const module = page.slug.split('-')[0];
      if (!result[module]) {
        result[module] = [];
      }
      result[module].push(page.slug);
    }
  }

  return result;
}

function groupByFile(pages: Map<string, WikiPage>): { [key: string]: string[] } {
  const result: { [key: string]: string[] } = {};

  for (const [slug, page] of pages.entries()) {
    if (page.type === 'file') {
      const lang = page.tags.find(t => t !== 'file' && t !== 'language');
      if (lang && !result[lang]) {
        result[lang] = [];
      }
      if (lang) {
        result[lang].push(page.slug);
      }
    }
  }

  return result;
}
