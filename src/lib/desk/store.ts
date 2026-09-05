import { resolveWebhook } from "@/lib/sports/discord";
import { getSql, dbSource } from "@/lib/db";
import { buildCalibration } from "@/lib/sports/calibration";
import { applyModelInputs, packModelInputs } from "@/lib/sports/model-inputs";
import { isFreeBetaMode } from "@/lib/sports/free-beta";
import { activeLedger, isPaperMode } from "@/lib/sports/paper-mode";
import { buildDeskHealth } from "./health.ts";
import { loadResearchSummary } from "@/lib/models-v3/summary";
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
import { clampDailyPicks, countsTowardDailyCap, resolveDailyPickTarget } from "@/lib/sports/rank";

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
  ledger?: string | null;
  pick_source?: string | null;
  line_source?: string | null;
  posted_score?: string | null;
  posted_state?: string | null;
  needs_manual_grade?: boolean | null;
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
    ledger: row.ledger === "paper" ? "paper" : "official",
    pickSource: row.pick_source === "manual_live" ? "manual_live" : row.pick_source === "manual" ? "manual" : "auto",
    lineSource: row.line_source ?? null,
    postedScore: row.posted_score ?? null,
    postedState: row.posted_state ?? null,
    needsManualGrade: Boolean(row.needs_manual_grade),
  };
}

export const GAME_UPSERT_CHUNK = 25;

function gameUpsertParams(g: GameCard): unknown[] {
  return [
    g.id,
    g.espnId,
    g.sport,
    g.league,
    g.startAt,
    g.status,
    g.home.name,
    g.away.name,
    g.home.abbr,
    g.away.abbr,
    g.home.logo,
    g.away.logo,
    g.home.score,
    g.away.score,
    g.home.record,
    g.away.record,
    g.venue,
    JSON.stringify(g.odds),
    g.rank ? JSON.stringify(g.rank) : null,
    JSON.stringify(packModelInputs(g)),
  ];
}

export async function upsertGames(games: GameCard[]): Promise<void> {
  if (!games.length) return;
  const sql = await getSql();
  for (let i = 0; i < games.length; i += GAME_UPSERT_CHUNK) {
    const chunk = games.slice(i, i + GAME_UPSERT_CHUNK);
    const params: unknown[] = [];
    const values = chunk.map((g, idx) => {
      const base = idx * 20;
      params.push(...gameUpsertParams(g));
      const slots = Array.from({ length: 20 }, (_, n) => `$${base + n + 1}`).join(", ");
      return `(${slots}, now())`;
    });
    await sql.query(
      `insert into games (
        id, espn_id, sport, league, start_at, status,
        home_team, away_team, home_abbr, away_abbr, home_logo, away_logo,
        home_score, away_score, home_record, away_record, venue, odds_json, rank_json, model_inputs_json, updated_at
      ) values ${values.join(", ")}
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
        updated_at = now()`,
      params,
    );
  }
}

