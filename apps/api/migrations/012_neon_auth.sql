-- Up Migration
-- Sign-up, sign-in, passwords and sessions now live in Neon Auth. A HireFlow account is
-- linked to its Neon Auth user by auth_id. Accounts made before this, such as the demo
-- accounts, are linked the first time someone signs in with the same confirmed email.
ALTER TABLE users ADD COLUMN auth_id text;
CREATE UNIQUE INDEX users_auth_id ON users (auth_id);
ALTER TABLE users DROP COLUMN password_hash;
DROP TABLE email_tokens;
DROP TABLE refresh_tokens;

-- Down Migration
-- Passwords and sessions cannot come back, so everyone has to reset their password.
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX email_tokens_user ON email_tokens (user_id);

ALTER TABLE users ADD COLUMN password_hash text NOT NULL DEFAULT '!';
ALTER TABLE users ALTER COLUMN password_hash DROP DEFAULT;
DROP INDEX users_auth_id;
ALTER TABLE users DROP COLUMN auth_id;
