import type { YachtSport } from "../core/versioning.ts";

export const YACHT_OBS_SCHEMA = "yacht-obs-1";

export type ObservationKind =
  | "board"
  | "venue"
  | "record"
  | "weather"
  | "injuries"
  | "starters"
  | "identity"
  | "market";

export type YachtObservation = {
  observationId: string;
  sport: YachtSport;
  gameId: string;
  eventId: string | null;
  source: string;
  sourceId: string | null;
  kind: ObservationKind;
  schemaVersion: string;
  collectedAt: string;
  knownAt: string | null;
  effectiveAt: string | null;
  payload: unknown;
  checksum: string;
  provenanceOk: boolean;
  quality: number;
};

export type QuoteRole = "current" | "open_claimed" | "close";

export type YachtQuote = {
  quoteId: string;
  sport: YachtSport;
  gameId: string;
  eventId: string | null;
  sportsbook: string;
  market: string;
  side: string;
  line: number | null;
  price: number;
  capturedAt: string | null;
  source: string;
  sourceId: string | null;
  schemaVersion: string;
  collectedAt: string;
  checksum: string;
  provenanceOk: boolean;
  evaluationOnly: boolean;
  role: QuoteRole;
};

export type EvalFactKind = "score" | "result" | "close" | "status";

export type YachtEvalFact = {
  factId: string;
  sport: YachtSport;
  gameId: string;
  kind: EvalFactKind;
  source: string;
  collectedAt: string;
  knownAt: string | null;
  payload: unknown;
  checksum: string;
  provenanceOk: boolean;
};

export type ExtractedWarehouse = {
  sport: YachtSport;
  gameId: string;
  observations: YachtObservation[];
  quotes: YachtQuote[];
  evalFacts: YachtEvalFact[];
};

export type CollectResult =
  | {
      ok: true;
      games: number;
      insertedObservations: number;
      insertedQuotes: number;
      insertedEvalFacts: number;
      insertedSnapshots: number;
      skipped: number;
      error: null;
    }
  | {
      ok: false;
      games: number;
      insertedObservations: number;
      insertedQuotes: number;
      insertedEvalFacts: number;
      insertedSnapshots: number;
      skipped: number;
      error: string;
    };
