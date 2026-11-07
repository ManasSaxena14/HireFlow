-- Up Migration
CREATE TABLE feed_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('greenhouse', 'lever', 'remotive', 'adzuna', 'rss')),
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_error text
);

CREATE TABLE feed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES feed_sources (id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  company_name text NOT NULL,
  location text,
  remote boolean NOT NULL DEFAULT false,
  url text NOT NULL,
  description text,
  skills text[] NOT NULL DEFAULT '{}',
  posted_at timestamptz,
  job_hash text NOT NULL UNIQUE,
  search tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(company_name, '') || ' ' || coalesce(description, '')
    )
  ) STORED,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX feed_jobs_search ON feed_jobs USING gin (search);
CREATE INDEX feed_jobs_newest ON feed_jobs ((coalesce(posted_at, created_at)) DESC, id DESC);
CREATE INDEX feed_jobs_last_seen ON feed_jobs (last_seen_at);
CREATE INDEX feed_jobs_not_matched ON feed_jobs (created_at) WHERE matched_at IS NULL;

CREATE TABLE job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords text[] NOT NULL CHECK (cardinality(keywords) > 0),
  locations text[] NOT NULL DEFAULT '{}',
  remote_only boolean NOT NULL DEFAULT false,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant', 'daily')),
  active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_alerts_user ON job_alerts (user_id, created_at);

CREATE TABLE alert_deliveries (
  alert_id uuid NOT NULL REFERENCES job_alerts (id) ON DELETE CASCADE,
  feed_job_id uuid NOT NULL REFERENCES feed_jobs (id) ON DELETE CASCADE,
  delivered_at timestamptz,
  PRIMARY KEY (alert_id, feed_job_id)
);
CREATE INDEX alert_deliveries_job ON alert_deliveries (feed_job_id);
CREATE INDEX alert_deliveries_waiting ON alert_deliveries (alert_id) WHERE delivered_at IS NULL;

-- Down Migration
DROP TABLE alert_deliveries;
DROP TABLE job_alerts;
DROP TABLE feed_jobs;
DROP TABLE feed_sources;
