import { isShadowSoak } from "./production-policy.ts";
import { expectedValuePct, oppositeSide } from "../sports/value.ts";
import { priceFor } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";

export { isShadowSoak } from "./production-policy.ts";

export type SoakTicketDraft = {
  gameId: string;
  league: string;
  market: string;
  selection: string;
  side: string;
  lockedLine: number | null;
  postedPrice: number;
  sportsbook: string;
  opposingPrice: number | null;
  modelVersion: string;
  modelProbability: number;
  noVigProbability: number | null;
  edgePct: number;
  expectedValuePct: number | null;
  dataQuality: number | null;
  confidence: number;
  wouldHavePosted: true;
};

export function soakDraftFromGame(game: GameCard): SoakTicketDraft | null {
  const rank = game.rank;
  if (!rank) return null;
  return {
    gameId: game.id,
    league: game.league,
    market: rank.market,
    selection: rank.selection,
    side: rank.side,
    lockedLine: rank.line,
    postedPrice: rank.price,
    sportsbook: game.odds.book,
    opposingPrice: priceFor(game.odds, rank.market, oppositeSide(rank.side)),
    modelVersion: rank.model,
    modelProbability: rank.probability,
    noVigProbability: rank.noVigImplied ?? null,
    edgePct: rank.edgePct,
    expectedValuePct: expectedValuePct(rank.probability, rank.price),
    dataQuality: rank.dataQuality ?? null,
    confidence: rank.confidence,
    wouldHavePosted: true,
  };
}

export async function recordSoakWouldHavePosted(games: GameCard[]): Promise<number> {
  if (!isShadowSoak()) return 0;
  const drafts = games.map(soakDraftFromGame).filter((d): d is SoakTicketDraft => d != null);
  if (!drafts.length) return 0;
  try {
    const { getSql } = await import("../db.ts");
    const sql = await getSql();
    let n = 0;
    for (const d of drafts) {
      await sql`
        insert into soak_tickets (
          game_id, league, market, selection, side, locked_line, posted_price, sportsbook,
          opposing_price, model_version, model_probability, no_vig_probability, edge_pct,
          expected_value_pct, data_quality, confidence, would_have_posted
        ) values (
          ${d.gameId}, ${d.league}, ${d.market}, ${d.selection}, ${d.side}, ${d.lockedLine}, ${d.postedPrice}, ${d.sportsbook},
          ${d.opposingPrice}, ${d.modelVersion}, ${d.modelProbability}, ${d.noVigProbability}, ${d.edgePct},
          ${d.expectedValuePct}, ${d.dataQuality}, ${d.confidence}, true
        )
      `;
      n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
