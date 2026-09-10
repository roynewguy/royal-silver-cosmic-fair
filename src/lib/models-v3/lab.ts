import { getSql } from "@/lib/db";
import { DEFAULT_REGISTRY, canQueueOfficial, catalogCard } from "./registry.ts";
import { allChampions, allPreviousChampions, championFor, isVerifiedModel } from "./champions.ts";
import { hydrateChampionsFromDb } from "./champions-db.ts";
import { eligibilityReasons, emptyStats, type ForwardStats } from "./promotion.ts";
import { brier, accuracy, logLoss } from "./evaluate.ts";
import { driftReport, type DriftRow } from "./drift.ts";
import type { ModelCard, ModelLabState, ModelStatus, ModelRole } from "../sports/types.ts";

export async function seedModelRegistry(): Promise<void> {
  try {
    const sql = await getSql();
    for (const e of DEFAULT_REGISTRY) {
      await sql`
        insert into model_registry (
          model_name, model_version, sport, status, role, training_period, features_json, notes, verified
        ) values (
          ${e.modelName}, ${e.modelVersion}, ${e.sport}, ${e.status}, ${e.role}, ${e.trainingPeriod},
          ${JSON.stringify(e.features)}, ${e.notes}, ${e.modelVersion.startsWith("v2-")}
        )
        on conflict (model_version, sport) do nothing
      `;
    }
  } catch {
    /* table may not exist yet */
  }
}

type LabStats = ForwardStats & {
  lastAt: string | null;
  avgEdge: number | null;
  wins: number;
  losses: number;
  units: number;
  logLoss: number | null;
  accuracy: number | null;
  driftRows: DriftRow[];
};

async function statsFor(versionPrefix: string, sport: string): Promise<LabStats> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      p: number | null;
      y: number | null;
      clv: number | null;
      edge: number | null;
      captured_at: string;
    }>`
      select model_probability as p,
             case when result = 'home' or result = 'WIN' then 1 when result is null then null else 0 end as y,
             clv, model_edge as edge, captured_at::text as captured_at
      from model_predictions
      where sport = ${sport} and model_version like ${`${versionPrefix}%`}
        and stage in ('pregame','canonical','posted')
      order by captured_at desc
      limit 2000
    `;
    const decided = rows
      .filter((r) => r.p != null && r.y != null)
      .map((r) => ({ p: Number(r.p), y: Number(r.y), stakePrice: null, closePrice: null }));
    const clvs = rows.map((r) => r.clv).filter((n): n is number => n != null).map(Number);
    const edges = rows.map((r) => r.edge).filter((n): n is number => n != null).map(Number);
    let units = 0;
    let peak = 0;
    let maxDd = 0;
    let bets = 0;
    let wins = 0;
    let losses = 0;
    for (const r of rows) {
      if (r.y == null) continue;
      bets += 1;
      if (r.y === 1) wins += 1;
      else losses += 1;
      units += r.y === 1 ? 0.91 : -1;
      peak = Math.max(peak, units);
      maxDd = Math.min(maxDd, units - peak);
    }
    const driftRows: DriftRow[] = decided.map((r) => ({ p: r.p, y: r.y }));
    return {
      n: decided.length,
      brier: decided.length ? brier(decided) : null,
      logLoss: decided.length ? logLoss(decided) : null,
      accuracy: decided.length ? accuracy(decided) : null,
      roi: bets ? units / bets : null,
      clv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
      calibrationDelta: decided.length
        ? accuracy(decided) - decided.reduce((s, r) => s + Math.max(r.p, 1 - r.p), 0) / decided.length
        : null,
      maxDrawdown: bets ? maxDd : null,
      lastAt: rows[0]?.captured_at ?? null,
      avgEdge: edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : null,
      wins,
      losses,
      units,
      driftRows,
    };
  } catch {
    return { ...emptyStats(), lastAt: null, avgEdge: null, wins: 0, losses: 0, units: 0, logLoss: null, accuracy: null, driftRows: [] };
  }
}

export async function loadModelLab(): Promise<ModelLabState> {
  await seedModelRegistry();
  await hydrateChampionsFromDb();
  const cards: ModelCard[] = [];
  try {
    const sql = await getSql();
    const rows = await sql<{
      model_name: string;
      model_version: string;
      sport: string;
      status: string;
      role: string;
      training_period: string | null;
      features_json: string;
      verified: boolean | null;
    }>`select model_name, model_version, sport, status, role, training_period, features_json, verified from model_registry order by sport, role, model_version`;
    const bySportChamp = new Map<string, ForwardStats>();
    for (const sport of new Set(rows.map((r) => r.sport))) {
      const live = championFor(sport);
      bySportChamp.set(sport, await statsFor(live || "v2-", sport));
    }
    for (const r of rows) {
      const prefix = r.model_version.replace(/-logreg.*$/, "").replace(/-ensemble.*$/, "");
      const st = await statsFor(prefix, r.sport);
      const champ = bySportChamp.get(r.sport) ?? emptyStats();
      const isChamp = r.model_version === championFor(r.sport);
      const role: ModelRole = isChamp ? "champion" : r.role === "champion" ? "challenger" : (r.role as ModelRole);
      const reasons = isChamp ? ["Live champion."] : eligibilityReasons(st, champ);
      cards.push(
        catalogCard(
          {
            modelName: r.model_name,
            modelVersion: r.model_version,
            sport: r.sport,
            status: (isChamp ? "production" : r.status) as ModelStatus,
            role,
            trainingPeriod: r.training_period,
            features: (() => {
              try {
                return JSON.parse(r.features_json) as string[];
              } catch {
                return [];
              }
            })(),
            notes: "",
          },
          {
            sampleSize: st.n,
            brier: st.brier,
            logLoss: st.logLoss,
            accuracy: st.accuracy,
            roi: st.roi,
            clv: st.clv,
            averageEdge: st.avgEdge,
            betCount: st.n,
            lastPredictionAt: st.lastAt,
            eligible: !isChamp && reasons.length === 0,
            eligibleReasons: reasons,
            livePosting: canQueueOfficial(r.model_version),
            verified: r.verified === true || isVerifiedModel(r.model_version, r.sport),
            wins: st.wins,
            losses: st.losses,
            units: st.units,
            drift: driftReport(st.driftRows),
          },
        ),
      );
    }
  } catch {
    for (const e of DEFAULT_REGISTRY) cards.push(catalogCard(e));
  }
  let passReasons: Array<{ reason: string; n: number }> = [];
  try {
    const sql = await getSql();
    passReasons = await sql<{ reason: string; n: number }>`
      select pass_reason as reason, count(*)::int as n
      from pass_log
      where captured_at > now() - interval '7 days'
      group by pass_reason
      order by n desc
      limit 12
    `;
  } catch {
    passReasons = [];
  }
  const champions = allChampions();
  const previousChampions = allPreviousChampions();
  const stillAllV2 = Object.values(champions).every((v) => v.startsWith("v2-"));
  return {
    champion: stillAllV2 ? "v2" : "per-sport",
    champions,
    previousChampions,
    note: stillAllV2
      ? "Each sport has its own champion. V2 is the default until the CEO verifies and promotes a challenger. Candidate marks never auto-post to Discord. Zero official picks is a valid day."
      : "Live Discord uses the active champion per sport. V2 remains the rollback default unless a previous challenger is stored. Promotion is CEO-only.",
    cards,
    livePostingLockedToV2: stillAllV2,
    passReasons,
  };
}
