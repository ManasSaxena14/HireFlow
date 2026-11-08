// Read-heavy load: the screens people open most. Run with: k6 run scripts/load/read-heavy.js
import { sleep } from 'k6';
import { get, ok, pick, prepare, thresholds } from './common.js';

export const options = {
  setupTimeout: '5m',
  scenarios: {
    reads: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: Number(__ENV.VUS || 50) },
        { duration: __ENV.DURATION || '1m', target: Number(__ENV.VUS || 50) },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: thresholds([
    'board',
    'stats',
    'feed search',
    'feed remote',
    'notifications',
    'practice stats',
    'careers page',
  ]),
};

export const setup = prepare;

const SEARCHES = ['backend', 'designer', 'data analyst', 'kubernetes', 'remote engineer'];

export default function ({ tokens, slug }) {
  const token = pick(tokens);
  ok(get('/tracker/applications?limit=100', token, { name: 'board' }), 'board');
  ok(get('/tracker/stats', token, { name: 'stats' }), 'stats');
  ok(
    get(`/feed/jobs?limit=20&q=${encodeURIComponent(pick(SEARCHES))}`, token, {
      name: 'feed search',
    }),
    'feed',
  );
  ok(get('/feed/jobs?limit=20&remote=true', token, { name: 'feed remote' }), 'feed remote');
  ok(get('/notifications', token, { name: 'notifications' }), 'notifications');
  ok(get('/prep/stats', token, { name: 'practice stats' }), 'practice');
  ok(get(`/public/companies/${slug}/jobs`, null, { name: 'careers page' }), 'careers');
  sleep(1);
}
