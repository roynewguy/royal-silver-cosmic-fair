import { isOfficialDay, ptDayKey } from "./day.ts";
import { planDailyCard, rankGames, bestOnSlate } from "./rank.ts";
import { isPlayableRank } from "./data-quality.ts";
import { asOfTimestamp, meaningfulInputDiff, stabilityReport } from "./validation.ts";
import type { HistoricalOddsLike, MarketTapeRow, ReplayReport, ReplayTick } from "./replay-types.ts";
import type { GameCard } from "./types.ts";

export type { ReplayReport, ReplayTick, MarketTapeRow, HistoricalOddsLike } from "./replay-types.ts";

function stripFuture(game: GameCard, simMs: number): GameCard {
  const start = new Date(game.startAt).getTime();
  const started = Number.isFinite(start) && start <= simMs;
  if (started) return game;
  return {
    ...game,
    status: "scheduled",
    home: { ...game.home, score: null },
    away: { ...game.away, score: null },
    odds: {
      ...game.odds,
      // close is not a pregame snapshot
    },
  };
}

export function oddsAsOf(
  game: GameCard,
  simMs: number,
  tape: MarketTapeRow[],
  hist: HistoricalOddsLike | null,
): GameCard {
  const start = new Date(game.startAt).getTime();
  const available = asOfTimestamp(
    tape.filter((t) => t.gameId === game.id).map((t) => ({ ...t, capturedAt: t.capturedAt })),
    simMs,
  );
  const last = available.sort((a, b) => +new Date(a.capturedAt) - +new Date(b.capturedAt)).at(-1);
  if (last) {
    return stripFuture(
      {
        ...game,
        odds: {
          ...game.odds,
          homeMl: last.homeMl,
          awayMl: last.awayMl,
          book: last.book ?? game.odds.book,
          source: (last.source as GameCard["odds"]["source"]) ?? game.odds.source,
          capturedAt: last.capturedAt,
        },
      },
      simMs,
    );
  }
  if (hist && simMs < start && hist.homeOpen != null) {
    return stripFuture(
      {
        ...game,
        odds: {
          ...game.odds,
          homeMl: hist.homeOpen,
          awayMl: hist.awayOpen,
          book: hist.sportsbook,
          source: "espn",
          capturedAt: new Date(start - 12 * 3600_000).toISOString(),
        },
      },
      simMs,
    );
  }
  return stripFuture(
    {
      ...game,
      odds: { ...game.odds, homeMl: null, awayMl: null, capturedAt: null, book: "none", source: "unknown" },
    },
    simMs,
  );
}

export function closingAsOf(hist: HistoricalOddsLike | null, startAt: string, simMs: number): number | null {
  const start = new Date(startAt).getTime();
  if (!hist || simMs < start) return null;
  return hist.homeClose ?? null;
}

