import type { GameCard, RankPick } from "../sports/types.ts";

/** Sports that can have an independent production champion. */
export const CHAMPION_SPORTS = ["mlb", "nba", "nfl", "nhl", "ncaaf", "wnba", "ncaab", "ufc"] as const;
export type ChampionSport = (typeof CHAMPION_SPORTS)[number];

/** Shipped V2 defaults. CEO promotion is the only way these change. */
export const DEFAULT_CHAMPIONS: Record<ChampionSport, string> = {
  mlb: "v2-mlb",
  nba: "v2-nba",
  nfl: "v2-nfl",
  nhl: "v2-nhl",
  ncaaf: "v2-ncaaf",
  wnba: "v2-wnba",
  ncaab: "v2-ncaab",
  ufc: "v2-ufc",
};

export type ProductionRanker = (game: GameCard) => RankPick | null;

export type ChampionAction = "verify" | "promote" | "rollback";

export type ChampionHistoryEntry = {
  sport: ChampionSport;
  action: ChampionAction;
  fromVersion: string | null;
  toVersion: string;
  operatorId: string | null;
  reason: string | null;
  at: string;
};

export type ChampionResult = {
  ok: boolean;
  sport?: ChampionSport;
  champion?: string;
  previous?: string | null;
  note: string;
};

export type ChampionGateInput = {
  version: string;
  sport: string;
  ceoApproved?: boolean;
  operatorId?: string | null;
  reason?: string | null;
};

const SPORTS_BY_LENGTH = [...CHAMPION_SPORTS].sort((a, b) => b.length - a.length);

let current: Record<ChampionSport, string> = { ...DEFAULT_CHAMPIONS };
let previous: Record<ChampionSport, string | null> = emptyPrevious();
const verified = new Set<string>(defaultVerifiedKeys());
const v2Rankers = new Map<string, ProductionRanker>();
const extraRankers = new Map<string, ProductionRanker>();
const history: ChampionHistoryEntry[] = [];

function emptyPrevious(): Record<ChampionSport, string | null> {
  return {
    mlb: null,
    nba: null,
    nfl: null,
    nhl: null,
    ncaaf: null,
    wnba: null,
    ncaab: null,
    ufc: null,
  };
}

function defaultVerifiedKeys(): string[] {
  return CHAMPION_SPORTS.map((sport) => verifyKey(sport, DEFAULT_CHAMPIONS[sport]));
}

