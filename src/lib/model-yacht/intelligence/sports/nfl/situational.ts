import { parseWindMph } from "../../../../sports/models/weather.ts";

export type NflWeatherBits = {
  windMph: number | null;
  precip: number | null;
  temperature: number | null;
  dome: number | null;
};

/** Parse ESPN weather string. Unparsed fields stay null — never invented. */
export function parseNflWeather(weather: string | null | undefined): NflWeatherBits {
  if (!weather?.trim()) {
    return { windMph: null, precip: null, temperature: null, dome: null };
  }
  const w = weather.toLowerCase();
  const dome = /indoor|dome|retractable/.test(w) ? 1 : /outdoor|open.?air/.test(w) ? 0 : null;
  const tempMatch = w.match(/(-?\d+)\s*°/);
  const temperature = tempMatch ? Number(tempMatch[1]) : null;
  const precip = /rain|snow|shower|storm/.test(w) ? 1 : /clear|sunny|fair/.test(w) ? 0 : null;
  return {
    windMph: parseWindMph(weather),
    precip: precip == null ? null : precip,
    temperature: Number.isFinite(temperature) ? temperature : null,
    dome,
  };
}

export function isThursdayKickoff(startAt: string): boolean {
  const ms = Date.parse(startAt);
  if (!Number.isFinite(ms)) return false;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(ms));
  return weekday === "Thu";
}

export function shortWeek(restDays: number | null): number | null {
  if (restDays == null || !Number.isFinite(restDays)) return null;
  return restDays <= 5 ? 1 : 0;
}

export function byeWeek(restDays: number | null): number | null {
  if (restDays == null || !Number.isFinite(restDays)) return null;
  return restDays >= 13 ? 1 : 0;
}

export function nflSeasonWeek(startAt: string): { season: number | null; week: number | null } {
  const ms = Date.parse(startAt);
  if (!Number.isFinite(ms)) return { season: null, week: null };
  const d = new Date(ms);
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const season = month >= 7 ? year : year - 1;
  const seasonStart = Date.UTC(season, 8, 1);
  const week = Math.max(1, Math.min(22, Math.floor((ms - seasonStart) / 7 / 86_400_000) + 1));
  return { season, week };
}
