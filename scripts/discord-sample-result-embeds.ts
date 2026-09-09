#!/usr/bin/env node
/** TEST RESULT sample embeds for DISCORD_TEST_WEBHOOK / #test-lab only. */
import {
  buildOfficialResultPayload,
  discordWebhookOk,
  postWebhook,
} from "../src/lib/sports/discord.ts";
import { channelWebhook, webhookIdentity } from "../src/lib/sports/discord-routing.ts";
import type { DeskRecord, GameCard, PickRow } from "../src/lib/sports/types.ts";

function requireTestWebhook(): string {
  const test = process.env.DISCORD_TEST_WEBHOOK?.trim() ?? "";
  if (!test || !discordWebhookOk(test)) {
    console.error("DISCORD_TEST_WEBHOOK is missing or invalid. Refusing to post.");
    process.exit(1);
  }
  const routed = channelWebhook("test", "", process.env);
  if (!routed) {
    console.error("DISCORD_TEST_WEBHOOK collides with picks/results/alerts (or is invalid). Refusing.");
    process.exit(1);
  }
  if (webhookIdentity(routed) !== webhookIdentity(test)) {
    console.error("Resolved test webhook identity mismatch. Refusing.");
    process.exit(1);
  }
  const picks = channelWebhook("picks", "", process.env);
  if (picks && webhookIdentity(picks) === webhookIdentity(test)) {
    console.error("Refusing: TEST webhook matches picks webhook.");
    process.exit(1);
  }
  const results = channelWebhook("results", "", process.env);
  if (results && webhookIdentity(results) === webhookIdentity(test)) {
    console.error("Refusing: TEST webhook matches results webhook.");
    process.exit(1);
  }
  return routed;
}

const kick = new Date(Date.now() - 3 * 3600_000).toISOString();

const winPick = {
  id: -101,
  sport: "MLB",
  selection: "ATH ML",
  matchup: "TOR @ ATH",
  market: "moneyline",
  side: "home",
  lockedOdds: 144,
  lockedLine: null,
  units: 2,
  confidence: 61,
  modelProbability: 0.55,
  modelEdge: 2.1,
  edgePct: 2.1,
  modelVersion: "sample",
  reason: "TEST SAMPLE RESULT — not a real ticket.",
  startAt: kick,
  lockedOddsJson: {
    book: "DraftKings",
    details: null,
    homeMl: 144,
    awayMl: -170,
    homeSpread: null,
    awaySpread: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    openHomeSpread: null,
    openTotal: null,
    openHomeMl: null,
    source: "odds-api",
    capturedAt: new Date().toISOString(),
  },
  freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }),
  pickSource: "auto",
} as PickRow;

const winGame = {
  status: "final",
  sport: "MLB",
  league: "mlb",
  startAt: kick,
  away: { name: "Blue Jays", abbr: "TOR", score: 0 },
  home: { name: "Athletics", abbr: "ATH", score: 2 },
} as GameCard;

const winRecord: DeskRecord = {
  wins: 3, losses: 1, pushes: 0, units: 3.8, riskedUnits: 5, pending: 0,
};

const lossPick = {
  ...winPick,
  id: -102,
  sport: "NBA",
  selection: "Lakers -3.5",
  matchup: "GSW @ LAL",
  market: "spread",
  side: "home",
  lockedOdds: -110,
  lockedLine: -3.5,
  units: 1,
  freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true }),
} as PickRow;

const lossGame = {
  status: "final",
  sport: "NBA",
  league: "nba",
  startAt: kick,
  away: { name: "Warriors", abbr: "GSW", score: 118 },
  home: { name: "Lakers", abbr: "LAL", score: 112 },
} as GameCard;

const lossRecord: DeskRecord = {
  wins: 3, losses: 2, pushes: 0, units: 2.8, riskedUnits: 6, pending: 0,
};

async function main() {
  const hook = requireTestWebhook();
  const samples: Array<{
    label: string;
    pick: PickRow;
    game: GameCard;
    result: "WIN" | "LOSS";
    profit: number;
    record: DeskRecord;
  }> = [
    { label: "SAMPLE RESULT · WIN", pick: winPick, game: winGame, result: "WIN", profit: 2.88, record: winRecord },
    { label: "SAMPLE RESULT · LOSS", pick: lossPick, game: lossGame, result: "LOSS", profit: -1, record: lossRecord },
  ];

  for (const sample of samples) {
    const payload = buildOfficialResultPayload(
      sample.pick,
      sample.game,
      sample.result,
      sample.profit,
      sample.record,
    );
    const body = {
      content: `🧪 **TEST SAMPLE RESULT — NOT AN OFFICIAL GRADE** · ${sample.label}`,
      embeds: payload.embeds,
    };
    const sent = await postWebhook(hook, body);
    if (!sent.ok) {
      console.error(`Failed ${sample.label}:`, sent.error ?? "unknown");
      process.exit(1);
    }
    console.log(`Posted ${sample.label} → message ${sent.id}`);
  }
  console.log("Done. TEST RESULT samples posted to DISCORD_TEST_WEBHOOK / #test-lab only. No ledger writes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

