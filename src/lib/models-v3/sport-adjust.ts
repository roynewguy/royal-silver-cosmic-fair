import { clamp, impliedFromAmerican, parseWinPct } from "../sports/odds.ts";
import type { GameCard } from "../sports/types.ts";

export type SportAdjust = {
  /** Added to home-win probability. Capped. Never uses scores or closing lines. */
  delta: number;
  /** 0 = keep model, 1 = fully replace with current no-vig market. */
  shrink: number;
  reasons: string[];
};

function injurySkew(game: GameCard, weight: number): number {
  const inj = game.injuries ?? [];
  const weightOf = (status: string) => {
    if (status === "out") return 1;
    if (status === "doubtful") return 0.65;
    if (status === "questionable") return 0.25;
    return 0;
  };
  const home = inj.filter((i) => i.team === "home").reduce((s, i) => s + weightOf(i.status), 0);
  const away = inj.filter((i) => i.team === "away").reduce((s, i) => s + weightOf(i.status), 0);
  return clamp((away - home) * weight, -0.04, 0.04);
}

function steamShrink(game: GameCard): number {
  const open = game.odds.openHomeMl;
  const now = game.odds.homeMl;
  if (open == null || now == null) return 0;
  const move = Math.abs(impliedFromAmerican(now) - impliedFromAmerican(open));
  if (move >= 0.035) return 0.28;
  if (move >= 0.02) return 0.14;
  return 0;
}

function mlbAdjust(game: GameCard): SportAdjust {
  const reasons: string[] = [];
  let delta = 0;
  let shrink = 0.08;
  const hs = game.home.starter;
  const as_ = game.away.starter;
  if (!hs?.name || !as_?.name) {
    shrink += 0.45;
    reasons.push("starter unconfirmed");
  }
  if (hs?.whip != null && as_?.whip != null) {
    const whip = clamp((as_.whip - hs.whip) * 0.045, -0.03, 0.03);
    delta += whip;
    if (Math.abs(whip) >= 0.008) reasons.push("whip");
  }
  const homeHome = parseWinPct(game.home.homeSplit);
  const awayRoad = parseWinPct(game.away.roadSplit);
  if (homeHome != null && awayRoad != null) {
    const split = clamp((homeHome - awayRoad) * 0.05, -0.02, 0.02);
    delta += split;
    if (Math.abs(split) >= 0.006) reasons.push("home/road split");
  }
  const inj = injurySkew(game, 0.008);
  delta += inj;
  if (Math.abs(inj) >= 0.008) reasons.push("injuries");
  shrink += steamShrink(game);
  if (!game.weather) {
    shrink += 0.04;
    reasons.push("no weather");
  }
  return { delta: clamp(delta, -0.05, 0.05), shrink: clamp(shrink, 0, 0.75), reasons };
}

function nflAdjust(game: GameCard): SportAdjust {
  const reasons: string[] = [];
  const inj = injurySkew(game, 0.012);
  if (Math.abs(inj) >= 0.01) reasons.push("injuries");
  let shrink = 0.1 + steamShrink(game);
  if (!game.injuriesFetchedAt) {
    shrink += 0.28;
    reasons.push("injury feed stale");
  }
  return { delta: inj, shrink: clamp(shrink, 0, 0.75), reasons };
}

function nbaAdjust(game: GameCard): SportAdjust {
  const reasons: string[] = [];
  const inj = injurySkew(game, 0.014);
  if (Math.abs(inj) >= 0.01) reasons.push("star availability");
  let shrink = 0.1 + steamShrink(game);
  if (!game.injuriesFetchedAt) {
    shrink += 0.25;
    reasons.push("injury feed stale");
  }
  return { delta: inj, shrink: clamp(shrink, 0, 0.75), reasons };
}

function nhlAdjust(game: GameCard): SportAdjust {
  const reasons: string[] = [];
  let delta = 0;
  let shrink = 0.08 + steamShrink(game);
  const hg = game.home.starter;
  const ag = game.away.starter;
  if (!hg?.name || !ag?.name) {
    shrink += 0.55;
    reasons.push("goalie unconfirmed");
  }
  if (hg?.savePct != null && ag?.savePct != null) {
    const sv = clamp((hg.savePct - ag.savePct) * 0.35, -0.035, 0.035);
    delta += sv;
    if (Math.abs(sv) >= 0.008) reasons.push("goalie save pct");
  }
  const inj = injurySkew(game, 0.006);
  delta += inj;
  return { delta: clamp(delta, -0.05, 0.05), shrink: clamp(shrink, 0, 0.8), reasons };
}

function genericAdjust(game: GameCard): SportAdjust {
  return { delta: injurySkew(game, 0.008), shrink: clamp(0.12 + steamShrink(game), 0, 0.7), reasons: [] };
}

/** Pregame-only residual. Scores and closing lines never enter this function. */
export function sportHomeAdjust(game: GameCard): SportAdjust {
  switch (game.league) {
    case "mlb":
      return mlbAdjust(game);
    case "nfl":
    case "ncaaf":
      return nflAdjust(game);
    case "nba":
    case "wnba":
      return nbaAdjust(game);
    case "nhl":
      return nhlAdjust(game);
    default:
      return genericAdjust(game);
  }
}

export function applySportAdjust(homeProb: number, marketHome: number | null, game: GameCard): { probability: number; adjust: SportAdjust } {
  const adjust = sportHomeAdjust(game);
  const raw = clamp(homeProb + adjust.delta, 0.08, 0.92);
  if (marketHome == null || !Number.isFinite(marketHome)) {
    return { probability: raw, adjust };
  }
  const p = raw * (1 - adjust.shrink) + clamp(marketHome, 0.08, 0.92) * adjust.shrink;
  return { probability: clamp(p, 0.08, 0.92), adjust };
}

export function assertNoLeakageInAdjust(game: GameCard): void {
  const packed = JSON.stringify(sportHomeAdjust(game));
  if (/"score"|homeScore|awayScore|closing/i.test(packed)) {
    throw new Error("sport adjust leaked future information");
  }
}
