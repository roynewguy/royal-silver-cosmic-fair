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
