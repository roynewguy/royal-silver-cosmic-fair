import { resolveWebhook } from "@/lib/sports/discord";
import { getSql } from "@/lib/db";
import { applyModelInputs, packModelInputs } from "@/lib/sports/model-inputs";
import type {
  DeskLog,
  DeskRecord,
  DeskState,
  GameCard,
  GameStatus,
  Market,
  OddsSnapshot,
  PickResult,
  PickRow,
  PickStatus,
  RankPick,
  Side,
  SportScan,
} from "@/lib/sports/types";
import { LEAGUES } from "@/lib/sports/leagues";

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return String(v ?? "");
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function jsonParse<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object") return raw as T;
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type GameRow = {
  id: string;
  espn_id: string;
  sport: string;
  league: string;
  start_at: unknown;
  status: string;
  home_team: string;
  away_team: string;
  home_abbr: string;
  away_abbr: string;
  home_logo: string | null;
  away_logo: string | null;
  home_score: number | null;
  away_score: number | null;
  home_record: string | null;
  away_record: string | null;
  venue: string | null;
  odds_json: string;
  rank_json: string | null;
  model_inputs_json?: string | null;
};

type PickDb = {
  id: number;
  game_id: string;
  sport: string;
  league: string;
  matchup: string;
  market: string;
  selection: string;
  side: string;
  locked_line: unknown;
  locked_odds: unknown;
  locked_odds_json: string;
  reason: string;
  research: string | null;
  confidence: unknown;
  edge_pct: unknown;
  units: unknown;
  status: string;
  result: string | null;
  profit_units: unknown;
  start_at: unknown;
  post_at: unknown;
  posted_at: unknown;
  graded_at: unknown;
  discord_message: string | null;
  discord_message_id?: string | null;
  official_key?: string | null;
  skip_reason: string | null;
  model_version?: string | null;
  model_probability?: unknown;
  model_edge?: unknown;
  freeze_json?: string | null;
  selected_odds?: unknown;
  posted_odds?: unknown;
  closing_odds?: unknown;
  clv?: unknown;
  created_at: unknown;
  home_logo?: string | null;
  away_logo?: string | null;
  home_abbr?: string | null;
  away_abbr?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  game_status?: string | null;
};

export function gameFromRow(row: GameRow): GameCard {
  const base: GameCard = {
    id: row.id,
    espnId: row.espn_id,
    sport: row.sport,
    league: row.league as GameCard["league"],
    startAt: iso(row.start_at),
    status: row.status as GameStatus,
    home: {
      name: row.home_team,
      abbr: row.home_abbr,
      logo: row.home_logo,
      score: numOrNull(row.home_score),
      record: row.home_record,
      homeSplit: null,
      roadSplit: null,
      starter: null,
    },
    away: {
      name: row.away_team,
      abbr: row.away_abbr,
      logo: row.away_logo,
      score: numOrNull(row.away_score),
      record: row.away_record,
      homeSplit: null,
      roadSplit: null,
      starter: null,
    },
    venue: row.venue,
    odds: jsonParse<OddsSnapshot>(row.odds_json, {
      book: "—",
      details: null,
      homeMl: null,
      awayMl: null,
      homeSpread: null,
      awaySpread: null,
      homeSpreadOdds: null,
      awaySpreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      openHomeSpread: null,
      openTotal: null,
      openHomeMl: null,
      source: "unknown",
      capturedAt: null,
    }),
    rank: jsonParse<RankPick | null>(row.rank_json, null),
    notes: [],
    injuries: [],
    weather: null,
  };
  return applyModelInputs(base, jsonParse(row.model_inputs_json ?? null, null));
}

export function pickFromRow(row: PickDb): PickRow {
  return {
    id: num(row.id),
    gameId: row.game_id,
    sport: row.sport,
    league: row.league,
    matchup: row.matchup,
    market: row.market as Market,
    selection: row.selection,
    side: row.side as Side,
    lockedLine: numOrNull(row.locked_line),
    lockedOdds: Math.round(num(row.locked_odds)),
    lockedOddsJson: jsonParse<OddsSnapshot>(row.locked_odds_json, {
      book: "—",
      details: null,
      homeMl: null,
      awayMl: null,
      homeSpread: null,
      awaySpread: null,
      homeSpreadOdds: null,
      awaySpreadOdds: null,
      total: null,
      overOdds: null,
      underOdds: null,
      openHomeSpread: null,
      openTotal: null,
      openHomeMl: null,
      source: "unknown",
      capturedAt: null,
    }),
    reason: row.reason,
    research: row.research,
    confidence: Math.round(num(row.confidence)),
    edgePct: num(row.edge_pct),
    units: num(row.units),
    status: row.status as PickStatus,
    result: (row.result as PickResult | null) ?? null,
    profitUnits: numOrNull(row.profit_units),
    startAt: iso(row.start_at),
    postAt: iso(row.post_at),
    postedAt: row.posted_at ? iso(row.posted_at) : null,
    gradedAt: row.graded_at ? iso(row.graded_at) : null,
    discordMessage: row.discord_message,
    discordMessageId: row.discord_message_id ?? null,
    officialKey: row.official_key ?? null,
    skipReason: row.skip_reason,
    modelVersion: row.model_version ?? null,
    modelProbability: numOrNull(row.model_probability),
    modelEdge: numOrNull(row.model_edge),
    freezeJson: row.freeze_json ?? null,
    selectedOdds: numOrNull(row.selected_odds),
    postedOdds: numOrNull(row.posted_odds),
    closingOdds: numOrNull(row.closing_odds),
    clv: numOrNull(row.clv),
    createdAt: iso(row.created_at),
    homeLogo: row.home_logo ?? null,
    awayLogo: row.away_logo ?? null,
    homeAbbr: row.home_abbr ?? null,
    awayAbbr: row.away_abbr ?? null,
    homeScore: numOrNull(row.home_score),
    awayScore: numOrNull(row.away_score),
    gameStatus: (row.game_status as GameStatus | null) ?? null,
  };
}

