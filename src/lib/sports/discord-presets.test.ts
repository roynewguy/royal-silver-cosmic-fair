import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDiscordPresets } from "./discord-presets.ts";
import type { DeskRecord, GameCard, PickRow } from "./types.ts";

const record: DeskRecord = {
  wins: 12,
  losses: 8,
  pushes: 1,
  units: 3.2,
  pending: 0,
};

test("presets fill from the live card and never look like official auto tickets", () => {
  const presets = buildDiscordPresets({
    record,
    picks: [
      {
        id: 1,
        officialKey: "mlb:1:official",
        status: "queued",
        result: null,
        sport: "MLB",
        selection: "MIA ML",
        lockedOdds: 135,
      } as PickRow,
    ],
    games: [
      {
        status: "in_progress",
        sport: "NBA",
        away: { abbr: "BOS", score: 76, name: "Celtics", logo: null, record: null, homeSplit: null, roadSplit: null, starter: null },
        home: { abbr: "LAL", score: 71, name: "Lakers", logo: null, record: null, homeSplit: null, roadSplit: null, starter: null },
        shortDetail: "3Q 6:42",
        startAt: new Date().toISOString(),
      } as GameCard,
    ],
  });
  const ids = presets.map((p) => p.id);
  assert.deepEqual(ids, ["card", "pass", "record", "cash", "live", "injury", "lock", "slate", "welcome", "custom"]);
  const card = presets.find((p) => p.id === "card")!;
  assert.match(card.body, /TODAY'S CARD/);
  assert.match(card.body, /MIA ML/);
  assert.match(card.body, /not a new pick/i);
  const live = presets.find((p) => p.id === "live")!;
  assert.match(live.body, /BOS 76 @ LAL 71/);
  assert.match(live.body, /Not a new official pick/);
  const rec = presets.find((p) => p.id === "record")!;
  assert.match(rec.body, /12-8-1/);
  assert.match(rec.body, /\+3\.20u/);
  for (const p of presets) {
    assert.doesNotMatch(p.body, /BOATBOYZ OFFICIAL PLAY/);
  }
});

test("empty board still gives a PASS and blank custom template", () => {
  const presets = buildDiscordPresets({ record, picks: [], games: [] });
  assert.match(presets.find((p) => p.id === "pass")!.body, /No play on this window/);
  assert.match(presets.find((p) => p.id === "custom")!.body, /Operator post/);
  assert.match(presets.find((p) => p.id === "card")!.body, /No official plays locked yet/);
});
