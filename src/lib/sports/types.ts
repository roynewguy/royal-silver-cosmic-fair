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

export type PickStatus = "queued" | "posting" | "posted" | "skipped" | "graded" | "delivery_unknown";

export type PickResult = "WIN" | "LOSS" | "PUSH" | "VOID";

export type GradeOutcome = "WIN" | "LOSS" | "PUSH" | "VOID" | "POSTPONED" | "CANCELLED" | "UNRESOLVED";

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
  eventId?: string | null;
  eventStartAt?: string | null;
  sportKey?: string | null;
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

export type PickTier = "lock" | "soft_floor";

export type PassReason =
  | "PASS_MISSING_STARTER"
  | "PASS_STALE_MARKET"
  | "PASS_DK_STALE"
  | "PASS_DK_UNAVAILABLE"
  | "PASS_LOW_DATA_QUALITY"
  | "PASS_EDGE_TOO_SMALL"
  | "PASS_EDGE_DIED"
  | "PASS_LOW_CONFIDENCE"
  | "PASS_GAME_MISMATCH"
  | "PASS_START_TIME_MISMATCH"
  | "PASS_GAME_STARTED"
  | "PASS_POSTPONED"
  | "PASS_CANCELLED"
  | "PASS_STARTER_CHANGED"
  | "PASS_CRITICAL_DATA_MISSING"
  | "PASS_EVENT_ID_CONFLICT"
  | "PASS_ODDS_EVENT_AMBIGUOUS"
  | "PASS_ALREADY_POSTED"
  | "PASS_DATA_CONFLICT"
  | "PASS_DAILY_CAP"
  | "PASS_NO_EDGE"
  | "PASS_HIGH_UNCERTAINTY"
  | "PASS_LINE_MOVED"
  | "PASS_PRICE_TOO_BAD"
  | "PASS_INJURY_UNCONFIRMED"
  | "PASS_STARTER_UNCONFIRMED"
  | "PASS_MARKET_STALE"
  | "PASS_MARKET_DISAGREEMENT"
  | "PASS_MARKET_INCOMPLETE"
  | "PASS_MODEL_UNCALIBRATED"
  | "PASS_CORRELATED"
  | "PASS_DAILY_RISK_LIMIT";

export type BookQuote = {
  sportsbook: string;
  key: string;
  homePrice: number | null;
  awayPrice: number | null;
};

export type MarketConsensus = {
  books: BookQuote[];
  bestHome: number | null;
  bestAway: number | null;
  consensusHome: number | null;
  medianHome: number | null;
  noVigHome: number | null;
  dispersion: number;
};

export type ModelCall = {
  model: string;
  probability: number;
  marketProbability: number | null;
  edgePct: number | null;
  expectedValuePct: number | null;
  uncertainty: number | null;
  dataQuality: number | null;
  confidence: number | null;
  action: "BET" | "PASS";
  passReason: PassReason | null;
  official: boolean;
  price?: number | null;
  side?: Side;
};

export type GameShadows = {
  v3?: ModelCall | null;
  v4?: ModelCall | null;
  consensus?: MarketConsensus | null;
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
  rawImplied?: number | null;
  noVigImplied?: number | null;
  marketHold?: number | null;
  vigAdjusted?: boolean;
  dataQuality?: number;
  missingInputs?: string[];
  passReason?: PassReason | null;
  freshness?: Record<string, { ageMinutes: number | null; source: string }>;
  flags?: Array<"UNSTABLE_MODEL_OUTPUT" | "EDGE_OUTLIER">;
  outlierReason?: string | null;
  /** Hard-edge LOCK vs soft-floor desk pick. */
  pickTier?: PickTier;
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
  clock?: string | null;
  period?: number | null;
  shortDetail?: string | null;
  fetchedAt?: string | null;
  injuriesFetchedAt?: string | null;
  startersFetchedAt?: string | null;
  weatherFetchedAt?: string | null;
  shadows?: GameShadows | null;
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
  ledger?: "official" | "paper";
  pickSource?: "auto" | "manual" | "manual_live";
  lineSource?: string | null;
  postedScore?: string | null;
  postedState?: string | null;
  needsManualGrade?: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeScore: number | null;
  awayScore: number | null;
  gameStatus: GameStatus | null;
};

export type DeskRecord = {
  riskedUnits?: number;
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
  oddsQuotaLevel: "ok" | "warning" | "critical" | "exhausted";
  oddsTickUsed: number | null;
  oddsEstimatedDaily: number | null;
  oddsEstimatedMonthly: number | null;
  oddsSummary: string;
  freeBeta: boolean;
  lastSportsbookAt: string | null;
  lastOfficialPostAt: string | null;
  lastGradeAt: string | null;
  pendingGrades: number;
  deliveryUnknown: number;
  staleJobs: number;
  staleInjuryFeeds: boolean;
  staleMarketFeeds: boolean;
  latestAlert: string | null;
  shadowSoak: boolean;
  soakRecorderFailed: boolean;
  soakWouldHavePosted: number | null;
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
  preflight?: import("../desk/preflight").Preflight | null;
  livePosting?: boolean;
  paperMode?: boolean;
  paperRecord?: DeskRecord | null;
  modelLab?: ModelLabState | null;
  skippedToday?: number;
};

export type ModelStatus = "shadow" | "candidate" | "production" | "retired";
export type ModelRole = "champion" | "challenger" | "paper";

export type ModelDrift = {
  last50Roi: number | null;
  last100Roi: number | null;
  last250Roi: number | null;
  last50Brier: number | null;
  last100Brier: number | null;
  last250Brier: number | null;
  flag: boolean;
  note: string | null;
};

export type ModelCard = {
  modelName: string;
  modelVersion: string;
  sport: string;
  status: ModelStatus;
  role: ModelRole;
  trainingPeriod: string | null;
  features: string[];
  sampleSize: number | null;
  brier: number | null;
  logLoss: number | null;
  accuracy: number | null;
  roi: number | null;
  clv: number | null;
  averageEdge: number | null;
  betCount: number | null;
  lastPredictionAt: string | null;
  eligible: boolean;
  eligibleReasons: string[];
  livePosting: boolean;
  wins: number | null;
  losses: number | null;
  units: number | null;
  drift: ModelDrift | null;
};

export type ModelLabState = {
  champion: string;
  note: string;
  cards: ModelCard[];
  livePostingLockedToV2: true;
  passReasons: Array<{ reason: string; n: number }>;
};
