-- Up Migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE membership_role AS ENUM ('admin', 'recruiter', 'hiring_manager', 'interviewer');
CREATE TYPE tracker_status AS ENUM ('saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn');
CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed');
CREATE TYPE stage_kind AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
CREATE TYPE interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE recommendation AS ENUM ('strong_no', 'no', 'yes', 'strong_yes');

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP FUNCTION set_updated_at();
DROP TYPE recommendation;
DROP TYPE interview_status;
DROP TYPE stage_kind;
DROP TYPE job_status;
DROP TYPE tracker_status;
DROP TYPE membership_role;