export function replayDay(opts: {
  date: string;
  games: GameCard[];
  tape: MarketTapeRow[];
  histOdds: Record<string, HistoricalOddsLike>;
  leadMinutes?: number;
  minEdge?: number;
  minConf?: number;
  target?: number;
  stepMs?: number;
  fromHourPt?: number;
}): ReplayReport {
  const lead = opts.leadMinutes ?? 150;
  const minEdge = opts.minEdge ?? 3;
  const minConf = opts.minConf ?? 58;
  const target = opts.target ?? 3;
  const step = opts.stepMs ?? 10 * 60_000;
  const dayGames = opts.games.filter((g) => ptDayKey(new Date(g.startAt)) === opts.date || isOfficialDay(g.startAt, new Date(`${opts.date}T20:00:00-07:00`)));
  if (!dayGames.length) {
    return { date: opts.date, ticks: [], paperPicks: [], notes: ["No games for this PT date in stored history."], source: "historical_games + market_tape + historical_odds (open only before first pitch)" };
  }
  const starts = dayGames.map((g) => +new Date(g.startAt));
  const startMs = Math.min(...starts) - 8 * 3600_000;
  const from = new Date(`${opts.date}T${String(opts.fromHourPt ?? 9).padStart(2, "0")}:00:00-07:00`).getTime();
  let sim = Math.max(from, startMs);
  const end = Math.max(...starts) + 30 * 60_000;
  const ticks: ReplayTick[] = [];
  let committed: Array<{ gameId: string; status: string; startAt: string }> = [];
  const lastByGame = new Map<string, { rank: GameCard["rank"]; game: GameCard }>();
  const paper: ReplayReport["paperPicks"] = [];

  while (sim <= end) {
    const slate = dayGames
      .map((g) => oddsAsOf(g, sim, opts.tape, opts.histOdds[g.id] ?? null))
      .filter((g) => new Date(g.startAt).getTime() > sim && g.status === "scheduled");
    const ranked = rankGames(slate);
    const playable = bestOnSlate(ranked, minEdge, minConf, new Date(sim));
    const plan = planDailyCard(
      playable.map((g) => g.id),
      committed,
      target,
      new Date(sim),
    );
    const passReasons = ranked
      .filter((g) => g.rank?.passReason)
      .map((g) => ({ gameId: g.id, reason: g.rank!.passReason! }));
    const stability = ranked.flatMap((g) => {
      const prev = lastByGame.get(g.id);
      if (!g.rank || !prev?.rank) return [];
      const inputs = meaningfulInputDiff(prev.game, g);
      const rep = stabilityReport(prev.rank, g.rank, inputs);
      return rep.flag ? [{ gameId: g.id, ...rep }] : [];
    });
    for (const g of ranked) if (g.rank) lastByGame.set(g.id, { rank: g.rank, game: g });

    const keep = new Set(plan.keepIds);
    committed = committed.filter((c) => c.status !== "queued" || keep.has(c.gameId));
    for (const g of playable.filter((x) => keep.has(x.id))) {
      const postAt = new Date(g.startAt).getTime() - lead * 60_000;
      const existing = committed.find((c) => c.gameId === g.id);
      if (!existing) committed.push({ gameId: g.id, status: "queued", startAt: g.startAt });
      if (sim >= postAt && isPlayableRank(g.rank, minEdge, minConf) && g.odds.homeMl != null) {
        const row = committed.find((c) => c.gameId === g.id);
        if (row && row.status === "queued") {
          row.status = "posted";
          paper.push({
            gameId: g.id,
            at: new Date(sim).toISOString(),
            selection: g.rank!.selection,
            probability: g.rank!.probability,
            edgePct: g.rank!.edgePct,
            confidence: g.rank!.confidence,
            price: g.rank!.price,
            passReason: g.rank!.passReason ?? null,
            ledger: "paper",
          });
        }
      }
    }

    ticks.push({
      at: new Date(sim).toISOString(),
      candidates: playable.map((g) => g.id),
      rotations: plan.rotateOffIds,
      passReasons,
      stability,
    });
    sim += step;
    if (ticks.length > 80) break;
  }

  const results = dayGames
    .filter((g) => g.status === "final" && g.home.score != null)
    .map((g) => {
      const pick = paper.find((p) => p.gameId === g.id);
      const hist = opts.histOdds[g.id] ?? null;
      const close = closingAsOf(hist, g.startAt, end + 4 * 3600_000);
      return {
        gameId: g.id,
        homeWin: (g.home.score ?? 0) > (g.away.score ?? 0),
        closingHomeMl: close,
        paper: pick ?? null,
      };
    });

  return {
    date: opts.date,
    ticks,
    paperPicks: paper,
    results,
    notes: [
      "Replay uses only tape/openers captured at or before each simulated time.",
      "Closing lines are never used to rank or lock a paper pick.",
      "Paper picks are not the public record.",
    ],
    source: "historical_games + market_tape + historical_odds openers",
  };
}
