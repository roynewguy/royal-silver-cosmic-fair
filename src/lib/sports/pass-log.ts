import { getSql } from "@/lib/db";
import { officialDecision } from "./policy.ts";
import type { GameCard } from "./types.ts";

export async function recordPassDecisions(games: GameCard[], minEdge: number, minConf: number): Promise<void> {
  try {
    const sql = await getSql();
    for (const game of games) {
      if (game.status !== "scheduled") continue;
      const decision = officialDecision(game, minEdge, minConf);
      if (decision.action === "BET") continue;
      await sql`
        insert into pass_log (
          game_id, sport, model_version, pass_reason, detail,
          edge_pct, expected_value_pct, data_quality, uncertainty, captured_at
        ) values (
          ${game.id}, ${game.league}, ${game.rank?.model ?? null}, ${decision.reason}, ${decision.detail},
          ${decision.edgePct}, ${decision.expectedValuePct}, ${decision.dataQuality}, ${decision.uncertainty}, now()
        )
      `;
    }
  } catch {
    /* research only */
  }
}

export async function countSkippedToday(): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from pass_log
      where captured_at >= date_trunc('day', timezone('America/Los_Angeles', now())) at time zone 'America/Los_Angeles'
    `;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}