export async function loadGames(): Promise<GameCard[]> {
  const sql = await getSql();
  const rows = await sql<GameRow>`
    select * from games
    where start_at > now() - interval '2 days'
      and start_at < now() + interval '14 days'
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
    limit 200
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
    where coalesce(ledger, 'official') = 'official'
      and official_key is not null
      and coalesce(pick_source, 'auto') = 'auto'
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

export async function loadPaperRecord(): Promise<DeskRecord> {
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
    where coalesce(ledger, 'official') = 'paper'
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
  }>`select id, kind, sport, message, created_at from desk_log order by id desc limit 80`;
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
  const last = await sql<{ message: string }>`select message from desk_log order by id desc limit 1`;
  if (last[0]?.message === message) return;
  await sql`insert into desk_log (kind, sport, message) values (${kind}, ${sport ?? null}, ${message})`;
}

export async function touchScan(kind: "scan" | "desk"): Promise<void> {
  const sql = await getSql();
  if (kind === "desk") {
    await sql`update desk_meta set last_scan_at = now(), last_desk_at = now(), updated_at = now() where id = 1`;
  } else {
    await sql`update desk_meta set last_scan_at = now(), updated_at = now() where id = 1`;
  }
}

export async function touchCronTick(source: string): Promise<void> {
  if (source !== "cron") return;
  const sql = await getSql();
  await sql`update desk_meta set last_tick_at = now(), last_tick_source = ${source}, updated_at = now() where id = 1`;
}

export async function loadMeta(): Promise<{
  lastScanAt: string | null;
  lastDeskAt: string | null;
  lastTickAt: string | null;
  minEdgePct: number;
  minConfidence: number;
  postLeadMinutes: number;
  maxDailyPicks: number;
  hasWebhook: boolean;
  autoRun: boolean;
  oddsRemaining: number | null;
  oddsUsed: number | null;
}> {
  const sql = await getSql();
  const rows = await sql<{
    last_scan_at: unknown;
    last_desk_at: unknown;
    last_tick_at: unknown;
    min_edge_pct: unknown;
    min_confidence: unknown;
    post_lead_minutes: unknown;
    max_daily_picks: unknown;
    daily_picks_source: string | null;
    discord_webhook: string | null;
    auto_run: unknown;
    odds_remaining: unknown;
    odds_used: unknown;
  }>`select last_scan_at, last_desk_at, last_tick_at, min_edge_pct, min_confidence, post_lead_minutes, max_daily_picks, daily_picks_source, discord_webhook, auto_run, odds_remaining, odds_used from desk_meta where id = 1`;
  const r = rows[0];
  const rawCap = Math.round(num(r?.max_daily_picks) || 3);
  return {
    lastScanAt: r?.last_scan_at ? iso(r.last_scan_at) : null,
    lastDeskAt: r?.last_desk_at ? iso(r.last_desk_at) : null,
    lastTickAt: r?.last_tick_at ? iso(r.last_tick_at) : null,
    minEdgePct: num(r?.min_edge_pct) || 3,
    minConfidence: Math.round(num(r?.min_confidence) || 58),
    postLeadMinutes: Math.round(num(r?.post_lead_minutes) || 150),
    maxDailyPicks: resolveDailyPickTarget({
      stored: rawCap,
      source: r?.daily_picks_source,
    }),
    hasWebhook: Boolean(r?.discord_webhook && String(r.discord_webhook).trim()),
    autoRun: r?.auto_run !== false,
    oddsRemaining: numOrNull(r?.odds_remaining),
    oddsUsed: numOrNull(r?.odds_used),
  };
}

export async function writeDeskSettings(input: {
  minEdgePct?: number;
  minConfidence?: number;
  postLeadMinutes?: number;
}): Promise<void> {
  const sql = await getSql();
  const edge = input.minEdgePct;
  const conf = input.minConfidence;
  const lead = input.postLeadMinutes;
  if (edge != null && Number.isFinite(edge)) {
    await sql`update desk_meta set min_edge_pct = ${Math.max(0, Math.min(20, edge))}, updated_at = now() where id = 1`;
  }
  if (conf != null && Number.isFinite(conf)) {
    await sql`update desk_meta set min_confidence = ${Math.round(Math.max(50, Math.min(90, conf)))}, updated_at = now() where id = 1`;
  }
  if (lead != null && Number.isFinite(lead)) {
    await sql`update desk_meta set post_lead_minutes = ${Math.round(Math.max(30, Math.min(360, lead)))}, updated_at = now() where id = 1`;
  }
}

export async function writeMaxDailyPicks(n: number): Promise<number> {
  const cap = clampDailyPicks(n);
  const sql = await getSql();
  await sql`update desk_meta set max_daily_picks = ${cap}, daily_picks_source = 'operator', updated_at = now() where id = 1`;
  return cap;
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

export async function readDesk(opts: { operator?: boolean } = {}): Promise<DeskState> {
  const operator = opts.operator === true;
  const [games, picks, record, log, meta] = await Promise.all([
    loadGames(),
    loadPicks(),
    loadRecord(),
    operator ? loadLog() : Promise.resolve([]),
    loadMeta(),
  ]);
  const hook = resolveWebhook(await readWebhook());
  const espnErrors = operator ? log.filter((l) => l.kind === "scan" && /error/i.test(l.message)).length : 0;
  const researchModels = operator ? await loadResearchSummary() : null;
  const paperRecord = operator ? await loadPaperRecord() : null;
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
    maxDailyPicks: meta.maxDailyPicks,
    hasWebhook: hook.source !== "none",
    webhookSource: hook.source,
    operator: false,
    soccerDesk: "off",
    pinFromEnv: Boolean(process.env.BOATBOYZ_PIN?.trim()),
    calibration: operator ? buildCalibration(picks.filter((p) => p.ledger !== "paper")) : null,
    health: buildDeskHealth({
      lastTickAt: meta.lastTickAt,
      lastScanAt: meta.lastScanAt,
      hasWebhook: hook.source !== "none",
      dbSource,
      espnErrors,
      oddsRemaining: meta.oddsRemaining,
      oddsUsed: meta.oddsUsed,
      freeBeta: isFreeBetaMode(),
    }),
    researchModels,
    paperMode: isPaperMode(),
    paperRecord,
  };
}

export async function loadTodayOfficial(now = new Date()): Promise<PickRow[]> {
  const sql = await getSql();
  const rows = await sql<PickDb>`
    select * from picks
    where status in ('queued','posting','posted','graded')
      and official_key is not null
      and coalesce(ledger, 'official') = ${activeLedger()}
      and start_at >= now() - interval '2 days'
      and start_at <= now() + interval '2 days'
    order by created_at asc
  `;
  const { isOfficialDay } = await import("@/lib/sports/day");
  return rows.map(pickFromRow).filter((p) => countsTowardDailyCap(p.status) && isOfficialDay(p.startAt, now));
}

export async function loadLatestPicksByGames(gameIds: string[]): Promise<Map<string, PickRow>> {
  const map = new Map<string, PickRow>();
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (!ids.length) return map;
  const sql = await getSql();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await sql.query<PickDb>(
    `select * from picks where game_id in (${placeholders}) order by created_at desc`,
    ids,
  );
  for (const row of rows) {
    const pick = pickFromRow(row);
    if (!map.has(pick.gameId)) map.set(pick.gameId, pick);
  }
  return map;
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
    where game_id = ${gameId} and status in ('queued','posting','posted','skipped','graded')
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
