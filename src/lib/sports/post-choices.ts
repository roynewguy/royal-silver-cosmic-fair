import { lineFor, selectionLabel } from "./odds.ts";
import { canPostGame, feedPriceForPost, liveFeedUsable } from "./manual-post.ts";
import type { GameCard, Market, Side } from "./types.ts";

export type PostChoice = {
  market: Market;
  side: Side;
  line: number | null;
  price: number;
  label: string;
};

const MARKETS: Array<{ market: Market; sides: Side[] }> = [
  { market: "moneyline", sides: ["away", "home"] },
  { market: "spread", sides: ["away", "home"] },
  { market: "total", sides: ["over", "under"] },
];

/** Only real feed prices. Never invent -110. */
export function operatorPostChoices(game: GameCard, now = Date.now()): PostChoice[] {
  if (!canPostGame(game)) return [];
  const choices: PostChoice[] = [];
  for (const { market, sides } of MARKETS) {
    for (const side of sides) {
      const price = feedPriceForPost(game, market, side, now);
      if (price == null) continue;
      const line = liveFeedUsable(game, now) ? lineFor(game.odds, market, side) : null;
      if (market !== "moneyline" && (line == null || !Number.isFinite(line))) continue;
      choices.push({
        market,
        side,
        line,
        price,
        label: selectionLabel({
          market,
          side,
          homeAbbr: game.home.abbr,
          awayAbbr: game.away.abbr,
          line,
          price,
        }),
      });
    }
  }
  return choices;
}

export function canOperatorPost(game: GameCard): boolean {
  return canPostGame(game);
}
