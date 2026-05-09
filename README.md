# GBrain

Your AI agent is smart but forgetful. GBrain gives it a brain.

Built by the President and CEO of Y Combinator to run his actual AI agents. The production brain powering his OpenClaw and Hermes deployments: **17,888 pages, 4,383 people, 723 companies**, 21 cron jobs running autonomously, built in 12 days. The agent ingests meetings, emails, tweets, voice calls, and original ideas while you sleep. It enriches every person and company it encounters. It fixes its own citations and consolidates memory overnight. You wake up and the brain is smarter than when you went to bed.

The brain wires itself. Every page write extracts entity references and creates typed links (`attended`, `works_at`, `invested_in`, `founded`, `advises`) with zero LLM calls. Hybrid search. Self-wiring knowledge graph. Structured timeline. Backlink-boosted ranking. Ask "who works at Acme AI?" or "what did Bob invest in this quarter?" and get answers vector search alone can't reach. Benchmarked end-to-end: **Recall@5 jumps from 83% to 95%, Precision@5 from 39% to 45%, +30 more correct answers in the agent's top-5 reads** on a 240-page Opus-generated rich-prose corpus. Graph-only F1: **86.6% vs grep's 57.8%** (+28.8 pts). [Full report](docs/benchmarks/2026-04-18-brainbench-v1.md).

GBrain is those patterns, generalized. 26 skills. Install in 30 minutes. Your agent does the work. As Garry's personal agent gets smarter, so does yours.

> **~30 minutes to a fully working brain.** Database ready in 2 seconds (PGLite, no server). You just answer questions about API keys.

