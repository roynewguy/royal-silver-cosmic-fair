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

export function ptYmd(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = ptDayKey(date).split("-").map(Number);
  return { y, m, d };
}

export function addYmd(ymd: { y: number; m: number; d: number }, days: number): { y: number; m: number; d: number } {
  const utc = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days, 12, 0, 0));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

export function ymdToEspn(ymd: { y: number; m: number; d: number }): string {
  return `${ymd.y}${String(ymd.m).padStart(2, "0")}${String(ymd.d).padStart(2, "0")}`;
}

/** Unique ESPN scoreboard dates for a 10-minute tick: yesterday, today, tomorrow in PT. */
export function scanDateKeys(now = new Date()): string[] {
  const today = ptYmd(now);
  return [-1, 0, 1].map((off) => ymdToEspn(addYmd(today, off)));
}

/**
 * Scoreboard dates for one league on a normal tick.
 * Daily sports: yesterday (grade) + today (official card).
 * Weekly sports: those plus tomorrow for near-future prep.
 */
export function scanDateKeysForLeague(daily: boolean, now = new Date()): string[] {
  const today = ptYmd(now);
  const keys = [ymdToEspn(today), ymdToEspn(addYmd(today, -1))];
  if (!daily) keys.push(ymdToEspn(addYmd(today, 1)));
  return [...new Set(keys)];
}

/** After today's board is in, which extra dates to fetch. Empty weekly slates skip tomorrow. */
export function extraScanDateKeys(
  daily: boolean,
  todayGameCount: number,
  now = new Date(),
): string[] {
  const today = ptYmd(now);
  const extra = [ymdToEspn(addYmd(today, -1))];
  if (!daily && todayGameCount > 0) extra.push(ymdToEspn(addYmd(today, 1)));
  return extra;
}
