// Shared parts of the k6 load tests. These run inside k6, not Node.
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE = `${__ENV.API_URL || 'http://localhost:4100'}/api/v1`;
// Made by scripts/load/auth-stub.mjs, which stands in for Neon Auth during a load test.
if (!__ENV.TOKENS_FILE) throw new Error('Run scripts/load/auth-stub.mjs and set TOKENS_FILE.');
const TOKENS = JSON.parse(open(__ENV.TOKENS_FILE));

const json = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});

export function post(path, body, token, tags) {
  return http.post(`${BASE}${path}`, JSON.stringify(body), { ...json(token), tags });
}

export function get(path, token, tags) {
  return http.get(`${BASE}${path}`, { ...json(token), tags });
}

/** Signs up test users, gives each a few jobs, and opens one company with a live job. */
export function prepare() {
  const run = Date.now();
  const tokens = [];
  for (const [index, token] of TOKENS.entries()) {
    // The first request makes the account, as it does for a real person.
    const me = get('/me', token);
    if (me.status !== 200) fail(`sign-in failed with ${me.status}`);
    for (let job = 0; job < 10; job++) {
      post(
        '/tracker/applications',
        { title: `Seed job ${job}`, companyName: `Seed ${index}` },
        token,
      );
    }
    post('/prep/sessions', { topic: 'Graphs', kind: 'dsa', durationMin: 30 }, token);
    tokens.push(token);
  }
  const owner = tokens[0];
  const company = post('/companies', { name: `Load Co ${run}` }, owner);
  const cid = company.json('id');
  const slug = company.json('slug');
  const job = post(
    `/companies/${cid}/jobs`,
    { title: 'Backend Developer', description: 'Build and run our services every day.' },
    owner,
  );
  post(`/companies/${cid}/jobs/${job.json('id')}/publish`, {}, owner);
  return { tokens, slug };
}

export function ok(response, name) {
  return check(response, { [`${name} ok`]: (r) => r.status >= 200 && r.status < 300 });
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The speed targets, overall and for each kind of request, so a slow one cannot hide. */
export const thresholds = (names) => ({
  http_req_duration: ['p(95)<300'],
  http_req_failed: ['rate<0.01'],
  ...Object.fromEntries(names.map((name) => [`http_req_duration{name:${name}}`, ['p(95)<300']])),
});
