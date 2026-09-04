import type { DeskState, GameCard, PickRow, SportScan } from "@/lib/sports/types";

function publicPick(pick: PickRow): PickRow {
  return {
    ...pick,
    research: null,
    edgePct: 0,
    confidence: 0,
    modelProbability: null,
    modelEdge: null,
    freezeJson: null,
    discordMessage: null,
    skipReason: pick.status === "graded" || pick.status === "posted" ? pick.skipReason : null,
  };
}

function publicGame(game: GameCard): GameCard {
  return {
    ...game,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    home: { ...game.home, homeSplit: null, roadSplit: null, starter: null },
    away: { ...game.away, homeSplit: null, roadSplit: null, starter: null },
  };
}

function publicScan(scan: SportScan): SportScan {
  return {
    ...scan,
    skipReason: scan.skipped ? null : null,
  };
}

export function isPublicPickStatus(status: string): boolean {
  return status === "posted" || status === "graded";
}

export function redactDesk(state: DeskState, operator: boolean): DeskState {
  if (operator) return { ...state, operator: true };
  return {
    ...state,
    operator: false,
    games: state.games.map(publicGame),
    picks: state.picks.filter((p) => isPublicPickStatus(p.status)).map(publicPick),
    log: [],
    scans: state.scans.map(publicScan),
    minEdgePct: 0,
    minConfidence: 0,
    lastDeskAt: null,
  };
}
