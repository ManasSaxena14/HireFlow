-- Up Migration
CREATE TABLE availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 is Sunday
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  timezone text NOT NULL,
  valid_from date,
  valid_to date
);
CREATE INDEX availability_rules_user ON availability_rules (company_id, user_id);

CREATE TABLE availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  during tstzrange NOT NULL,
  reason text
);
CREATE INDEX availability_blocks_user ON availability_blocks (company_id, user_id);

CREATE TABLE interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id),
  interviewer_id uuid NOT NULL REFERENCES users (id),
  during tstzrange NOT NULL,
  status interview_status NOT NULL DEFAULT 'scheduled',
  meeting_url text,
  notes text,
  -- Only known when the candidate books the time themselves. Used for the time in their emails.
  candidate_timezone text,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- These two rules are what really stop double booking. Checking first can never be enough,
  -- because two requests can both pass the check at the same moment.
  CONSTRAINT no_interviewer_overlap EXCLUDE USING gist
    (interviewer_id WITH =, during WITH &&) WHERE (status = 'scheduled'),
  CONSTRAINT no_candidate_overlap EXCLUDE USING gist
    (candidate_id WITH =, during WITH &&) WHERE (status = 'scheduled')
);
CREATE INDEX interviews_company_start ON interviews (company_id, lower(during), id);
CREATE INDEX interviews_application ON interviews (application_id);

CREATE TABLE interview_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES users (id),
  duration_min smallint NOT NULL CHECK (duration_min BETWEEN 15 AND 480),
  slots timestamptz[] NOT NULL,
  meeting_url text,
  notes text,
  expires_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  interview_id uuid REFERENCES interviews (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interview_offers_application ON interview_offers (application_id, created_at DESC);

ALTER TABLE reminders ADD CONSTRAINT reminders_interview_id_fkey
  FOREIGN KEY (interview_id) REFERENCES interviews (id) ON DELETE CASCADE;
CREATE INDEX reminders_interview ON reminders (interview_id);

-- Down Migration
-- These reminders point at interviews that are about to go, so they cannot stay.
DELETE FROM reminders WHERE interview_id IS NOT NULL;
DROP INDEX reminders_interview;
ALTER TABLE reminders DROP CONSTRAINT reminders_interview_id_fkey;
DROP TABLE interview_offers;
DROP TABLE interviews;
DROP TABLE availability_blocks;
DROP TABLE availability_rules;
