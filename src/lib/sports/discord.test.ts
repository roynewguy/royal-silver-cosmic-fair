import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OFFICIAL_EMBED_COLOR,
  boldBetLine,
  buildDiscordMessage,
  buildOfficialPickEmbed,
  buildOfficialPickPayload,
  buildOfficialResultEmbed,
  buildOfficialResultPayload,
  buildOperatorPost,
  buildRecapMessage,
  buildTestPreviewMessage,
  discordWebhookOk,
  favoredLine,
  matchupVsChip,
  officialPlayHeadline,
  officialTierBadge,
  officialTierBadgePlain,
  parseResultWebhookBody,
  postWebhook,
  resolvePickTier,
  resolveWebhook,
  resultBadgePlain,
  serializeResultWebhookBody,
  unitsFieldLabel,
  verifiedPlaceBetUrl,
} from "./discord.ts";
import type { GameCard, PickRow } from "./types.ts";

test("rejects non-discord urls", () => {
  assert.equal(discordWebhookOk("https://example.com/api/webhooks/1/x"), false);
  assert.equal(discordWebhookOk("http://discord.com/api/webhooks/1/x"), false);
});

test("accepts discord webhook urls", () => {
  assert.equal(discordWebhookOk("https://discord.com/api/webhooks/123/abc"), true);
  assert.equal(discordWebhookOk("https://discordapp.com/api/webhooks/123/abc"), true);
});


test("webhook posts send BoatBoyzPicks User-Agent", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: "msg1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await postWebhook("https://discord.com/api/webhooks/123/abc", "health");
    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("User-Agent"), "BoatBoyzPicks/1.0");
    assert.equal(headers.get("Content-Type"), "application/json");
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.username, "BoatBoyzPicks");
    assert.equal(body.content, "health");
    assert.equal(body.flags, 4);
    assert.equal(body.embeds, undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test("webhook posts with embeds skip SUPPRESS_EMBEDS flag and keep username", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: "embed1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await postWebhook("https://discord.com/api/webhooks/123/abc", {
      content: "",
      embeds: [{ description: "card", color: OFFICIAL_EMBED_COLOR }],
    });
    assert.equal(r.ok, true);
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.username, "BoatBoyzPicks");
    assert.equal(body.content, undefined);
    assert.equal(body.flags, undefined);
    assert.equal(body.embeds.length, 1);
    assert.equal(body.embeds[0].color, OFFICIAL_EMBED_COLOR);
    assert.deepEqual(body.allowed_mentions, { parse: [] });
  } finally {
    globalThis.fetch = prev;
  }
});


test("operator freeform posts send the typed text and skip empty", () => {
  assert.equal(buildOperatorPost("   "), null);
  assert.equal(buildOperatorPost(""), null);
  const msg = buildOperatorPost("  Lakers ML tonight, fading the public  ");
  assert.equal(msg, "Lakers ML tonight, fading the public");
  assert.equal(buildOperatorPost("x".repeat(2000))?.length, 1900);
});


test("env webhook beats stored desk webhook", () => {
  const prev = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/env/token";
  const r = resolveWebhook("https://discord.com/api/webhooks/desk/token");
  assert.equal(r.source, "env");
  assert.match(r.url, /env\/token$/);
  if (prev === undefined) delete process.env.DISCORD_WEBHOOK_URL;
  else process.env.DISCORD_WEBHOOK_URL = prev;
});

