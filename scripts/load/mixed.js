// Mixed reads and writes. Run with: k6 run scripts/load/mixed.js
import { sleep } from 'k6';
import { get, ok, pick, post, prepare, thresholds } from './common.js';

export const options = {
  setupTimeout: '5m',
  scenarios: {
    mixed: {
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
    'add job',
    'move job',
    'add note',
    'log practice',
    'stats',
    'feed search',
    'notifications',
  ]),
};

export const setup = prepare;

export default function ({ tokens }) {
  const token = pick(tokens);
  ok(get('/tracker/applications?limit=100', token, { name: 'board' }), 'board');

  // About one in three runs also writes, like a person adding and moving a job.
  if (Math.random() < 0.35) {
    const created = post(
      '/tracker/applications',
      { title: `Load job ${__VU}-${__ITER}-${Date.now()}`, companyName: 'Load Co' },
      token,
      { name: 'add job' },
    );
    if (ok(created, 'add job')) {
      const id = created.json('id');
      ok(
        post(`/tracker/applications/${id}/move`, { toStatus: 'applied' }, token, {
          name: 'move job',
        }),
        'move',
      );
      ok(
        post(`/tracker/applications/${id}/notes`, { body: 'Sent the form.' }, token, {
          name: 'add note',
        }),
        'note',
      );
    }
    ok(
      post(
        '/prep/sessions',
        { topic: pick(['Graphs', 'Heaps', 'Caching']), kind: 'dsa', durationMin: 20 },
        token,
        {
          name: 'log practice',
        },
      ),
      'practice',
    );
  }

  ok(get('/tracker/stats', token, { name: 'stats' }), 'stats');
  ok(get('/feed/jobs?limit=20&q=backend', token, { name: 'feed search' }), 'feed');
  ok(get('/notifications', token, { name: 'notifications' }), 'notifications');
  sleep(1);
}
