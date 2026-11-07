-- Up Migration
CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files (id),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  parse_error text,
  parsed_text text,
  parsed_skills text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resumes_user ON resumes (user_id, created_at DESC);

CREATE TABLE resume_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id uuid NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  tracked_application_id uuid REFERENCES tracked_applications (id) ON DELETE SET NULL,
  job_ref text,
  score numeric(5, 2) NOT NULL,
  matched text[] NOT NULL,
  missing text[] NOT NULL,
  sections_found text[] NOT NULL DEFAULT '{}',
  suggestions text[] NOT NULL DEFAULT '{}',
  breakdown jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resume_matches_resume ON resume_matches (resume_id, created_at DESC);
CREATE INDEX resume_matches_application ON resume_matches (tracked_application_id)
  WHERE tracked_application_id IS NOT NULL;

ALTER TABLE tracked_applications
  ADD CONSTRAINT tracked_applications_resume_fk
  FOREIGN KEY (resume_id) REFERENCES resumes (id) ON DELETE SET NULL;
CREATE INDEX tracked_applications_resume ON tracked_applications (resume_id)
  WHERE resume_id IS NOT NULL;

-- Down Migration
DROP INDEX tracked_applications_resume;
ALTER TABLE tracked_applications DROP CONSTRAINT tracked_applications_resume_fk;
DROP TABLE resume_matches;
CREATE TEMP TABLE resume_files ON COMMIT DROP AS SELECT file_id FROM resumes;
DROP TABLE resumes;
DELETE FROM files WHERE id IN (SELECT file_id FROM resume_files);