test("play card has pick, favored %, units, score, and line", () => {
  const pick = {
    id: 9,
    sport: "NBA",
    selection: "Lakers ML",
    matchup: "GSW @ LAL",
    market: "moneyline",
    side: "home",
    lockedOdds: -135,
    lockedLine: null,
    units: 1,
    confidence: 67,
    modelProbability: 0.6,
    modelEdge: 3,
    edgePct: 3,
    modelVersion: "v2-nba",
    reason:
      "Lakers get the home spot against Warriors.\nWhy BoatBoyzPicks likes it:\n* Lakers are playing at home\n* opponent is missing Stephen Curry",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
  } as PickRow;
  const game = {
    status: "scheduled",
    away: { name: "Warriors", abbr: "GSW", score: null },
    home: { name: "Lakers", abbr: "LAL", score: null },
  } as GameCard;
  const msg = buildDiscordMessage(pick, game);
  assert.equal(favoredLine(pick), "BoatBoyzPicks Probability: 60%");
  assert.match(msg, /🔒 \*\*LOCK\*\*/);
  assert.match(msg, /BoatBoyzPicks OFFICIAL PLAY/);
  assert.match(msg, /\*\*Lakers ML\*\*/);
  assert.match(msg, /vs Warriors/);
  assert.match(msg, /BoatBoyzPicks Probability: 60%/);
  assert.match(msg, /Market /);
  assert.match(msg, /Estimated Edge:/);
  assert.match(msg, /DraftKings: -135/);
  assert.match(msg, /\*\*1u\*\*/);
  assert.match(msg, /💵 Stake:/);
  assert.match(msg, /WHY BoatBoyzPicks LIKES IT/);
  assert.match(msg, /playing at home/);
  assert.match(msg, /Score: Not started/);
  assert.match(msg, /Model: v2-nba/);
  assert.match(msg, /🎯 \*\*Lakers ML\*\*/);
  assert.match(msg, /📊 \*\*THE NUMBERS\*\*/);
  assert.doesNotMatch(msg, /Favored /);
  assert.doesNotMatch(msg, /current DK/i);
  assert.doesNotMatch(msg, /ESPN/);
});

test("test preview is labeled unofficial and includes desk notes", () => {
  const game = {
    sport: "MLB",
    league: "mlb",
    status: "scheduled",
    startAt: new Date("2026-09-04T01:40:00Z").toISOString(),
    away: { name: "Yankees", abbr: "NYY", score: null, record: "78-62", starter: { name: "Gerrit Cole", era: 3.2, whip: null, savePct: null, position: "P" } },
    home: { name: "Padres", abbr: "SD", score: null, record: "76-64", homeSplit: "42-28", starter: { name: "Dylan Cease", era: 3.5, whip: null, savePct: null, position: "P" } },
    odds: { details: "NYY -112", homeMl: 104, awayMl: -112, source: "espn" },
    injuries: [{ team: "home", player: "Fernando Tatis Jr.", status: "out", position: "RF" }],
    weather: "68° F, 8 mph",
    venue: "Petco Park",
    rank: null,
  } as GameCard;
  const msg = buildTestPreviewMessage(game);
  assert.match(msg, /TEST PREVIEW — NOT AN OFFICIAL PICK/);
  assert.match(msg, /MLB/);
  assert.match(msg, /NYY @ SD/);
  assert.match(msg, /Current odds: NYY -112/);
  assert.match(msg, /DESK NOTES/);
  assert.match(msg, /home/);
  assert.match(msg, /Tatis|weather|Cease|Cole/i);
  assert.match(msg, /not an official BoatBoyzPicks play/i);
});

test("soft-floor Discord payload is labeled BEST AVAILABLE / DESK PICK and always has a writeup", () => {
  const pick = {
    id: 11,
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
    modelEdge: 1.8,
    edgePct: 1.8,
    modelVersion: "v2-nfl",
    reason: "",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api", capturedAt: new Date("2026-09-04T01:00:00Z").toISOString() },
    freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true, marketProbability: 0.52 }),
  } as PickRow;
  const game = {
    status: "scheduled",
    league: "nfl",
    sport: "NFL",
    startAt: pick.startAt,
    away: { name: "Broncos", abbr: "DEN", score: null, record: "8-8", roadSplit: "3-5", starter: null },
    home: { name: "Seahawks", abbr: "SEA", score: null, record: "10-6", homeSplit: "6-2", starter: null },
    injuries: [],
    weather: "54° F, calm",
    odds: pick.lockedOddsJson,
    rank: null,
  } as unknown as GameCard;
  const msg = buildDiscordMessage(pick, game);
  assert.equal(resolvePickTier(pick), "soft_floor");
  assert.equal(officialTierBadge(pick), "📋 **BEST AVAILABLE / DESK PICK**");
  assert.match(msg, /^📋 \*\*BEST AVAILABLE \/ DESK PICK\*\*/m);
  assert.match(msg, /BEST AVAILABLE/);
  assert.match(msg, /DESK PICK/);
  assert.match(msg, /Soft floor/);
  assert.match(msg, /💵 Stake: \*\*0\.5u\*\*/);
  assert.doesNotMatch(msg, /\*\*1u\*\*/);
  // Soft-floor must never look like LOCK: no LOCK primary badge.
  assert.doesNotMatch(msg, /🔒\s*\*\*LOCK\*\*/);
  assert.doesNotMatch(msg, /\*\*LOCK\*\*/);
  assert.doesNotMatch(msg, /OFFICIAL PLAY · LOCK/);
  assert.doesNotMatch(officialPlayHeadline(pick), /\bLOCK\b/);
  assert.match(msg, /WHY BoatBoyzPicks LIKES IT/);
  assert.match(msg, /Seahawks|home|edge|slate|BoatBoyzPicks/i);
  assert.doesNotMatch(msg, /ESPN/);
});

