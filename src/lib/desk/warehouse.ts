import { getSql } from "@/lib/db";
import { impliedFromAmerican } from "@/lib/sports/odds";
import { marketImplied, packPregameFeatures } from "@/lib/sports/warehouse";
import type { GameCard, RankPick } from "@/lib/sports/types";

async function swallow(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    /* warehouse must never fail a live tick */
  }
}

export async function recordPregameSnapshots(games: GameCard[]): Promise<void> {
  await swallow(async () => {
    const sql = await getSql();
    const now = Date.now();
    for (const game of games) {
      const feats = packPregameFeatures(game, now);
      if (!feats) continue;
      await sql`
        insert into game_history (
          id, espn_id, sport, league, start_at, status,
          home_team, away_team, home_abbr, away_abbr,
          pregame_json, pregame_locked, updated_at
        ) values (
          ${game.id}, ${game.espnId}, ${game.sport}, ${game.league}, ${game.startAt}, ${game.status},
          ${game.home.name}, ${game.away.name}, ${game.home.abbr}, ${game.away.abbr},
          ${JSON.stringify(feats)}, false, now()
        )
        on conflict (id) do update set
          status = excluded.status,
          pregame_json = case when game_history.pregame_locked then game_history.pregame_json else excluded.pregame_json end,
          updated_at = now()
        where game_history.pregame_locked = false
      `;
      const rank = game.rank;
      if (!rank) continue;
      await sql`
        insert into model_predictions (
          game_id, model_version, stage, captured_at, sport, league,
          market, selection, side, model_probability, market_implied, model_edge, confidence,
          price, line, book, odds_source, features_json
        ) values (
          ${game.id}, ${rank.model}, 'pregame', now(), ${game.sport}, ${game.league},
          ${rank.market}, ${rank.selection}, ${rank.side}, ${rank.probability}, ${marketImplied(rank)}, ${rank.edgePct}, ${Math.round(rank.confidence)},
          ${rank.price}, ${rank.line}, ${game.odds.book}, ${game.odds.source}, ${JSON.stringify(feats)}
        )
        on conflict (game_id, model_version, stage) do update set
          captured_at = excluded.captured_at,
          market = excluded.market,
          selection = excluded.selection,
          side = excluded.side,
          model_probability = excluded.model_probability,
          market_implied = excluded.market_implied,
          model_edge = excluded.model_edge,
          confidence = excluded.confidence,
          price = excluded.price,
          line = excluded.line,
          book = excluded.book,
          odds_source = excluded.odds_source,
          features_json = excluded.features_json
      `;
    }
  });
}

export async function recordPostedPrediction(game: GameCard, rank: RankPick): Promise<void> {
  await swallow(async () => {
    const sql = await getSql();
    const feats = packPregameFeatures(game);
    await sql`
      insert into model_predictions (
        game_id, model_version, stage, captured_at, sport, league,
        market, selection, side, model_probability, market_implied, model_edge, confidence,
        price, line, book, odds_source, features_json
      ) values (
        ${game.id}, ${rank.model}, 'posted', now(), ${game.sport}, ${game.league},
        ${rank.market}, ${rank.selection}, ${rank.side}, ${rank.probability}, ${marketImplied(rank)}, ${rank.edgePct}, ${Math.round(rank.confidence)},
        ${rank.price}, ${rank.line}, ${game.odds.book}, ${game.odds.source}, ${JSON.stringify(feats ?? {})}
      )
      on conflict (game_id, model_version, stage) do nothing
    `;
    await sql`update game_history set pregame_locked = true, updated_at = now() where id = ${game.id}`;
  });
}

export async function recordClosingResult(input: {
  game: GameCard;
  modelVersion: string | null;
  result: string;
  closingPrice: number | null;
  postedPrice: number | null;
}): Promise<void> {
  await swallow(async () => {
    const sql = await getSql();
    const clv =
      input.closingPrice != null && input.postedPrice != null
        ? impliedFromAmerican(input.closingPrice) - impliedFromAmerican(input.postedPrice)
        : null;
    await sql`
      update game_history set
        status = ${input.game.status},
        home_score = ${input.game.home.score},
        away_score = ${input.game.away.score},
        result = ${input.result},
        pregame_locked = true,
        updated_at = now()
      where id = ${input.game.id}
    `;
    if (!input.modelVersion) return;
    await sql`
      insert into model_predictions (
        game_id, model_version, stage, captured_at, sport, league,
        result, closing_price, clv, features_json
      ) values (
        ${input.game.id}, ${input.modelVersion}, 'closing', now(), ${input.game.sport}, ${input.game.league},
        ${input.result}, ${input.closingPrice}, ${clv}, '{}'
      )
      on conflict (game_id, model_version, stage) do update set
        result = excluded.result,
        closing_price = excluded.closing_price,
        clv = excluded.clv
    `;
    await sql`
      update model_predictions set
        result = ${input.result},
        closing_price = ${input.closingPrice},
        clv = ${clv}
      where game_id = ${input.game.id} and model_version = ${input.modelVersion} and stage = 'posted'
    `;
  });
}
