-- =========================================================================
-- MangaLoop — esquema inicial.
-- Datas sempre em UTC (ISO-8601). O fuso editorial e aplicado na interface.
-- =========================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  password_algo        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'admin',
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at        TEXT,
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  admin_user_id  TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf_secret    TEXT NOT NULL,
  user_agent     TEXT,
  ip_hash        TEXT,
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      TEXT NOT NULL,
  identifier  TEXT NOT NULL,
  window_start TEXT NOT NULL,
  hits        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier)
);

CREATE TABLE IF NOT EXISTS challenges (
  id              TEXT PRIMARY KEY,
  edition_number  INTEGER NOT NULL UNIQUE,
  theme           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  allows_fiction  INTEGER NOT NULL DEFAULT 0,
  launch_at       TEXT,
  close_at        TEXT,
  publish_at      TEXT,
  instagram_url   TEXT,
  tiktok_url      TEXT,
  x_url           TEXT,
  rules_url       TEXT,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  editorial_note  TEXT,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

CREATE TABLE IF NOT EXISTS submissions (
  id                    TEXT PRIMARY KEY,
  challenge_id          TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  network               TEXT NOT NULL CHECK (network IN ('INSTAGRAM','TIKTOK','X')),
  rank                  INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  comment_text          TEXT NOT NULL,
  source_url            TEXT,
  votes                 INTEGER,
  counted_at            TEXT,
  comment_posted_at     TEXT,
  author_pseudonym      TEXT,
  author_handle         TEXT,
  expanded_story        TEXT,
  genre                 TEXT,
  art_style             TEXT,
  narrative_tone        TEXT,
  visual_tone           TEXT,
  editorial_notes       TEXT,
  consent_status        TEXT NOT NULL DEFAULT 'PENDING',
  consent_at            TEXT,
  consent_evidence      TEXT,
  is_minor              INTEGER NOT NULL DEFAULT 0,
  guardian_consent      INTEGER NOT NULL DEFAULT 0,
  is_fiction            INTEGER NOT NULL DEFAULT 0,
  content_flags         TEXT NOT NULL DEFAULT '[]',
  disqualify_reason     TEXT,
  is_demo               INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge ON submissions(challenge_id, network, rank);
-- Uma unica vaga ativa por edicao/rede.
CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_slot
  ON submissions(challenge_id, network) WHERE status = 'SELECTED';
-- Um participante nao ocupa mais de uma vaga por semana.
CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_author_week
  ON submissions(challenge_id, author_pseudonym)
  WHERE status = 'SELECTED' AND author_pseudonym IS NOT NULL;

CREATE TABLE IF NOT EXISTS mangas (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  challenge_id      TEXT REFERENCES challenges(id) ON DELETE SET NULL,
  submission_id     TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  synopsis          TEXT,
  genre             TEXT,
  art_style         TEXT,
  narrative_tone    TEXT,
  visual_tone       TEXT,
  humor_intensity   TEXT,
  fidelity          TEXT,
  color_mode        TEXT,
  panel_density     TEXT,
  page_min          INTEGER NOT NULL DEFAULT 4,
  page_max          INTEGER NOT NULL DEFAULT 6,
  format            TEXT NOT NULL DEFAULT 'VERTICAL',
  language          TEXT NOT NULL DEFAULT 'pt-BR',
  quality_mode      TEXT NOT NULL DEFAULT 'ECONOMICO',
  status            TEXT NOT NULL DEFAULT 'RECEIVED',
  version           INTEGER NOT NULL DEFAULT 1,
  cover_page_id     TEXT,
  page_count        INTEGER NOT NULL DEFAULT 0,
  credits_json      TEXT NOT NULL DEFAULT '{}',
  ai_disclosure     TEXT,
  is_demo           INTEGER NOT NULL DEFAULT 0,
  scheduled_at      TEXT,
  published_at      TEXT,
  unpublished_at    TEXT,
  failure_reason    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mangas_status ON mangas(status, published_at);
CREATE INDEX IF NOT EXISTS idx_mangas_challenge ON mangas(challenge_id);

CREATE TABLE IF NOT EXISTS characters (
  id            TEXT PRIMARY KEY,
  manga_id      TEXT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  ref_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT,
  description   TEXT NOT NULL,
  outfit        TEXT,
  proportions   TEXT,
  accessories   TEXT,
  palette       TEXT,
  line_rules    TEXT,
  ref_asset_id  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (manga_id, ref_id)
);

CREATE TABLE IF NOT EXISTS script_versions (
  id          TEXT PRIMARY KEY,
  manga_id    TEXT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  script_json TEXT NOT NULL,
  model       TEXT,
  source      TEXT NOT NULL DEFAULT 'AI',
  note        TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (manga_id, version)
);

CREATE TABLE IF NOT EXISTS pages (
  id                      TEXT PRIMARY KEY,
  manga_id                TEXT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  page_number             INTEGER NOT NULL,
  kind                    TEXT NOT NULL DEFAULT 'STORY',
  base_asset_id           TEXT,
  composite_asset_id      TEXT,
  balloons_json           TEXT NOT NULL DEFAULT '[]',
  panels_json             TEXT NOT NULL DEFAULT '[]',
  alt_text                TEXT,
  transcript              TEXT,
  version                 INTEGER NOT NULL DEFAULT 1,
  status                  TEXT NOT NULL DEFAULT 'PENDING',
  params_hash             TEXT,
  origin                  TEXT,
  failure_reason          TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  UNIQUE (manga_id, page_number)
);

CREATE TABLE IF NOT EXISTS page_versions (
  id             TEXT PRIMARY KEY,
  page_id        TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  base_asset_id  TEXT,
  balloons_json  TEXT,
  panels_json    TEXT,
  alt_text       TEXT,
  transcript     TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (page_id, version)
);

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  visibility  TEXT NOT NULL DEFAULT 'private',
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL DEFAULT 0,
  width       INTEGER,
  height      INTEGER,
  checksum    TEXT,
  origin      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id                  TEXT PRIMARY KEY,
  type                TEXT NOT NULL,
  manga_id            TEXT REFERENCES mangas(id) ON DELETE CASCADE,
  page_id             TEXT REFERENCES pages(id) ON DELETE CASCADE,
  character_id        TEXT,
  status              TEXT NOT NULL DEFAULT 'QUEUED',
  idempotency_key     TEXT UNIQUE,
  params_json         TEXT NOT NULL DEFAULT '{}',
  attempts            INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 3,
  run_after           TEXT,
  locked_at           TEXT,
  started_at          TEXT,
  finished_at         TEXT,
  progress            INTEGER NOT NULL DEFAULT 0,
  result_json         TEXT,
  error_message       TEXT,
  estimated_cost_usd  REAL,
  actual_cost_usd     REAL,
  cost_known          INTEGER NOT NULL DEFAULT 0,
  mode                TEXT NOT NULL DEFAULT 'demo',
  created_by          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON generation_jobs(status, run_after);
CREATE INDEX IF NOT EXISTS idx_jobs_manga  ON generation_jobs(manga_id);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT,
  manga_id            TEXT,
  kind                TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'openai',
  model               TEXT,
  params_json         TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  images_count        INTEGER,
  estimated_cost_usd  REAL,
  actual_cost_usd     REAL,
  cost_source         TEXT NOT NULL DEFAULT 'UNKNOWN',
  status              TEXT NOT NULL DEFAULT 'OK',
  mode                TEXT NOT NULL DEFAULT 'demo',
  occurred_at         TEXT NOT NULL,
  month_key           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_ledger(month_key);
CREATE INDEX IF NOT EXISTS idx_usage_manga ON usage_ledger(manga_id);

CREATE TABLE IF NOT EXISTS approvals (
  id                  TEXT PRIMARY KEY,
  manga_id            TEXT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,
  script_version      INTEGER,
  manga_version       INTEGER,
  approved_by         TEXT,
  approved_at         TEXT NOT NULL,
  note                TEXT,
  invalidated_at      TEXT,
  invalidated_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_manga ON approvals(manga_id, kind);

CREATE TABLE IF NOT EXISTS magazines (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  edition_number  INTEGER NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  challenge_id    TEXT REFERENCES challenges(id) ON DELETE SET NULL,
  summary         TEXT,
  cover_asset_id  TEXT,
  cover_mode      TEXT NOT NULL DEFAULT 'REUSE',
  editorial_note  TEXT,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  scheduled_at    TEXT,
  published_at    TEXT,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magazine_entries (
  id          TEXT PRIMARY KEY,
  magazine_id TEXT NOT NULL REFERENCES magazines(id) ON DELETE CASCADE,
  manga_id    TEXT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (magazine_id, manga_id),
  UNIQUE (magazine_id, position)
);

CREATE TABLE IF NOT EXISTS social_scripts (
  id              TEXT PRIMARY KEY,
  challenge_id    TEXT REFERENCES challenges(id) ON DELETE SET NULL,
  theme           TEXT NOT NULL,
  preset_key      TEXT,
  wpm             INTEGER NOT NULL DEFAULT 150,
  word_count      INTEGER NOT NULL,
  duration_sec    REAL NOT NULL,
  script_text     TEXT NOT NULL,
  x_copy          TEXT,
  x_char_count    INTEGER,
  created_by      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  actor        TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  summary      TEXT,
  meta_json    TEXT,
  ip_hash      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_cache (
  hash         TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  asset_id     TEXT,
  payload_json TEXT,
  hits         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
