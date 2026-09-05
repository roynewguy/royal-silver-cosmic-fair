import { getSql } from "@/lib/db";
import { replayDay, type HistoricalOddsLike, type MarketTapeRow, type ReplayReport } from "./replay.ts";
import type { GameCard, OddsSnapshot } from "./types.ts";

function emptyOdds(over: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    book: over.book ?? "ESPN BET",
    details: null,
    homeMl: over.homeMl ?? null,
    awayMl: over.awayMl ?? null,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: over.openHomeMl ?? over.homeMl ?? null,
    source: over.source ?? "espn",
    capturedAt: over.capturedAt ?? null,
  };
}

export async function runPaperReplay(date: string): Promise<ReplayReport> {
  const sql = await getSql();
  const games: GameCard[] = [];
  const histOdds: Record<string, HistoricalOddsLike> = {};
  const tape: MarketTapeRow[] = [];
  try {
    const hist = await sql<{
      game_id: string;
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
      select game_id, espn_id, sport, league, start_at::text as start_at,
             home_team, away_team, home_abbr, away_abbr, home_score, away_score, status, venue
      from historical_games
      where start_at >= ${`${date}T00:00:00-07:00`}::timestamptz
        and start_at < ${`${date}T23:59:59-07:00`}::timestamptz + interval '1 day'
    `;
    for (const r of hist) {
      games.push({
        id: r.game_id,
        espnId: r.espn_id,
        sport: r.sport,
        league: r.league as GameCard["league"],
        startAt: r.start_at,
        status: r.status as GameCard["status"],
        home: { name: r.home_team, abbr: r.home_abbr, logo: null, score: r.home_score, record: "70-70", homeSplit: null, roadSplit: null, starter: null },
        away: { name: r.away_team, abbr: r.away_abbr, logo: null, score: r.away_score, record: "70-70", homeSplit: null, roadSplit: null, starter: null },
        venue: r.venue,
        odds: emptyOdds(),
        rank: null,
        notes: [],
        injuries: [],
        weather: null,
      });
    }
    const odds = await sql<{
      game_id: string;
      sportsbook: string;
      home_price: number | null;
      away_price: number | null;
      captured_kind: string;
    }>`
      select game_id, sportsbook, home_price, away_price, captured_kind
      from historical_odds
      where game_id = any(${games.map((g) => g.id)})
    `;
    for (const o of odds) {
      const cur = histOdds[o.game_id] ?? { sportsbook: o.sportsbook, homeOpen: null, awayOpen: null, homeClose: null, awayClose: null };
      if (o.captured_kind === "open") {
        cur.homeOpen = o.home_price;
        cur.awayOpen = o.away_price;
      } else {
        cur.homeClose = o.home_price;
        cur.awayClose = o.away_price;
      }
      histOdds[o.game_id] = cur;
    }
    const tapeRows = await sql<{
      game_id: string;
      captured_at: string;
      book: string | null;
      source: string | null;
      home_ml: number | null;
      away_ml: number | null;
    }>`
      select game_id, captured_at::text as captured_at, book, source, home_ml, away_ml
      from market_tape
      where game_id = any(${games.map((g) => g.id)})
      order by captured_at asc
    `;
    for (const t of tapeRows) {
      tape.push({
        gameId: t.game_id,
        capturedAt: t.captured_at,
        homeMl: t.home_ml,
        awayMl: t.away_ml,
        book: t.book ?? undefined,
        source: t.source ?? undefined,
      });
    }
  } catch {
    /* missing tables */
  }
  const report = replayDay({ date, games, tape, histOdds });
  try {
    await sql`
      insert into paper_replay_runs (replay_date, report_json, official)
      values (${date}, ${JSON.stringify(report)}, false)
    `;
  } catch {
    /* optional */
  }
  return report;
}
