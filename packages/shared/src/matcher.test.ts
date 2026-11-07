import { describe, expect, it } from 'vitest';
import { findSkills, matchResume, normalizeText } from './matcher.js';
import skills from './skills.json' with { type: 'json' };

const RESUME = `Riya Menon
riya@example.com

Experience
Built APIs with NodeJS and Postgres at Larkspur. Ran services on AWS.

Education
B.Tech in Computer Science

Skills
JavaScript, React, Docker

Projects
A chat app using websockets.`;

const JOB = `Backend Engineer

About the role
You will work with Docker and sometimes Kafka.

Requirements
- Node.js
- PostgreSQL
- Kubernetes

Nice to have:
- GraphQL
`;

describe('skills dictionary', () => {
  it('has at least 150 skills, with no name or alias used twice', () => {
    expect(skills.length).toBeGreaterThanOrEqual(150);
    const names = skills.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
    const aliases = skills.flatMap((skill) => skill.aliases.map(normalizeText));
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe('findSkills', () => {
  it('maps every spelling to one name', () => {
    for (const text of ['node', 'NodeJS', 'node.js', 'Node.JS.', 'node js']) {
      expect(findSkills(text)).toEqual(['Node.js']);
    }
    expect(findSkills('k8s')).toEqual(['Kubernetes']);
    expect(findSkills('Postgres, psql')).toEqual(['PostgreSQL']);
  });

  it('keeps names with symbols apart', () => {
    expect(findSkills('C++')).toEqual(['C++']);
    expect(findSkills('c#')).toEqual(['C#']);
    expect(findSkills('.NET and CI/CD')).toEqual(['.NET', 'CI/CD']);
  });

  it('matches whole words only', () => {
    expect(findSkills('JavaScript')).toEqual(['JavaScript']);
    expect(findSkills('rustic gitignore reactor')).toEqual([]);
  });

  it('does not count the shorter name inside a longer one', () => {
    expect(findSkills('React Native')).toEqual(['React Native']);
    expect(findSkills('React and React Native')).toEqual(['React', 'React Native']);
  });

  it('treats short names that are normal words with care', () => {
    expect(findSkills('Go to market, go fast')).toEqual([]);
    expect(findSkills('We write Go and golang')).toEqual(['Go']);
    expect(findSkills('R&D and C-level people')).toEqual([]);
    expect(findSkills('Skills: R, C')).toEqual(['C', 'R']);
  });
});

describe('matchResume', () => {
  it('follows the scoring rules, with required skills counting double', () => {
    const result = matchResume(RESUME, JOB);
    expect(result.matched).toEqual(['Node.js', 'PostgreSQL', 'Docker']);
    expect(result.missing).toEqual(['Kubernetes', 'GraphQL', 'Kafka']);
    // Weights: Node 2, Postgres 2, Kubernetes 2, Docker 1, GraphQL 1, Kafka 1. Found 5 of 9.
    expect(result.breakdown.coverage).toBeCloseTo(5 / 9, 3);
    expect(result.breakdown.sections).toBe(1);
    expect(result.sectionsFound).toEqual(['experience', 'education', 'skills', 'projects']);
    expect(result.score).toBe(
      Math.round(
        100 *
          (0.65 * (5 / 9) + 0.25 * result.breakdown.keywordSim + 0.1 * result.breakdown.sections),
      ),
    );
  });

  it('suggests only missing required skills, and in honest words', () => {
    expect(matchResume(RESUME, JOB).suggestions).toEqual([
      'The job asks for Kubernetes. Add it only if you have real experience with Kubernetes.',
    ]);
  });

  it('gives the same answer every time', () => {
    const first = matchResume(RESUME, JOB);
    for (let run = 0; run < 5; run++) expect(matchResume(RESUME, JOB)).toEqual(first);
  });

  it('reads a required line written all in one line', () => {
    const job = 'Requirements: Python and SQL\nYou may also use Excel in this role.';
    const result = matchResume('Excel', job);
    expect(result.suggestions).toHaveLength(2);
    expect(result.missing.slice(0, 2)).toEqual(['Python', 'SQL']);
  });

  it('does not count a "preferred" heading as required', () => {
    const result = matchResume('nothing here', 'Preferred qualifications\n- Rust\n');
    expect(result.missing).toEqual(['Rust']);
    expect(result.suggestions).toEqual([]);
  });

  it('copes with an empty resume, an empty job and both', () => {
    const zero = { coverage: 0, keywordSim: 0, sections: 0 };
    expect(matchResume('', JOB)).toMatchObject({ score: 0, matched: [], breakdown: zero });
    expect(matchResume('', JOB).missing).toHaveLength(6);
    expect(matchResume(RESUME, '').matched).toEqual([]);
    expect(matchResume(RESUME, '').score).toBe(10);
    expect(matchResume('', '')).toMatchObject({ score: 0, suggestions: [], breakdown: zero });
  });

  it('copes with a job with no known skills', () => {
    const result = matchResume(RESUME, 'A friendly person to welcome our guests every morning.');
    expect(result.breakdown.coverage).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it('gives top marks when the two texts are the same', () => {
    const result = matchResume(RESUME, RESUME);
    expect(result.missing).toEqual([]);
    expect(result.breakdown.keywordSim).toBeCloseTo(1, 3);
    expect(result.score).toBe(100);
  });

  it('stays within limits and fast on very long text', () => {
    const long = 'python django postgres aws team built many services '.repeat(3000);
    const started = Date.now();
    const result = matchResume(long.slice(0, 100_000), long.slice(0, 50_000));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('does not treat a long line of text as a section heading', () => {
    const result = matchResume('I gained a lot of experience working with teams every day', JOB);
    expect(result.sectionsFound).toEqual([]);
  });
});
