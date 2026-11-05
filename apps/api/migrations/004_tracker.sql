-- Up Migration
CREATE TABLE tracked_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  company_name text NOT NULL,
  job_url text,
  location text,
  source text,
  salary_min integer,
  salary_max integer,
  currency char(3),
  status tracker_status NOT NULL DEFAULT 'saved',
  applied_at timestamptz,
  skills text[] NOT NULL DEFAULT '{}',
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  job_hash text NOT NULL,
  resume_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_hash)
);
CREATE INDEX ta_user_status ON tracked_applications (user_id, status) WHERE archived_at IS NULL;
CREATE INDEX ta_user_created ON tracked_applications (user_id, created_at DESC, id DESC);
CREATE TRIGGER tracked_applications_updated_at BEFORE UPDATE ON tracked_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_application_id uuid NOT NULL REFERENCES tracked_applications (id) ON DELETE CASCADE,
  from_status tracker_status,
  to_status tracker_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_events_application ON application_events (tracked_application_id, created_at);

CREATE TABLE application_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_application_id uuid NOT NULL REFERENCES tracked_applications (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_notes_application ON application_notes (tracked_application_id, created_at DESC);

CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tracked_application_id uuid REFERENCES tracked_applications (id) ON DELETE CASCADE,
  interview_id uuid,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('follow_up', 'custom', 'interview')),
  remind_at timestamptz NOT NULL,
  message text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_due ON reminders (remind_at) WHERE sent_at IS NULL;
CREATE INDEX reminders_application ON reminders (tracked_application_id);
-- A card never carries more than one pending automatic follow-up.
CREATE UNIQUE INDEX reminders_one_pending_follow_up ON reminders (tracked_application_id)
  WHERE kind = 'follow_up' AND sent_at IS NULL;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC, id DESC);

-- Down Migration
DROP TABLE notifications;
DROP TABLE reminders;
DROP TABLE application_notes;
DROP TABLE application_events;
DROP TABLE tracked_applications;
