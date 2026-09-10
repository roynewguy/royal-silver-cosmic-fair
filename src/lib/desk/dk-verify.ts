import { safeOddsError } from "../sports/odds-error.ts";
import { recordEvent } from "./telemetry";
import { getSql } from "@/lib/db";
import { isFreshOfficialDkCache, marketParam, officialLineDecision } from "@/lib/sports/free-beta.ts";
import { LEAGUE_BY_ID } from "@/lib/sports/leagues.ts";
import {
  fetchDraftKingsMarket,
  isDraftKingsLine,
  overlayDraftKings,
  matchSingleOddsEvent,
  currentOddsTelemetry,
  type OddsUsage,
} from "@/lib/sports/odds-api.ts";
import {
  OFFICIAL_BOOKS,
  emptyTelemetry,
  foldUsage,
  formatOddsSummary,
  parseOddsTelemetry,
  quotaBlocksOfficialLock,
  quotaLevel,
  type OddsTelemetry,
} from "@/lib/sports/odds-poll.ts";
import { applyDraftKingsSnapshot } from "@/lib/sports/dk-open.ts";
import type { GameCard, Market, OddsSnapshot } from "@/lib/sports/types";
import { addLog } from "./store";

function jsonParse<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object") return raw as T;
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadOddsTelemetry(): Promise<OddsTelemetry> {
  const sql = await getSql();
  const rows = await sql<{
    odds_remaining: unknown;
    odds_used: unknown;
    odds_last: unknown;
    odds_telemetry_json: string | null;
  }>`select odds_remaining, odds_used, odds_last, odds_telemetry_json from desk_meta where id = 1`;
  const row = rows[0];
  const parsed = parseOddsTelemetry(row?.odds_telemetry_json);
  const remaining =
    row?.odds_remaining == null || row.odds_remaining === "" ? parsed.remaining : Number(row.odds_remaining);
  const used = row?.odds_used == null || row.odds_used === "" ? parsed.used : Number(row.odds_used);
  const last = row?.odds_last == null || row.odds_last === "" ? parsed.last : Number(row.odds_last);
  return {
    ...parsed,
    remaining: Number.isFinite(remaining as number) ? (remaining as number) : parsed.remaining,
    used: Number.isFinite(used as number) ? (used as number) : parsed.used,
    last: Number.isFinite(last as number) ? (last as number) : parsed.last,
  };
}

export async function recordOddsUsage(usage: OddsUsage, sportKey?: string): Promise<void> {
  if (usage.remaining == null && usage.used == null && usage.last == null) return;
  const sql = await getSql();
  const live = currentOddsTelemetry();
  let next: OddsTelemetry;
  if (live) {
    next = {
      ...live,
      remaining: usage.remaining ?? live.remaining,
      used: usage.used ?? live.used,
      last: usage.last ?? live.last,
      quotaLevel: quotaLevel(usage.remaining ?? live.remaining),
      updatedAt: new Date().toISOString(),
    };
  } else {
    let prev: OddsTelemetry = emptyTelemetry();
    try {
      prev = await loadOddsTelemetry();
    } catch {
      prev = emptyTelemetry();
    }
    next = foldUsage(prev, {
      remaining: usage.remaining,
      used: usage.used,
      last: usage.last,
      sportKey,
    });
  }
  await sql`
    update desk_meta set
      odds_remaining = ${usage.remaining},
      odds_used = ${usage.used},
      odds_last = ${usage.last},
      odds_updated_at = now(),
      odds_telemetry_json = ${JSON.stringify(next)},
      updated_at = now()
    where id = 1
  `;
}

export async function persistOddsTickTelemetry(): Promise<OddsTelemetry> {
  const live = currentOddsTelemetry();
  const sql = await getSql();
  let prev = emptyTelemetry();
  try {
    prev = await loadOddsTelemetry();
  } catch {
    prev = emptyTelemetry();
  }
  const next: OddsTelemetry = live
    ? {
        ...live,
        dayKey: live.dayKey,
        dayUsed: prev.dayKey === live.dayKey ? Math.max(prev.dayUsed, live.dayUsed) : live.dayUsed,
      }
    : prev;
  await sql`
    update desk_meta set
      odds_telemetry_json = ${JSON.stringify(next)},
      updated_at = now()
    where id = 1
  `;
  return next;
}

export function operatorOddsSummary(t: OddsTelemetry): string {
  return formatOddsSummary(t);
}

