import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { matchesAlert } from '../src/alerts/match.js';
import { greenhouseAdapter } from '../src/feed/greenhouse.js';
import { createFeedHttp, type FeedHttp } from '../src/feed/http.js';
import { leverAdapter } from '../src/feed/lever.js';
import { htmlToText } from '../src/feed/text.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const answering = (body: unknown): FeedHttp => ({ getJson: async () => body });

describe('greenhouse adapter', () => {
  it('changes the recorded answer into our job shape', async () => {
    const jobs = await greenhouseAdapter.fetchJobs(
      { board: 'larkspur' },
      answering(fixture('greenhouse')),
    );
    expect(jobs.map((job) => job.externalId)).toEqual(['1001', '1002']);
    expect(jobs[0]).toMatchObject({
      title: 'Senior Backend Engineer',
      companyName: 'Larkspur',
      location: 'Remote, India',
      remote: true,
      url: 'https://job-boards.greenhouse.io/larkspur/jobs/1001',
      postedAt: new Date('2026-10-20T14:00:00Z'),
    });
    expect(jobs[0]?.description).toContain('Build APIs with Node & Postgres.');
    expect(jobs[0]?.description).not.toContain('alert(1)');
    expect(jobs[1]).toMatchObject({ remote: false, postedAt: new Date('2026-11-02T14:00:00Z') });
  });

  it('leaves out a link that is not http and a job with missing parts', async () => {
    const jobs = await greenhouseAdapter.fetchJobs(
      { board: 'larkspur' },
      answering(fixture('greenhouse')),
    );
    expect(jobs.some((job) => job.externalId === '1003' || job.externalId === '1004')).toBe(false);
  });

  it('refuses an answer in the wrong shape and a board name that could change the address', async () => {
    await expect(
      greenhouseAdapter.fetchJobs({ board: 'larkspur' }, answering({ nope: true })),
    ).rejects.toThrow();
    await expect(
      greenhouseAdapter.fetchJobs({ board: '../admin' }, answering({ jobs: [] })),
    ).rejects.toThrow();
  });
});

describe('lever adapter', () => {
  it('changes the recorded answer into our job shape', async () => {
    const jobs = await leverAdapter.fetchJobs(
      { site: 'larkspur', companyName: 'Larkspur' },
      answering(fixture('lever')),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Data Analyst',
      companyName: 'Larkspur',
      location: 'Berlin, Germany',
      remote: true,
      postedAt: new Date(1793000000000),
    });
    expect(jobs[0]?.description).toContain('• Write SQL');
    expect(jobs[0]?.description).toContain('We welcome everyone.');
    expect(jobs[1]?.remote).toBe(true);
  });
});

describe('htmlToText', () => {
  it('removes tags, keeps line breaks and reads entities', () => {
    expect(htmlToText('<p>One&nbsp;two</p><p>R&amp;D &#39;team&#x27;</p>')).toBe(
      "One two\nR&D 'team'",
    );
  });

  it('does not read entities a second time after removing tags', () => {
    expect(htmlToText('&amp;amp;lt;')).toBe('&lt;');
  });
});

describe('feed http', () => {
  const ok = () => new Response('{"jobs":[]}', { status: 200 });

  it('tries three times when the source has a problem on its side', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(ok());
    const http = createFeedHttp({ fetchImpl, retryDelayMs: 0 });
    await expect(http.getJson('https://example.com')).resolves.toEqual({ jobs: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('says so when a source is too slow', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      init?.signal?.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 30));
      init?.signal?.throwIfAborted();
      return ok();
    };
    const http = createFeedHttp({ fetchImpl, tries: 1, timeoutMs: 5 });
    await expect(http.getJson('https://example.com')).rejects.toThrow('took too long');
  });

  it('stops after three tries', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    const http = createFeedHttp({ fetchImpl, retryDelayMs: 0 });
    await expect(http.getJson('https://example.com')).rejects.toThrow('status 500');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not try again when the board does not exist', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 404 }));
    const http = createFeedHttp({ fetchImpl, retryDelayMs: 0 });
    await expect(http.getJson('https://example.com')).rejects.toThrow('status 404');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('matchesAlert', () => {
  const job = {
    title: 'JavaScript Developer',
    description: 'You will work with C++ and Node.js.',
    location: 'Remote, India',
    remote: true,
  };
  const alert = { keywords: ['python'], locations: [], remote_only: false };

  it('finds any keyword in the title or description, in any case', () => {
    expect(matchesAlert(job, { ...alert, keywords: ['python', 'JAVASCRIPT'] })).toBe(true);
    expect(matchesAlert(job, { ...alert, keywords: ['node.js'] })).toBe(true);
    expect(matchesAlert(job, { ...alert, keywords: ['c++'] })).toBe(true);
    expect(matchesAlert(job, alert)).toBe(false);
  });

  it('matches whole words only', () => {
    expect(matchesAlert(job, { ...alert, keywords: ['java'] })).toBe(false);
  });

  it('checks the place when one is given', () => {
    const keywords = ['node.js'];
    expect(matchesAlert(job, { ...alert, keywords, locations: ['india'] })).toBe(true);
    expect(matchesAlert(job, { ...alert, keywords, locations: ['London'] })).toBe(false);
    expect(
      matchesAlert({ ...job, location: null }, { ...alert, keywords, locations: ['India'] }),
    ).toBe(false);
  });

  it('checks remote when asked', () => {
    const keywords = ['node.js'];
    expect(matchesAlert(job, { ...alert, keywords, remote_only: true })).toBe(true);
    expect(matchesAlert({ ...job, remote: false }, { ...alert, keywords, remote_only: true })).toBe(
      false,
    );
  });
});
