import { injuryNotes } from "./models/injury.ts";
import type { GameCard, RankPick, Side } from "./types.ts";

function pickedTeam(game: GameCard, side: Side) {
  if (side === "away") return game.away;
  if (side === "home") return game.home;
  return null;
}

function otherTeam(game: GameCard, side: Side) {
  if (side === "away") return game.home;
  if (side === "home") return game.away;
  return null;
}

function outdoor(game: GameCard): boolean {
  return game.league === "nfl" || game.league === "ncaaf" || game.league === "mlb" || game.league === "mls";
}

export function whyBullets(game: GameCard, rank: Pick<RankPick, "side"> & Partial<RankPick>): string[] {
  const bullets: string[] = [];
  const side = rank.side;
  const picked = pickedTeam(game, side);
  const other = otherTeam(game, side);

  if (side === "home") bullets.push(`${game.home.name} are playing at home`);
  if (side === "away") bullets.push(`${game.away.name} still grade as the side despite the road spot`);
  if (side === "over" || side === "under") bullets.push(`lean is ${side} on the total`);

  if (picked?.starter?.name) {
    const extra =
      picked.starter.era != null
        ? ` (ERA ${picked.starter.era.toFixed(2)})`
        : picked.starter.savePct != null
          ? ` (SV% ${(picked.starter.savePct * 100).toFixed(1)})`
          : "";
    bullets.push(`${picked.starter.name} is listed to start${extra}`);
  }
  if (other?.starter?.name && game.league === "mlb") {
    bullets.push(`${other.name} listed ${other.starter.name}`);
  }

  const oppOut = other ? injuryNotes(game, side === "home" ? "away" : "home") : [];
  if (oppOut[0]) {
    const player = oppOut[0].replace(/\s+(OUT|DOUBTFUL)$/i, "");
    bullets.push(`opponent is missing ${player}`);
  }
  const ownOut = picked ? injuryNotes(game, side === "away" ? "away" : "home") : [];
  if (ownOut[0] && side !== "over" && side !== "under") {
    const player = ownOut[0].replace(/\s+(OUT|DOUBTFUL)$/i, "");
    bullets.push(`${picked?.name ?? "this side"} has ${player} listed out/doubtful`);
  }

  if (game.weather && outdoor(game)) bullets.push(`weather ${game.weather}`);

  if (side === "home" && game.home.homeSplit) {
    bullets.push(`home profile ${game.home.homeSplit} vs road ${game.away.roadSplit ?? game.away.record ?? "—"}`);
  } else if (side === "away" && game.away.roadSplit) {
    bullets.push(`road profile ${game.away.roadSplit} vs home ${game.home.homeSplit ?? game.home.record ?? "—"}`);
  } else if (game.home.record && game.away.record) {
    bullets.push(`records ${game.away.record} @ ${game.home.record}`);
  }

  if (bullets.length < 2) {
    const first = String(rank.why ?? "")
      .split(/[.;]/)
      .map((s) => s.trim())
      .find((s) => s.length > 12);
    if (first) bullets.push(first);
  }

  const uniq = [...new Set(bullets.map((b) => b.replace(/\s+/g, " ").trim()))].filter(Boolean);
  return uniq.slice(0, 5);
}