export async function upsertGames(games: GameCard[]): Promise<void> {
  const sql = await getSql();
  for (const g of games) {
    await sql`
      insert into games (
        id, espn_id, sport, league, start_at, status,
        home_team, away_team, home_abbr, away_abbr, home_logo, away_logo,
        home_score, away_score, home_record, away_record, venue, odds_json, rank_json, model_inputs_json, updated_at
      ) values (
        ${g.id}, ${g.espnId}, ${g.sport}, ${g.league}, ${g.startAt}, ${g.status},
        ${g.home.name}, ${g.away.name}, ${g.home.abbr}, ${g.away.abbr}, ${g.home.logo}, ${g.away.logo},
        ${g.home.score}, ${g.away.score}, ${g.home.record}, ${g.away.record}, ${g.venue},
        ${JSON.stringify(g.odds)}, ${g.rank ? JSON.stringify(g.rank) : null}, ${JSON.stringify(packModelInputs(g))}, now()
      )
      on conflict (id) do update set
        status = excluded.status,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        home_record = excluded.home_record,
        away_record = excluded.away_record,
        odds_json = excluded.odds_json,
        rank_json = excluded.rank_json,
        model_inputs_json = excluded.model_inputs_json,
        venue = excluded.venue,
        updated_at = now()
    `;
  }
}

export async function loadGames(): Promise<GameCard[]> {
  const sql = await getSql();
  const rows = await sql<GameRow>`
    select * from games
    where start_at > now() - interval '10 days'
    order by start_at asc
  `;
  return rows.map(gameFromRow);
}

export async function loadPicks(): Promise<PickRow[]> {
  const sql = await getSql();
  const rows = await sql<PickDb>`
    select p.*, g.home_logo, g.away_logo, g.home_abbr, g.away_abbr,
           g.home_score, g.away_score, g.status as game_status
    from picks p
    left join games g on g.id = p.game_id
    order by p.created_at desc
    limit 80
  `;
  return rows.map(pickFromRow);
}

export async function loadRecord(): Promise<DeskRecord> {
  const sql = await getSql();
  const rows = await sql<{
    wins: unknown;
    losses: unknown;
    pushes: unknown;
    units: unknown;
    pending: unknown;
  }>`
    select
      count(*) filter (where result = 'WIN' and status = 'graded') as wins,
      count(*) filter (where result = 'LOSS' and status = 'graded') as losses,
      count(*) filter (where result = 'PUSH' and status = 'graded') as pushes,
      coalesce(sum(profit_units) filter (where status = 'graded' and result is not null), 0) as units,
      count(*) filter (where status = 'posted' and result is null) as pending
    from picks
  `;
  const r = rows[0];
  return {
    wins: num(r?.wins),
    losses: num(r?.losses),
    pushes: num(r?.pushes),
    units: num(r?.units),
    pending: num(r?.pending),
  };
}

export async function loadLog(): Promise<DeskLog[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    kind: string;
    sport: string | null;
    message: string;
    created_at: unknown;
  }>`select id, kind, sport, message, created_at from desk_log order by id desc limit 24`;
  return rows.map((r) => ({
    id: num(r.id),
    kind: r.kind,
    sport: r.sport,
    message: r.message,
    createdAt: iso(r.created_at),
  }));
}

export async function addLog(kind: string, message: string, sport?: string | null): Promise<void> {
  const sql = await getSql();
  await sql`insert into desk_log (kind, sport, message) values (${kind}, ${sport ?? null}, ${message})`;
  await sql`delete from desk_log where id < (select coalesce(max(id), 0) - 200 from desk_log)`;
}

export async function touchScan(kind: "scan" | "desk"): Promise<void> {
  const sql = await getSql();
  if (kind === "desk") {
    await sql`update desk_meta set last_scan_at = now(), last_desk_at = now(), updated_at = now() where id = 1`;
  } else {
    await sql`update desk_meta set last_scan_at = now(), updated_at = now() where id = 1`;
  }
}

