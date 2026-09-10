import { getSql } from "@/lib/db";
import { impliedFromAmerican, twoWayMarket } from "../sports/odds.ts";
import { evaluateBetOpportunity, expectedValuePct, uncertaintyFromQuality } from "../sports/value.ts";
import { dataQualityFor, marketAgeMs } from "../sports/data-quality.ts";
import type { GameCard, ModelCall, PassReason } from "../sports/types.ts";
import { canQueueOfficial } from "./registry.ts";
import { gameCardToHistorical } from "./live-features.ts";
import { loadShadowArtifacts, shadowPredict, type ShadowCall } from "./shadow.ts";
import { v2HomeProbability } from "./v2-prob.ts";
import { v4Predict } from "./v4.ts";
import type { HistoricalGame } from "./types.ts";

export { canRewritePrediction } from "./prediction-lock.ts";

async function loadHistory(sql: Awaited<ReturnType<typeof getSql>>, league: string, beforeIso: string): Promise<HistoricalGame[]> {
  const out: HistoricalGame[] = [];
  try {
    const hist = await sql<{
      game_id: string;
      espn_id: string;
      sport: string;
      league: string;
      season: number;
      start_at: string;
      home_team: string;
      away_team: string;
      home_abbr: string;
      away_abbr: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
      venue: string | null;
    }>`
      select game_id, espn_id, sport, league, season, start_at::text as start_at,
             home_team, away_team, home_abbr, away_abbr, home_score, away_score, status, venue
      from historical_games
      where league = ${league} and status = 'final' and start_at < ${beforeIso}::timestamptz
    `;
    for (const r of hist) {
      out.push({
        gameId: r.game_id,
        espnId: r.espn_id,
        sport: r.sport,
        league: r.league,
        season: r.season,
        startAt: r.start_at,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        homeAbbr: r.home_abbr,
        awayAbbr: r.away_abbr,
        homeScore: r.home_score,
        awayScore: r.away_score,
        status: r.status,
        venue: r.venue,
        homeWin: r.home_score != null && r.away_score != null ? r.home_score > r.away_score : null,
      });
    }
  } catch {
    /* optional */
  }
  return out;
}

function callFromShadow(pred: ShadowCall, game: GameCard): ModelCall {
  const quality = dataQualityFor(game);
  const uncertainty = uncertaintyFromQuality({
    dataQuality: quality.score,
    missingCount: quality.missing.length,
    marketAgeMs: marketAgeMs(game),
    modelDisagreement: null,
  });
  const homeMl = game.odds.homeMl;
  const awayMl = game.odds.awayMl;
  const mkt = homeMl != null && awayMl != null ? twoWayMarket(homeMl, awayMl) : null;
  const pHome = pred.probability;
  const edgeHome = mkt ? pHome - mkt.noVigA : 0;
  const edgeAway = mkt ? 1 - pHome - mkt.noVigB : 0;
  const pickHome = !mkt || edgeHome >= edgeAway;
  const probability = pickHome ? pHome : 1 - pHome;
  const price = pickHome ? homeMl : awayMl;
  const marketProbability = mkt ? (pickHome ? mkt.noVigA : mkt.noVigB) : pred.marketProbability;
  const decision = evaluateBetOpportunity({
    modelProbability: probability,
    marketProbability,
    price: price ?? null,
    opposingPrice: pickHome ? awayMl : homeMl,
    sportsbook: game.odds.book,
    capturedAt: game.odds.capturedAt,
    dataQuality: quality.score,
    modelUncertainty: uncertainty,
    marketAgeMs: marketAgeMs(game),
    sport: game.league,
    marketType: "moneyline",
    minEdgePct: 3,
    minConfidence: 58,
    confidence: Math.round(Math.max(20, Math.min(80, 70 - uncertainty * 40))),
    openPrice: pickHome ? game.odds.openHomeMl : null,
    consensusProb: game.shadows?.consensus?.noVigHome ?? null,
    consensusDispersion: game.shadows?.consensus?.dispersion ?? null,
  });
  return {
    model: pred.modelVersion,
    probability,
    marketProbability,
    edgePct: decision.edgePct,
    expectedValuePct: price != null ? expectedValuePct(probability, price) : null,
    uncertainty,
    dataQuality: quality.score,
    confidence: decision.confidence,
    action: decision.action,
    passReason: decision.reason === "BET" ? null : (decision.reason as PassReason),
    official: false,
    price: price ?? pred.marketPrice,
    side: pickHome ? "home" : "away",
  };
}

