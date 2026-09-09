#!/usr/bin/env node
/**
 * One-shot: post 2 SAMPLE official-style embeds to DISCORD_TEST_WEBHOOK only.
 * Never touches picks/results/alerts webhooks. No DB / ledger writes.
 *
 *   DISCORD_TEST_WEBHOOK=https://discord.com/api/webhooks/... \
 *     node --experimental-strip-types scripts/discord-sample-embeds.ts
 */
import {
  buildOfficialPickPayload,
  discordWebhookOk,
  postWebhook,
} from "../src/lib/sports/discord.ts";
import { channelWebhook, webhookIdentity } from "../src/lib/sports/discord-routing.ts";
import type { GameCard, PickRow } from "../src/lib/sports/types.ts";

function requireTestWebhook(): string {
  const test = process.env.DISCORD_TEST_WEBHOOK?.trim() ?? "";
  if (!test || !discordWebhookOk(test)) {
    console.error("DISCORD_TEST_WEBHOOK is missing or invalid. Refusing to post.");
    process.exit(1);
  }
  const routed = channelWebhook("test", "", process.env);
  if (!routed) {
    console.error(
      "DISCORD_TEST_WEBHOOK collides with picks/results/alerts (or is invalid). Refusing.",
    );
    process.exit(1);
  }
  if (webhookIdentity(routed) !== webhookIdentity(test)) {
    console.error("Resolved test webhook identity mismatch. Refusing.");
    process.exit(1);
  }
  // Hard refuse if somehow equal to picks.
  const picks = channelWebhook("picks", "", process.env);
  if (picks && webhookIdentity(picks) === webhookIdentity(test)) {
    console.error("Refusing: TEST webhook matches picks webhook.");
    process.exit(1);
  }
  return routed;
}

const kick = new Date(Date.now() + 6 * 3600_000).toISOString();

const lockPick = {
  id: -1,
  sport: "NBA",
  selection: "Lakers -3.5",
  matchup: "GSW @ LAL",
  market: "spread",
  side: "home",
  lockedOdds: -110,
  lockedLine: -3.5,
  units: 1,
  confidence: 68,
  modelProbability: 0.61,
  modelEdge: 3.4,
  edgePct: 3.4,
  modelVersion: "sample",
  reason:
    "SAMPLE LOCK — not a real ticket. Lakers host Warriors with a playable number.\nWhy BoatBoyzPicks likes it:\n* Lakers are playing at home\n* verified DraftKings spread only",
  startAt: kick,
  lockedOddsJson: {
    book: "DraftKings",
    details: null,
    homeMl: null,
    awayMl: null,
    homeSpread: -3.5,
    awaySpread: 3.5,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
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
} as PickRow;

const lockGame = {
  status: "scheduled",
  sport: "NBA",
  league: "nba",
  startAt: kick,
  away: { name: "Warriors", abbr: "GSW", score: null },
  home: { name: "Lakers", abbr: "LAL", score: null },
} as GameCard;

const deskPick = {
  ...lockPick,
  id: -2,
  sport: "NFL",
  selection: "SEA -3",
  matchup: "DEN @ SEA",
  market: "spread",
  side: "home",
  lockedOdds: -110,
  lockedLine: -3,
  units: 0.5,
  confidence: 54,
  modelProbability: 0.54,
  modelEdge: 1.6,
  edgePct: 1.6,
  reason:
    "SAMPLE DESK PICK — soft floor, not a LOCK. Seahawks at home is the best available straight on this demo slate.\nWhy BoatBoyzPicks likes it:\n* Seahawks are playing at home\n* below hard-edge bar · verified DK only",
  freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true }),
} as PickRow;

const deskGame = {
  status: "scheduled",
  sport: "NFL",
  league: "nfl",
  startAt: kick,
  away: { name: "Broncos", abbr: "DEN", score: null },
  home: { name: "Seahawks", abbr: "SEA", score: null },
} as GameCard;

async function main() {
  const hook = requireTestWebhook();
  const samples: Array<{ label: string; pick: PickRow; game: GameCard }> = [
    { label: "SAMPLE 1 · LOCK", pick: lockPick, game: lockGame },
    { label: "SAMPLE 2 · BEST AVAILABLE / DESK PICK", pick: deskPick, game: deskGame },
  ];

  for (const sample of samples) {
    const payload = buildOfficialPickPayload(sample.pick, sample.game);
    const body = {
      content: `🧪 **TEST SAMPLE — NOT AN OFFICIAL PICK** · ${sample.label}`,
      embeds: payload.embeds,
    };
    const sent = await postWebhook(hook, body);
    if (!sent.ok) {
      console.error(`Failed ${sample.label}:`, sent.error ?? "unknown");
      process.exit(1);
    }
    console.log(`Posted ${sample.label} → message ${sent.id}`);
  }
  console.log("Done. Two TEST samples posted to DISCORD_TEST_WEBHOOK only.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
