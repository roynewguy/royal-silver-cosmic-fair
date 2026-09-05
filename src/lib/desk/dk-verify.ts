import { getSql } from "@/lib/db";
import { applyDraftKingsSnapshot } from "@/lib/sports/dk-open.ts";
import { isFreshOfficialDkCache, marketParam, officialDkAction } from "@/lib/sports/free-beta.ts";
import { LEAGUE_BY_ID } from "@/lib/sports/leagues.ts";
import {
  fetchDraftKingsMarket,
  isDraftKingsLine,
  overlayDraftKings,
  matchSingleOddsEvent,
  type OddsUsage,
} from "@/lib/sports/odds-api.ts";
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

export async function recordOddsUsage(usage: OddsUsage): Promise<void> {
  if (usage.remaining == null && usage.used == null) return;
  const sql = await getSql();
  await sql`
    update desk_meta set
      odds_remaining = ${usage.remaining},
      odds_used = ${usage.used},
      odds_last = ${usage.last},
      odds_updated_at = now(),
      updated_at = now()
    where id = 1
  `;
}

export async function loadOddsRemaining(): Promise<number | null> {
  const sql = await getSql();
  const rows = await sql<{ odds_remaining: unknown }>`select odds_remaining from desk_meta where id = 1`;
  const n = rows[0]?.odds_remaining;
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

async function loadCache(gameId: string, market: Market): Promise<{
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
  return { odds, checks: Number(row.checks) || 0, ageMs: Number.isFinite(at) ? Date.now() - at : 0 };
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

function cacheIsOfficiallyValid(cached: { odds: OddsSnapshot; ageMs: number } | null): boolean {
  return Boolean(cached && isDraftKingsLine(cached.odds) && isFreshOfficialDkCache(cached.ageMs));
}

export async function confirmDraftKings(
  game: GameCard,
  market: Market,
): Promise<{ ok: true; game: GameCard } | { ok: false; error: string }> {
  const cached = await loadCache(game.id, market);
  const remaining = await loadOddsRemaining();
  const fresh = cacheIsOfficiallyValid(cached);
  const action = officialDkAction({
    remaining,
    cacheAgeMs: cached?.ageMs ?? null,
    cachedIsDk: Boolean(cached && isDraftKingsLine(cached.odds)),
    checksAlready: cached?.checks ?? 0,
  });

  if (action === "use-cache") {
    if (!fresh || !cached) return { ok: false, error: "PASS_DK_STALE" };
    return { ok: true, game: { ...game, odds: applyDraftKingsSnapshot(game.odds, cached.odds) } };
  }
  if (action === "pass") {
    return { ok: false, error: "PASS_DK_STALE" };
  }

  const league = LEAGUE_BY_ID[game.league];
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!league?.oddsApiKey || !apiKey) {
    return { ok: false, error: "PASS_DK_UNAVAILABLE" };
  }

  try {
    const { rows, usage } = await fetchDraftKingsMarket(league.oddsApiKey, apiKey, marketParam(market));
    await recordOddsUsage(usage);
    const match = matchSingleOddsEvent(
      { home: game.home.name, away: game.away.name, startAt: game.startAt },
      rows,
    );
    if (!match.ok) return { ok: false, error: match.reason };
    const hit = rows[match.index];
    if (hit) {
      const next = overlayDraftKings(game, hit);
      if (next && isDraftKingsLine(next.odds)) {
        await saveCache(game.id, market, next.odds, (cached?.checks ?? 0) + 1);
        return { ok: true, game: next };
      }
    }
  } catch (err) {
    await addLog("scan", `Odds API ${err instanceof Error ? err.message : "failed"}`, game.sport);
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
  await sql`delete from desk_log where id < (select coalesce(max(id), 0) - 80 from desk_log)`;
  await sql`delete from games where start_at < now() - interval '10 days' and status in ('final','cancelled','postponed')`;
  await sql`update desk_meta set last_prune_at = now(), updated_at = now() where id = 1`;
}