test("LOCK and soft-floor headers differ when both tiers are present on the desk", () => {
  const base = {
    id: 1,
    sport: "NBA",
    selection: "Lakers ML",
    matchup: "GSW @ LAL",
    market: "moneyline",
    side: "home",
    lockedOdds: -135,
    lockedLine: null,
    units: 1,
    confidence: 67,
    modelProbability: 0.6,
    modelEdge: 3.2,
    edgePct: 3.2,
    modelVersion: "v2-nba",
    reason: "Lakers host Warriors.\nWhy BoatBoyzPicks likes it:\n* Lakers are playing at home",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
  } as PickRow;
  const lockPick = { ...base, freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }) } as PickRow;
  const softPick = {
    ...base,
    freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true }),
    units: 0.5,
    confidence: 52,
    modelEdge: 1.1,
    edgePct: 1.1,
  } as PickRow;
  const softFloorFlagOnly = {
    ...base,
    freezeJson: JSON.stringify({ softFloor: true }),
  } as PickRow;
  const lockMsg = buildDiscordMessage(lockPick);
  const softMsg = buildDiscordMessage(softPick);
  const softFlagMsg = buildDiscordMessage(softFloorFlagOnly);

  assert.equal(resolvePickTier(lockPick), "lock");
  assert.equal(officialTierBadge(lockPick), "🔒 **LOCK**");
  assert.match(lockMsg, /^🔒 \*\*LOCK\*\*/m);
  assert.match(lockMsg, /Hard-edge qualifying play/);
  assert.doesNotMatch(lockMsg, /BEST AVAILABLE/);
  assert.doesNotMatch(lockMsg, /DESK PICK/);

  assert.equal(resolvePickTier(softPick), "soft_floor");
  assert.equal(resolvePickTier(softFloorFlagOnly), "soft_floor");
  assert.match(softMsg, /^📋 \*\*BEST AVAILABLE \/ DESK PICK\*\*/m);
  assert.match(softFlagMsg, /^📋 \*\*BEST AVAILABLE \/ DESK PICK\*\*/m);
  assert.match(softMsg, /DESK PICK/);
  assert.doesNotMatch(softMsg, /🔒\s*\*\*LOCK\*\*/);
  assert.doesNotMatch(softMsg, /\*\*LOCK\*\*/);
  assert.doesNotMatch(softFlagMsg, /\*\*LOCK\*\*/);
  assert.doesNotMatch(officialPlayHeadline(softPick), /\bLOCK\b/);
  assert.doesNotMatch(officialPlayHeadline(softFloorFlagOnly), /\bLOCK\b/);

  assert.match(lockMsg, /WHY BoatBoyzPicks LIKES IT/);
  assert.match(softMsg, /WHY BoatBoyzPicks LIKES IT/);
  assert.match(lockMsg, /💵 Stake: \*\*1u\*\*/);
  assert.match(softMsg, /💵 Stake: \*\*0\.5u\*\*/);
});


