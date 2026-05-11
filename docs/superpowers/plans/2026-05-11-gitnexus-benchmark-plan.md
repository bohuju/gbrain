# GitNexus Integration Benchmark Plan

**Date:** 2026-05-11
**Status:** executed
**Branch:** `gitnexus-integration` vs `master`

---

## Execution Steps

### Phase 1: Environment Setup (5 min)
1. Confirm git branch, environment variables (MINIMAX_API_KEY, EMBEDDING_BACKEND)
2. `bun install` gbrain-gitnexus dependencies
3. `npm install` GitNexus dependencies (for GitNexus CLI)
4. Build GitNexus: `gitnexus/build.js`
5. Confirm Starlette repo exists at /home/bohuju/self_project/starlette

### Phase 2: Master Baseline (10 min)
1. `git checkout master`
2. `gbrain init --yes --non-interactive --url <connection>`
3. `gbrain import /home/bohuju/self_project/starlette --include-code --no-embed`
4. `gbrain embed --all` (MiniMax embo-01)
5. `gbrain doctor --json` → record metrics
6. `gbrain query "Starlette" --no-expand` → time + count
7. `gbrain query "middleware" --no-expand` → time + count

### Phase 3: GitNexus-Integration Benchmark (20 min)
1. `git checkout gitnexus-integration`
2. `npx gitnexus analyze /home/bohuju/self_project/starlette --force`
3. `gbrain init --yes --non-interactive --url <connection>`
4. Build embedded schema: `bun run build:schema`
5. `gbrain code import /home/bohuju/self_project/starlette --force`
6. `gbrain doctor --json` → record metrics
7. `gbrain query "Starlette" --no-expand` → time + count
8. `gbrain query "middleware" --no-expand` → time + count
9. `gbrain code search "middleware"` → results + time
10. Test MCP operations: code_query, code_context, code_impact

### Phase 4: Report Writing (10 min)
Write three files:
1. `specs/2026-05-11-gitnexus-benchmark-design.md`
2. `plans/2026-05-11-gitnexus-benchmark-plan.md`
3. `results/2026-05-11-gitnexus-benchmark-results.md`

### Phase 5: Commit
```
git add -A
git commit -m "benchmark: GitNexus integration A/B comparison results"
git push origin gitnexus-integration
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| MiniMax rate limit (RPM) | Retry with `embed --stale`, wait 60s between runs |
| GitNexus CLI version mismatch | Fix reader.ts to parse actual CLI output format |
| Schema-embedded.ts stale | Run `bun run build:schema` before code import |
| Edge query buffer overflow | Batch queries with SKIP/LIMIT (1000 rows per batch) |
| code_imports table missing | Run `gbrain init --migrate-only` to apply schema |
