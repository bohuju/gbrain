import { createInterface } from 'node:readline';
import { RepoAnalyzer, AnalyzeProgress } from '../core/repo-analyzer/index.ts';
import { createProgress } from '../core/progress.ts';

export const description = 'Analyze a code repository and generate structured documentation';

export const help = `
gbrain analyze-repo <url|path> [options]

Analyze a code repository and generate structured docs with query support.

Options:
  --help, -h          Show help
  --output, -o        Output directory
  --include-tests     Include test files
  --include-examples  Include example files
  --format, -f        Output format (markdown/json)
  --no-wiki           Skip wiki generation
  --query, -q         Interactive query mode
  --access-token      Repository access token
  --json              Output JSON format
`;

interface AnalyzeOptions {
  help?: boolean;
  output?: string;
  'include-tests'?: boolean;
  'include-examples'?: boolean;
  'no-wiki'?: boolean;
  query?: boolean;
  json?: boolean;
  format?: string;
  'access-token'?: string;
  _: string[];
}

function parseArgs(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = { _: [] };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--include-tests') {
      options['include-tests'] = true;
    } else if (arg === '--include-examples') {
      options['include-examples'] = true;
    } else if (arg === '--no-wiki') {
      options['no-wiki'] = true;
    } else if (arg === '--query' || arg === '-q') {
      options.query = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if ((arg === '--output' || arg === '-o') && i + 1 < args.length) {
      options.output = args[++i];
    } else if ((arg === '--format' || arg === '-f') && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === '--access-token' && i + 1 < args.length) {
      options['access-token'] = args[++i];
    } else if (!arg.startsWith('-')) {
      options._.push(arg);
    }

    i++;
  }

  return options;
}

async function promptLoop(analyzer: RepoAnalyzer): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write('Enter your question (quit/q to exit):\n');

  for await (const line of rl) {
    const query = line.trim();
    if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'q') {
      rl.close();
      break;
    }

    if (query) {
      const result = await analyzer.query(query);
      process.stdout.write('\n' + '─'.repeat(60) + '\n');
      process.stdout.write(result.answer + '\n');
      process.stdout.write('─'.repeat(60) + '\n');
      process.stdout.write(`\nConfidence: ${(result.confidence * 100).toFixed(1)}%\n`);

      if (result.sources.length > 0) {
        process.stdout.write('\nSources:\n');
        result.sources.slice(0, 3).forEach(s => {
          process.stdout.write(`  - ${s}\n`);
        });
      }

      process.stdout.write('\nContinue asking (quit/q to exit):\n');
    }
  }
}

export async function run(args: string[] = []) {
  const options = parseArgs(args);

  if (options.help || args.length === 0) {
    console.log(help);
    return;
  }

  const repoInput = options._[0];
  if (!repoInput) {
    console.error('Repository URL or local path is required');
    console.log(help);
    return 1;
  }

  const includeTests = options['include-tests'];
  const includeExamples = options['include-examples'];
  const accessToken = options['access-token'];

  let progressReporter: ReturnType<typeof createProgress> | undefined;
  if (!options.json) {
    progressReporter = createProgress({ mode: 'auto' });
  }

  try {
    if (!options.json) {
      console.log('Analyzing repository...');
    }

    const analyzer = new RepoAnalyzer(repoInput);

    const wikiStructure = await analyzer.analyze({
      includeTests,
      includeExamples,
      accessToken,
      onProgress: (progress: AnalyzeProgress) => {
        if (progressReporter) {
          progressReporter.update(progress.current, progress.total, progress.message);
        } else if (options.json) {
          console.error(JSON.stringify({
            phase: progress.phase,
            current: progress.current,
            total: progress.total,
            message: progress.message,
          }));
        }
      },
    });

    if (!options.json) {
      console.log('\nAnalysis complete.');
    }

    const stats = analyzer.getStats();

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        repoInfo: analyzer.getRepoInfo(),
        stats,
        pageCount: wikiStructure.pages.size,
        pages: Array.from(wikiStructure.pages.values()).map(page => ({
          slug: page.slug,
          title: page.title,
          type: page.type,
          tags: page.tags,
        })),
      }, null, 2));
    } else {
      console.log('\nAnalysis stats:');
      console.log(`   Files: ${stats?.fileCount}`);
      console.log(`   Languages: ${stats?.languages.size}`);
      console.log(`   Symbols: ${stats?.symbolCount}`);
      console.log(`   Pages generated: ${wikiStructure.pages.size}`);

      console.log('\nGenerated pages:');
      Array.from(wikiStructure.pages.values()).slice(0, 10).forEach(page => {
        console.log(`   - ${page.title}`);
      });

      if (wikiStructure.pages.size > 10) {
        console.log(`   ... and ${wikiStructure.pages.size - 10} more`);
      }

      if (options.query) {
        await promptLoop(analyzer);
      } else {
        console.log('\nTip: use --query or -q for interactive query mode');
      }
    }

    return 0;
  } catch (error) {
    console.error('\nAnalysis failed:', error);
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: String(error) }, null, 2));
    }
    return 1;
  }
}
