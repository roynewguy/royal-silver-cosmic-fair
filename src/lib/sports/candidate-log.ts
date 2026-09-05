import { getSql } from "@/lib/db";
import { shouldAppendSnapshot } from "./data-quality.ts";
import type { GameCard } from "./types.ts";

export async function recordMarketTape(games: GameCard[]): Promise<void> {
  try {
    const sql = await getSql();
    for (const game of games) {
      const last = await sql<{ home_ml: number | null; away_ml: number | null }>`
        select home_ml, away_ml from market_tape where game_id = ${game.id} order by captured_at desc limit 1
      `;
      const prev = last[0];
      if (prev && prev.home_ml === game.odds.homeMl && prev.away_ml === game.odds.awayMl) continue;
      await sql`
        insert into market_tape (game_id, captured_at, source, book, home_ml, away_ml, home_spread, total)
        values (
          ${game.id}, now(), ${game.odds.source}, ${game.odds.book},
          ${game.odds.homeMl}, ${game.odds.awayMl}, ${game.odds.homeSpread}, ${game.odds.total}
        )
      `;
    }
  } catch {
    /* research only */
  }
}

export async function firstSeenPrice(gameId: string): Promise<number | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ home_ml: number | null; away_ml: number | null }>`
      select home_ml, away_ml from market_tape where game_id = ${gameId} order by captured_at asc limit 1
    `;
    return rows[0]?.home_ml ?? rows[0]?.away_ml ?? null;
  } catch {
    return null;
  }
}

export async function recordV2Candidates(games: GameCard[]): Promise<void> {
  try {
    await recordMarketTape(games);
    const sql = await getSql();
    const now = Date.now();
    for (const game of games) {
      const rank = game.rank;
      if (!rank || game.status !== "scheduled") continue;
      const recent = await sql<{ id: number; probability: number; generated_at: string }>`
        select id, probability, generated_at::text as generated_at
        from research_v2_snapshots
        where game_id = ${game.id} and model_version = ${rank.model}
        order by generated_at desc limit 1
      `;
      const last = recent[0];
      const lastAt = last ? new Date(last.generated_at).getTime() : null;
      if (!shouldAppendSnapshot(lastAt, last?.probability ?? null, now, rank.probability)) continue;
      const first = await firstSeenPrice(game.id);
      const features = JSON.stringify({
        knownBeforeStart: true,
        missing: rank.missingInputs ?? [],
        dataQuality: rank.dataQuality ?? null,
        vigAdjusted: rank.vigAdjusted === true,
        homeMl: game.odds.homeMl,
        awayMl: game.odds.awayMl,
        capturedAt: game.odds.capturedAt,
        book: game.odds.book,
        source: game.odds.source,
      });
      await sql`
        insert into research_v2_snapshots (
          game_id, model_version, generated_at, market, selection, side,
          probability, raw_implied, novig_implied, market_hold, edge_pct, confidence,
          data_quality, missing_json, pass_reason, price, line, features_json, first_price, official
        ) values (
          ${game.id}, ${rank.model}, now(), ${rank.market}, ${rank.selection}, ${rank.side},
          ${rank.probability}, ${rank.rawImplied ?? null}, ${rank.noVigImplied ?? null}, ${rank.marketHold ?? null},
          ${rank.edgePct}, ${rank.confidence}, ${rank.dataQuality ?? null},
          ${JSON.stringify(rank.missingInputs ?? [])}, ${rank.passReason ?? null},
          ${rank.price}, ${rank.line}, ${features}, ${first ?? rank.price}, false
        )
      `;
    }
  } catch {
    /* never affects official ledger */
  }
}
