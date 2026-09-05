export type SportId =
  | "nfl"
  | "ncaaf"
  | "mlb"
  | "mls"
  | "epl"
  | "nhl"
  | "nba"
  | "wnba"
  | "ncaab"
  | "ufc";

export type GameStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "cancelled"
  | "delayed"
  | "suspended";

export type Market = "spread" | "moneyline" | "total";

export type Side = "home" | "away" | "over" | "under";

export type PickStatus = "queued" | "posting" | "posted" | "skipped" | "graded";

export type PickResult = "WIN" | "LOSS" | "PUSH" | "VOID";

export type OddsSnapshot = {
  book: string;
  details: string | null;
  homeMl: number | null;
  awayMl: number | null;
  homeSpread: number | null;
  awaySpread: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
  openHomeSpread: number | null;
  openTotal: number | null;
  openHomeMl: number | null;
  source: "odds-api" | "espn" | "unknown";
  capturedAt: string | null;
};

export type TeamInfo = {
  name: string;
  abbr: string;
  logo: string | null;
  score: number | null;
  record: string | null;
  homeSplit: string | null;
  roadSplit: string | null;
  starter: Starter | null;
};

export type InjuryStatus = "out" | "doubtful" | "questionable" | "probable" | "unknown";

export type Injury = {
  team: "home" | "away";
  player: string;
  status: InjuryStatus;
  position: string | null;
};

export type Starter = {
  name: string;
  era: number | null;
  whip: number | null;
  savePct: number | null;
  position: string | null;
};

export type RankPick = {
  market: Market;
  side: Side;
  selection: string;
  line: number | null;
  price: number;
  edgePct: number;
  confidence: number;
  why: string;
  model: string;
  probability: number;
};

export type GameCard = {
  id: string;
  espnId: string;
  sport: string;
  league: SportId;
  startAt: string;
  status: GameStatus;
  home: TeamInfo;
  away: TeamInfo;
  venue: string | null;
  odds: OddsSnapshot;
  rank: RankPick | null;
  notes: string[];
  injuries: Injury[];
  weather: string | null;
};

export type SportScan = {
  league: SportId;
  sport: string;
  active: boolean;
  gameCount: number;
  skipped: boolean;
  skipReason: string | null;
};

export type PickRow = {
  id: number;
  gameId: string;
  sport: string;
  league: string;
  matchup: string;
  market: Market;
  selection: string;
  side: Side;
  lockedLine: number | null;
  lockedOdds: number;
  lockedOddsJson: OddsSnapshot;
  reason: string;
  research: string | null;
  confidence: number;
  edgePct: number;
  units: number;
  status: PickStatus;
  result: PickResult | null;
  profitUnits: number | null;
  startAt: string;
  postAt: string;
  postedAt: string | null;
  gradedAt: string | null;
  discordMessage: string | null;
  discordMessageId: string | null;
  officialKey: string | null;
  skipReason: string | null;
  modelVersion: string | null;
  modelProbability: number | null;
  modelEdge: number | null;
  freezeJson: string | null;
  selectedOdds: number | null;
  postedOdds: number | null;
  closingOdds: number | null;
  clv: number | null;
  createdAt: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeScore: number | null;
  awayScore: number | null;
  gameStatus: GameStatus | null;
};

export type DeskRecord = {
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  pending: number;
};

export type DeskLog = {
  id: number;
  kind: string;
  sport: string | null;
  message: string;
  createdAt: string;
};

export type CalibrationSlice = {
  key: string;
  bets: number;
  decided: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  actualWinRate: number | null;
  expectedWinRate: number | null;
  delta: number | null;
  roi: number | null;
  units: number;
  avgClv: number | null;
  enough: boolean;
};

export type CalibrationReport = {
  buckets: CalibrationSlice[];
  models: CalibrationSlice[];
  official: number;
  decided: number;
  note: string;
};

export type AutomationStatus = "online" | "delayed" | "offline" | "unarmed";
export type ServiceLevel = "ok" | "warn" | "bad";

export type DeskHealth = {
  automation: AutomationStatus;
  lastTickAt: string | null;
  lastScanAt: string | null;
  nextScanAt: string | null;
  db: ServiceLevel;
  dbLabel: string;
  espn: ServiceLevel;
  discord: ServiceLevel;
  discordLabel: string;
  odds: ServiceLevel;
  oddsLabel: string;
  oddsRemaining: number | null;
  oddsUsed: number | null;
  freeBeta: boolean;
};

export type DeskState = {
  record: DeskRecord;
  games: GameCard[];
  picks: PickRow[];
  scans: SportScan[];
  log: DeskLog[];
  lastScanAt: string | null;
  lastDeskAt: string | null;
  minEdgePct: number;
  minConfidence: number;
  postLeadMinutes: number;
  maxDailyPicks: number;
  hasWebhook: boolean;
  webhookSource: "env" | "desk" | "none";
  operator: boolean;
  soccerDesk: "off";
  pinFromEnv: boolean;
  calibration: CalibrationReport | null;
  health: DeskHealth;
  researchModels: {
    production: string;
    shadow: string | null;
    testN: number | null;
    brier: number | null;
    logLoss: number | null;
    roi: number | null;
    note: string;
    sports?: Array<{
      league: string;
      production: string;
      shadow: string | null;
      testN: number | null;
      brier: number | null;
      logLoss: number | null;
      roi: number | null;
    }>;
    shadowCompare?: {
      league: string;
      n: number;
      v2: { n: number; brier: number | null; accuracy: number | null; avgClv: number | null };
      v3: { n: number; brier: number | null; accuracy: number | null; avgClv: number | null };
      note: string;
    } | null;
    audit?: string[];
  } | null;
};
