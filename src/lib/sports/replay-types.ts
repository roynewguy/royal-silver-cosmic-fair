import type { GameCard, PassReason, RankPick } from "./types.ts";
import type { StabilityReport } from "./validation.ts";

export type MarketTapeRow = {
  gameId: string;
  capturedAt: string;
  homeMl: number | null;
  awayMl: number | null;
  book?: string;
  source?: string;
};

export type HistoricalOddsLike = {
  sportsbook: string;
  homeOpen: number | null;
  awayOpen: number | null;
  homeClose: number | null;
  awayClose: number | null;
};

export type ReplayTick = {
  at: string;
  candidates: string[];
  rotations: string[];
  passReasons: Array<{ gameId: string; reason: PassReason }>;
  stability: Array<{ gameId: string } & StabilityReport>;
};

export type ReplayPaperPick = {
  gameId: string;
  at: string;
  selection: string;
  probability: number;
  edgePct: number;
  confidence: number;
  price: number;
  passReason: PassReason | null;
  ledger: "paper";
};

export type ReplayReport = {
  date: string;
  ticks: ReplayTick[];
  paperPicks: ReplayPaperPick[];
  results?: Array<{
    gameId: string;
    homeWin: boolean;
    closingHomeMl: number | null;
    paper: ReplayPaperPick | null;
  }>;
  notes: string[];
  source: string;
};

export type { GameCard, RankPick };
