import { isOfficialDay } from "./day.ts";
import { LEAGUE_BY_ID, type LeagueConfig } from "./leagues.ts";
import {
  clamp,
  devig,
  hasUsableOdds,
  impliedFromAmerican,
  parseWinPct,
  selectionLabel,
} from "./odds.ts";
import type { GameCard, RankPick, SportScan } from "./types.ts";

const MIN_EDGE = 0.03;
const MIN_CONF = 58;

function modelHomeWin(game: GameCard, league: LeagueConfig): number | null {
  const hw = parseWinPct(game.home.record);
  const aw = parseWinPct(game.away.record);
  if (hw == null || aw == null) return null;
  return clamp(0.5 + (hw - aw) * 0.38 + league.homeAdv, 0.18, 0.82);
}

function juiceImbalance(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  return impliedFromAmerican(a) - impliedFromAmerican(b);
}

function spreadMoveBonus(game: GameCard): number {
  const open = game.odds.openHomeSpread;
  const now = game.odds.homeSpread;
  if (open == null || now == null) return 0;
  return clamp((open - now) * 0.008, -0.02, 0.02);
}

function rankOne(game: GameCard, league: LeagueConfig): RankPick | null {
  if (game.status !== "scheduled" && game.status !== "delayed") return null;
  if (game.status === "delayed") return null;
  if (!hasUsableOdds(game.odds)) return null;
  const start = new Date(game.startAt).getTime();
  if (Number.isNaN(start) || start < Date.now() - 5 * 60_000) return null;

  const injuryHit = (game.injuries ?? []).join(" ").toLowerCase();
  const homeHurt = injuryHit.includes(game.home.abbr.toLowerCase()) || injuryHit.includes("out");
  const injuryHaircut = (game.injuries?.length ?? 0) > 0 ? (homeHurt ? 0.01 : 0.005) : 0;

  const candidates: RankPick[] = [];
  const modelHomeRaw = modelHomeWin(game, league);
  const modelHome = modelHomeRaw == null ? null : clamp(modelHomeRaw - injuryHaircut, 0.18, 0.82);

  if (modelHome != null && game.odds.homeMl != null && game.odds.awayMl != null) {
    const modelAway = 1 - modelHome;
    const [fairHome] = devig(game.odds.homeMl, game.odds.awayMl);
    const edgeHome = modelHome - fairHome;
    const edgeAway = modelAway - (1 - fairHome);
    const pickHome = edgeHome >= edgeAway;
    const edge = pickHome ? edgeHome : edgeAway;
    const side = pickHome ? "home" : "away";
    const price = pickHome ? game.odds.homeMl : game.odds.awayMl;
    const tooChalky = Math.abs(price) >= 380 && league.kind === "moneyline";
    const dogTooLong = price >= (league.id === "mlb" ? 180 : 165);
    if (!tooChalky && !dogTooLong && Math.abs(price) < 900) {
      candidates.push({
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
        why: pickHome
          ? `${game.home.abbr} prices a touch short of the home-side model.`
          : `${game.away.abbr} is a number the desk will take versus ${game.home.abbr}.`,
      });
    }
  }

  if (
    league.kind === "spread" &&
    game.odds.homeSpread != null &&
    (game.odds.homeSpreadOdds != null || game.odds.awaySpreadOdds != null)
  ) {
    const line = game.odds.homeSpread;
    const maxSpread = league.id === "ncaaf" ? 16.5 : league.id === "nfl" ? 7.5 : 14.5;
    if (Math.abs(line) <= maxSpread) {
      const move = spreadMoveBonus(game);
      const juice =
        juiceImbalance(game.odds.homeSpreadOdds, game.odds.awaySpreadOdds) * 0.5;
      const expectedMargin =
        modelHome != null ? (modelHome - 0.5) * league.ptsPerWin : 0;
      const coverHome = modelHome != null ? expectedMargin + line : 0;
      const homeDog = line > 0;
      const modelEdge =
        modelHome != null ? coverHome / Math.max(16, league.ptsPerWin) : 0;
      const edgeHome = modelEdge + move + juice + (homeDog ? 0.01 : 0);
      if (Math.abs(edgeHome) >= 0.025) {
        const pickHome = edgeHome >= 0;
        const edge = Math.abs(edgeHome);
        const side = pickHome ? "home" : "away";
        const price =
          (pickHome ? game.odds.homeSpreadOdds : game.odds.awaySpreadOdds) ?? -110;
        const playLine = pickHome ? game.odds.homeSpread : game.odds.awaySpread;
        candidates.push({
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
          edgePct: edge * 100,
          confidence: 0,
          why: pickHome
            ? `${game.home.abbr} ${playLine} is a softer number than the projected margin.`
            : `${game.away.abbr} ${playLine} catches a line the model does not fully respect.`,
        });
      }
    }
  }

  if (league.avgTotal != null && game.odds.total != null && game.odds.overOdds != null && game.odds.underOdds != null) {
    const [fairOver] = devig(game.odds.overOdds, game.odds.underOdds);
    const modelOver =
      game.odds.total < league.avgTotal - 1
        ? 0.53
        : game.odds.total > league.avgTotal + 1.5
          ? 0.47
          : 0.5;
    const edgeOver = modelOver - fairOver;
    const juice = juiceImbalance(game.odds.overOdds, game.odds.underOdds);
    const adj = edgeOver - juice * 0.25;
    if (Math.abs(adj) > 0.025 && Math.abs(game.odds.total - league.avgTotal) >= 1) {
      const pickOver = adj > 0;
      const price = pickOver ? game.odds.overOdds : game.odds.underOdds;
      const side = pickOver ? "over" : "under";
      candidates.push({
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
        why: pickOver
          ? `Total sits under the sport's scoring baseline — slight Over lean.`
          : `Number is rich versus typical scoring — Under is the side.`,
      });
    }
  }

  if (candidates.length === 0) return null;

  const preferred = league.kind;
  candidates.sort((a, b) => {
    const pref = (m: RankPick) => (m.market === preferred ? 1.18 : m.market === "total" ? 0.82 : 1);
    return b.edgePct * pref(b) - a.edgePct * pref(a);
  });
  const best = candidates[0];
  if (!best) return null;
  const conf = clamp(52 + best.edgePct * 2.1 + (parseWinPct(game.home.record) ? 4 : 0), 52, 78);
  if (best.edgePct < MIN_EDGE * 100 || conf < MIN_CONF) return null;
  return { ...best, confidence: Math.round(conf) };
}

