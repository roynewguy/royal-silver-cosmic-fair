import { ingestRange, type IngestResult } from "../ingest.ts";
import { RESEARCH_BY_ID } from "../sports.ts";

export type { IngestResult };

export async function ingestMlbRange(opts: {
  from: string;
  to: string;
  cacheDir: string;
  fetchOdds?: boolean;
}): Promise<IngestResult> {
  return ingestRange(RESEARCH_BY_ID.mlb, { ...opts, cacheDir: opts.cacheDir.replace(/\/mlb$/, "") });
}
