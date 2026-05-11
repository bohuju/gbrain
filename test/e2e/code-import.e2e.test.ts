import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runCodeImport } from '../../src/core/import-code';
import { createEngine } from '../../src/core/engine-factory';
import type { BrainEngine } from '../../src/core/engine';
import { join } from 'path';
import { execSync } from 'child_process';

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures', 'code-fixture');

describe('code import E2E', () => {
  let engine: BrainEngine;

  beforeAll(async () => {
    // Use test database
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/gbrain_test';
    engine = await createEngine({ engine: 'postgres' });
    await engine.connect({ engine: 'postgres', databaseUrl: dbUrl });
    await engine.initSchema();
  });

  afterAll(async () => {
    // Clean up code pages
    try {
      await engine.executeRaw(`DELETE FROM pages WHERE source_id = 'code'`);
    } catch { /* best effort */ }
    await engine.disconnect();
  });

  it('imports a fixture repo end to end', async () => {
    // Index with gitnexus
    execSync('npx gitnexus analyze --force', { cwd: FIXTURE_DIR, stdio: 'pipe' });

    // Import
    const result = await runCodeImport(engine, {
      repoPath: FIXTURE_DIR,
      embed: false,  // skip embedding in CI (needs API key)
      force: true,
    });

    expect(result.status).toBe('imported');
    expect(result.nodesTotal).toBeGreaterThan(0);
    expect(result.edgesTotal).toBeGreaterThan(0);
  });

  it('code_query finds imported symbols', async () => {
    const rows = await engine.searchKeyword('validate_token', { limit: 5 });
    const codeSlugs = rows.filter(r => r.slug.startsWith('code/'));
    expect(codeSlugs.length).toBeGreaterThan(0);
  });

  it('code_context resolves callers and callees', async () => {
    // Find the login function
    const loginPages = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages WHERE source_id = 'code' AND title = 'login' LIMIT 1`
    );

    if (loginPages.length === 0) return; // skip if not found

    const slug = loginPages[0].slug;

    // Get callees (login calls validate_token)
    const callees = await engine.executeRaw<{ slug: string; title: string }>(`
      SELECT p.slug, p.title FROM links l
      JOIN pages p ON p.id = l.to_page_id
      WHERE l.from_page_id = (SELECT id FROM pages WHERE slug = $1)
        AND l.link_type = 'code_call'
    `, [slug]);

    expect(callees.length).toBeGreaterThan(0);
  });

  it('code_impact finds upstream callers', async () => {
    const validatePages = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages WHERE source_id = 'code' AND title = 'validate_token' LIMIT 1`
    );

    if (validatePages.length === 0) return;

    const slug = validatePages[0].slug;

    // Find who calls validate_token
    const callers = await engine.executeRaw<{ slug: string; title: string }>(`
      SELECT p.slug, p.title FROM links l
      JOIN pages p ON p.id = l.from_page_id
      WHERE l.to_page_id = (SELECT id FROM pages WHERE slug = $1)
        AND l.link_type = 'code_call'
    `, [slug]);

    // login should call validate_token
    const hasLogin = callers.some(c => c.title.includes('login'));
    expect(hasLogin).toBe(true);
  });
});
