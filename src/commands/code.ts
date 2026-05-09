import type { BrainEngine } from '../core/engine.ts';
import { clampSearchLimit } from '../core/engine.ts';
import type { Page, SearchResult } from '../core/types.ts';

interface CodeCommandOptions {
  json: boolean;
  tag?: string;
  limit: number;
}

function printUsage(): void {
  console.log(`Usage:
  gbrain code list [--tag <language>] [-n <limit>] [--json]
  gbrain code search <query> [-n <limit>] [--json]
`);
}

function parseOptions(args: string[], defaultLimit: number): { opts: CodeCommandOptions; rest: string[] } {
  const rest: string[] = [];
  const opts: CodeCommandOptions = { json: false, limit: defaultLimit };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--tag' || arg === '--language') {
      opts.tag = args[++i];
      continue;
    }
    if (arg === '-n' || arg === '--limit') {
      opts.limit = Number(args[++i]);
      continue;
    }
    rest.push(arg);
  }

  opts.limit = clampSearchLimit(opts.limit, defaultLimit, 100);
  return { opts, rest };
}

function formatDate(value: Date | string | undefined): string {
  if (!value) return '?';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '?';
  return date.toISOString().slice(0, 10);
}

function codeLanguage(page: Page): string {
  const lang = page.frontmatter?.language;
  return typeof lang === 'string' && lang ? lang : '-';
}

function codePath(page: Page): string {
  const path = page.frontmatter?.file_path;
  return typeof path === 'string' && path ? path : page.slug.replace(/^code\//, '');
}

function formatListText(pages: Page[]): string {
  if (pages.length === 0) return 'No code files found.\n';
  return pages.map(page =>
    `${page.slug}\t${codeLanguage(page)}\t${formatDate(page.updated_at)}\t${codePath(page)}`,
  ).join('\n') + '\n';
}

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function formatSearchText(results: SearchResult[]): string {
  if (results.length === 0) return 'No code results.\n';
  return results.map(result =>
    `[${result.score?.toFixed(4) ?? '?'}] ${result.slug} ${result.chunk_source}:${result.chunk_index} -- ${snippet(result.chunk_text)}`,
  ).join('\n') + '\n';
}

async function runList(engine: BrainEngine, args: string[]): Promise<void> {
  const { opts } = parseOptions(args, 50);
  const pages = await engine.listPages({ type: 'code_file', tag: opts.tag, limit: opts.limit });

  if (opts.json) {
    console.log(JSON.stringify({
      files: pages.map(page => ({
        slug: page.slug,
        title: page.title,
        language: codeLanguage(page),
        path: codePath(page),
        updated_at: page.updated_at instanceof Date ? page.updated_at.toISOString() : page.updated_at,
      })),
    }, null, 2));
    return;
  }

  process.stdout.write(formatListText(pages));
}

async function runSearch(engine: BrainEngine, args: string[]): Promise<void> {
  const { opts, rest } = parseOptions(args, 20);
  const query = rest.join(' ').trim();
  if (!query) {
    console.error('Usage: gbrain code search <query> [-n <limit>] [--json]');
    process.exit(2);
  }

  const results = await engine.searchKeyword(query, { type: 'code_file', limit: opts.limit });
  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  process.stdout.write(formatSearchText(results));
}

export async function runCode(engine: BrainEngine, args: string[]): Promise<void> {
  const subcommand = args[0];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printUsage();
    return;
  }

  if (subcommand === 'list') {
    await runList(engine, args.slice(1));
    return;
  }

  if (subcommand === 'search') {
    await runSearch(engine, args.slice(1));
    return;
  }

  console.error(`Unknown code subcommand: ${subcommand}`);
  printUsage();
  process.exit(2);
}
