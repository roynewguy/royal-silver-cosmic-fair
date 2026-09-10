import { injuryBoardOk } from "./schema-guard.ts";

export type BoardInj = { teamName: string | null; abbr: string | null; player: string; status: string; position: string | null };

type InjuryPayload = {
  injuries?: { displayName?: string; injuries?: InjuryRow[] }[];
  teams?: { team?: { abbreviation?: string }; injuries?: InjuryRow[] }[];
};
type InjuryRow = { status?: string; athlete?: { displayName?: string; position?: { abbreviation?: string } } };

/** ESPN's league board groups injuries by full team name. Unknown schemas fail closed. */
export function parseInjuryBoard(value: unknown): BoardInj[] | null {
  if (!injuryBoardOk(value).ok) return null;
  const payload = value as InjuryPayload;
  const groups = Array.isArray(payload.injuries)
    ? payload.injuries.map(g => ({ teamName: g.displayName, abbr: undefined, injuries: g.injuries }))
    : Array.isArray(payload.teams)
      ? payload.teams.map(g => ({ teamName: undefined, abbr: g.team?.abbreviation, injuries: g.injuries }))
      : null;
  if (!groups) return null;
  const rows: BoardInj[] = [];
  for (const group of groups) {
    if ((!group.teamName?.trim() && !group.abbr?.trim()) || !Array.isArray(group.injuries)) return null;
    for (const injury of group.injuries) {
      if (!injury?.athlete?.displayName?.trim() || !injury.status?.trim()) return null;
      rows.push({ teamName: group.teamName?.trim() ?? null, abbr: group.abbr?.trim() ?? null,
        player: injury.athlete.displayName.trim(), status: injury.status,
        position: injury.athlete.position?.abbreviation ?? null });
    }
  }
  return rows;
}
