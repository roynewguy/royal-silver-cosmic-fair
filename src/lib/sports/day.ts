const TZ = "America/Los_Angeles";

export function ptDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Official BoatBoyz card: games that start on today's PT calendar date. */
export function isOfficialDay(startAt: string, now = new Date()): boolean {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return false;
  return ptDayKey(d) === ptDayKey(now);
}

export function officialKey(league: string, gameId: string): string {
  return `${league}:${gameId}:official`;
}