async function persistPrediction(game: GameCard, call: ModelCall, stage: string): Promise<void> {
  if (call.official) return;
  if (canQueueOfficial(call.model)) return;
  const sql = await getSql();
  await sql`
    insert into model_predictions (
      game_id, model_version, stage, captured_at, sport, league,
      market, selection, side, model_probability, market_implied, model_edge, confidence,
      price, line, book, odds_source, features_json,
      expected_value, uncertainty, data_quality, qualified, posted, pass_reason, official, ledger
    ) values (
      ${game.id}, ${call.model}, ${stage}, now(), ${game.sport}, ${game.league},
      'moneyline', ${null}, ${call.side ?? "home"}, ${call.probability}, ${call.marketProbability}, ${call.edgePct}, ${call.confidence},
      ${call.price ?? null}, ${null}, ${game.odds.book}, ${game.odds.source}, ${JSON.stringify({ knownBeforeStart: true, official: false })},
      ${call.expectedValuePct}, ${call.uncertainty}, ${call.dataQuality}, ${call.action === "BET"}, false, ${call.passReason}, false, 'paper'
    )
    on conflict (game_id, model_version, stage) do update set
      captured_at = excluded.captured_at,
      model_probability = excluded.model_probability,
      market_implied = excluded.market_implied,
      model_edge = excluded.model_edge,
      expected_value = excluded.expected_value,
      uncertainty = excluded.uncertainty,
      data_quality = excluded.data_quality,
      qualified = excluded.qualified,
      pass_reason = excluded.pass_reason,
      features_json = excluded.features_json
    where model_predictions.official = false
      and model_predictions.result is null
  `;
}

export async function attachChallengerPredictions(games: GameCard[], now = Date.now()): Promise<GameCard[]> {
  try {
    const arts = await loadShadowArtifacts();
    const sql = await getSql();
    const byLeague = new Map<string, HistoricalGame[]>();
    const out: GameCard[] = [];
    for (const game of games) {
      if (game.status !== "scheduled") {
        out.push(game);
        continue;
      }
      if (new Date(game.startAt).getTime() <= now) {
        out.push(game);
        continue;
      }
      let hist = byLeague.get(game.league);
      if (!hist) {
        hist = await loadHistory(sql, game.league, game.startAt);
        byLeague.set(game.league, hist);
      }
      const merged = hist.concat(
        games.filter((g) => g.league === game.league && g.id !== game.id).map(gameCardToHistorical),
      );
      const art = arts.get(game.league);
      const v3pred = art && !canQueueOfficial(art.modelVersion) ? shadowPredict(game, art, merged, now) : null;
      const v2Home = game.rank
        ? v2HomeProbability({ market: game.rank.market, side: game.rank.side, modelProbability: game.rank.probability })
        : null;
      const v3 = v3pred ? callFromShadow(v3pred, game) : null;
      if (v3) v3.official = false;
      const v4 = v4Predict(game, v2Home, v3pred, now);
      if (v4) v4.official = false;
      if (v3) await persistPrediction(game, v3, "pregame").catch(() => undefined);
      if (v4) await persistPrediction(game, v4, "pregame").catch(() => undefined);
      out.push({ ...game, shadows: { ...game.shadows, v3, v4 } });
    }
    return out;
  } catch {
    return games;
  }
}

export function closingClv(postedPrice: number | null, closingPrice: number | null): number | null {
  if (postedPrice == null || closingPrice == null) return null;
  return impliedFromAmerican(closingPrice) - impliedFromAmerican(postedPrice);
}

export async function loadStoredShadows(games: GameCard[]): Promise<GameCard[]> {
  if (!games.length) return games;
  try {
    const sql = await getSql();
    const rows = await sql<{
      game_id: string;
      model_version: string;
      model_probability: number | null;
      market_implied: number | null;
      model_edge: number | null;
      expected_value: number | null;
      uncertainty: number | null;
      data_quality: number | null;
      pass_reason: string | null;
      qualified: boolean | null;
      official: boolean | null;
      price: number | null;
      side: string | null;
    }>`
      select game_id, model_version, model_probability, market_implied, model_edge,
             expected_value, uncertainty, data_quality, pass_reason, qualified, official, price, side
      from model_predictions
      where stage = 'pregame' and captured_at > now() - interval '4 days'
    `;
    const byGame = new Map<string, { v3?: ModelCall; v4?: ModelCall }>();
    for (const r of rows) {
      if (r.official) continue;
      if (canQueueOfficial(r.model_version)) continue;
      const call: ModelCall = {
        model: r.model_version,
        probability: Number(r.model_probability ?? 0.5),
        marketProbability: r.market_implied == null ? null : Number(r.market_implied),
        edgePct: r.model_edge == null ? null : Number(r.model_edge),
        expectedValuePct: r.expected_value == null ? null : Number(r.expected_value),
        uncertainty: r.uncertainty == null ? null : Number(r.uncertainty),
        dataQuality: r.data_quality == null ? null : Number(r.data_quality),
        confidence: null,
        action: r.qualified ? "BET" : "PASS",
        passReason: (r.pass_reason as ModelCall["passReason"]) ?? null,
        official: false,
        price: r.price,
        side: r.side === "away" ? "away" : "home",
      };
      const cur = byGame.get(r.game_id) ?? {};
      if (r.model_version.startsWith("v3-")) cur.v3 = call;
      if (r.model_version.startsWith("v4-")) cur.v4 = call;
      byGame.set(r.game_id, cur);
    }
    return games.map((g) => {
      const extra = byGame.get(g.id);
      if (!extra) return g;
      return { ...g, shadows: { ...g.shadows, ...extra } };
    });
  } catch {
    return games;
  }
}
