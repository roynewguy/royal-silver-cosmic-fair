export type YachtCollectorState = {
  ok: boolean;
  error: string | null;
  at: string | null;
  lastGames: number | null;
};

let state: YachtCollectorState = { ok: true, error: null, at: null, lastGames: null };

export function yachtCollectorHealth(): YachtCollectorState {
  return state;
}

export function markYachtCollectorOk(games: number): void {
  state = { ok: true, error: null, at: new Date().toISOString(), lastGames: games };
}

export function markYachtCollectorFailed(error: string): void {
  state = { ok: false, error, at: new Date().toISOString(), lastGames: state.lastGames };
}