test("official LOCK embed matches BetStars-style card shape with 1u", () => {
  const pick = {
    id: 9,
    sport: "NBA",
    selection: "Lakers -3.5",
    matchup: "GSW @ LAL",
    market: "spread",
    side: "home",
    lockedOdds: -110,
    lockedLine: -3.5,
    units: 1,
    confidence: 67,
    modelProbability: 0.6,
    modelEdge: 3.2,
    edgePct: 3.2,
    modelVersion: "v2-nba",
    reason:
      "Lakers get the home spot against Warriors. Model likes the number.\nWhy BoatBoyzPicks likes it:\n* Lakers are playing at home\n* Warriors missing Steph Curry",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api", capturedAt: new Date("2026-09-04T01:00:00Z").toISOString() },
    freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }),
  } as import("./types.ts").PickRow;
  const game = {
    status: "scheduled",
    away: { name: "Warriors", abbr: "GSW", score: null },
    home: { name: "Lakers", abbr: "LAL", score: null },
  } as import("./types.ts").GameCard;

  const embed = buildOfficialPickEmbed(pick, game);
  const payload = buildOfficialPickPayload(pick, game);

  assert.equal(embed.color, OFFICIAL_EMBED_COLOR);
  assert.equal(OFFICIAL_EMBED_COLOR, 0xD4AF37);
  assert.match(embed.author?.name ?? "", /🔒 LOCK/);
  assert.doesNotMatch(embed.author?.name ?? "", /BEST AVAILABLE/);
  assert.match(embed.description ?? "", /🏀 \*\*Lakers\*\* \| Warriors vs Lakers/);
  assert.match(embed.description ?? "", /\*\*Lakers -3\.5\*\* @ \*\*-110\*\*/);
  assert.match(embed.description ?? "", /`Warriors vs Lakers`/);
  assert.match(embed.description ?? "", /WHY BoatBoyzPicks LIKES IT/);
  assert.match(embed.description ?? "", /playing at home|missing Steph|home spot/i);
  assert.equal(boldBetLine(pick), "**Lakers -3.5** @ **-110**");
  assert.equal(matchupVsChip(pick, game), "Warriors vs Lakers");
  assert.equal(unitsFieldLabel(pick), "1u LOCK");
  assert.equal(officialTierBadgePlain(pick), "🔒 LOCK");

  const names = (embed.fields ?? []).map((f) => f.name);
  assert.deepEqual(names, ["Edge %", "Book", "Units", "Kick PT"]);
  const byName = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
  assert.match(byName["Edge %"]!, /\+3\.2%/);
  assert.equal(byName.Book, "DraftKings");
  assert.equal(byName.Units, "1u LOCK");
  assert.match(byName["Kick PT"]!, /PT$/);
  assert.match(embed.footer?.text ?? "", /^BoatBoyzPicks · .+ PT$/);
  assert.equal(embed.url, undefined);
  assert.equal(payload.content, "");
  assert.equal(payload.embeds?.length, 1);
  assert.doesNotMatch(JSON.stringify(embed), /https?:\/\/sportsbook\.draftkings/);
});

test("official soft-floor embed is BEST AVAILABLE / DESK PICK with 0.5u desk and never LOCK", () => {
  const pick = {
    id: 11,
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
    modelEdge: 1.8,
    edgePct: 1.8,
    modelVersion: "v2-nfl",
    reason: "",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api", capturedAt: new Date("2026-09-04T01:00:00Z").toISOString() },
    freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true, marketProbability: 0.52 }),
  } as import("./types.ts").PickRow;
  const game = {
    status: "scheduled",
    league: "nfl",
    sport: "NFL",
    startAt: pick.startAt,
    away: { name: "Broncos", abbr: "DEN", score: null, record: "8-8", roadSplit: "3-5", starter: null },
    home: { name: "Seahawks", abbr: "SEA", score: null, record: "10-6", homeSplit: "6-2", starter: null },
    injuries: [],
    weather: "54° F, calm",
    odds: pick.lockedOddsJson,
    rank: null,
  } as unknown as import("./types.ts").GameCard;

  const embed = buildOfficialPickEmbed(pick, game);
  assert.equal(resolvePickTier(pick), "soft_floor");
  assert.equal(officialTierBadgePlain(pick), "📋 BEST AVAILABLE / DESK PICK");
  assert.equal(unitsFieldLabel(pick), "0.5u desk");
  assert.match(embed.author?.name ?? "", /BEST AVAILABLE \/ DESK PICK/);
  assert.doesNotMatch(embed.author?.name ?? "", /\bLOCK\b/);
  assert.doesNotMatch(embed.description ?? "", /\bLOCK\b/);
  assert.doesNotMatch(JSON.stringify(embed.fields), /\bLOCK\b/);
  const units = embed.fields?.find((f) => f.name === "Units")?.value;
  assert.equal(units, "0.5u desk");
  assert.match(embed.description ?? "", /🏈 \*\*Seahawks\*\*/);
  assert.match(embed.description ?? "", /`Broncos vs Seahawks`/);
  assert.match(embed.description ?? "", /Soft floor/);
  assert.match(embed.description ?? "", /WHY BoatBoyzPicks LIKES IT/);
  assert.equal(embed.color, OFFICIAL_EMBED_COLOR);
});

