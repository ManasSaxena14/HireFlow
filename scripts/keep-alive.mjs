// Keeps the Render backend awake for as many hours a day as the free plans allow.
// GitHub Actions runs it every 12 minutes. It uses Node's own fetch, so it needs no packages.
//
// While Render is awake, its worker asks the database every few seconds, so Neon is awake too.
// Render's 750 free hours a month cover a whole month, but Neon's free 100 compute hours do not.
// So Neon sets the limit. Each run reads Neon's real usage for this month, works out how many
// awake hours a day are still affordable, and pings only inside that many hours from the daily
// start time. Spare hours make later days longer, and heavy use makes them shorter, so the
// month ends just inside the free amount. Visits at other times still wake both, and their
// cost is counted on the next run.
//
// Settings, all from the environment:
//   RENDER_BACKEND_URL  The Render address, like https://hireflow-api.onrender.com (required)
//   NEON_API_KEY        A Neon API key, to read usage. Without it, a fixed 10 hour window is used
//   NEON_PROJECT_ID     The Neon project id, like orange-tooth-36639358
//   KEEP_ALIVE_START    Daily start in UTC as HH:MM. Default 02:30, which is 08:00 in India
//   KEEP_ALIVE_DRY_RUN  Set to 1 to print the decision without pinging
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

/** Neon's free compute for one project in one month, in compute-unit seconds. */
const FREE_CU_SECONDS = 100 * 3600;
/** Kept free for visits outside the window and for rounding. */
const MARGIN = 0.08;
/** The smallest Neon compute size. An awake hour never costs less than this. */
const MIN_CU = 0.25;
/** Used when Neon usage cannot be read. Ten hours a day fits the free plan with room to spare. */
const FALLBACK_HOURS = 10;

const env = process.env;
const log = (message) => console.log(message);
const warn = (message) => console.log(`::warning::${message}`);

function startMinute() {
  const match = /^(\d{1,2}):(\d{2})$/.exec(env.KEEP_ALIVE_START ?? '02:30');
  if (!match) return 150;
  return (Number(match[1]) % 24) * 60 + (Number(match[2]) % 60);
}

/** Reads this month's Neon usage. Returns null when it cannot, so the fallback is used. */
async function neonUsage() {
  if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID) return null;
  try {
    const response = await fetch(
      `https://console.neon.tech/api/v2/projects/${encodeURIComponent(env.NEON_PROJECT_ID)}`,
      {
        headers: { Authorization: `Bearer ${env.NEON_API_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      warn(
        `Could not read Neon usage: HTTP ${response.status}. Using the ${FALLBACK_HOURS} hour window.`,
      );
      return null;
    }
    const { project } = await response.json();
    return {
      used: Number(project.compute_time_seconds ?? 0),
      active: Number(project.active_time_seconds ?? 0),
      periodEnd: Date.parse(project.consumption_period_end),
    };
  } catch (error) {
    warn(`Could not read Neon usage: ${error.message}. Using the ${FALLBACK_HOURS} hour window.`);
    return null;
  }
}

/** How many hours a day the backend may stay awake for the rest of this month. */
export function affordableHours(usage, now) {
  if (!usage || !Number.isFinite(usage.periodEnd)) return FALLBACK_HOURS;
  // The real cost of an awake hour, from this month so far, and never below the smallest size.
  const cuPerHour = Math.max(MIN_CU, usage.active > 600 ? usage.used / usage.active : MIN_CU);
  const leftCuSeconds = FREE_CU_SECONDS * (1 - MARGIN) - usage.used;
  if (leftCuSeconds <= 0) return 0;
  const awakeHoursLeft = leftCuSeconds / cuPerHour / 3600;
  const daysLeft = Math.max((usage.periodEnd - now) / 86_400_000, 1 / 24);
  return Math.min(24, awakeHoursLeft / daysLeft);
}

/** True when this moment is inside today's awake hours, counted from the daily start. */
export function insideWindow(hours, now, start = startMinute()) {
  const date = new Date(now);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (minute - start + 1440) % 1440 < hours * 60;
}

async function ping(base) {
  const url = `${base.replace(/\/+$/, '')}/api/v1/health`;
  let status = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // A sleeping free service can take up to a minute to wake.
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      status = response.status;
    } catch {
      status = 0;
    }
    log(`Try ${attempt}: HTTP ${status}`);
    if (status === 200) return;
    if (attempt < 3) await wait(attempt * 20_000);
  }
  // A warning, not a failed run, so a short outage does not send an email every 12 minutes.
  warn(`The backend did not answer 200 after 3 tries. Last answer: HTTP ${status}.`);
}

async function main() {
  const base = env.RENDER_BACKEND_URL?.trim();
  if (!base) {
    log('::notice::RENDER_BACKEND_URL is not set yet, so there is nothing to ask.');
    return;
  }
  const now = Date.now();
  const usage = await neonUsage();
  const hours = affordableHours(usage, now);
  if (usage) {
    log(
      `Neon this month: ${(usage.used / 3600).toFixed(1)} of 100 compute hours used. ` +
        `Affordable: ${hours.toFixed(1)} awake hours a day from now on.`,
    );
  }
  if (!insideWindow(hours, now)) {
    log(`Outside today's ${hours.toFixed(1)} awake hours, so the backend may sleep.`);
    return;
  }
  if (env.KEEP_ALIVE_DRY_RUN === '1') {
    log('Inside the awake hours. Dry run, so no ping.');
    return;
  }
  await ping(base);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
