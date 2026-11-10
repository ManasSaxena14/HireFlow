-- Fills a load-test database with enough rows that slow queries show up.
-- Run it on its own database, never on real data: psql "$LOAD_DATABASE_URL" -f scripts/load/seed-volume.sql
BEGIN;

INSERT INTO users (email, full_name, email_verified_at)
SELECT 'bulk-' || n || '@example.com', 'Bulk User ' || n, now()
FROM generate_series(1, 5000) AS n;

-- 40 jobs on each person's board.
INSERT INTO tracked_applications (user_id, title, company_name, status, job_hash, created_at)
SELECT u.id, 'Job ' || n, 'Company ' || (n % 300), (ARRAY['saved','applied','screening','interview','offer','rejected'])[1 + n % 6]::tracker_status,
       md5(u.id::text || n), now() - (n || ' hours')::interval
FROM users u CROSS JOIN generate_series(1, 40) AS n
WHERE u.email LIKE 'bulk-%';

INSERT INTO notifications (user_id, type, payload, read_at, created_at)
SELECT u.id, 'reminder', jsonb_build_object('message', 'Follow up ' || n), CASE WHEN n % 3 = 0 THEN NULL ELSE now() END,
       now() - (n || ' hours')::interval
FROM users u CROSS JOIN generate_series(1, 40) AS n
WHERE u.email LIKE 'bulk-%';

INSERT INTO feed_sources (name, kind, config, enabled) VALUES ('Bulk board', 'greenhouse', '{"board":"bulk"}', true);
INSERT INTO feed_jobs (source_id, external_id, title, company_name, location, remote, url, description, posted_at, job_hash, matched_at)
SELECT s.id, n::text,
       (ARRAY['Backend Engineer','Frontend Developer','Data Analyst','Product Designer','Site Reliability Engineer'])[1 + n % 5] || ' ' || n,
       'Company ' || (n % 800),
       (ARRAY['Remote, India','London','Berlin, Germany','New York, NY','Pune'])[1 + n % 5],
       n % 5 = 0, 'https://example.com/jobs/' || n,
       repeat('We build services with Node.js, PostgreSQL and Kubernetes. ', 30) || ' role ' || n,
       now() - (n || ' minutes')::interval, md5('feed' || n), now()
FROM feed_sources s CROSS JOIN generate_series(1, 50000) AS n
WHERE s.name = 'Bulk board';

INSERT INTO practice_sessions (user_id, topic, kind, duration_min, outcome, created_at)
SELECT u.id, 'Topic ' || (n % 12), (ARRAY['dsa','system_design','behavioral','mock','other'])[1 + n % 5], 30,
       (ARRAY['solved','partial','failed'])[1 + n % 3], now() - (n || ' days')::interval
FROM users u CROSS JOIN generate_series(1, 30) AS n
WHERE u.email LIKE 'bulk-%' AND u.email < 'bulk-2';

COMMIT;
ANALYZE;