test("ML bold bet line and optional Place Bet only for real DK deep-link", () => {
  const base = {
    id: 12,
    sport: "NFL",
    selection: "KC ML",
    matchup: "KC @ BUF",
    market: "moneyline",
    side: "away",
    lockedOdds: 100,
    lockedLine: null,
    units: 1,
    confidence: 61,
    modelProbability: 0.55,
    modelEdge: 2.5,
    edgePct: 2.5,
    reason: "Chiefs priced right on the road.",
    startAt: new Date("2026-09-04T00:20:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api", eventId: "odds-api-not-a-dk-link" },
    freezeJson: JSON.stringify({ pickTier: "lock" }),
  } as import("./types.ts").PickRow;

  assert.equal(boldBetLine(base), "**KC ML** @ **+100**");
  assert.equal(verifiedPlaceBetUrl(base), undefined);
  assert.equal(buildOfficialPickEmbed(base).url, undefined);

  const withFake = {
    ...base,
    freezeJson: JSON.stringify({ pickTier: "lock", placeBetUrl: "https://example.com/bet/123" }),
  } as import("./types.ts").PickRow;
  assert.equal(verifiedPlaceBetUrl(withFake), undefined);
  assert.equal(buildOfficialPickEmbed(withFake).url, undefined);

  const withOddsApiLookalike = {
    ...base,
    freezeJson: JSON.stringify({
      pickTier: "lock",
      placeBetUrl: "https://api.the-odds-api.com/v4/events/abc",
    }),
  } as import("./types.ts").PickRow;
  assert.equal(verifiedPlaceBetUrl(withOddsApiLookalike), undefined);

  const real = {
    ...base,
    freezeJson: JSON.stringify({
      pickTier: "lock",
      placeBetUrl: "https://sportsbook.draftkings.com/event/12345",
    }),
  } as import("./types.ts").PickRow;
  assert.equal(verifiedPlaceBetUrl(real), "https://sportsbook.draftkings.com/event/12345");
  assert.equal(buildOfficialPickEmbed(real).url, "https://sportsbook.draftkings.com/event/12345");
});

test("LOCK vs soft-floor embed badges and units differ on the same slate", () => {
  const base = {
    id: 1,
    sport: "NBA",
    selection: "Lakers ML",
    matchup: "GSW @ LAL",
    market: "moneyline",
    side: "home",
    lockedOdds: -135,
    lockedLine: null,
    units: 1,
    confidence: 67,
    modelProbability: 0.6,
    modelEdge: 3.2,
    edgePct: 3.2,
    reason: "Lakers host Warriors.\nWhy BoatBoyzPicks likes it:\n* Lakers are playing at home",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
  } as import("./types.ts").PickRow;
  const lockPick = { ...base, freezeJson: JSON.stringify({ pickTier: "lock", softFloor: false }) } as import("./types.ts").PickRow;
  const softPick = {
    ...base,
    freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true }),
    units: 0.5,
    confidence: 52,
    modelEdge: 1.1,
    edgePct: 1.1,
  } as import("./types.ts").PickRow;

  const lockEmbed = buildOfficialPickEmbed(lockPick);
  const softEmbed = buildOfficialPickEmbed(softPick);
  assert.match(lockEmbed.author?.name ?? "", /🔒 LOCK/);
  assert.match(softEmbed.author?.name ?? "", /BEST AVAILABLE \/ DESK PICK/);
  assert.doesNotMatch(softEmbed.author?.name ?? "", /\bLOCK\b/);
  assert.doesNotMatch(JSON.stringify(softEmbed), /\bLOCK\b/);
  assert.equal(lockEmbed.fields?.find((f) => f.name === "Units")?.value, "1u LOCK");
  assert.equal(softEmbed.fields?.find((f) => f.name === "Units")?.value, "0.5u desk");
  assert.equal(lockEmbed.color, softEmbed.color);
  assert.equal(lockEmbed.color, 0xD4AF37);
});

