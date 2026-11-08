-- Up Migration
-- Searching jobs by place uses ILIKE '%text%', which a normal index cannot help with.
-- On 50,000 jobs a place with no match read the whole table (37 ms). A trigram index fixes it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX feed_jobs_location_trgm ON feed_jobs USING gin (location gin_trgm_ops);

-- Down Migration
DROP INDEX feed_jobs_location_trgm;
DROP EXTENSION IF EXISTS pg_trgm;