function verifyKey(sport: string, version: string): string {
  return `${sport}::${version}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function isChampionSport(sport: string | null | undefined): sport is ChampionSport {
  return Boolean(sport && (CHAMPION_SPORTS as readonly string[]).includes(sport));
}

/**
 * Parse the sport token out of a model version.
 * Uses hyphen/underscore tokens so `v2-wnba` is not mistaken for `nba`.
 */
export function sportOfVersion(version: string | null | undefined): ChampionSport | null {
  if (!version) return null;
  const tokens = version.trim().toLowerCase().split(/[-_/]+/).filter(Boolean);
  for (const sport of SPORTS_BY_LENGTH) {
    if (tokens.includes(sport)) return sport;
  }
  return null;
}

export function championFor(sport: string | null | undefined): string {
  if (!isChampionSport(sport)) return "";
  return current[sport] ?? DEFAULT_CHAMPIONS[sport];
}

export function previousChampion(sport: string | null | undefined): string | null {
  if (!isChampionSport(sport)) return null;
  return previous[sport] ?? null;
}

export function allChampions(): Record<ChampionSport, string> {
  return { ...current };
}

export function allPreviousChampions(): Record<ChampionSport, string | null> {
  return { ...previous };
}

export function isDefaultV2Champion(version: string, sport: string): boolean {
  return isChampionSport(sport) && DEFAULT_CHAMPIONS[sport] === version;
}

export function isVerifiedModel(version: string, sport: string): boolean {
  if (isDefaultV2Champion(version, sport)) return true;
  return verified.has(verifyKey(sport, version));
}

export function isActiveChampion(version: string | null | undefined): boolean {
  if (!version) return false;
  const sport = sportOfVersion(version);
  if (!sport) return false;
  return championFor(sport) === version;
}

export function registerProductionRanker(version: string, ranker: ProductionRanker): void {
  const sport = sportOfVersion(version);
  if (sport && DEFAULT_CHAMPIONS[sport] === version) {
    v2Rankers.set(version, ranker);
    return;
  }
  extraRankers.set(version, ranker);
}

export function productionRankerFor(version: string | null | undefined): ProductionRanker | null {
  if (!version) return null;
  return extraRankers.get(version) ?? v2Rankers.get(version) ?? null;
}

export function championHistory(): ChampionHistoryEntry[] {
  return history.map((row) => ({ ...row }));
}

export function applyChampionSnapshot(input: {
  champions?: Partial<Record<string, string>>;
  previous?: Partial<Record<string, string | null>>;
  verified?: Array<{ sport: string; version: string }>;
}): void {
  if (input.champions) {
    for (const [sport, version] of Object.entries(input.champions)) {
      if (isChampionSport(sport) && version) current[sport] = version;
    }
  }
  if (input.previous) {
    for (const [sport, version] of Object.entries(input.previous)) {
      if (isChampionSport(sport)) previous[sport] = version ?? null;
    }
  }
  if (input.verified) {
    for (const row of input.verified) {
      if (isChampionSport(row.sport) && row.version) verified.add(verifyKey(row.sport, row.version));
    }
  }
}

function pushHistory(entry: Omit<ChampionHistoryEntry, "at"> & { at?: string }): void {
  history.push({ ...entry, at: entry.at ?? nowIso() });
}

function gateSport(sport: string): { ok: true; sport: ChampionSport } | { ok: false; note: string } {
  const id = sport.trim().toLowerCase();
  if (!isChampionSport(id)) return { ok: false, note: `Unknown sport ${sport}.` };
  return { ok: true, sport: id };
}

function requireCeo(ceoApproved: boolean | undefined): ChampionResult | null {
  if (ceoApproved !== true) {
    return { ok: false, note: "CEO approval is required. Grokbot CEO decides promotion from evaluation evidence." };
  }
  return null;
}

/** CEO marks a challenger verified. Does not change the live champion. */
export function verifyChallenger(input: ChampionGateInput): ChampionResult {
  const ceo = requireCeo(input.ceoApproved);
  if (ceo) return ceo;
  const sportGate = gateSport(input.sport);
  if (!sportGate.ok) return sportGate;
  const version = input.version.trim();
  if (!version) return { ok: false, note: "Model version is required." };
  const parsed = sportOfVersion(version);
  if (parsed !== sportGate.sport) {
    return { ok: false, note: `Version ${version} does not belong to ${sportGate.sport}.` };
  }
  if (isVerifiedModel(version, sportGate.sport)) {
    return {
      ok: true,
      sport: sportGate.sport,
      champion: championFor(sportGate.sport),
      previous: previousChampion(sportGate.sport),
      note: `${version} is already verified for ${sportGate.sport}. Live champion is unchanged.`,
    };
  }
  verified.add(verifyKey(sportGate.sport, version));
  pushHistory({
    sport: sportGate.sport,
    action: "verify",
    fromVersion: championFor(sportGate.sport),
    toVersion: version,
    operatorId: input.operatorId ?? null,
    reason: input.reason ?? "CEO verified challenger",
  });
  return {
    ok: true,
    sport: sportGate.sport,
    champion: championFor(sportGate.sport),
    previous: previousChampion(sportGate.sport),
    note: `${version} verified for ${sportGate.sport}. Not the live champion until CEO promotes it.`,
  };
}

/**
 * CEO replaces the live champion for one sport.
 * Unverified models are blocked. A production ranker must already be registered
 * so official tickets are produced by that model, not relabeled V2 math.
 */
export function promoteSportChampion(input: ChampionGateInput): ChampionResult {
  const ceo = requireCeo(input.ceoApproved);
  if (ceo) return ceo;
  const sportGate = gateSport(input.sport);
  if (!sportGate.ok) return sportGate;
  const version = input.version.trim();
  if (!version) return { ok: false, note: "Model version is required." };
  const parsed = sportOfVersion(version);
  if (parsed !== sportGate.sport) {
    return { ok: false, note: `Version ${version} does not belong to ${sportGate.sport}.` };
  }
  if (!isVerifiedModel(version, sportGate.sport)) {
    return { ok: false, note: `${version} is not verified for ${sportGate.sport}. Verify before champion promotion.` };
  }
  const builtinV2 = isDefaultV2Champion(version, sportGate.sport);
  if (!builtinV2 && !productionRankerFor(version)) {
    return {
      ok: false,
      note: `No production ranker registered for ${version}. Register a ranker before promotion so ${sportGate.sport} does not go dark.`,
    };
  }
  const currentChamp = championFor(sportGate.sport);
  if (currentChamp === version) {
    return {
      ok: true,
      sport: sportGate.sport,
      champion: version,
      previous: previousChampion(sportGate.sport),
      note: `${version} is already the ${sportGate.sport} champion.`,
    };
  }
  previous[sportGate.sport] = currentChamp;
  current[sportGate.sport] = version;
  pushHistory({
    sport: sportGate.sport,
    action: "promote",
    fromVersion: currentChamp,
    toVersion: version,
    operatorId: input.operatorId ?? null,
    reason: input.reason ?? "CEO promoted sport champion",
  });
  return {
    ok: true,
    sport: sportGate.sport,
    champion: version,
    previous: currentChamp,
    note: `${sportGate.sport} champion is now ${version}. Previous champion ${currentChamp} remains the rollback target. Other sports are unchanged.`,
  };
}

/** Restore the previous champion for one sport. */
export function rollbackSportChampion(input: {
  sport: string;
  ceoApproved?: boolean;
  operatorId?: string | null;
  reason?: string | null;
}): ChampionResult {
  const ceo = requireCeo(input.ceoApproved);
  if (ceo) return ceo;
  const sportGate = gateSport(input.sport);
  if (!sportGate.ok) return sportGate;
  const target = previousChampion(sportGate.sport);
  if (!target) {
    return {
      ok: false,
      sport: sportGate.sport,
      champion: championFor(sportGate.sport),
      previous: null,
      note: `No rollback target for ${sportGate.sport}. Live champion remains ${championFor(sportGate.sport)}.`,
    };
  }
  const currentChamp = championFor(sportGate.sport);
  previous[sportGate.sport] = currentChamp;
  current[sportGate.sport] = target;
  pushHistory({
    sport: sportGate.sport,
    action: "rollback",
    fromVersion: currentChamp,
    toVersion: target,
    operatorId: input.operatorId ?? null,
    reason: input.reason ?? "CEO rolled back sport champion",
  });
  return {
    ok: true,
    sport: sportGate.sport,
    champion: target,
    previous: currentChamp,
    note: `${sportGate.sport} rolled back to ${target}. ${currentChamp} is the new rollback target. Other sports are unchanged.`,
  };
}

export function resetChampionStore(): void {
  current = { ...DEFAULT_CHAMPIONS };
  previous = emptyPrevious();
  verified.clear();
  for (const key of defaultVerifiedKeys()) verified.add(key);
  extraRankers.clear();
  history.length = 0;
}
