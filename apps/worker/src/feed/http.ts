const MAX_BODY_BYTES = 30 * 1024 * 1024;
const USER_AGENT = 'HireFlow job feed';

export class FeedFetchError extends Error {
  constructor(
    message: string,
    /** False when trying again cannot help, such as a board that does not exist. */
    readonly canRetry: boolean,
  ) {
    super(message);
  }
}

export interface FeedHttp {
  getJson(url: string): Promise<unknown>;
}

export interface FeedHttpOptions {
  fetchImpl?: typeof fetch;
  tries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

async function readLimited(response: Response): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new FeedFetchError('The source sent too much data.', false);
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Tries a source up to three times. Each try waits longer than the one before. */
export function createFeedHttp({
  fetchImpl = fetch,
  tries = 3,
  retryDelayMs = 10_000,
  timeoutMs = 90_000,
}: FeedHttpOptions = {}): FeedHttp {
  const once = async (url: string) => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new FeedFetchError('The source took too long to answer.', true);
      }
      throw new FeedFetchError('We could not reach the source.', true);
    }
    if (!response.ok) {
      const canRetry = response.status === 429 || response.status >= 500;
      throw new FeedFetchError(`The source answered with status ${response.status}.`, canRetry);
    }
    try {
      return JSON.parse(await readLimited(response)) as unknown;
    } catch (error) {
      if (error instanceof FeedFetchError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new FeedFetchError('The source took too long to answer.', true);
      }
      throw new FeedFetchError('The source sent something we could not read.', true);
    }
  };

  return {
    async getJson(url) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await once(url);
        } catch (error) {
          if (!(error instanceof FeedFetchError) || !error.canRetry || attempt >= tries) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    },
  };
}
