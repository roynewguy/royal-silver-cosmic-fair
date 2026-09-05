import { getSql } from "@/lib/db";
import { impliedFromAmerican } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";
import { loadShadowArtifacts, shadowPredict } from "./shadow.ts";
import { canQueueOfficial } from "./registry.ts";

export async function recordMlbShadow(games: GameCard[]): Promise<void> {
  await recordShadowPredictions(games);
}

export async function recordShadowPredictions(games: GameCard[]): Promise<void> {
  try {
    const arts = await loadShadowArtifacts();
    if (!arts.size) return;
    const sql = await getSql();
    for (const game of games) {
      if (game.status !== "scheduled") continue;
      const art = arts.get(game.league);
      if (!art || canQueueOfficial(art.modelVersion)) continue;
      const pred = shadowPredict(game, art);
      if (!pred) continue;
      const market = game.odds.homeMl != null ? impliedFromAmerican(game.odds.homeMl) : null;
      const edge = market != null ? pred.probability - market : null;
      await sql`
        insert into research_predictions (
          game_id, model_version, generated_at, market, side, probability, market_probability, estimated_edge, official
        ) values (
          ${game.id}, ${pred.modelVersion}, now(), 'moneyline', 'home', ${pred.probability}, ${market}, ${edge}, false
        )
        on conflict (game_id, model_version) do update set
          generated_at = now(),
          probability = excluded.probability,
          market_probability = excluded.market_probability,
          estimated_edge = excluded.estimated_edge,
          official = false
      `;
    }
  } catch {
    /* shadow must never affect production */
  }
}
