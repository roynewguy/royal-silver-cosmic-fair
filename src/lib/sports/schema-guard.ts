/** Unexpected API shapes fail closed. Never coerce missing fields into healthy data. */

export type SchemaGuard = { ok: true } | { ok: false; reason: "PASS_CRITICAL_DATA_MISSING"; detail: string };

export function espnScoreboardOk(payload: unknown): SchemaGuard {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN scoreboard is not an object" };
  }
  const events = (payload as { events?: unknown }).events;
  if (events == null) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN scoreboard missing events[]" };
  }
  if (!Array.isArray(events)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN scoreboard events is not an array" };
  }
  return { ok: true };
}

export function espnEventOk(event: unknown): SchemaGuard {
  if (!event || typeof event !== "object") {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN event is not an object" };
  }
  const e = event as { id?: unknown; competitions?: unknown; date?: unknown };
  if (e.id == null && !(Array.isArray(e.competitions) && e.competitions[0] && typeof e.competitions[0] === "object" && "id" in (e.competitions[0] as object))) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN event missing id" };
  }
  if (e.competitions != null && !Array.isArray(e.competitions)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "ESPN competitions is not an array" };
  }
  return { ok: true };
}

export function oddsApiListOk(payload: unknown): SchemaGuard {
  if (payload == null) return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API payload missing" };
  if (!Array.isArray(payload)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API payload is not an array" };
  }
  return { ok: true };
}

export function oddsApiGameOk(row: unknown): SchemaGuard {
  if (!row || typeof row !== "object") {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API game is not an object" };
  }
  const g = row as { home_team?: unknown; away_team?: unknown; commence_time?: unknown; bookmakers?: unknown };
  if (typeof g.home_team !== "string" || !g.home_team.trim()) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API game missing home_team" };
  }
  if (typeof g.away_team !== "string" || !g.away_team.trim()) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API game missing away_team" };
  }
  if (typeof g.commence_time !== "string" || !Number.isFinite(Date.parse(g.commence_time))) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API game missing commence_time" };
  }
  if (g.bookmakers != null && !Array.isArray(g.bookmakers)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Odds API bookmakers is not an array" };
  }
  return { ok: true };
}

export function injuryBoardOk(payload: unknown): SchemaGuard {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Injury board is not an object" };
  }
  const p = payload as { injuries?: unknown; teams?: unknown };
  if (p.injuries != null && !Array.isArray(p.injuries)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Injury board injuries is not an array" };
  }
  if (p.teams != null && !Array.isArray(p.teams)) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Injury board teams is not an array" };
  }
  if (p.injuries == null && p.teams == null) {
    return { ok: false, reason: "PASS_CRITICAL_DATA_MISSING", detail: "Injury board missing injuries/teams" };
  }
  return { ok: true };
}
