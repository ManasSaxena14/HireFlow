import type { FeedHttp } from './http.js';
import { htmlToText } from './text.js';

/** A job in the same shape, whichever source it came from. */
export interface NormalJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string | null;
  remote: boolean;
  url: string;
  description: string | null;
  skills: string[];
  postedAt: Date | null;
}

export interface SourceAdapter {
  readonly kind: string;
  fetchJobs(config: unknown, http: FeedHttp): Promise<NormalJob[]>;
}

const LIMITS = { title: 200, company: 200, location: 200, description: 20_000, url: 2000 };

const clean = (value: string | null | undefined, max: number) => {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
};

/** Returns null for a job we cannot show, so one bad job does not fail the whole source. */
export function normalJob(raw: {
  externalId: string;
  title: string;
  companyName: string;
  location?: string | null | undefined;
  remote: boolean;
  url: string;
  descriptionHtml?: string | null | undefined;
  skills?: string[] | undefined;
  postedAt?: Date | null | undefined;
}): NormalJob | null {
  const title = clean(raw.title, LIMITS.title);
  const companyName = clean(raw.companyName, LIMITS.company);
  const url = raw.url.trim();
  // A link that is not http could run code when someone clicks it.
  if (!title || !companyName || url.length > LIMITS.url || !/^https?:\/\/\S+$/i.test(url)) {
    return null;
  }
  const postedAt = raw.postedAt && !Number.isNaN(raw.postedAt.getTime()) ? raw.postedAt : null;
  return {
    externalId: raw.externalId,
    title,
    companyName,
    location: clean(raw.location, LIMITS.location),
    remote: raw.remote,
    url,
    description: clean(
      raw.descriptionHtml ? htmlToText(raw.descriptionHtml) : null,
      LIMITS.description,
    ),
    skills: (raw.skills ?? [])
      .map((skill) => skill.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 30),
    postedAt,
  };
}

export const looksRemote = (location: string | null | undefined) =>
  /\bremote\b/i.test(location ?? '');
