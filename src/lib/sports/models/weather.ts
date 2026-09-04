export function parseWindMph(weather: string | null): number | null {
  if (!weather) return null;
  const w = weather.toLowerCase();
  const numbered = w.match(/wind(?:\s*speed)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    ?? w.match(/gust(?:s)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    ?? w.match(/(\d+(?:\.\d+)?)\s*(?:mph|km\/h)/i);
  if (numbered) {
    const n = Number(numbered[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function windUnderLean(weather: string | null): { under: number; note: string } {
  if (!weather) return { under: 0, note: "" };
  const w = weather.toLowerCase();
  const mph = parseWindMph(weather);
  let under = 0;
  if (mph != null) {
    if (mph >= 20) under += 0.04;
    else if (mph >= 15) under += 0.025;
    else if (mph >= 10) under += 0.01;
  }
  const temp = Number((w.match(/(-?\d+)\s*°/) ?? [])[1]);
  if (Number.isFinite(temp) && temp <= 32) under += 0.03;
  if (/rain|snow|shower/.test(w)) under += 0.03;
  return { under, note: under ? ` Weather: ${weather}.` : "" };
}
