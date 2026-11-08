-- Up Migration
CREATE TABLE practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dsa', 'system_design', 'behavioral', 'mock', 'other')),
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  duration_min integer CHECK (duration_min BETWEEN 1 AND 600),
  outcome text CHECK (outcome IN ('solved', 'partial', 'failed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_sessions_user ON practice_sessions (user_id, created_at DESC, id DESC);

CREATE TABLE review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic text NOT NULL,
  ease_factor numeric(4, 2) NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  due_on date NOT NULL DEFAULT current_date,
  last_reviewed_at timestamptz
);
-- One review per topic, whatever the capital letters.
CREATE UNIQUE INDEX review_items_user_topic ON review_items (user_id, lower(topic));
CREATE INDEX review_items_due ON review_items (user_id, due_on);

-- Down Migration
DROP TABLE review_items;
DROP TABLE practice_sessions;
