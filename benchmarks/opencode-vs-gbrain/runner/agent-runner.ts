import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAdapter, AgentRunResult, GroupConfig, GroupLabel, TaskDef } from './types';
import { homedir, tmpdir } from 'node:os';

const OPENCODE_CONFIG_PATH = join(homedir(), '.config', 'opencode', 'opencode.json');

interface OpencodeAdapterOptions {
  /** Starlette working directory */
  workDir: string;
  /** How to invoke opencode. Falls back to interactive mode if not set. */
  opencodeCommand?: string;
  /** Directory to store per-task logs */
  resultsDir: string;
}

/**
 * OpenCode adapter that manages MCP config and invokes the agent.
 *
 * If opencode supports headless invocation (e.g. `opencode run --prompt-file {promptFile}`),
 * set `opencodeCommand` to the command template with `{promptFile}` placeholder.
 * Otherwise, the adapter prepares the environment and pauses for a manual session.
 */
export function createOpencodeAdapter(opts: OpencodeAdapterOptions): AgentAdapter {
  let groupLabel: GroupLabel = 'A';
  let originalConfigBackup: string | null = null;

  return {
    async setup(config: GroupConfig): Promise<void> {
      groupLabel = config.label;

      // Back up existing opencode config
      if (existsSync(OPENCODE_CONFIG_PATH)) {
        originalConfigBackup = readFileSync(OPENCODE_CONFIG_PATH, 'utf-8');
      }

      // Write group-specific config
      const configDir = join(homedir(), '.config', 'opencode');
      mkdirSync(configDir, { recursive: true });
      const mcpConfig = readFileSync(config.mcpConfigPath, 'utf-8');
      writeFileSync(OPENCODE_CONFIG_PATH, mcpConfig);

      // If Group B, run GBrain index (skip embedding if no API key)
      if (config.needsGbrainIndex) {
        execSync('gbrain init', { cwd: opts.workDir, stdio: 'inherit' });
        execSync(`gbrain config set sync.repo_path "${opts.workDir.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
        // Import code files with keyword search only (no embedding API key needed)
        try {
          execSync('gbrain sync --force', { cwd: opts.workDir, stdio: 'inherit', timeout: 300_000 });
        } catch {
          // Fallback: import without embedding if sync fails (e.g. no OPENAI_API_KEY)
          execSync(`gbrain import "${opts.workDir}" --include-code --no-embed`, { stdio: 'inherit', timeout: 120_000 });
        }
        execSync('gbrain extract links', { cwd: opts.workDir, stdio: 'inherit' });
      }
    },

    async runTask(task: TaskDef, workDir: string): Promise<AgentRunResult> {
      const taskDir = join(opts.resultsDir, `group_${groupLabel.toLowerCase()}`, task.id);
      mkdirSync(taskDir, { recursive: true });

      // Apply seed patch
      try {
        execSync(`git checkout -- . && git clean -fd && git apply ${join(task.dir, 'seed.patch')}`, {
          cwd: workDir,
          stdio: 'pipe',
        });
      } catch (e) {
        return {
          taskId: task.id,
          group: groupLabel,
          success: 0,
          toolCallCount: 0,
          wallClockMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          outputDiff: '',
          outputFiles: {},
          logs: `seed.patch apply failed: ${e}`,
        };
      }

      const startTime = Date.now();
      // Group B uses GBrain-guided prompt if available
      const promptFile = groupLabel === 'B'
        ? (existsSync(join(task.dir, 'prompt_gb.md')) ? 'prompt_gb.md' : 'prompt.md')
        : 'prompt.md';
      const prompt = readFileSync(join(task.dir, promptFile), 'utf-8');
      writeFileSync(join(taskDir, 'prompt_used.md'), prompt);

      if (opts.opencodeCommand) {
        // Headless mode: invoke opencode programmatically
        const promptFile = join(tmpdir(), `bench-task-${task.id}-${groupLabel.toLowerCase()}.md`);
        writeFileSync(promptFile, prompt);
        const cmd = opts.opencodeCommand
          .replace('{promptFile}', promptFile)
          .replace('{workDir}', workDir)
          .replace('{logDir}', taskDir);

        const result = spawn('/bin/sh', ['-c', cmd], {
          cwd: workDir,
          stdio: 'pipe',
        });

        let stdout = '';
        let stderr = '';
        result.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        result.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        await new Promise<void>((resolve, reject) => {
          result.on('error', (err: Error) => {
            reject(err);
          });
          result.on('close', (code: number) => {
            // Save logs before resolving — capture output regardless of exit code
            writeFileSync(join(taskDir, 'session.log'), stdout + '\n' + stderr);
            resolve(); // Always resolve — let verify.sh determine success
          });
        });

        const wallClockMs = Date.now() - startTime;
        const logs = stdout + '\n' + stderr;

        // Parse metrics from agent output
        const toolCallCount = (logs.match(/tool_call|Tool call|invoking tool/gi) ?? []).length;
        const tokensIn = extractNumber(logs, /input tokens?[:\s]+(\d+)/i);
        const tokensOut = extractNumber(logs, /output tokens?[:\s]+(\d+)/i);

        // Capture git diff
        const outputDiff = execSync('git diff', { cwd: workDir, encoding: 'utf-8' });
        writeFileSync(join(taskDir, 'output.diff'), outputDiff);

        // List new files
        const newFiles = execSync('git ls-files --others --exclude-standard', {
          cwd: workDir,
          encoding: 'utf-8',
        });
        const outputFiles: Record<string, string> = {};
        for (const f of newFiles.trim().split('\n').filter(Boolean)) {
          try {
            outputFiles[f] = readFileSync(join(workDir, f), 'utf-8');
          } catch { /* binary or deleted */ }
        }

        // Run verify.sh, extract success score
        const success = runVerify(join(task.dir, 'verify.sh'), workDir, taskDir);

        // Parse GBrain tool usage (Group B only)
        const gbrainToolCalls = groupLabel === 'B' ? parseGbrainTools(logs) : undefined;

        return {
          taskId: task.id,
          group: groupLabel,
          success,
          toolCallCount,
          wallClockMs,
          tokensIn,
          tokensOut,
          outputDiff,
          outputFiles,
          logs,
          gbrainToolCalls,
        };
      } else {
        // Interactive mode: prepare environment, pause for manual run
        writeFileSync(join(taskDir, 'INSTRUCTIONS.md'),
          `# Task: ${task.id} — Group ${groupLabel}\n\n` +
          `Working directory: ${workDir}\n\n` +
          `## Prompt\n\n${prompt}\n\n` +
          `## Steps\n` +
          `1. Start opencode in directory ${workDir}\n` +
          `2. Paste the prompt above\n` +
          `3. Let the agent work until it declares completion\n` +
          `4. Save the session transcript to: ${join(taskDir, 'session.log')}\n` +
          `5. Run: touch ${join(taskDir, 'DONE')}\n`);

        console.log(`\n[${groupLabel}] Task ${task.id} ready.`);
        console.log(`  Work dir: ${workDir}`);
        console.log(`  Instructions: ${join(taskDir, 'INSTRUCTIONS.md')}`);
        console.log(`  Waiting for: ${join(taskDir, 'DONE')}`);

        // Poll for DONE file
        const doneFile = join(taskDir, 'DONE');
        while (!existsSync(doneFile)) {
          await new Promise(r => setTimeout(r, 5000));
        }

        const wallClockMs = Date.now() - startTime;
        // In interactive mode, metrics come from the saved session log
        const logs = existsSync(join(taskDir, 'session.log'))
          ? readFileSync(join(taskDir, 'session.log'), 'utf-8')
          : '';
        const toolCallCount = (logs.match(/tool_call|Tool call|invoking tool/gi) ?? []).length;
        const tokensIn = extractNumber(logs, /input tokens?[:\s]+(\d+)/i);
        const tokensOut = extractNumber(logs, /output tokens?[:\s]+(\d+)/i);
        const outputDiff = execSync('git diff', { cwd: workDir, encoding: 'utf-8' });
        const success = runVerify(join(task.dir, 'verify.sh'), workDir, taskDir);
        const gbrainToolCalls = groupLabel === 'B' ? parseGbrainTools(logs) : undefined;

        return {
          taskId: task.id,
          group: groupLabel,
          success,
          toolCallCount,
          wallClockMs,
          tokensIn,
          tokensOut,
          outputDiff,
          outputFiles: {},
          logs,
          gbrainToolCalls,
        };
      }
    },

    async teardown(): Promise<void> {
      // Restore original opencode config
      if (originalConfigBackup !== null) {
        writeFileSync(OPENCODE_CONFIG_PATH, originalConfigBackup);
      }
      // Reset working directory
      execSync('git checkout -- . && git clean -fd', { cwd: opts.workDir, stdio: 'pipe' });
    },
  };
}

function extractNumber(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : 0;
}

function runVerify(verifyScript: string, workDir: string, logDir: string): number {
  try {
    const out = execSync(`bash ${verifyScript}`, {
      cwd: workDir,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
    });
    writeFileSync(join(logDir, 'verify_stdout.txt'), out);
    return 1.0;
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    writeFileSync(join(logDir, 'verify_stdout.txt'), (err.stdout ?? '') + '\n' + (err.stderr ?? ''));
    if (err.code === 2) return 0.5;  // partial pass per verify.sh contract
    return 0.0;
  }
}

function parseGbrainTools(logs: string): Record<string, number> {
  const tools = ['search', 'query', 'get_page', 'put_page', 'list_pages', 'get_backlinks',
    'traverse_graph', 'resolve_slugs', 'file_list', 'get_ingest_log', 'get_stats', 'get_health'];
  const counts: Record<string, number> = {};
  for (const tool of tools) {
    const re = new RegExp(`"method":"tools/call"[^}]*"name":"${tool}"`, 'gi');
    const matches = logs.match(re);
    if (matches) counts[tool] = matches.length;
  }
  return counts;
}
