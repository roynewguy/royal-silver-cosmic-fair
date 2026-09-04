import {
  clamp,
  devig,
  hasUsableOdds,
  impliedFromAmerican,
  parseWinPct,
  selectionLabel,
} from "../odds.ts";
import { isFreeBetaMode } from "../free-beta.ts";
import { isDraftKingsLine } from "../odds-api.ts";
import type { GameCard, RankPick, Side } from "../types.ts";

export const MIN_EDGE = 0.03;
export const MIN_CONF = 58;

export function sitePct(game: GameCard): { home: number | null; away: number | null } {
  const homeHome = parseWinPct(game.home.homeSplit) ?? parseWinPct(game.home.record);
  const awayRoad = parseWinPct(game.away.roadSplit) ?? parseWinPct(game.away.record);
  return { home: homeHome, away: awayRoad };
}

export function spreadMoveBonus(game: GameCard): number {
  const open = game.odds.openHomeSpread;
  const now = game.odds.homeSpread;
  if (open == null || now == null) return 0;
  return clamp((open - now) * 0.008, -0.02, 0.02);
}

export function juiceImbalance(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  return impliedFromAmerican(a) - impliedFromAmerican(b);
}

export function gate(game: GameCard): boolean {
  if (game.status !== "scheduled") return false;
  if (isFreeBetaMode()) {
    if (!hasUsableOdds(game.odds) && !isDraftKingsLine(game.odds)) return false;
  } else if (!isDraftKingsLine(game.odds)) {
    return false;
  }
  const start = new Date(game.startAt).getTime();
  if (Number.isNaN(start) || start < Date.now() - 5 * 60_000) return false;
  return true;
}

export function mlPlay(
  game: GameCard,
  modelHome: number,
  why: string,
  model: string,
  opts: { maxChalk: number; maxDog: number },
): RankPick | null {
  if (game.odds.homeMl == null || game.odds.awayMl == null) return null;
  const [fairHome] = devig(game.odds.homeMl, game.odds.awayMl);
  const edgeHome = modelHome - fairHome;
  const edgeAway = 1 - modelHome - (1 - fairHome);
  const pickHome = edgeHome >= edgeAway;
  const edge = pickHome ? edgeHome : edgeAway;
  const price = pickHome ? game.odds.homeMl : game.odds.awayMl;
  if (Math.abs(price) >= opts.maxChalk) return null;
  if (price >= opts.maxDog) return null;
  if (edge < MIN_EDGE) return null;
  const side: Side = pickHome ? "home" : "away";
  return {
    market: "moneyline",
    side,
    selection: selectionLabel({
      market: "moneyline",
      side,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      line: null,
      price,
    }),
    line: null,
    price,
    edgePct: edge * 100,
    confidence: 0,
    why,
    model,
    probability: pickHome ? modelHome : 1 - modelHome,
  };
}

export function spreadPlay(
  game: GameCard,
  modelHome: number,
  ptsPerWin: number,
  maxSpread: number,
  why: string,
  model: string,
): RankPick | null {
  if (game.odds.homeSpread == null) return null;
  const line = game.odds.homeSpread;
  if (Math.abs(line) > maxSpread) return null;
  const move = spreadMoveBonus(game);
  const juice = juiceImbalance(game.odds.homeSpreadOdds, game.odds.awaySpreadOdds) * 0.45;
  const expectedMargin = (modelHome - 0.5) * ptsPerWin;
  const coverHome = (expectedMargin + line) / Math.max(14, ptsPerWin);
  const edgeHome = coverHome + move + juice + (line > 0 ? 0.008 : 0);
  if (Math.abs(edgeHome) < MIN_EDGE) return null;
  const pickHome = edgeHome >= 0;
  const side: Side = pickHome ? "home" : "away";
  const price = (pickHome ? game.odds.homeSpreadOdds : game.odds.awaySpreadOdds) ?? -110;
  const playLine = pickHome ? game.odds.homeSpread : game.odds.awaySpread;
  const coverProb = clamp(0.5 + coverHome, 0.18, 0.82);
  return {
    market: "spread",
    side,
    selection: selectionLabel({
      market: "spread",
      side,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      line: playLine,
      price,
    }),
    line: playLine,
    price,
    edgePct: Math.abs(edgeHome) * 100,
    confidence: 0,
    why,
    model,
    probability: pickHome ? coverProb : 1 - coverProb,
  };
}

export function totalPlay(
  game: GameCard,
  modelOver: number,
  why: string,
  model: string,
): RankPick | null {
  if (game.odds.total == null || game.odds.overOdds == null || game.odds.underOdds == null) return null;
  const [fairOver] = devig(game.odds.overOdds, game.odds.underOdds);
  const adj = modelOver - fairOver - juiceImbalance(game.odds.overOdds, game.odds.underOdds) * 0.2;
  if (Math.abs(adj) < MIN_EDGE) return null;
  const pickOver = adj > 0;
  const side: Side = pickOver ? "over" : "under";
  const price = pickOver ? game.odds.overOdds : game.odds.underOdds;
  return {
    market: "total",
    side,
    selection: selectionLabel({
      market: "total",
      side,
      homeAbbr: game.home.abbr,
      awayAbbr: game.away.abbr,
      line: game.odds.total,
      price,
    }),
    line: game.odds.total,
    price,
    edgePct: Math.abs(adj) * 100,
    confidence: 0,
    why,
    model,
    probability: pickOver ? modelOver : 1 - modelOver,
  };
}

export function pickBest(
  candidates: RankPick[],
  preferred: RankPick["market"],
  extraConf = 0,
): RankPick | null {
  const playable = candidates.filter((c) => c.edgePct >= MIN_EDGE * 100);
  if (!playable.length) return null;
  playable.sort((a, b) => {
    const pref = (m: RankPick) => (m.market === preferred ? 1.2 : m.market === "total" ? 0.84 : 1);
    return b.edgePct * pref(b) - a.edgePct * pref(a);
  });
  const best = playable[0];
  if (!best) return null;
  const conf = clamp(52 + best.edgePct * 2.0 + extraConf, 52, 79);
  if (conf < MIN_CONF) return null;
  return { ...best, confidence: Math.round(conf) };
}
