import { getSql } from "@/lib/db";
import { applyDraftKingsSnapshot } from "@/lib/sports/dk-open.ts";
import { canSpendOddsCredit, isFreeBetaMode, marketParam } from "@/lib/sports/free-beta.ts";
import { LEAGUE_BY_ID } from "@/lib/sports/leagues.ts";
import {
  fetchDraftKingsMarket,
  isDraftKingsLine,
  overlayDraftKings,
  pairOddsEvents,
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

export async function confirmDraftKings(
  game: GameCard,
  market: Market,
): Promise<{ ok: true; game: GameCard } | { ok: false; error: string }> {
  const cached = await loadCache(game.id, market);
  const remaining = await loadOddsRemaining();
  const spend = canSpendOddsCredit({
    remaining,
    checksAlready: cached?.checks ?? 0,
    cacheAgeMs: cached?.ageMs ?? null,
  });

  if (!spend.fetch) {
    if (cached && isDraftKingsLine(cached.odds)) {
      return { ok: true, game: { ...game, odds: applyDraftKingsSnapshot(game.odds, cached.odds) } };
    }
    return { ok: false, error: `PASS: DraftKings line unavailable. ${spend.reason}` };
  }

  const league = LEAGUE_BY_ID[game.league];
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!league?.oddsApiKey || !apiKey) {
    if (cached && isDraftKingsLine(cached.odds)) {
      return { ok: true, game: { ...game, odds: applyDraftKingsSnapshot(game.odds, cached.odds) } };
    }
    return { ok: false, error: "PASS: DraftKings line unavailable." };
  }

  try {
    const { rows, usage } = await fetchDraftKingsMarket(league.oddsApiKey, apiKey, marketParam(market));
    await recordOddsUsage(usage);
    const pairs = pairOddsEvents(
      [{ id: game.id, home: game.home.name, away: game.away.name, startAt: game.startAt }],
      rows,
    );
    const idx = pairs.get(game.id);
    const hit = idx != null ? rows[idx] : undefined;
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

  if (cached && isDraftKingsLine(cached.odds)) {
    return { ok: true, game: { ...game, odds: applyDraftKingsSnapshot(game.odds, cached.odds) } };
  }
  return { ok: false, error: "PASS: DraftKings line unavailable." };
}

export async function pruneFreeBetaCaches(): Promise<void> {
  if (!isFreeBetaMode()) return;
  const sql = await getSql();
  await sql`delete from dk_cache where verified_at < now() - interval '2 days'`;
  await sql`delete from research_cache where updated_at < now() - interval '2 days'`;
  await sql`delete from desk_log where id < (select coalesce(max(id), 0) - 80 from desk_log)`;
  await sql`delete from games where start_at < now() - interval '10 days'`;
}
