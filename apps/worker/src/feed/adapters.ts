import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import type { SourceAdapter } from './types.js';

/** To add a source, write an adapter and list it here. Nothing else needs to change. */
export const ADAPTERS: readonly SourceAdapter[] = [greenhouseAdapter, leverAdapter];
