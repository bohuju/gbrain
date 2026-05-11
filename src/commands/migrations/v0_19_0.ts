import type { BrainEngine } from '../../core/engine.ts';

export const v0_19_0 = {
  version: 19,
  async up(engine: BrainEngine): Promise<void> {
    await engine.runMigration(19, `
      CREATE TABLE IF NOT EXISTS code_imports (
        id            SERIAL PRIMARY KEY,
        repo_path     TEXT NOT NULL,
        repo_commit   TEXT NOT NULL,
        gitnexus_ver  TEXT NOT NULL DEFAULT '',
        nodes_total   INTEGER NOT NULL DEFAULT 0,
        edges_total   INTEGER NOT NULL DEFAULT 0,
        chunks_total  INTEGER NOT NULL DEFAULT 0,
        embedded      INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'importing',
        error_text    TEXT,
        started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at   TIMESTAMPTZ,
        CONSTRAINT chk_code_imports_status CHECK (status IN ('importing', 'embedded', 'done', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS idx_code_imports_repo ON code_imports(repo_path, started_at DESC);
      INSERT INTO sources (id, name, config)
        VALUES ('code', 'code', '{"federated": true, "type": "code"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;

      -- Update search vector trigger to handle all code_* page types
      CREATE OR REPLACE FUNCTION update_page_search_vector() RETURNS trigger AS $$
      DECLARE
        timeline_text TEXT;
      BEGIN
        SELECT coalesce(string_agg(summary || ' ' || detail, ' '), '')
        INTO timeline_text
        FROM timeline_entries
        WHERE page_id = NEW.id;

        IF NEW.type LIKE 'code_%' THEN
          NEW.search_vector := NULL;
          NEW.code_search_vector :=
            setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce(NEW.compiled_truth, '')), 'B');
        ELSE
          NEW.code_search_vector := NULL;
          NEW.search_vector :=
            setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(NEW.compiled_truth, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(NEW.timeline, '')), 'C') ||
            setweight(to_tsvector('english', coalesce(timeline_text, '')), 'C');
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};