export function whyWriteup(game: GameCard, rank: Pick<RankPick, "side"> & Partial<RankPick>): string {
  const side = rank.side;
  const home = game.home.name;
  const away = game.away.name;
  const bits: string[] = [];
  const favorite =
    game.odds?.homeMl != null && game.odds?.awayMl != null
      ? game.odds.homeMl <= game.odds.awayMl
        ? "home"
        : "away"
      : side === "away"
        ? "away"
        : "home";

  if (side === "home") {
    bits.push(
      favorite === "home"
        ? `${home} are favored to win at home against ${away}.`
        : `${home} get the home spot as an underdog against ${away}.`,
    );
  } else if (side === "away") {
    bits.push(
      favorite === "away"
        ? `${away} are favored to win on the road at ${home}.`
        : `${away} are the road underdog at ${home}, and the number still looks like value.`,
    );
  } else if (side === "over" || side === "under") {
    bits.push(`This is a ${side} on ${away} at ${home}.`);
  } else {
    bits.push(`${away} visit ${home}.`);
  }

  const starter = pickedTeam(game, side)?.starter?.name;
  if (starter) bits.push(`${starter} is the listed starter.`);

  const opp = otherTeam(game, side);
  const oppOut = opp ? injuryNotes(game, side === "home" ? "away" : "home") : [];
  if (oppOut[0]) {
    bits.push(`Opposite side is missing ${oppOut[0].replace(/\s+(OUT|DOUBTFUL)$/i, "")}.`);
  }

  const picked = pickedTeam(game, side);
  if (picked?.record && opp?.record) {
    bits.push(`${picked.name} enter at ${picked.record} vs ${opp.record}.`);
  }

  if (game.weather && outdoor(game)) bits.push(`Weather: ${game.weather}.`);
  else if (!outdoor(game) && (side === "home" || side === "away")) bits.push("Indoor spot, so weather is not a factor.");

  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export function formatWhy(game: GameCard, rank: Pick<RankPick, "side"> & Partial<RankPick>): string {
  const writeup = whyWriteup(game, rank);
  const lines = whyBullets(game, rank).map((b) => `* ${b}`);
  if (lines.length === 0 && !writeup) return rank.why || "Board notes only.";
  return [writeup, "Why BoatBoyz likes it:", ...lines].filter(Boolean).join("\n");
}

/** Default Discord writeup for any posted play. Operator notes get appended, never replace facts. */
export function defaultPlayReason(game: GameCard, side: Side, note?: string | null): string {
  const generated = formatWhy(game, { side });
  const extra = (note ?? "").trim();
  if (!extra) return generated;
  if (/Why BoatBoyz likes it:/i.test(extra)) return extra;
  return `${generated}\n* ${extra}`;
}

/** Matchup notes for a test preview — facts only, no official pick. */
export function previewNotes(game: GameCard): { writeup: string; bullets: string[] } {
  if (game.rank) {
    return { writeup: whyWriteup(game, game.rank), bullets: whyBullets(game, game.rank) };
  }
  const homeMl = game.odds.homeMl;
  const awayMl = game.odds.awayMl;
  const favorite: Side =
    homeMl != null && awayMl != null ? (homeMl <= awayMl ? "home" : "away") : "home";
  const fake = { side: favorite, why: "" } as Pick<RankPick, "side">;
  const bullets = whyBullets(game, fake);
  const favored = favorite === "home" ? game.home.name : game.away.name;
  const juice = favorite === "home" ? homeMl : awayMl;
  const price = juice != null ? (juice > 0 ? `+${juice}` : String(juice)) : null;
  const writeup = [
    `${game.home.name} are at home against ${game.away.name}.`,
    price ? `Current board has ${favored} around ${price}.` : null,
    game.weather && outdoor(game) ? `Weather: ${game.weather}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { writeup, bullets };
}

export function parseWhy(reason: string): { writeup: string; bullets: string[] } {
  const raw = (reason || "").trim();
  const idx = raw.search(/Why BoatBoyz likes it:/i);
  if (idx >= 0) {
    const writeup = raw.slice(0, idx).trim();
    const rest = raw.slice(idx).replace(/^Why BoatBoyz likes it:\s*/i, "");
    const bullets = rest
      .split(/\n/)
      .map((s) => s.replace(/^[•*-]\s*/, "").trim())
      .filter(Boolean);
    return { writeup, bullets: bullets.slice(0, 5) };
  }
  const lines = raw
    .split(/\n/)
    .map((s) => s.replace(/^[•*-]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return { writeup: "", bullets: lines.slice(0, 5) };
  return { writeup: raw, bullets: [] };
}
