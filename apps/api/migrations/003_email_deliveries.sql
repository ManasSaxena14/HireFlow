-- Up Migration
-- One row per logical email. The mail worker consults it so a retried job
-- or a restarted worker does not send the same message twice.
CREATE TABLE email_deliveries (
  dedupe_key text PRIMARY KEY,
  template text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE email_deliveries;
