import type { GameCard } from "../../sports/types.ts";
import { isYachtSport, type YachtSport } from "../core/versioning.ts";
import { checksumOf, schemaVersion, sourceClock, sourceProvenanceOk, yachtId } from "./clocks.ts";
import type { ExtractedWarehouse, ObservationKind, YachtEvalFact, YachtObservation, YachtQuote } from "./types.ts";

const FORBIDDEN_FEATURE_KEYS = [
  "EPA",
  "xG",
  "KenPom",
  "FIP",
  "xFIP",
  "fighter striking",
  "homeScore",
  "awayScore",
  "clv",
  "homeClose",
  "awayClose",
];

function quality(ok: boolean): number {
  return ok ? 1 : 0;
}

function observation(input: {
  sport: YachtSport;
  gameId: string;
  eventId: string | null;
  source: string;
  sourceId: string | null;
  kind: ObservationKind;
  collectedAt: string;
  knownAt: string | null;
  startAt: string;
  payload: unknown;
}): YachtObservation {
  const checksum = checksumOf(input.payload);
  const provenanceOk = sourceProvenanceOk({
    knownAt: input.knownAt,
    collectedAt: input.collectedAt,
    startAt: input.startAt,
  });
  return {
    observationId: yachtId("yobs", [
      input.sport,
      input.gameId,
      input.source,
      input.kind,
      input.knownAt,
      checksum,
    ]),
    sport: input.sport,
    gameId: input.gameId,
    eventId: input.eventId,
    source: input.source,
    sourceId: input.sourceId,
    kind: input.kind,
    schemaVersion: schemaVersion(),
    collectedAt: input.collectedAt,
    knownAt: input.knownAt,
    effectiveAt: input.knownAt,
    payload: input.payload,
    checksum,
    provenanceOk,
    quality: quality(provenanceOk),
  };
}

function quote(input: {
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
  collectedAt: string;
  evaluationOnly: boolean;
  role: YachtQuote["role"];
}): YachtQuote {
  const evaluationOnly = input.evaluationOnly || input.role === "close";
  const checksum = checksumOf({
    sportsbook: input.sportsbook,
    market: input.market,
    side: input.side,
    line: input.line,
    price: input.price,
    role: input.role,
  });
  const provenanceOk =
    !evaluationOnly &&
    sourceProvenanceOk({ knownAt: input.capturedAt, collectedAt: input.collectedAt });
  return {
    quoteId: yachtId("yqte", [
      input.sport,
      input.gameId,
      input.sportsbook,
      input.market,
      input.side,
      input.line,
      input.price,
      input.capturedAt,
      input.source,
      input.role,
    ]),
    ...input,
    evaluationOnly,
    schemaVersion: schemaVersion(),
    checksum,
    provenanceOk,
  };
}

function evalFact(input: {
  sport: YachtSport;
  gameId: string;
  kind: YachtEvalFact["kind"];
  source: string;
  collectedAt: string;
  knownAt: string | null;
  payload: unknown;
}): YachtEvalFact {
  const checksum = checksumOf(input.payload);
  return {
    factId: yachtId("yevl", [input.sport, input.gameId, input.kind, input.knownAt, checksum]),
    sport: input.sport,
    gameId: input.gameId,
    kind: input.kind,
    source: input.source,
    collectedAt: input.collectedAt,
    knownAt: input.knownAt,
    payload: input.payload,
    checksum,
    provenanceOk: sourceProvenanceOk({ knownAt: input.knownAt, collectedAt: input.collectedAt }),
  };
}

function addQuote(
  quotes: YachtQuote[],
  base: Omit<Parameters<typeof quote>[0], "side" | "price" | "line">,
  side: string,
  price: number | null | undefined,
  line: number | null = null,
): void {
  if (price == null || !Number.isFinite(price) || price === 0) return;
  quotes.push(quote({ ...base, side, price, line }));
}

