import { formatAmerican, formatKick, formatUnits } from "../utils.ts";
import { sportEmoji } from "./discord.ts";
import { isOfficialDay } from "./day.ts";
import type { DeskRecord, GameCard, PickRow } from "./types.ts";

export type DiscordPreset = {
  id: string;
  label: string;
  body: string;
};

function recordLine(record: DeskRecord): string {
  return `${record.wins}-${record.losses}-${record.pushes}  ${formatUnits(record.units)}`;
}

function officialCard(picks: PickRow[]): PickRow[] {
  return picks.filter(
    (p) =>
      Boolean(p.officialKey) &&
      (p.status === "queued" || p.status === "posting" || p.status === "posted") &&
      !p.result,
  );
}

function latestCash(picks: PickRow[]): PickRow | undefined {
  return picks.find((p) => p.result === "WIN" && p.status === "graded");
}

function liveGames(games: GameCard[]): GameCard[] {
  return games.filter((g) => g.status === "in_progress");
}

function nextKick(games: GameCard[]): GameCard | undefined {
  return games
    .filter((g) => g.status === "scheduled")
    .slice()
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))[0];
}

function cardBody(picks: PickRow[]): string {
  if (!picks.length) {
    return [
      "🌊 BoatBoyzPicks UPDATE",
      "",
      "No official plays locked yet.",
      "Live slate days still post BEST AVAILABLE / DESK PICKs when the hard edge is quiet.",
      "",
      "Not an official pick post.",
    ].join("\n");
  }
  return [
    "🌊 BoatBoyzPicks TODAY'S CARD",
    "",
    ...picks.map((p) => `${sportEmoji(p.sport)} ${p.sport}  **${p.selection}**  ${formatAmerican(p.lockedOdds)}`),
    "",
    "Official tickets still verify at DraftKings before they post.",
    "This message is a card update, not a new pick.",
  ].join("\n");
}

export function buildDiscordPresets(input: {
  record: DeskRecord;
  picks: PickRow[];
  games: GameCard[];
  now?: Date;
}): DiscordPreset[] {
  const now = input.now ?? new Date();
  const card = officialCard(input.picks);
  const cash = latestCash(input.picks);
  const live = liveGames(input.games)[0];
  const next = nextKick(input.games);
  const todayCount = input.games.filter((g) => g.status === "scheduled" && isOfficialDay(g.startAt, now)).length;

  return [
    { id: "card", label: "Today's card", body: cardBody(card) },
    {
      id: "pass",
      label: "PASS",
      body: [
        "🌊 BoatBoyzPicks PASS",
        "",
        "No play on this window.",
        "We'd rather sit than force a bet.",
        "",
        "Not an official pick.",
      ].join("\n"),
    },
    {
      id: "record",
      label: "Record",
      body: ["🌊 BoatBoyzPicks RECORD", "", recordLine(input.record), "", "Official auto card only."].join("\n"),
    },
    {
      id: "cash",
      label: "Cash",
      body: cash
        ? [
            "🌊 BoatBoyzPicks CASH",
            "",
            `${sportEmoji(cash.sport)} ${cash.sport}`,
            `**${cash.selection}**`,
            "",
            `Desk ${recordLine(input.record)}`,
          ].join("\n")
        : ["🌊 BoatBoyzPicks CASH", "", "**[TEAM / PLAY]**", "", "Hit. On to the next.", "", `Desk ${recordLine(input.record)}`].join("\n"),
    },
    {
      id: "live",
      label: "Live look",
      body: live
        ? [
            "🌊 BoatBoyzPicks LIVE LOOK",
            "",
            `${sportEmoji(live.sport)} ${live.sport}`,
            `${live.away.abbr} ${live.away.score ?? "—"} @ ${live.home.abbr} ${live.home.score ?? "—"}`,
            live.shortDetail || live.clock || "In progress",
            "",
            "Watching it. Not a new official pick.",
          ].join("\n")
        : [
            "🌊 BoatBoyzPicks LIVE LOOK",
            "",
            "**[SPORT]**  [AWAY] — @ [HOME] —",
            "[period / clock]",
            "",
            "Watching it. Not a new official pick.",
          ].join("\n"),
    },
    {
      id: "injury",
      label: "Injury",
      body: [
        "🌊 BoatBoyzPicks NOTE",
        "",
        next
          ? `${sportEmoji(next.sport)} ${next.away.abbr} @ ${next.home.abbr}`
          : "[SPORT]  [AWAY] @ [HOME]",
        "",
        "[PLAYER] is [OUT / QUESTIONABLE].",
        "Sitting this one unless the number moves.",
        "",
        "Desk note. Not an official pick.",
      ].join("\n"),
    },
    {
      id: "lock",
      label: "Lock in",
      body: [
        "🌊 BoatBoyzPicks LOCK IN",
        "",
        next
          ? `${sportEmoji(next.sport)} ${next.away.abbr} @ ${next.home.abbr}  ${formatKick(next.startAt, "America/Los_Angeles")} PT`
          : "[GAME]  [TIME] PT",
        "",
        "Get the number in before kick.",
        "",
        "Reminder only. Not a new official pick.",
      ].join("\n"),
    },
    {
      id: "slate",
      label: "Slate",
      body: [
        "🌊 BoatBoyzPicks SLATE",
        "",
        todayCount ? `${todayCount} games on today's PT board.` : "Scanning today's board.",
        card.length ? `${card.length} official play${card.length === 1 ? "" : "s"} in the window.` : "No official plays locked yet.",
        "",
        "Quality first. Soft floor keeps the desk live when the hard gate is empty.",
      ].join("\n"),
    },
    {
      id: "welcome",
      label: "Welcome",
      body: [
        "🌊 WELCOME TO BoatBoyzPicks",
        "",
        "We scan the whole slate.",
        "We post the strongest 1–6 plays.",
        "Hard edge = LOCK. Soft floor = BEST AVAILABLE / DESK PICK.",
        "",
        "Official picks verify at DraftKings before they go out.",
        "This channel is the bot. Sit back.",
      ].join("\n"),
    },
    {
      id: "note",
      label: "Desk note",
      body: [
        "🌊 BoatBoyzPicks NOTE",
        "",
        "[note]",
        "",
        "Desk note. Not an official pick.",
      ].join("\n"),
    },
  ];
}

