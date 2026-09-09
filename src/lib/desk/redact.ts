import type { DeskState, GameCard, PickRow, SportScan } from "@/lib/sports/types";
import { EMPTY_HEALTH } from "./health.ts";

function publicPick(pick: PickRow): PickRow {
  const posted = pick.status === "posted" || pick.status === "graded";
  return {
    ...pick,
    research: null,
    edgePct: posted ? pick.edgePct : 0,
    confidence: posted ? pick.confidence : 0,
    modelProbability: posted ? pick.modelProbability : null,
    modelEdge: null,
    freezeJson: null,
    discordMessage: posted ? pick.discordMessage : null,
    skipReason: posted ? pick.skipReason : null,
  };
}

function publicGame(game: GameCard): GameCard {
  return {
    ...game,
    rank: null,
    notes: [],
    injuries: [],
    weather: null,
    shadows: null,
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
    picks: state.picks.filter((p) => isPublicPickStatus(p.status) && p.ledger !== "paper").map(publicPick),
    log: [],
    preflight: null,
    paperRecord: null,
    scans: state.scans.map(publicScan),
    minEdgePct: 0,
    minConfidence: 0,
    maxDailyPicks: 0,
    lastDeskAt: null,
    calibration: null,
    health: {
      ...(state.health ?? EMPTY_HEALTH),
      latestAlert: null,
      deliveryUnknown: 0,
      staleJobs: 0,
      oddsRemaining: null,
      oddsUsed: null,
    },
    researchModels: operator ? state.researchModels : null,
    modelLab: null,
    skippedToday: 0,
  };
}