> **LLMs:** fetch [`llms.txt`](llms.txt) for the documentation map, or [`llms-full.txt`](llms-full.txt) for the same map with core docs inlined in one fetch. **Agents:** start with [`AGENTS.md`](AGENTS.md) (or [`CLAUDE.md`](CLAUDE.md) if you're Claude Code).

## Install

### On an agent platform (recommended)

GBrain is designed to be installed and operated by an AI agent. If you don't have one running yet:

- **[OpenClaw](https://openclaw.ai)** ... Deploy [AlphaClaw on Render](https://render.com/deploy?repo=https://github.com/chrysb/alphaclaw) (one click, 8GB+ RAM)
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** ... Deploy on [Railway](https://github.com/praveen-ks-2001/hermes-agent-template) (one click)

Paste this into your agent:

```
Retrieve and follow the instructions at:
https://raw.githubusercontent.com/garrytan/gbrain/master/INSTALL_FOR_AGENTS.md
```

That's it. The agent clones the repo, installs GBrain, sets up the brain, loads 26 skills, and configures recurring jobs. You answer a few questions about API keys. ~30 minutes.

If your agent doesn't auto-read `AGENTS.md`, point it at that file first:
`https://raw.githubusercontent.com/garrytan/gbrain/master/AGENTS.md` is the non-Claude
agent operating protocol (install, read order, trust boundary, common tasks). For
the full doc map, use `llms.txt` at the same URL root.

### Standalone CLI (no agent)

```bash
git clone https://github.com/garrytan/gbrain.git && cd gbrain && bun install && bun link
gbrain init                     # local brain, ready in 2 seconds
gbrain import ~/notes/          # index your markdown
gbrain query "what themes show up across my notes?"
```

**Do NOT use `bun install -g github:garrytan/gbrain`.** Bun blocks the top-level
postinstall hook on global installs, so schema migrations never run and the CLI
aborts with `Aborted()` the first time it opens PGLite. Use `git clone + bun install
&& bun link` as shown above. See [#218](https://github.com/garrytan/gbrain/issues/218).

```
3 results (hybrid search, 0.12s):

1. concepts/do-things-that-dont-scale (score: 0.94)
   PG's argument that unscalable effort teaches you what users want.
   [Source: paulgraham.com, 2013-07-01]

2. originals/founder-mode-observation (score: 0.87)
   Deep involvement isn't micromanagement if it expands the team's thinking.

3. concepts/build-something-people-want (score: 0.81)
   The YC motto. Connected to 12 other brain pages.
```

### MCP server (Claude Code, Cursor, Windsurf)

GBrain exposes 30+ MCP tools via stdio:

```json
{
  "mcpServers": {
    "gbrain": { "command": "gbrain", "args": ["serve"] }
  }
}
```

Add to `~/.claude/server.json` (Claude Code), Settings > MCP Servers (Cursor), or your client's MCP config.

### Remote MCP (Claude Desktop, Cowork, Perplexity)

```bash
ngrok http 8787 --url your-brain.ngrok.app
bun run src/commands/auth.ts create "claude-desktop"
claude mcp add gbrain -t http https://your-brain.ngrok.app/mcp -H "Authorization: Bearer TOKEN"
```

Per-client guides: [`docs/mcp/`](docs/mcp/DEPLOY.md). ChatGPT requires OAuth 2.1 (not yet implemented).

## The 26 Skills

GBrain ships 26 skills organized by `skills/RESOLVER.md`. The resolver tells your agent which skill to read for any task.

[Skill files are code.](https://x.com/garrytan/status/2042925773300908103) They're the most powerful way to get knowledge work done. A skill file is a fat markdown document that encodes an entire workflow: when to fire, what to check, how to chain with other skills, what quality bar to enforce. The agent reads the skill and executes it. Skills can also call deterministic TypeScript code bundled in GBrain (search, import, embed, sync) for the parts that shouldn't be left to LLM judgment. [Thin harness, fat skills](docs/ethos/THIN_HARNESS_FAT_SKILLS.md): the intelligence lives in the skills, not the runtime.

### Always-on

| Skill | What it does |
|-------|-------------|
| **signal-detector** | Fires on every message. Spawns a cheap model in parallel to capture original thinking and entity mentions. The brain compounds on autopilot. |
| **brain-ops** | Brain-first lookup before any external API. The read-enrich-write loop that makes every response smarter. |

### Content ingestion

| Skill | What it does |
|-------|-------------|
| **ingest** | Thin router. Detects input type and delegates to the right ingestion skill. |
| **idea-ingest** | Links, articles, tweets become brain pages with analysis, author people pages, and cross-linking. |
| **media-ingest** | Video, audio, PDF, books, screenshots, GitHub repos. Transcripts, entity extraction, backlink propagation. |
| **meeting-ingestion** | Transcripts become brain pages. Every attendee gets enriched. Every company gets a timeline entry. |

### Brain operations

| Skill | What it does |
|-------|-------------|
| **enrich** | Tiered enrichment (Tier 1/2/3). Creates and updates person/company pages with compiled truth and timelines. |
| **query** | 3-layer search with synthesis and citations. Says "the brain doesn't have info on X" instead of hallucinating. |
| **maintain** | Periodic health: stale pages, orphans, dead links, citation audit, back-link enforcement, tag consistency. |
| **citation-fixer** | Scans pages for missing or malformed citations. Fixes format to match the standard. |
| **repo-architecture** | Where new brain files go. Decision protocol: primary subject determines directory, not format. |
| **publish** | Share brain pages as password-protected HTML. Zero LLM calls. |
| **data-research** | Structured data research with parameterized YAML recipes. Extract investor updates, expenses, company metrics from email. |

### Operational

| Skill | What it does |
|-------|-------------|
| **daily-task-manager** | Task lifecycle with priority levels (P0-P3). Stored as searchable brain pages. |
| **daily-task-prep** | Morning prep: calendar lookahead with brain context per attendee, open threads, task review. |
| **cron-scheduler** | Schedule staggering (5-min offsets), quiet hours (timezone-aware with wake-up override), idempotency. |
| **reports** | Timestamped reports with keyword routing. "What's the latest briefing?" finds it instantly. |
| **cross-modal-review** | Quality gate via second model. Refusal routing: if one model refuses, silently switch. |
| **webhook-transforms** | External events (SMS, meetings, social mentions) converted into brain pages with entity extraction. |
| **testing** | Validates every skill has SKILL.md with frontmatter, manifest coverage, resolver coverage. |
| **skill-creator** | Create new skills following the conformance standard. MECE check against existing skills. |
| **minion-orchestrator** | Long-running agent work as background jobs. Submit, fan out children with depth/cap/timeouts, collect results via child_done inbox. |

### Identity and setup

| Skill | What it does |
|-------|-------------|
| **soul-audit** | 6-phase interview generating SOUL.md (agent identity), USER.md (user profile), ACCESS_POLICY.md (4-tier privacy), HEARTBEAT.md (operational cadence). |
| **setup** | Auto-provision PGLite or Supabase. First import. GStack detection. |
| **migrate** | Universal migration from Obsidian, Notion, Logseq, markdown, CSV, JSON, Roam. |
| **briefing** | Daily briefing with meeting context, active deals, and citation tracking. |

### Conventions

Cross-cutting rules in `skills/conventions/`:
- **quality.md** ... citations, back-links, notability gate, source attribution
- **brain-first.md** ... 5-step lookup before any external API call
- **model-routing.md** ... which model for which task
- **test-before-bulk.md** ... test 3-5 items before any batch operation
- **cross-modal.yaml** ... review pairs and refusal routing chain

## How It Works

The operational loop is simple:

```text
signal in → brain lookup → response/workflow → write back → derived state refresh → better next turn
```

The detailed mechanics now live in [End-to-End Pipelines](#end-to-end-pipelines). That section is the canonical walkthrough for write, code, sync, search, graph, files, jobs, and maintenance flows.

What matters at the product level is the compounding loop: every meeting, page edit, sync, import, and cron run leaves the brain in a better state for the next turn. The agent enriches a person page after a meeting; next time that person appears, the context is already there.

The system gets smarter on its own. Entity enrichment auto-escalates: a person mentioned once gets a stub page (Tier 3). After 3 mentions across different sources, they get web + social enrichment (Tier 2). After a meeting or 8+ mentions, full pipeline (Tier 1). The brain learns who matters without being told. Deterministic classifiers improve over time via a fail-improve loop that logs every LLM fallback and generates better regex patterns from the failures. `gbrain doctor` shows the trajectory: "intent classifier: 87% deterministic, up from 40% in week 1."

> "Prep me for my meeting with Jordan in 30 minutes"
> ... pulls dossier, shared history, recent activity, open threads

> "What have I said about the relationship between shame and founder performance?"
> ... searches YOUR thinking, not the internet

## Minions: your sub-agents won't drop work anymore

A durable, Postgres-native job queue built into the brain. Every long-running agent task is now a job that survives gateway restarts, streams progress, gets paused / resumed / steered mid-flight, and shows up in `gbrain jobs list`. Zero infra beyond your existing brain.

### The production numbers that matter

Here's my personal OpenClaw deployment: one Render container. Supabase Postgres holding a 45,000-page brain. 19 cron jobs firing on schedule. Real gateway load from real daily work. The task: pull a month of my social posts from an external API and ingest them end-to-end into the brain as a structured page.

|              | Minions   | `sessions_spawn`               |
|---           |---        |---                             |
| Wall time    | **753ms** | **>10,000ms** (gateway timeout) |
| Token cost   | **$0.00** | ~$0.03 per run                 |
| Success rate | **100%**  | **0%** (couldn't even spawn)   |
| Memory/job   | ~2 MB     | ~80 MB                         |

Under that 19-cron load, sub-agent spawn couldn't clear the 10-second gateway wall. Minions landed it in under a second for zero tokens. **Scaling:** 19,240 posts across 36 months, single bash loop, ~15 min total, $0.00. Sub-agents: ~9 min best case, ~$1.08 in tokens, ~40% spawn failure. **Lab:** durability ∞ (SIGKILL mid-flight, 10/10 rescued), throughput ~10× faster, fan-out ~21× with no failure wall, memory ~400× less.

Full benchmarks: [production](docs/benchmarks/2026-04-18-minions-vs-openclaw-production.md) and [lab](docs/benchmarks/2026-04-18-minions-vs-openclaw-subagents.md).

### The routing rule

> **Deterministic** (same input → same steps → same output) → **Minions**
> **Judgment** (input requires assessment or decision) → **Sub-agents**

Pull posts, parse JSON, write a brain page, run a sync — deterministic. $0 tokens, survives restart, millisecond runtime. Triage the inbox, assess meeting priority, decide if a cold email deserves a reply — judgment. What sub-agents are actually good at. `minion_mode: pain_triggered` (the default) automates the routing.

### What's fixed

The six daily pains — spawn storms, agents that stop responding, forgotten dispatches, gateway crashes mid-run, runaway grandchildren, debugging soup — all belonged to the "deterministic work through a reasoning model" mistake. Minions fixes them by not making that mistake: `max_children` cap, `timeout_ms` + AbortSignal, `child_done` inbox, full `parent_job_id`/`depth`/transcript per job, Postgres durability with stall detection, cascade cancel via recursive CTE. Plus idempotency keys, attachment validation, `removeOnComplete`, and `gbrain jobs smoke` that proves the install in half a second.

```bash
gbrain jobs smoke                        # verify install
gbrain jobs submit sync --params '{}'    # fire a background job
gbrain jobs stats                        # health dashboard
gbrain jobs work --concurrency 4         # start a worker (Postgres only)
```

Read [`skills/minion-orchestrator/SKILL.md`](skills/minion-orchestrator/SKILL.md) for parent-child DAGs, fan-in collection, steering via inbox.

**Minions is not incrementally better than sub-agents for background work. It's categorically different.** 753ms vs gateway timeout. $0 vs tokens. 100% vs couldn't-spawn. If your agent does deterministic work on a schedule, it runs on Minions now.

### Health check and self-heal

Minions is canonical as of v0.11.1 — every `gbrain upgrade` runs the migration automatically (schema → smoke → prefs → host rewrites → env-aware autopilot install). If you ever want to verify manually or wire a cron into your morning briefing:

```bash
gbrain doctor                    # half-migrated state? prints loud banner + exits non-zero
gbrain skillpack-check --quiet    # exit 0/1/2 for pipeline gating
gbrain skillpack-check | jq       # full JSON: {healthy, summary, actions[], doctor, migrations}
```

If anything's off, `actions[]` tells you the exact command to run. For deeper troubleshooting: [`docs/guides/minions-fix.md`](docs/guides/minions-fix.md).

Moving gateway crons to Minions (deterministic scripts, zero LLM tokens per fire): [`docs/guides/minions-shell-jobs.md`](docs/guides/minions-shell-jobs.md).

## Durable agents: `gbrain agent` (v0.15)

Your subagent runs survive crashes now. OpenClaw died mid-run? The worker re-claims on restart and replays from the last committed turn. Fan-out across 50 shards, one shard crashes — the aggregator still claims after every child reaches a terminal state and writes a mixed-outcome summary. Tool calls persist as a two-phase ledger (`pending` → `complete | failed`) so replay is safe by construction, not by hope.

```bash
# Submit a single-subagent run
gbrain agent run "summarize my last 10 journal pages"

# Fan out N prompts across N subagent children + 1 aggregator
gbrain agent run "analyze every page" \
  --fanout-manifest manifests/pages.json \
  --subagent-def analyzer

# Tail a running job (heartbeat per turn + full transcript on completion)
gbrain agent logs 1247 --follow --since 5m
```

Durability is the point: every Anthropic turn commits to `subagent_messages`, every tool call to `subagent_tool_executions`. Worker kills, OpenClaw crashes, timeouts — all resumable. Host repos (your OpenClaw, etc.) ship their own subagent definitions via `GBRAIN_PLUGIN_PATH` + a `gbrain.plugin.json` manifest: see [`docs/guides/plugin-authors.md`](docs/guides/plugin-authors.md). Requires `ANTHROPIC_API_KEY` on the worker.

## Skillify: your skills tree stops being a black box

Hermes and similar agent frameworks auto-create skills as a background behavior. Fine until you don't know what the agent shipped. Checklists decay. Tests drift. Resolver entries get stale. Six months later you've got an opaque pile of "skills" that nobody has read, nobody has tested, and nobody is sure still work.

GBrain ships the same capability. Except the human stays in the loop.

- **`/skillify`** turns raw code into a properly-skilled feature: SKILL.md + deterministic script + unit tests + integration tests + LLM evals + resolver trigger + resolver trigger eval + E2E smoke + brain filing. Ten items. Every one required.
- **`gbrain check-resolvable`** walks the whole skills tree: reachability, MECE overlap, DRY violations, gap detection, orphaned skills. Exits non-zero if anything is off.
- **`scripts/skillify-check.ts`** — machine-readable audit. `--json` for CI, `--recent` for last-7-days files.

You decide when and what. The tooling keeps the checklist honest.

### Why this is the right answer for OpenClaw

Auto-generated skills are a liability the first time a behavior breaks. Was it the skill? The test? The resolver trigger? The eval? You don't know, because you never read it. Debugging a black box is pure guesswork.

Skillify makes the black box legible. Every skill in your tree has: a contract (SKILL.md), tests that exercise that contract, an eval that grades LLM output against a rubric, a resolver trigger the user actually types, and a test that confirms the trigger routes right. If something breaks, you know which layer to look at. If anything goes stale, `check-resolvable` says so.

In practice this combo produces **zero orphaned skills, every feature with tests + evals + resolver triggers + evals of the triggers.** Compounding quality instead of compounding entropy.

```bash
# Audit a feature's skill completeness (10-item checklist)
bun run scripts/skillify-check.ts src/commands/publish.ts

# In CI: fail the build when a new feature isn't properly skilled
bun run scripts/skillify-check.ts --json --recent

# Validate the whole skills tree before shipping
gbrain check-resolvable
```

**Skillify is not a nice-to-have. It's the piece that makes the skills tree survive six months of compounding work.** Read [`skills/skillify/SKILL.md`](skills/skillify/SKILL.md) for the full 10-item checklist and the anti-patterns it catches.

## Getting Data In

GBrain ships integration recipes that your agent sets up for you. Each recipe tells the agent what credentials to ask for, how to validate, and what cron to register.

| Recipe | Requires | What It Does |
|--------|----------|-------------|
| [Public Tunnel](recipes/ngrok-tunnel.md) | — | Fixed URL for MCP + voice (ngrok Hobby $8/mo) |
| [Credential Gateway](recipes/credential-gateway.md) | — | Gmail + Calendar access |
| [Voice-to-Brain](recipes/twilio-voice-brain.md) | ngrok-tunnel | Phone calls to brain pages (Twilio + OpenAI Realtime) |
| [Email-to-Brain](recipes/email-to-brain.md) | credential-gateway | Gmail to entity pages |
| [X-to-Brain](recipes/x-to-brain.md) | — | Twitter timeline + mentions + deletions |
| [Calendar-to-Brain](recipes/calendar-to-brain.md) | credential-gateway | Google Calendar to searchable daily pages |
| [Meeting Sync](recipes/meeting-sync.md) | — | Circleback transcripts to brain pages with attendees |

**Data research recipes** extract structured data from email into tracked brain pages. Built-in recipes for investor updates (MRR, ARR, runway, headcount), expense tracking, and company metrics. Create your own with `gbrain research init`.

Run `gbrain integrations` to see status.

## GBrain + GStack

[GStack](https://github.com/garrytan/gstack) is the engine. GBrain is the mod.

- **[GStack](https://github.com/garrytan/gstack)** = coding skills (ship, review, QA, investigate, office-hours, retro). 70,000+ stars, 30,000 developers per day. When your agent codes on itself, it uses GStack.
- **GBrain** = everything-else skills (brain ops, signal detection, ingestion, enrichment, cron, reports, identity). When your agent remembers, thinks, and operates, it uses GBrain.
- **`hosts/gbrain.ts`** = the bridge. Tells GStack's coding skills to check the brain before coding.

`gbrain init` detects if GStack is installed and reports mod status. If GStack isn't there, it tells you how to get it.

## Architecture

```
┌──────────────────┐    ┌───────────────┐    ┌──────────────────┐
│   Brain Repo     │    │    GBrain     │    │    AI Agent      │
│   (git)          │    │  (retrieval)  │    │  (read/write)    │
│                  │    │               │    │                  │
│  markdown files  │───>│  Postgres +   │<──>│  26 skills       │
│  = source of     │    │  pgvector     │    │  define HOW to   │
│    truth         │    │               │    │  use the brain   │
│                  │<───│  hybrid       │    │                  │
│  human can       │    │  search       │    │  RESOLVER.md     │
│  always read     │    │  (vector +    │    │  routes intent   │
│  & edit          │    │   keyword +   │    │  to skill        │
│                  │    │   RRF)        │    │                  │
└──────────────────┘    └───────────────┘    └──────────────────┘
```

The repo is the system of record. GBrain is the retrieval layer. The agent reads and writes through both. Human always wins... edit any markdown file and `gbrain sync` picks up the changes.

## End-to-End Pipelines

GBrain is not one pipeline. It is a set of deterministic pipelines that share the same core tables, engine interface, and skill layer:

- `pages` is the canonical content layer for markdown pages and code files.
- `content_chunks` is the retrieval layer for compiled truth, timeline, and source code chunks.
- `links` is the graph layer for markdown references and code references.
- `page_versions` is the history layer for edits and re-imports.
- `sources`, `files`, `minion_jobs`, and config keys are the operational layer around the brain.

Everything below reuses those same primitives.

### 1. Entry points

```
Human / Agent / Cron / Webhook / MCP client
  → CLI (`gbrain ...`) or MCP server (`gbrain serve`)
  → operations.ts contract
  → BrainEngine (`pglite` or `postgres`)
  → shared tables + shared search/graph/chunk logic
```

- CLI callers are trusted local callers.
- MCP callers are remote callers and go through the stricter trust boundary.
- The same operation contract powers both surfaces, so behavior is shared instead of forked.

### 2. Markdown write pipeline

```
put/import/sync of markdown
  → parse frontmatter + body
  → slug authority check (path-derived slug wins)
  → split into compiled_truth + timeline
  → chunk compiled_truth/timeline
  → embed chunks (best-effort, before DB transaction)
  → transaction:
      createVersion (if existing)
      putPage
      reconcile tags
      upsertChunks / deleteChunks
  → auto-link post-hook
  → search + graph immediately see the new state
```

Key properties:

- Idempotent by content hash.
- Empty content removes stale chunks.
- Embedding failure does not block page persistence.
- Page text remains the source of truth; derived graph/search state is rebuildable.

### 3. Code import pipeline

```
sync/import with --include-code
  → detectCodeLanguage
  → codePathToSlug
  → extractSymbols
  → extractReferences
  → chunk symbol bodies + uncovered top-level code
  → embed chunks (best-effort)
  → transaction:
      createVersion (if existing)
      putPage(type=code_file, compiled_truth=raw source)
      reconcile language tag
      upsertChunks(source_code)
      delete stale code_import links
      addLinksBatch(imports/calls/extends/implements/tests)
```

Key properties:

- Code is layered onto the existing page/chunk/link model, not a parallel subsystem.
- `code_search_vector` uses `simple` tsvector config to preserve identifiers.
- Code files can be listed, searched, versioned, graphed, orphan-checked, and exported through the same core machinery.

### 4. Git sync pipeline

```
git repo
  → read repo_path + last_commit
  → optional git pull --ff-only
  → validate ancestry
  → git diff --name-status -M last..HEAD
  → buildSyncManifest
  → isSyncable(markdown|code|false)
  → delete removed pages
  → rename moved pages
  → import added/modified files one by one
  → record sync failures if any file fails
  → advance sync anchor only on success (or explicit --skip-failed)
  → optional extract links/timeline
  → optional embed changed pages
```

Key properties:

- Per-file atomicity, not one giant transaction.
- Broken files block bookmark advancement instead of silently disappearing from future syncs.
- `--retry-failed` and `--skip-failed` make failure recovery explicit.
- `--include-code` gates code ingestion cleanly rather than mixing file classes by default.

### 5. Search pipeline

```
query/search
  → classify intent
  → auto-pick detail level
  → detect code-like query or page-type filter
  → keyword search (english for markdown, simple for code)
  → optional vector search (if embeddings/API key available)
  → optional multi-query expansion
  → RRF fusion
  → cosine re-score
  → compiled-truth boost
  → backlink boost
  → source-aware dedup
  → top-k results
```

There are really two search surfaces:

- `gbrain search`: deterministic full-text entrypoint, fast, no embedding required.
- `gbrain query`: hybrid retrieval entrypoint, uses the whole ranking stack.

Both share the same chunk and page model, so markdown and code can coexist in one result set.

### 6. Graph pipeline

```
page write / extract job / code import
  → derive typed links
  → store in links with provenance
  → graph-query / backlinks / orphans / backlink boost consume those links
```

Graph producers:

- Markdown auto-linking on write.
- Batch `gbrain extract links|timeline|all`.
- Code reference extraction during code import.

Graph consumers:

- `graph-query` recursive traversal.
- `get_backlinks` and ranking boosts.
- `orphans` for maintenance and coverage audits.
- Agent workflows that need typed relationships, not just fuzzy retrieval.

### 7. File and blob pipeline

```
local binary file
  → files upload/mirror/sync
  → storage backend (S3 / Supabase Storage / local)
  → files ledger row with hash + mime + metadata
  → optional redirect pointer in repo
  → restore/verify/clean operations
```

This keeps the brain repo readable while letting large media live in durable object storage. The page graph stays in Postgres; the bytes live in storage.

### 8. Minions and durable agent pipeline

```
skill / cron / operator action
  → jobs submit
  → minion_jobs row + attempts ledger
  → worker claim / heartbeat / renew lock
  → handler executes (shell, subagent, built-ins)
  → complete / fail / retry / stall rescue
  → stats / logs / child_done inbox / parent aggregation
```

Key properties:

- Postgres-native durability.
- Parent/child DAG support.
- Timeouts, backoff, idempotency keys, max-stalled rescue.
- Deterministic work routes here instead of burning LLM tokens on background execution.

### 9. Health and maintenance pipeline

```
doctor / maintain / check-resolvable / jobs smoke / skillpack-check
  → schema + config + engine checks
  → embedding coverage / sync failure / orphan / dead-link checks
  → resolver + skills-tree conformance checks
  → optional auto-fixes for safe classes of drift
```

This is what keeps the system maintainable over time. GBrain assumes derived state will drift, then gives you commands to detect and repair it rather than pretending drift never happens.

### 10. Full system view

```
Signals in
  → skills decide what workflow to run
  → operations.ts provides the stable tool contract
  → import/write/sync pipelines normalize data into pages/chunks/links
  → search/graph/files/jobs consume the same normalized state
  → maintain/doctor verify health and repair drift
  → better context for the next agent turn
```

The design goal is deliberate: add capabilities by extending shared pipelines, not by spawning one-off subsystems. That is what keeps later changes cheap.

## The Knowledge Model

Every page follows the compiled truth + timeline pattern:

```markdown
---
type: concept
title: Do Things That Don't Scale
tags: [startups, growth, pg-essay]
---

Paul Graham's argument that startups should do unscalable things early on.
The key insight: the unscalable effort teaches you what users actually
want, which you can't learn any other way.

---

- 2013-07-01: Published on paulgraham.com
- 2024-11-15: Referenced in batch W25 kickoff talk
```

Above the `---`: **compiled truth**. Your current best understanding. Gets rewritten when new evidence changes the picture. Below: **timeline**. Append-only evidence trail. Never edited, only added to.

## Knowledge Graph

Pages aren't just text. Every mention of a person, company, or concept becomes a typed link in a structured graph. The brain wires itself.

```
Write a meeting page mentioning Alice and Acme AI
  -> Auto-link extracts entity refs from content (zero LLM calls)
  -> Infers types: meeting page + person ref => `attended`
                   "CEO of X" pattern        => `works_at`
                   "invested in"             => `invested_in`
                   "advises", "advisor"      => `advises`
                   "founded", "co-founded"   => `founded`
  -> Reconciles stale links: edits remove links no longer in content
  -> Backlinks rank well-connected entities higher in search
```

```bash
gbrain graph-query people/alice --type attended --depth 2
# returns who Alice met with, transitively
```

The graph powers questions vector search can't: "who works at Acme AI?", "what has Bob invested in?", "find the connection between Alice and Carol". Backfill an existing brain in one command:

```bash
gbrain extract links --source db        # wire up the existing 29K pages
gbrain extract timeline --source db     # extract dated events from markdown timelines
```

Then ask graph questions or watch the search ranking improve. Benchmarked: **Recall@5 jumps from 83% to 95%, Precision@5 from 39% to 45%, +30 more correct answers in the agent's top-5 reads** on a 240-page Opus-generated rich-prose corpus. Graph-only F1 hits 86.6% vs grep's 57.8% (+28.8 pts). See [docs/benchmarks/2026-04-18-brainbench-v1.md](docs/benchmarks/2026-04-18-brainbench-v1.md).

## Code-Aware Brain

Code files become brain pages. Code symbols become chunk metadata. Import/call relationships become links. The important part is architectural: code support extends the same `pages` / `content_chunks` / `links` / `search` stack described in [End-to-End Pipelines](#end-to-end-pipelines), instead of creating a separate code subsystem.

The design is layering, not forking:

```
Markdown page ──→ pages (type='concept') ──→ chunks (source='compiled_truth')
                                             ──→ links (source='markdown')

Code file ────→ pages (type='code_file') ──→ chunks (source='source_code')
                                             ──→ links (source='code_import')
```

### What gets reused

| Layer | How code plugs in |
|---|---|
| **pages** | `type='code_file'`. Same table. `compiled_truth` holds raw source. `frontmatter` holds language, file path, byte size. Content hash gives idempotent re-import for free. |
| **content_chunks** | `chunk_source='source_code'`. `symbol_name` and `symbol_kind` columns carry tree-sitter-free regex-extracted symbols (functions, classes, interfaces). `start_line` / `end_line` for precise display. |
| **links** | `link_source='code_import'`. Import/call/extends/implements references become typed graph edges. Reconciliation works exactly like markdown links: re-import deletes stale `code_import` edges, re-extracts. |
| **tags** | Language tags (`typescript`, `python`, `go`). Same tags table — `gbrain code list --tag typescript` just works. |
| **search** | `code_search_vector` tsvector column on pages with `simple` config (no stemming — preserves `putPage`, path separators, camelCase identifiers). The trigger routes by page type: code pages get `simple` tsvector, markdown pages get `english`. |
| **graph** | `traverse_graph` and `get_backlinks` recursive CTEs work on any link type. `gbrain graph-query code/src/core/operations --type calls --depth 2` traverses code references the same way as markdown references. |
| **page_versions** | Code file history tracked through the existing versioning system. |
| **sync** | `isSyncable()` returns `'markdown' | 'code' | false`. `--include-code` flag on `import` and `sync` gates code ingestion. |

The concrete flow is covered above in the dedicated code import, search, and graph pipeline sections. This section keeps the invariants and command surface in one place.

### Cross-type linking (code ↔ markdown)

Markdown pages reference code via wikilinks:

```markdown
The entry point is [[code:src/core/import-file.ts#importFromContent]].
```

This creates a bidirectional link: the markdown page links to the code page, and the code page gets a backlink. `graph-query` traverses across types without knowing the difference. Code pages with `link_type='tests'` edges surface test coverage through the same graph traversal that finds meeting attendees.

### Commands

```bash
# Import code alongside markdown
gbrain import ~/repo/ --include-code
gbrain sync --include-code

# List imported code files
gbrain code list                          # all code files
gbrain code list --tag typescript         # filter by language
gbrain code list --json                   # machine-readable

# Search code only (symbols, identifiers, paths)
gbrain code search putPage
gbrain code search "importFromContent" -n 10

# General search finds code too (auto-detects code-like queries)
gbrain search putPage                     # routes to code_search_vector automatically
gbrain query "where is putPage defined"   # hybrid search, code_definition intent

# Graph traversal across code
gbrain graph-query code/src/core/operations --type calls --depth 2
gbrain graph-query code/src/core/operations --type imports --direction in

# Find code files with no inbound links (reuses find_orphans)
gbrain orphans --type code_file
```

### Languages

17 languages supported via extension detection: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, Swift, Kotlin, Shell, SQL. Symbol extraction uses deterministic regex patterns (no tree-sitter dependency) for TypeScript/JavaScript, Python, and Go — other languages fall back to blank-line chunking without symbol metadata.

### Design decisions

**No tree-sitter.** Regex-based symbol extraction for the three dominant languages. Tree-sitter adds WASM bloat and a native compilation step for every new language. The regex approach covers functions, classes, interfaces, methods, type aliases, exports, and doc comments. Non-TS/Python/Go files still get chunked and searchable — they just don't get per-symbol metadata until a parser is added.

**No parallel tables.** `code_repositories`, `code_symbols`, `code_references` — none exist. `sources` handles multi-repo. `pages` handles code files. `content_chunks` handles symbols. `links` handles references. Every search, graph, and admin command works on code content without a single new code path.

**No new search engine.** The hybrid search pipeline is content-agnostic. `code_search_vector` with `simple` config preserves identifiers that `english` stemming would destroy. `isCodeLikeQuery` auto-detects code queries so `gbrain search putPage` routes correctly without the user specifying a type filter.

## Search

The detailed search path is documented in [End-to-End Pipelines](#end-to-end-pipelines). In short, GBrain stacks intent detection, keyword search, optional vector retrieval, RRF fusion, cosine re-scoring, boosts, and dedup on top of the same normalized page/chunk model.

Why the stack matters:

- Keyword alone misses conceptual matches.
- Vector alone misses exact identifiers, slugs, and phrasing.
- RRF plus boosts gets both precision and recall.
- The same search entrypoint can rank markdown and code together.

Search quality is benchmarked and reproducible: `gbrain eval --qrels queries.json` measures P@k, Recall@k, MRR, and nDCG@k. A/B test config changes before deploying them.

## Why it works: many strategies in concert

The brain isn't one trick. Every retrieval question goes through ~20 deterministic
techniques layered together. No single one is magic; the win comes from stacking
them so each layer covers what the others miss.

```
Question
  │
  ├─ INGESTION (every put_page)
  │    ├─ Recursive markdown chunking (or semantic / LLM-guided)
  │    ├─ Code chunking: blank-line + indentation splitter (40-80 lines)
  │    ├─ Symbol extraction: deterministic regex (functions, classes, interfaces)
  │    ├─ Reference extraction: import resolution + call detection
  │    ├─ Embedding cache invalidation on edit
  │    └─ Idempotent imports (content-hash dedup)
  │
  ├─ GRAPH EXTRACTION (auto-link post-hook, zero LLM)
  │    ├─ Entity-ref regex (markdown links + bare slugs)
  │    ├─ Code-fence stripping (no false-positive slugs in code blocks)
  │    ├─ Typed inference cascade (FOUNDED → INVESTED → ADVISES → WORKS_AT)
  │    ├─ Page-role priors (partner-bio language → invested_in)
  │    ├─ Within-page dedup (same target collapses to one link)
  │    ├─ Stale-link reconciliation (edits remove dropped refs)
  │    └─ Multi-type link constraint (same person can works_at AND advises)
  │
  ├─ SEARCH PIPELINE (every query)
  │    ├─ Intent classifier (entity / temporal / event / general
  │    │                     / code_definition / code_relationship — auto-routes)
  │    ├─ Code-query detector (camelCase, snake_case, path-like, keyword → simple tsvector)
  │    ├─ Multi-query expansion (Haiku rephrases the question 3 ways)
  │    ├─ Vector search (HNSW cosine over OpenAI embeddings)
  │    ├─ Keyword search (english tsvector for markdown, simple tsvector for code)
  │    ├─ Reciprocal Rank Fusion (score = sum 1/(60+rank) across both)
  │    ├─ Cosine re-scoring (re-rank chunks against actual query embedding)
  │    ├─ Compiled-truth boost (assessments outrank timeline noise)
  │    ├─ Symbol-name exact match boost (code queries prefer exact identifier hits)
  │    ├─ Backlink boost (well-connected entities rank higher)
  │    └─ Source-aware dedup (one CT chunk per page guaranteed)
  │
  ├─ GRAPH TRAVERSAL (relational queries)
  │    ├─ Recursive CTE with cycle prevention (visited-array check)
  │    ├─ Type-filtered edges (--type works_at, attended, etc.)
  │    ├─ Direction control (in / out / both)
  │    └─ Depth-capped (≤10 for remote MCP; DoS prevention)
  │
  └─ AGENT WORKFLOW (graph-confident hybrid)
       ├─ Graph-query first (high-precision typed answers)
       ├─ Grep fallback when graph returns nothing
       └─ Graph hits ranked first in top-K (better P@K and R@K)
```

End-to-end on the BrainBench v1 corpus (240 rich-prose pages, before/after PR #188):

| Metric                  | BEFORE PR #188 | AFTER PR #188 | Δ           |
|-------------------------|----------------|---------------|-------------|
| **Precision@5**         | 39.2%          | **44.7%**     | **+5.4 pts**|
| **Recall@5**            | 83.1%          | **94.6%**     | **+11.5 pts**|
| Correct in top-5        | 217            | 247           | **+30**     |
| Graph-only F1 (ablation)| 57.8% (grep)   | **86.6%**     | **+28.8 pts**|

Plus 5 orthogonal capability checks (identity resolution, temporal queries,
performance at 10K-page scale, robustness to malformed input, MCP operation
contract). All pass. [Full report.](docs/benchmarks/2026-04-18-brainbench-v1.md)

The point: each technique handles a class of inputs the others miss. Vector
search misses exact slug refs; keyword catches them. Keyword misses conceptual
matches; vector catches them. RRF picks the best of both. Compiled-truth boost
keeps assessments above timeline noise. Auto-link extraction wires the graph
that lets backlink boost rank well-connected entities higher. Graph traversal
answers questions search alone can't reach. The agent picks graph-first for
precision and falls back to keyword for recall. **All deterministic, all in
concert, all measured.**

## Voice

Call a phone number. Your AI answers. It knows who's calling, pulls their full context from the brain, and responds like someone who actually knows your world. When the call ends, a brain page appears with the transcript, entity detection, and cross-references.

<p align="center">
  <img src="docs/images/voice-client.png" alt="Voice client connected" width="300" />
</p>

> [See it in action](https://x.com/garrytan/status/2043022208512172263)

The voice recipe ships with GBrain: [Voice-to-Brain](recipes/twilio-voice-brain.md). WebRTC works in a browser tab with zero setup. A real phone number is optional.

## Engine Architecture

```
CLI / MCP Server
     (thin wrappers, identical operations)
              |
      BrainEngine interface (pluggable)
              |
     +--------+--------+
     |                  |
PGLiteEngine       PostgresEngine
  (default)          (Supabase)
     |                  |
~/.gbrain/           Supabase Pro ($25/mo)
brain.pglite         Postgres + pgvector
embedded PG 17.5

     gbrain migrate --to supabase|pglite
         (bidirectional migration)
```

PGLite: embedded Postgres, no server, zero config. When your brain outgrows local (1000+ files, multi-device), `gbrain migrate --to supabase` moves everything.

## File Storage

Brain repos accumulate binaries. GBrain has a three-stage migration:

```bash
gbrain files mirror <dir>       # copy to cloud, local untouched
gbrain files redirect <dir>     # replace local with .redirect pointers
gbrain files clean <dir>        # remove pointers, cloud only
gbrain files restore <dir>      # download everything back (undo)
```

Storage backends: S3-compatible (AWS, R2, MinIO), Supabase Storage, or local.

## Commands

```
SETUP
  gbrain init [--supabase|--url]        Create brain (PGLite default)
  gbrain migrate --to supabase|pglite   Bidirectional engine migration
  gbrain upgrade                        Self-update with feature discovery

PAGES
  gbrain get <slug>                     Read a page (fuzzy slug matching)
  gbrain put <slug> [< file.md]         Write/update (auto-versions)
  gbrain delete <slug>                  Delete a page
  gbrain list [--type T] [--tag T]      List with filters

SEARCH
  gbrain search <query>                 Keyword search (code-aware, auto-detects)
  gbrain query <question>              Hybrid search (vector + keyword + RRF)
  gbrain code list [--tag T] [-n N]     List imported code files
  gbrain code search <query> [-n N]     Search imported code only

IMPORT
  gbrain import <dir> [--no-embed]      Import markdown (--include-code for code)
  gbrain sync [--repo <path>]           Git-to-brain incremental sync
                                        (--include-code for code, --watch, --install-cron)
  gbrain export [--dir ./out/]          Export to markdown
  gbrain analyze-repo <url|path>        Analyze repo, generate structured docs
                                        (--include-tests, --query, --json)

FILES
  gbrain files list|upload|sync|verify  File storage operations

EMBEDDINGS
  gbrain embed [<slug>|--all|--stale]   Generate/refresh embeddings

LINKS + GRAPH
  gbrain link|unlink|backlinks          Cross-reference management
  gbrain extract links|timeline|all     Batch backfill from existing pages
                                        (--source db|fs, --type, --since, --dry-run)
  gbrain graph-query <slug>             Typed traversal (--type T --depth N
                                        --direction in|out|both)

JOBS (Minions)
  gbrain jobs submit <name> [--params JSON] [--follow]  Submit a background job
  gbrain jobs list [--status S] [--queue Q]             List jobs with filters
  gbrain jobs get|cancel|retry|delete <id>              Manage job lifecycle
  gbrain jobs prune [--older-than 30d]                  Clean completed/dead jobs
  gbrain jobs stats                                     Job health dashboard
  gbrain jobs smoke                                     One-command health check
  gbrain jobs work [--queue Q] [--concurrency N]        Start worker daemon

ADMIN
  gbrain doctor [--json] [--fast]       Health checks (resolver, skills, DB, embeddings)
  gbrain doctor --fix [--dry-run]       Auto-fix DRY violations (delegate inlined rules to conventions)
  gbrain stats                          Brain statistics
  gbrain serve                          MCP server (stdio)
  gbrain integrations                   Integration recipe dashboard
  gbrain check-backlinks check|fix      Back-link enforcement
  gbrain lint [--fix]                   LLM artifact detection
  gbrain repair-jsonb [--dry-run]       Repair v0.12.0 double-encoded JSONB (Postgres)
  gbrain orphans [--json] [--count]     Find pages with zero inbound wikilinks
  gbrain transcribe <audio>             Transcribe audio (Groq Whisper)
  gbrain research init <name>           Scaffold a data-research recipe
  gbrain research list                  Show available recipes
```

Run `gbrain --help` for the full reference.

## Origin Story

I was setting up my [OpenClaw](https://openclaw.ai) agent and started a markdown brain repo. One page per person, one page per company, compiled truth on top, timeline on the bottom. Within a week: 10,000+ files, 3,000+ people, 13 years of calendar data, 280+ meeting transcripts, 300+ captured ideas.

The agent runs while I sleep. The dream cycle scans every conversation, enriches missing entities, fixes broken citations, consolidates memory. I wake up and the brain is smarter than when I went to sleep.

The skills in this repo are those patterns, generalized. What took 11 days to build by hand ships as a mod you install in 30 minutes.

## Docs

**For agents:**
- **[skills/RESOLVER.md](skills/RESOLVER.md)** ... Start here. The skill dispatcher.
- [Individual skill files](skills/) ... 25 standalone instruction sets
- [GBRAIN_SKILLPACK.md](docs/GBRAIN_SKILLPACK.md) ... Legacy reference architecture
- [Getting Data In](docs/integrations/README.md) ... Integration recipes and data flow
- [GBRAIN_VERIFY.md](docs/GBRAIN_VERIFY.md) ... Installation verification

**For humans:**
- [GBRAIN_RECOMMENDED_SCHEMA.md](docs/GBRAIN_RECOMMENDED_SCHEMA.md) ... Brain repo directory structure
- [Thin Harness, Fat Skills](docs/ethos/THIN_HARNESS_FAT_SKILLS.md) ... Architecture philosophy
- [ENGINES.md](docs/ENGINES.md) ... Pluggable engine interface

**Reference:**
- [GBRAIN_V0.md](docs/GBRAIN_V0.md) ... Full product spec
- [CHANGELOG.md](CHANGELOG.md) ... Version history

**Benchmarks:**
- [BrainBench v1 (PR #188)](docs/benchmarks/2026-04-18-brainbench-v1.md) ... single comprehensive before/after report on a 240-page Opus-generated corpus. 7 categories: relational queries, identity resolution, temporal queries, performance, robustness, MCP contract.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `bun test` for unit tests. E2E tests: spin up Postgres with pgvector, run `bun run test:e2e`, tear down.

PRs welcome for: new enrichment APIs, performance optimizations, additional engine backends, new skills following the conformance standard in `skills/skill-creator/SKILL.md`.

## License

MIT