/** Pure extract. Missing source clocks stay unproven. No packModelInputs.capturedAt. */
export function extractGameWarehouse(game: GameCard, collectedAt: string): ExtractedWarehouse | null {
  if (!isYachtSport(game.league)) return null;
  const sport = game.league;
  const eventId = game.odds.eventId ?? game.espnId ?? null;
  const boardAt = sourceClock(game.fetchedAt);
  const weatherAt = sourceClock(game.weatherFetchedAt);
  const injuryAt = sourceClock(game.injuriesFetchedAt);
  const starterAt = sourceClock(game.startersFetchedAt);
  const oddsAt = sourceClock(game.odds.capturedAt);
  const observations: YachtObservation[] = [
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-site-scoreboard",
      sourceId: game.espnId,
      kind: "board",
      collectedAt,
      knownAt: boardAt,
      startAt: game.startAt,
      payload: {
        venue: game.venue,
        home: game.home.name,
        away: game.away.name,
        homeAbbr: game.home.abbr,
        awayAbbr: game.away.abbr,
        startAt: game.startAt,
        status: game.status,
      },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-site-scoreboard",
      sourceId: game.espnId,
      kind: "venue",
      collectedAt,
      knownAt: boardAt,
      startAt: game.startAt,
      payload: { venue: game.venue },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-record",
      sourceId: game.espnId,
      kind: "record",
      collectedAt,
      knownAt: boardAt,
      startAt: game.startAt,
      payload: { homeRecord: game.home.record, awayRecord: game.away.record },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-weather",
      sourceId: game.espnId,
      kind: "weather",
      collectedAt,
      knownAt: weatherAt,
      startAt: game.startAt,
      payload: { weather: game.weather },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-injury-board",
      sourceId: game.espnId,
      kind: "injuries",
      collectedAt,
      knownAt: injuryAt,
      startAt: game.startAt,
      payload: { injuries: game.injuries ?? [] },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-probable",
      sourceId: game.espnId,
      kind: "starters",
      collectedAt,
      knownAt: starterAt,
      startAt: game.startAt,
      payload: { homeStarter: game.home.starter, awayStarter: game.away.starter },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: "espn-card",
      sourceId: game.espnId,
      kind: "identity",
      collectedAt,
      knownAt: boardAt,
      startAt: game.startAt,
      payload: { home: game.home.name, away: game.away.name },
    }),
    observation({
      sport,
      gameId: game.id,
      eventId,
      source: game.odds.source,
      sourceId: game.odds.eventId ?? null,
      kind: "market",
      collectedAt,
      knownAt: oddsAt,
      startAt: game.startAt,
      payload: {
        book: game.odds.book,
        homeMl: game.odds.homeMl,
        awayMl: game.odds.awayMl,
      },
    }),
  ];

  const quotes: YachtQuote[] = [];
  const dk = {
    sport,
    gameId: game.id,
    eventId,
    sportsbook: game.odds.book || "DraftKings",
    source: game.odds.source,
    sourceId: game.odds.eventId ?? null,
    collectedAt,
  };
  addQuote(
    quotes,
    { ...dk, market: "moneyline", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "home",
    game.odds.homeMl,
  );
  addQuote(
    quotes,
    { ...dk, market: "moneyline", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "away",
    game.odds.awayMl,
  );
  addQuote(
    quotes,
    { ...dk, market: "spread", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "home",
    game.odds.homeSpreadOdds,
    game.odds.homeSpread,
  );
  addQuote(
    quotes,
    { ...dk, market: "spread", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "away",
    game.odds.awaySpreadOdds,
    game.odds.awaySpread,
  );
  addQuote(
    quotes,
    { ...dk, market: "total", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "over",
    game.odds.overOdds,
    game.odds.total,
  );
  addQuote(
    quotes,
    { ...dk, market: "total", capturedAt: oddsAt, evaluationOnly: false, role: "current" },
    "under",
    game.odds.underOdds,
    game.odds.total,
  );
  addQuote(
    quotes,
    { ...dk, market: "moneyline", capturedAt: null, evaluationOnly: false, role: "open_claimed" },
    "home",
    game.odds.openHomeMl,
  );
  addQuote(
    quotes,
    { ...dk, market: "moneyline", capturedAt: null, evaluationOnly: false, role: "open_claimed" },
    "away",
    game.odds.openAwayMl,
  );

  for (const book of game.shadows?.consensus?.books ?? []) {
    const other = {
      sport,
      gameId: game.id,
      eventId,
      sportsbook: book.sportsbook,
      market: "moneyline",
      source: "odds-api-consensus",
      sourceId: book.key,
      collectedAt,
      capturedAt: null as string | null,
      evaluationOnly: false as const,
      role: "current" as const,
    };
    addQuote(quotes, other, "home", book.homePrice);
    addQuote(quotes, other, "away", book.awayPrice);
  }

  const evalFacts: YachtEvalFact[] = [];
  if (game.status === "final" || game.status === "postponed" || game.status === "cancelled") {
    evalFacts.push(
      evalFact({
        sport,
        gameId: game.id,
        kind: "status",
        source: "espn-site-scoreboard",
        collectedAt,
        knownAt: boardAt,
        payload: { status: game.status },
      }),
    );
  }
  if (game.status === "final") {
    evalFacts.push(
      evalFact({
        sport,
        gameId: game.id,
        kind: "score",
        source: "espn-site-scoreboard",
        collectedAt,
        knownAt: boardAt,
        payload: { homeScore: game.home.score, awayScore: game.away.score },
      }),
    );
    evalFacts.push(
      evalFact({
        sport,
        gameId: game.id,
        kind: "result",
        source: "espn-site-scoreboard",
        collectedAt,
        knownAt: boardAt,
        payload: {
          homeWin:
            game.home.score != null && game.away.score != null ? game.home.score > game.away.score : null,
        },
      }),
    );
  }

  return { sport, gameId: game.id, observations, quotes, evalFacts };
}

export function observationHasForbiddenFeature(obs: YachtObservation): boolean {
  const payload = JSON.stringify(obs.payload);
  return FORBIDDEN_FEATURE_KEYS.some((k) => payload.includes(k));
}
