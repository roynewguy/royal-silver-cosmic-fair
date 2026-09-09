import { impliedFromAmerican } from "./odds.ts";
import type { MarketConsensus, BookQuote } from "./types.ts";
import type { GameCard } from "./types.ts";

export const CONSENSUS_BOOKS = ["draftkings", "fanduel", "betmgm", "williamhill_us"] as const;

const BOOK_LABEL: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function bookKey(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/draft\s*kings|draftkings/.test(s)) return "draftkings";
  if (/fanduel|fan duel/.test(s)) return "fanduel";
  if (/betmgm|bet mgm|mgm/.test(s)) return "betmgm";
  if (/caesars|williamhill|william hill/.test(s)) return "williamhill_us";
  return null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

type LooseEvent = {
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number }> }>;
  }>;
};

export function quotesFromEvent(event: LooseEvent, homeName: string, awayName: string): BookQuote[] {
  const out: BookQuote[] = [];
  for (const book of event.bookmakers ?? []) {
    const key = bookKey(`${book.key ?? ""} ${book.title ?? ""}`);
    if (!key) continue;
    const h2h = book.markets?.find((m) => m.key === "h2h");
    const home = h2h?.outcomes?.find((o) => namesMatch(o.name ?? "", homeName))?.price;
    const away = h2h?.outcomes?.find((o) => namesMatch(o.name ?? "", awayName))?.price;
    if (home == null && away == null) continue;
    out.push({
      sportsbook: BOOK_LABEL[key] ?? key,
      key,
      homePrice: home ?? null,
      awayPrice: away ?? null,
    });
  }
  return out;
}

export function buildMarketConsensus(quotes: BookQuote[]): MarketConsensus | null {
  if (!quotes.length) return null;
  const homePrices = quotes.map((q) => q.homePrice).filter((n): n is number => n != null);
  const awayPrices = quotes.map((q) => q.awayPrice).filter((n): n is number => n != null);
  const homeImplied = homePrices.map(impliedFromAmerican);
  const bestHome = homePrices.length
    ? homePrices.reduce((best, p) => (impliedFromAmerican(p) < impliedFromAmerican(best) ? p : best))
    : null;
  const bestAway = awayPrices.length
    ? awayPrices.reduce((best, p) => (impliedFromAmerican(p) < impliedFromAmerican(best) ? p : best))
    : null;
  const consensusHome = median(homePrices);
  const noVigHome =
    consensusHome != null && awayPrices.length
      ? (() => {
          const away = median(awayPrices);
          if (away == null) return impliedFromAmerican(consensusHome);
          const a = impliedFromAmerican(consensusHome);
          const b = impliedFromAmerican(away);
          const s = a + b;
          return s > 0 ? a / s : a;
        })()
      : consensusHome != null
        ? impliedFromAmerican(consensusHome)
        : null;
  const mean = homeImplied.length ? homeImplied.reduce((a, b) => a + b, 0) / homeImplied.length : null;
  const dispersion =
    mean != null && homeImplied.length >= 2
      ? Math.sqrt(homeImplied.reduce((s, p) => s + (p - mean) ** 2, 0) / homeImplied.length)
      : 0;
  return {
    books: quotes,
    bestHome,
    bestAway,
    consensusHome,
    medianHome: consensusHome,
    noVigHome,
    dispersion,
  };
}

export async function persistBookQuotes(games: GameCard[]): Promise<void> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    for (const game of games) {
      const books = game.shadows?.consensus?.books ?? [];
      for (const book of books) {
        await sql`
          insert into book_quotes (game_id, sportsbook, market, home_price, away_price)
          select ${game.id}, ${book.sportsbook}, 'moneyline', ${book.homePrice}, ${book.awayPrice}
          where not exists (
            select 1 from book_quotes q
            where q.game_id = ${game.id} and q.sportsbook = ${book.sportsbook}
              and q.captured_at > now() - interval '25 minutes'
          )
        `;
      }
    }
  } catch {
    /* research only */
  }
}

