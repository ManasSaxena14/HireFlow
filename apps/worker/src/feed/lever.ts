import { z } from 'zod';
import { type NormalJob, looksRemote, normalJob, type SourceAdapter } from './types.js';

const configSchema = z.object({
  site: z.string().regex(/^[a-z0-9_-]+$/i),
  companyName: z.string().min(1),
});

const jobSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  categories: z.object({ location: z.string().nullish() }).nullish(),
  workplaceType: z.string().nullish(),
  createdAt: z.number().nullish(),
  description: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additional: z.string().nullish(),
});

/** The public postings API that companies on Lever offer for anyone to read. */
export const leverAdapter: SourceAdapter = {
  kind: 'lever',
  async fetchJobs(rawConfig, http) {
    const config = configSchema.parse(rawConfig);
    const jobs = z
      .array(z.unknown())
      .parse(await http.getJson(`https://api.lever.co/v0/postings/${config.site}?mode=json`));
    return jobs.flatMap((item): NormalJob[] => {
      const parsed = jobSchema.safeParse(item);
      if (!parsed.success) return [];
      const job = parsed.data;
      const location = job.categories?.location;
      const lists = (job.lists ?? []).map(
        (list) => `<p>${list.text ?? ''}</p><ul>${list.content ?? ''}</ul>`,
      );
      const normal = normalJob({
        externalId: job.id,
        title: job.text,
        companyName: config.companyName,
        location,
        remote: job.workplaceType === 'remote' || looksRemote(location),
        url: job.hostedUrl,
        descriptionHtml: [job.description, ...lists, job.additional].filter(Boolean).join(''),
        postedAt: job.createdAt ? new Date(job.createdAt) : null,
      });
      return normal ? [normal] : [];
    });
  },
};
