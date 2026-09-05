export type HistoricalGame = {
  gameId: string;
  espnId: string;
  sport: string;
  league: string;
  season: number;
  startAt: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  venue: string | null;
  homeWin: boolean | null;
};

export type HistoricalOdds = {
  gameId: string;
  sportsbook: string;
  market: "moneyline";
  homeOpen: number | null;
  awayOpen: number | null;
  homeClose: number | null;
  awayClose: number | null;
};

export type StarterFeat = {
  name: string | null;
  era: number | null;
  wins: number | null;
  losses: number | null;
};

export type TeamFeat = {
  games: number;
  winPct: number;
  last5: number;
  last10: number;
  homeWinPct: number;
  awayWinPct: number;
  runsForPg: number;
  runsAgainstPg: number;
  runDiffPg: number;
  restDays: number | null;
};

export type TrainingRow = {
  gameId: string;
  league: string;
  season: number;
  startAt: string;
  homeAbbr: string;
  awayAbbr: string;
  homeWin: boolean;
  features: {
    capturedAt: string;
    knownBeforeStart: true;
    home: TeamFeat;
    away: TeamFeat;
    homeStarter: StarterFeat;
    awayStarter: StarterFeat;
    venue: string | null;
  };
  market: {
    sportsbook: string;
    homeOpen: number | null;
    awayOpen: number | null;
    homeClose: number | null;
    awayClose: number | null;
    impliedHomeClose: number | null;
  };
};

/** @deprecated use TrainingRow */
export type MlbRow = TrainingRow;

export type Split = "train" | "valid" | "test";

export type LogRegArtifact = {
  modelVersion: string;
  sport: string;
  target: "home_win";
  trainedAt: string;
  trainFrom: string;
  trainTo: string;
  validFrom: string;
  validTo: string;
  testFrom: string;
  testTo: string;
  featureNames: string[];
  means: number[];
  stds: number[];
  weights: number[];
  metrics: Record<string, unknown>;
  notes: string[];
};
