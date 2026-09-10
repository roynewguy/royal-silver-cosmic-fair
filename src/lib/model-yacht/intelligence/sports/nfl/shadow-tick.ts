import type { GameCard } from "../../../../sports/types.ts";
import { buildYachtSnapshot } from "../../../core/snapshot.ts";
import { liveMarketSnapshot } from "../../../shared.ts";
import { persistShadow, runChallengerSafe, type ShadowStore } from "../../shadow.ts";
import { nflLiveFeatures } from "./live-features.ts";
import { nflYachtVersion, predictNflChallenger, type NflChallengerArtifacts } from "./engine.ts";
import type { CandidateKind } from "../../prediction.ts";

export type NflShadowTickResult = {
  predicted: number;
  skipped: number;
  error: string | null;
};

/**
 * Shadow tick for eligible NFL games. Isolated from V2.
 * Missing artifacts / provenance failures skip the game and never queue official tickets.
 */
export function runNflShadowTick(input: {
  games: GameCard[];
  store: ShadowStore;
  artifacts?: NflChallengerArtifacts;
  kinds?: CandidateKind[];
  now?: string;
}): NflShadowTickResult {
  const boxed = runChallengerSafe(() => {
    let predicted = 0;
    let skipped = 0;
    const kinds = input.kinds ?? ["logreg", "gbt", "market"];
    const now = input.now ?? new Date().toISOString();
    for (const game of input.games) {
      if (game.league !== "nfl" && game.sport.toLowerCase() !== "nfl") {
        skipped += 1;
        continue;
      }
      if (game.status !== "scheduled") {
        skipped += 1;
        continue;
      }
      const predictionAt = now;
      if (Date.parse(predictionAt) >= Date.parse(game.startAt)) {
        skipped += 1;
        continue;
      }
      const features = nflLiveFeatures({ game, predictionAt });
      const market = liveMarketSnapshot(game);
      for (const kind of kinds) {
        const inner = runChallengerSafe(() => {
          const snapshot = buildYachtSnapshot({
            gameId: game.id,
            sport: "nfl",
            league: "nfl",
            modelVersion: nflYachtVersion(kind),
            predictionAt,
            startAt: game.startAt,
            features,
            market,
          });
          const pred = predictNflChallenger({ snapshot, kind, artifacts: input.artifacts });
          persistShadow(input.store, pred);
        });
        if (inner.ok) predicted += 1;
        else skipped += 1;
      }
    }
    return { predicted, skipped };
  });
  if (!boxed.ok) return { predicted: 0, skipped: 0, error: boxed.error };
  return { ...boxed.value, error: null };
}