export function rankGame(game: GameCard): RankPick | null {
  const league = LEAGUE_BY_ID[game.league];
  if (!league?.official) return null;
  return rankOne(game, league);
}

export function rankGames(games: GameCard[]): GameCard[] {
  return games.map((game) => {
    const league = LEAGUE_BY_ID[game.league];
    if (!league) return { ...game, rank: null };
    if (!league.official) return { ...game, rank: null };
    return { ...game, rank: rankOne(game, league) };
  });
}

export function bestPerSport(
  games: GameCard[],
  minEdge = 3,
  minConf = 58,
  now = new Date(),
): { pick: GameCard; skip: SportScan }[] {
  const bySport = new Map<string, GameCard[]>();
  for (const g of games) {
    const list = bySport.get(g.league) ?? [];
    list.push(g);
    bySport.set(g.league, list);
  }
  const out: { pick: GameCard; skip: SportScan }[] = [];
  for (const league of Object.values(LEAGUE_BY_ID)) {
    const all = bySport.get(league.id) ?? [];
    if (!league.official) {
      out.push({
        pick: all[0] ?? ({ league: league.id, sport: league.sport } as GameCard),
        skip: {
          league: league.id,
          sport: league.sport,
          active: false,
          gameCount: all.length,
          skipped: true,
          skipReason: "Soccer desk dark until 3-way markets ship.",
        },
      });
      continue;
    }
    const slate = all.filter((g) => g.status === "scheduled" && isOfficialDay(g.startAt, now));
    const playable = slate.filter(
      (g) => g.rank && g.rank.edgePct >= minEdge && g.rank.confidence >= minConf,
    );
    playable.sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
    const top = playable[0];
    if (!top) {
      out.push({
        pick: slate[0] ?? ({ league: league.id, sport: league.sport } as GameCard),
        skip: {
          league: league.id,
          sport: league.sport,
          active: slate.length > 0,
          gameCount: slate.length,
          skipped: true,
          skipReason:
            slate.length === 0
              ? "No games on today's PT card."
              : slate.every((g) => !hasUsableOdds(g.odds))
                ? "No listed odds — pass."
                : "No play meets the edge threshold.",
        },
      });
    } else {
      out.push({
        pick: top,
        skip: {
          league: league.id,
          sport: league.sport,
          active: true,
          gameCount: slate.length,
          skipped: false,
          skipReason: null,
        },
      });
    }
  }
  return out;
}

export function unitsFor(confidence: number): number {
  if (confidence >= 80) return 2;
  if (confidence >= 72) return 1.5;
  return 1;
}