test("official result embed is gold-bar WIN/LOSS/PUSH with clean fields and never LOCK", () => {
  const pick = {
    id: 42,
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
    reason: "Athletics ML",
    startAt: new Date("2026-09-04T02:30:00Z").toISOString(),
    lockedOddsJson: { book: "DraftKings", source: "odds-api" },
    freezeJson: JSON.stringify({ pickTier: "soft_floor", softFloor: true }),
    pickSource: "auto",
  } as import("./types.ts").PickRow;
  const game = {
    status: "final",
    sport: "MLB",
    away: { name: "Blue Jays", abbr: "TOR", score: 0 },
    home: { name: "Athletics", abbr: "ATH", score: 2 },
  } as import("./types.ts").GameCard;
  const record = { wins: 3, losses: 1, pushes: 0, units: 3.8, riskedUnits: 5, pending: 0 };

  const winEmbed = buildOfficialResultEmbed(pick, game, "WIN", 2.88, record);
  assert.equal(winEmbed.color, OFFICIAL_EMBED_COLOR);
  assert.equal(OFFICIAL_EMBED_COLOR, 0xD4AF37);
  assert.match(winEmbed.author?.name ?? "", /✅ WIN/);
  assert.match(winEmbed.author?.name ?? "", /BoatBoyzPicks RESULT/);
  assert.doesNotMatch(winEmbed.author?.name ?? "", /\bLOCK\b/);
  assert.doesNotMatch(JSON.stringify(winEmbed), /\bLOCK\b/);
  assert.match(winEmbed.description ?? "", /⚾ \*\*MLB\*\*/);
  assert.match(winEmbed.description ?? "", /\*\*ATH ML\*\* @ \*\*\+144\*\*/);
  const names = (winEmbed.fields ?? []).map((f) => f.name);
  assert.deepEqual(names, ["Result", "Sport", "Pick", "Final", "This ticket", "W-L-P", "Kick PT"]);
  const byName = Object.fromEntries((winEmbed.fields ?? []).map((f) => [f.name, f.value]));
  assert.equal(byName.Result, "✅ WIN");
  assert.equal(byName.Sport, "MLB");
  assert.equal(byName.Pick, "ATH ML (+144)");
  assert.equal(byName.Final, "Final TOR 0 @ ATH 2");
  assert.equal(byName["This ticket"], "+2.88u");
  assert.equal(byName["W-L-P"], "3-1-0 · +3.80u · ROI 76.0%");
  assert.match(byName["Kick PT"]!, /PT$/);
  assert.match(winEmbed.footer?.text ?? "", /^BoatBoyzPicks · .+ PT$/);

  const lossEmbed = buildOfficialResultEmbed(pick, game, "LOSS", -2, { ...record, wins: 2, losses: 2, units: -0.2, riskedUnits: 5 });
  assert.match(lossEmbed.author?.name ?? "", /❌ LOSS/);
  assert.equal(lossEmbed.color, OFFICIAL_EMBED_COLOR);

  const pushEmbed = buildOfficialResultEmbed(pick, game, "PUSH", 0, { ...record, pushes: 1 });
  assert.match(pushEmbed.author?.name ?? "", /↔️ PUSH/);
  assert.equal(resultBadgePlain("PUSH"), "↔️ PUSH");

  const payload = buildOfficialResultPayload(pick, game, "WIN", 2.88, record);
  assert.equal(payload.content, "");
  assert.equal(payload.embeds?.length, 1);

  const wire = serializeResultWebhookBody(payload);
  const parsed = parseResultWebhookBody(wire);
  assert.equal(typeof parsed, "object");
  assert.equal((parsed as { embeds?: unknown[] }).embeds?.length, 1);
  assert.equal(parseResultWebhookBody("**WIN** · MLB\nATH ML"), "**WIN** · MLB\nATH ML");
  assert.match(buildRecapMessage(pick, game, "WIN", 2.88, record), /\*\*WIN\*\* · MLB/);
});

test("postWebhook marks Discord 401/403 as authFailure, not uncertain", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    const res = await postWebhook("https://discord.com/api/webhooks/1/abc", "hello");
    assert.equal(res.ok, false);
    assert.equal(res.uncertain, false);
    assert.equal(res.authFailure, true);
    assert.match(res.error ?? "", /401/);
  } finally {
    globalThis.fetch = original;
  }
});

test("postWebhook marks Discord 403 as authFailure for alerts path", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("forbidden", { status: 403 })) as typeof fetch;
  try {
    const res = await postWebhook("https://discord.com/api/webhooks/1/abc", "hello");
    assert.equal(res.ok, false);
    assert.equal(res.authFailure, true);
    assert.equal(res.uncertain, false);
  } finally {
    globalThis.fetch = original;
  }
});
