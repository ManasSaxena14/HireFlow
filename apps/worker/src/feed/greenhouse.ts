import { z } from 'zod';
import { type NormalJob, looksRemote, normalJob, type SourceAdapter } from './types.js';

const configSchema = z.object({
  board: z.string().regex(/^[a-z0-9_-]+$/i),
  companyName: z.string().min(1).optional(),
});

const responseSchema = z.object({ jobs: z.array(z.unknown()) });

const jobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  absolute_url: z.string(),
  company_name: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
  content: z.string().nullish(),
});

/** The public job board API that companies on Greenhouse offer for anyone to read. */
export const greenhouseAdapter: SourceAdapter = {
  kind: 'greenhouse',
  async fetchJobs(rawConfig, http) {
    const config = configSchema.parse(rawConfig);
    const { jobs } = responseSchema.parse(
      await http.getJson(
        `https://boards-api.greenhouse.io/v1/boards/${config.board}/jobs?content=true`,
      ),
    );
    return jobs.flatMap((item): NormalJob[] => {
      const parsed = jobSchema.safeParse(item);
      if (!parsed.success) return [];
      const job = parsed.data;
      const location = job.location?.name;
      const posted = job.first_published ?? job.updated_at;
      const normal = normalJob({
        externalId: String(job.id),
        title: job.title,
        companyName: job.company_name ?? config.companyName ?? config.board,
        location,
        remote: looksRemote(location),
        url: job.absolute_url,
        descriptionHtml: job.content,
        postedAt: posted ? new Date(posted) : null,
      });
      return normal ? [normal] : [];
    });
  },
};