export async function loadOddsRemaining(): Promise<number | null> {
  const sql = await getSql();
  const rows = await sql<{ odds_remaining: unknown }>`select odds_remaining from desk_meta where id = 1`;
  const n = rows[0]?.odds_remaining;
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

export async function readDkCache(gameId: string, market: Market): Promise<{
  odds: OddsSnapshot;
  checks: number;
  ageMs: number;
} | null> {
  const sql = await getSql();
  const rows = await sql<{ odds_json: string; checks: unknown; verified_at: unknown }>`
    select odds_json, checks, verified_at from dk_cache where game_id = ${gameId} and market = ${market}
  `;
  const row = rows[0];
  if (!row) return null;
  const odds = jsonParse<OddsSnapshot>(row.odds_json, null as unknown as OddsSnapshot);
  if (!odds) return null;
  const at = new Date(String(row.verified_at)).getTime();
  return { odds, checks: Number(row.checks) || 0, ageMs: Number.isFinite(at) ? Date.now() - at : Infinity };
}

async function saveCache(gameId: string, market: Market, odds: OddsSnapshot, checks: number): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into dk_cache (game_id, market, odds_json, checks, verified_at)
    values (${gameId}, ${market}, ${JSON.stringify(odds)}, ${checks}, now())
    on conflict (game_id, market) do update set
      odds_json = excluded.odds_json,
      checks = excluded.checks,
      verified_at = now()
  `;
}

export async function confirmDraftKings(
  game: GameCard,
  market: Market,
): Promise<{ ok: true; game: GameCard } | { ok: false; error: string }> {
  const cached = await readDkCache(game.id, market);
  const league = LEAGUE_BY_ID[game.league];
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!league?.oddsApiKey || !apiKey) {
    return { ok: false, error: !apiKey ? "ODDS_API_KEY is missing on this deployment" : "This league has no DraftKings provider mapping" };
  }

  const remaining = await loadOddsRemaining();
  const action = officialLineDecision({
    remaining,
    cacheAgeMs: cached?.ageMs ?? null,
    cachedIsDk: Boolean(cached && isDraftKingsLine(cached.odds)),
    checksAlready: cached?.checks ?? 0,
  });

  if (action === "pass") {
    if (quotaBlocksOfficialLock({
      remaining,
      cacheAgeMs: cached?.ageMs ?? null,
      cachedIsDk: Boolean(cached && isDraftKingsLine(cached.odds)),
    })) {
      return { ok: false, error: remaining != null && remaining <= 0 ? "Odds API credits exhausted." : "PASS_DK_UNAVAILABLE" };
    }
    return { ok: false, error: "PASS_DK_UNAVAILABLE" };
  }

  if (action === "use-cache" && cached) {
    const capturedAge = cached.odds.capturedAt ? Date.now() - Date.parse(cached.odds.capturedAt) : null;
    if (!isDraftKingsLine(cached.odds) || !isFreshOfficialDkCache(cached.ageMs) || !isFreshOfficialDkCache(capturedAge)) {
      return { ok: false, error: "PASS_DK_STALE" };
    }
    const next = { ...game, odds: applyDraftKingsSnapshot(game.odds, cached.odds) };
    return { ok: true, game: next };
  }

  try {
    const { rows, usage } = await fetchDraftKingsMarket(league.oddsApiKey, apiKey, marketParam(market), OFFICIAL_BOOKS);
    await recordOddsUsage(usage, league.oddsApiKey);
    await recordEvent("odds_api_success");
    const match = matchSingleOddsEvent(
      { home: game.home.name, away: game.away.name, startAt: game.startAt },
      rows.filter(e => e.sport_key === league.oddsApiKey),
    );
    if (!match.ok) return { ok: false, error: match.reason };
    const hit = rows.filter(e => e.sport_key === league.oddsApiKey)[match.index];
    if (hit) {
      const next = overlayDraftKings(game, hit);
      if (next && isDraftKingsLine(next.odds) && next.odds.eventId && isFreshOfficialDkCache(next.odds.capturedAt ? Date.now() - Date.parse(next.odds.capturedAt) : null)) {
        await recordEvent("dk_success");
        await saveCache(game.id, market, next.odds, (cached?.checks ?? 0) + 1);
        return { ok: true, game: next };
      }
    }
  } catch (error) {
    const detail = safeOddsError(error);
    await recordEvent("dk_failure", detail);
    await addLog("scan", detail, game.sport);
    return { ok: false, error: detail };
  }

  return { ok: false, error: "PASS_DK_UNAVAILABLE" };
}

export async function pruneFreeBetaCaches(force = false): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ last_prune_at: unknown }>`select last_prune_at from desk_meta where id = 1`;
  const last = rows[0]?.last_prune_at ? new Date(String(rows[0].last_prune_at)).getTime() : 0;
  if (!force && Number.isFinite(last) && Date.now() - last < 6 * 3600_000) return;
  await sql`delete from dk_cache where verified_at < now() - interval '2 days'`;
  await sql`delete from research_cache where updated_at < now() - interval '2 days'`;
  await sql`delete from desk_log where created_at < now() - interval '30 days'`;
  await sql`delete from games where start_at < now() - interval '10 days' and status in ('final','cancelled','postponed')`;
  await sql`update desk_meta set last_prune_at = now(), updated_at = now() where id = 1`;
}
