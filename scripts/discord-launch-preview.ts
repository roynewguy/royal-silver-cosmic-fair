#!/usr/bin/env node
/**
 * Safe TEST-webhook preview of launch Discord cards.
 * Never posts to official picks, results, free, alerts, or Model Lab.
 *
 *   DISCORD_TEST_WEBHOOK=https://discord.com/api/webhooks/... \
 *     npm run discord:launch-preview
 */
import {
  buildNoPlayPayload,
  buildOfficialPickPayload,
  buildOfficialResultPayload,
  buildOwnerAlertPayload,
  discordWebhookOk,
  launchPreviewLabel,
  postWebhook,
  type LaunchPreviewKind,
} from "../src/lib/sports/discord.ts";
import { resolveTestWebhook, channelWebhook, webhookIdentity } from "../src/lib/sports/discord-routing.ts";
import type { DeskRecord, GameCard, PickRow } from "../src/lib/sports/types.ts";

function requireTestWebhook(): string {
  const test = process.env.DISCORD_TEST_WEBHOOK?.trim() ?? "";
  if (!test || !discordWebhookOk(test)) {
    console.error("DISCORD_TEST_WEBHOOK is missing or invalid. Refusing to post.");
    process.exit(1);
  }
  const resolved = resolveTestWebhook(process.env);
  if (!resolved.url) {
    console.error(`Refusing: ${resolved.reason ?? "TEST webhook unsafe"}.`);
    process.exit(1);
  }
  const picks = channelWebhook("picks", "", process.env);
  const results = channelWebhook("results", "", process.env);
  const alerts = channelWebhook("alerts", "", process.env);
  const free = channelWebhook("free", "", process.env);
  const lab = channelWebhook("lab", "", process.env);
  for (const [name, url] of Object.entries({ picks, results, alerts, free, lab })) {
    if (url && webhookIdentity(url) === webhookIdentity(test)) {
      console.error(`Refusing: TEST webhook matches ${name}.`);
      process.exit(1);
    }
  }
  return resolved.url;
}

const kick = new Date(Date.now() + 6 * 3600_000).toISOString();
const postedAt = new Date().toISOString();

const lockPick = {
  id: 20,
  sport: "MLB",
  selection: "Dodgers ML",
  matchup: "SD @ LAD",
  market: "moneyline",
  side: "home",
  lockedOdds: -125,
  lockedLine: null,
  units: 1,
  confidence: 68,
  modelProbability: 0.61,
  modelEdge: 3.4,
  edgePct: 3.4,
  modelVersion: "v2-mlb",
  reason: "TEST SAMPLE — not a real ticket.",
  startAt: kick,
  postedAt,
  lockedOddsJson: {
    book: "DraftKings",
    source: "odds-api",
    capturedAt: postedAt,
  },
  freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }),
  officialKey: "mlb:test:official",
} as PickRow;

const lockGame = {
  status: "scheduled",
  sport: "MLB",
  league: "mlb",
  startAt: kick,
  away: { name: "Padres", abbr: "SD", score: null },
  home: { name: "Dodgers", abbr: "LAD", score: null },
} as GameCard;

const finalGame = {
  ...lockGame,
  status: "final",
  away: { name: "Padres", abbr: "SD", score: 1 },
  home: { name: "Dodgers", abbr: "LAD", score: 4 },
} as GameCard;

const record: DeskRecord = { wins: 12, losses: 8, pushes: 1, units: 4.2, riskedUnits: 21, pending: 0 };

async function main() {
  const hook = requireTestWebhook();
  const kinds: LaunchPreviewKind[] = [
    "official-lock",
    "result-win",
    "result-loss",
    "result-push",
    "result-void",
    "no-play",
    "operator-alert",
  ];
  for (const kind of kinds) {
    const label = launchPreviewLabel(kind);
    const payload =
      kind === "official-lock" ? buildOfficialPickPayload(lockPick, lockGame)
      : kind === "result-win" ? buildOfficialResultPayload(lockPick, finalGame, "WIN", 0.8, { ...record, wins: 13, units: 5 })
      : kind === "result-loss" ? buildOfficialResultPayload(lockPick, { ...finalGame, home: { ...finalGame.home, score: 0 }, away: { ...finalGame.away, score: 3 } }, "LOSS", -1, { ...record, losses: 9, units: 3.2 })
      : kind === "result-push" ? buildOfficialResultPayload(lockPick, finalGame, "PUSH", 0, { ...record, pushes: 2 })
      : kind === "result-void" ? buildOfficialResultPayload(lockPick, { ...finalGame, status: "cancelled" }, "VOID", 0, record)
      : kind === "no-play" ? buildNoPlayPayload()
      : buildOwnerAlertPayload("DISCORD_DELIVERY_UNKNOWN", "TEST SAMPLE — delivery unknown. Do not resend.");
    const body = {
      content: `🧪 **${label} — NOT AN OFFICIAL PICK**`,
      embeds: payload.embeds,
    };
    const sent = await postWebhook(hook, body);
    if (!sent.ok) {
      console.error(`Failed ${kind}:`, sent.error ?? "unknown");
      process.exit(1);
    }
    console.log(`Posted ${label} → ${sent.id}`);
  }
  console.log("Done. Launch preview posted to DISCORD_TEST_WEBHOOK only.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
