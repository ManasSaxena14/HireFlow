import { describe, expect, it } from 'vitest';
import { sm2 } from './prep.js';

const fresh = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

/** The SM-2 formula written out again, step by step, to check the code against. */
function byTheBook(state: typeof fresh, q: number) {
  let { repetitions, intervalDays } = state;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * state.easeFactor);
  }
  const easeFactor = Math.max(1.3, state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { easeFactor, intervalDays, repetitions };
}

describe('sm2', () => {
  it('gives 1 day, then 6 days, then interval times ease', () => {
    const first = sm2(fresh, 4);
    expect(first).toEqual({ easeFactor: 2.5, intervalDays: 1, repetitions: 1 });
    const second = sm2(first, 4);
    expect(second).toEqual({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 });
    const third = sm2(second, 4);
    expect(third).toEqual({ easeFactor: 2.5, intervalDays: 15, repetitions: 3 });
  });

  it('changes the ease by the formula for each grade', () => {
    expect(sm2(fresh, 5).easeFactor).toBe(2.6);
    expect(sm2(fresh, 4).easeFactor).toBe(2.5);
    expect(sm2(fresh, 3).easeFactor).toBe(2.36);
    expect(sm2(fresh, 2).easeFactor).toBe(2.18);
    expect(sm2(fresh, 1).easeFactor).toBe(1.96);
    expect(sm2(fresh, 0).easeFactor).toBe(1.7);
  });

  it('starts again tomorrow after a grade under 3, keeping the lower ease', () => {
    const learned = { easeFactor: 2.5, intervalDays: 15, repetitions: 3 };
    expect(sm2(learned, 2)).toEqual({ easeFactor: 2.18, intervalDays: 1, repetitions: 0 });
  });

  it('never lets the ease go under 1.3', () => {
    let state = fresh;
    for (let step = 0; step < 10; step++) state = sm2(state, 0);
    expect(state.easeFactor).toBe(1.3);
  });

  it('matches the formula for every grade from many starting points', () => {
    for (const easeFactor of [1.3, 1.7, 2.18, 2.5, 2.9]) {
      for (const [intervalDays, repetitions] of [
        [0, 0],
        [1, 1],
        [6, 2],
        [15, 3],
        [40, 6],
      ] as const) {
        for (let q = 0; q <= 5; q++) {
          const state = { easeFactor, intervalDays, repetitions };
          const expected = byTheBook(state, q);
          const actual = sm2(state, q);
          expect(actual.intervalDays).toBe(expected.intervalDays);
          expect(actual.repetitions).toBe(expected.repetitions);
          expect(actual.easeFactor).toBeCloseTo(expected.easeFactor, 2);
        }
      }
    }
  });
});
