import { getSql } from "@/lib/db";
import { impliedFromAmerican } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";
import { inCanonicalWindow } from "./integrity.ts";
import { gameCardToHistorical } from "./live-features.ts";
import { canQueueOfficial } from "./registry.ts";
import { loadShadowArtifacts, shadowPredict } from "./shadow.ts";
import type { HistoricalGame } from "./types.ts";

export async function recordMlbShadow(games: GameCard[]): Promise<void> {
  await recordShadowPredictions(games);
}

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
    /* table may not exist yet */
  }
  try {
    const live = await sql<{
      id: string;
      espn_id: string;
      sport: string;
      league: string;
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
      select id, espn_id, sport, league, start_at::text as start_at,
             home_team, away_team, home_abbr, away_abbr, home_score, away_score, status, venue
      from game_history
      where league = ${league} and status = 'final' and start_at < ${beforeIso}::timestamptz
    `;
    for (const r of live) {
      out.push({
        gameId: r.id,
        espnId: r.espn_id,
        sport: r.sport,
        league: r.league,
        season: new Date(r.start_at).getUTCFullYear(),
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

export async function recordShadowPredictions(games: GameCard[]): Promise<void> {
  try {
    const arts = await loadShadowArtifacts();
    if (!arts.size) return;
    const sql = await getSql();
    const now = Date.now();
    const byLeague = new Map<string, HistoricalGame[]>();
    for (const game of games) {
      if (game.status !== "scheduled") continue;
      const art = arts.get(game.league);
      if (!art || canQueueOfficial(art.modelVersion)) continue;
      let hist = byLeague.get(game.league);
      if (!hist) {
        hist = await loadHistory(sql, game.league, game.startAt);
        byLeague.set(game.league, hist);
      }
      const merged = hist.concat(games.filter((g) => g.league === game.league && g.id !== game.id).map(gameCardToHistorical));
      const pred = shadowPredict(game, art, merged, now);
      if (!pred) continue;

      const recent = await sql<{ id: number; probability: number; generated_at: string }>`
        select id, probability, generated_at::text as generated_at from research_shadow
        where game_id = ${game.id} and model_version = ${pred.modelVersion} and kind = 'tick'
        order by generated_at desc limit 1
      `;
      const last = recent[0];
      const lastAge = last ? now - new Date(last.generated_at).getTime() : Infinity;
      const moved = last ? Math.abs(last.probability - pred.probability) >= 0.005 : true;
      if (!last || lastAge > 25 * 60_000 || moved) {
        await sql`
          insert into research_shadow (
            game_id, model_version, kind, generated_at, market, side,
            probability, market_probability, estimated_edge, market_price, features_json, official
          ) values (
            ${game.id}, ${pred.modelVersion}, 'tick', now(), 'moneyline', 'home',
            ${pred.probability}, ${pred.marketProbability}, ${pred.estimatedEdge}, ${pred.marketPrice}, ${pred.featuresJson}, false
          )
        `;
      }

      if (inCanonicalWindow(game.startAt, now)) {
        await sql`
          insert into research_shadow (
            game_id, model_version, kind, generated_at, market, side,
            probability, market_probability, estimated_edge, market_price, features_json, official
          )
          select
            ${game.id}, ${pred.modelVersion}, 'canonical', now(), 'moneyline', 'home',
            ${pred.probability}, ${pred.marketProbability}, ${pred.estimatedEdge}, ${pred.marketPrice}, ${pred.featuresJson}, false
          where not exists (
            select 1 from research_shadow s
            where s.game_id = ${game.id} and s.model_version = ${pred.modelVersion} and s.kind = 'canonical'
          )
        `;
      }
    }
  } catch {
    /* shadow must never affect production */
  }
}

export async function gradeShadowPredictions(games: GameCard[]): Promise<void> {
  try {
    const sql = await getSql();
    for (const game of games) {
      if (game.status !== "final" || game.home.score == null || game.away.score == null) continue;
      if (game.home.score === game.away.score) continue;
      const y = game.home.score > game.away.score ? 1 : 0;
      const closing = game.odds.homeMl;
      const closeImp = closing != null ? impliedFromAmerican(closing) : null;
      const rows = await sql<{ id: number; probability: number; market_price: number | null }>`
        select id, probability, market_price from research_shadow
        where game_id = ${game.id} and kind = 'canonical' and result is null
      `;
      for (const row of rows) {
        const brier = (row.probability - y) ** 2;
        const clv =
          closeImp != null && row.market_price != null
            ? closeImp - impliedFromAmerican(row.market_price)
            : null;
        await sql`
          update research_shadow set
            result = ${y === 1 ? "home" : "away"},
            closing_price = ${closing},
            closing_implied = ${closeImp},
            clv = ${clv},
            brier = ${brier}
          where id = ${row.id} and kind = 'canonical' and result is null
        `;
      }
    }
  } catch {
    /* unofficial */
  }
}