export async function loadMeta(): Promise<{
  lastScanAt: string | null;
  lastDeskAt: string | null;
  minEdgePct: number;
  minConfidence: number;
  postLeadMinutes: number;
  hasWebhook: boolean;
  autoRun: boolean;
}> {
  const sql = await getSql();
  const rows = await sql<{
    last_scan_at: unknown;
    last_desk_at: unknown;
    min_edge_pct: unknown;
    min_confidence: unknown;
    post_lead_minutes: unknown;
    discord_webhook: string | null;
    auto_run: unknown;
  }>`select last_scan_at, last_desk_at, min_edge_pct, min_confidence, post_lead_minutes, discord_webhook, auto_run from desk_meta where id = 1`;
  const r = rows[0];
  return {
    lastScanAt: r?.last_scan_at ? iso(r.last_scan_at) : null,
    lastDeskAt: r?.last_desk_at ? iso(r.last_desk_at) : null,
    minEdgePct: num(r?.min_edge_pct) || 3,
    minConfidence: Math.round(num(r?.min_confidence) || 58),
    postLeadMinutes: Math.round(num(r?.post_lead_minutes) || 150),
    hasWebhook: Boolean(r?.discord_webhook && String(r.discord_webhook).trim()),
    autoRun: r?.auto_run !== false,
  };
}

export function scansFrom(games: GameCard[], picks: PickRow[]): SportScan[] {
  return LEAGUES.map((league) => {
    const slate = games.filter((g) => g.league === league.id);
    const live = picks.find(
      (p) => p.sport === league.sport && (p.status === "queued" || p.status === "posting" || p.status === "posted") && !p.result,
    );
    const scheduled = slate.filter((g) => g.status === "scheduled");
    if (live) {
      return {
        league: league.id,
        sport: league.sport,
        active: true,
        gameCount: scheduled.length,
        skipped: false,
        skipReason: null,
      };
    }
    if (scheduled.length === 0) {
      return {
        league: league.id,
        sport: league.sport,
        active: slate.length > 0,
        gameCount: slate.length,
        skipped: true,
        skipReason: "No games in window.",
      };
    }
    const ranked = scheduled.filter((g) => g.rank);
    return {
      league: league.id,
      sport: league.sport,
      active: true,
      gameCount: scheduled.length,
      skipped: ranked.length === 0,
      skipReason: ranked.length === 0 ? "No strong play." : null,
    };
  });
}

export async function readDesk(): Promise<DeskState> {
  const [games, picks, record, log, meta] = await Promise.all([
    loadGames(),
    loadPicks(),
    loadRecord(),
    loadLog(),
    loadMeta(),
  ]);
  const hook = resolveWebhook(await readWebhook());
  return {
    record,
    games,
    picks,
    scans: scansFrom(games, picks),
    log,
    lastScanAt: meta.lastScanAt,
    lastDeskAt: meta.lastDeskAt,
    minEdgePct: meta.minEdgePct,
    minConfidence: meta.minConfidence,
    postLeadMinutes: meta.postLeadMinutes,
    hasWebhook: hook.source !== "none",
    webhookSource: hook.source,
    operator: false,
    soccerDesk: "off",
    pinFromEnv: Boolean(process.env.BOATBOYZ_PIN?.trim()),
  };
}

export async function livePickForSport(sport: string): Promise<PickRow | null> {
  const sql = await getSql();
  const rows = await sql<PickDb>`
    select * from picks
    where sport = ${sport} and status in ('queued','posting','posted') and result is null
    order by created_at desc
    limit 1
  `;
  return rows[0] ? pickFromRow(rows[0]) : null;
}

export async function pickByGame(gameId: string): Promise<PickRow | null> {
  const sql = await getSql();
  const rows = await sql<PickDb>`
    select * from picks
    where game_id = ${gameId} and status in ('queued','posting','posted','graded')
    order by created_at desc
    limit 1
  `;
  return rows[0] ? pickFromRow(rows[0]) : null;
}

export async function readWebhook(): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ discord_webhook: string | null }>`select discord_webhook from desk_meta where id = 1`;
  return rows[0]?.discord_webhook?.trim() ?? "";
}

export async function writeWebhook(url: string): Promise<void> {
  const sql = await getSql();
  await sql`update desk_meta set discord_webhook = ${url || null}, updated_at = now() where id = 1`;
}

export async function tryWorkerLock(): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: number }>`
    update desk_meta
    set worker_lock_until = now() + interval '3 minutes'
    where id = 1 and (worker_lock_until is null or worker_lock_until < now())
    returning id
  `;
  return rows.length > 0;
}

export async function clearWorkerLock(): Promise<void> {
  const sql = await getSql();
  await sql`update desk_meta set worker_lock_until = null where id = 1`;
}
