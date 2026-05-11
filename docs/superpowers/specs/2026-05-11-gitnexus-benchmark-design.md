# GitNexus Integration Benchmark Design

**Date:** 2026-05-11
**Branch:** `gitnexus-integration` vs `master`
**Target Repo:** Starlette (encode/starlette)
**GBrain version:** 0.16.4
**GitNexus version:** 1.6.4
**Database:** Postgres at localhost:5435/gbrain_mcp
**Embedding backend:** MiniMax embo-01

---

## 1. Goal

Quantify the impact of GitNexus code knowledge graph integration on gbrain's search and code intelligence capabilities. Compare master (markdown-documents-only) against gitnexus-integration (markdown + GitNexus code graph import).

## 2. Benchmark Dimensions

### Dimension A: Brain Health
Compare `gbrain doctor --json` metrics:
- Page count
- Health score
- Brain score (embed, links, timeline, orphans, dead-links)
- Embedding coverage

### Dimension B: Hybrid RRF Search Quality
Run `gbrain query --no-expand` for two queries on each branch:
- "Starlette" — general project query
- "middleware" — domain-specific query
- Measure: result count, top relevance score, query latency

### Dimension C: Code-Specific Search
GitNexus-integration only:
- `gbrain code search "middleware"` — code-only keyword search
- `code_query "middleware"` — MCP operation for code symbol search
- `code_context` — 360° symbol context (callers, callees, importers)
- `code_impact` — blast radius analysis

### Dimension D: Import Performance
- GitNexus analysis time
- Code import time
- Node/edge/chunk/embedding counts

## 3. Setup

Both branches tested against the same Postgres database (re-initialized each time).

**Master:**
```
gbrain init --yes --non-interactive --url <connection>
gbrain import <starlette> --include-code --no-embed
gbrain embed --all
```

**GitNexus-integration:**
```
gbrain init --yes --non-interactive --url <connection>
npx gitnexus analyze <starlette> --force
gbrain code import <starlette> --force
```

## 4. Success Criteria

- code import produces >0 nodes, edges, and chunks
- code_query returns code-specific results
- code_context resolves callers/callees
- code_impact runs without SQL errors
- Brain score improves with code graph links
- Hybrid search quality is not degraded
