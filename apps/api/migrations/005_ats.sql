-- Up Migration
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  company_id uuid,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_company ON files (company_id);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  location text,
  employment_type text,
  remote boolean NOT NULL DEFAULT false,
  skills text[] NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE INDEX jobs_company_created ON jobs (company_id, created_at DESC, id DESC);

CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  kind stage_kind NOT NULL,
  email_subject text,
  email_body text,
  -- Checked at the end of the transaction, so a save can swap the order of two stages.
  UNIQUE (job_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  resume_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX candidates_company_email ON candidates (company_id, lower(email));

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES pipeline_stages (id),
  resume_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  score numeric(5, 2),
  rejection_reason text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (job_id, candidate_id)
);
CREATE INDEX applications_job_stage ON applications (company_id, job_id, stage_id);
CREATE INDEX applications_company_applied ON applications (company_id, applied_at DESC, id DESC);
CREATE INDEX applications_candidate ON applications (candidate_id);

CREATE TABLE application_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  from_stage_id uuid,
  to_stage_id uuid NOT NULL,
  actor_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_stage_events_application
  ON application_stage_events (application_id, created_at);

CREATE TABLE scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES users (id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  recommendation recommendation NOT NULL,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, interviewer_id)
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_application ON comments (application_id, created_at DESC);

CREATE TABLE application_assignments (
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, user_id)
);
CREATE INDEX application_assignments_user ON application_assignments (company_id, user_id);

-- Down Migration
DROP TABLE application_assignments;
DROP TABLE comments;
DROP TABLE scorecards;
DROP TABLE application_stage_events;
DROP TABLE applications;
DROP TABLE candidates;
DROP TABLE pipeline_stages;
DROP TABLE jobs;
DROP TABLE files;
