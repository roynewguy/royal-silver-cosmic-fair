import { lineFor, priceFor, selectionLabel } from "./odds.ts";
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

/** Every slate game can be posted on any standard market, even with no feed line. */
export function operatorPostChoices(game: GameCard): PostChoice[] {
  const choices: PostChoice[] = [];
  for (const { market, sides } of MARKETS) {
    for (const side of sides) {
      const price = priceFor(game.odds, market, side) ?? -110;
      const line = lineFor(game.odds, market, side);
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
  return game.status !== "cancelled" && game.status !== "postponed";
}
