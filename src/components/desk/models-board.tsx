"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";
import type { ModelCard } from "@/lib/sports/types";

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
}

function wl(card: ModelCard): string {
  if (card.wins == null && card.losses == null) return "—";
  return `${card.wins ?? 0}-${card.losses ?? 0}`;
}

export function ModelsBoard() {
  const desk = useDesk();
  const lab = desk.data.modelLab;
  const cards = lab?.cards ?? [];
  const sports = [...new Set(cards.map((c) => c.sport))];
  const skipped = desk.data.skippedToday ?? 0;

  if (!desk.data.operator) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl tracking-wide">Models</h1>
        <p className="text-sm text-muted">Unlock from Home to compare V2, V3, and V4 Shadow Ensemble. Shadow numbers stay off the public book.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Research</p>
        <h1 className="mt-1 font-display text-4xl tracking-wide">Models</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {lab?.note ?? "V2 is the live champion. Challengers write paper predictions only."}
        </p>
        <p className="mt-2 text-xs text-subtle">
          Passes logged today: {skipped}. Zero official picks is a valid day.
        </p>
      </div>

      {sports.map((sport) => {
        const group = cards.filter((c) => c.sport === sport);
        const champ = group.find((c) => c.role === "champion") ?? group.find((c) => c.modelVersion === lab?.champions?.[sport]);
        const previous = lab?.previousChampions?.[sport] ?? null;
        return (
          <section key={sport} className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">{sport}</h2>
              <div className="flex items-center gap-3">
                {champ ? (
                  <p className="text-xs text-subtle">
                    Live: {champ.modelVersion}
                    {champ.drift?.flag ? " · drift flag" : ""}
                    {previous ? ` · rollback: ${previous}` : ""}
                  </p>
                ) : null}
                {previous ? (
                  <Button size="sm" variant="secondary" onClick={() => desk.rollbackChampion({ sport })}>
                    Rollback
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl bg-surface px-4 py-3 shadow-border">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-[11px] tracking-[0.14em] text-subtle uppercase">
                  <tr>
                    <th className="py-2 font-medium">Model</th>
                    <th className="py-2 font-medium">W-L</th>
                    <th className="py-2 font-medium">ROI</th>
                    <th className="py-2 font-medium">CLV</th>
                    <th className="py-2 font-medium">Brier</th>
                    <th className="py-2 font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((card) => (
                    <tr key={`${card.sport}-${card.modelVersion}-cmp`} className="border-t border-border">
                      <td className="py-2">
                        {card.modelName}
                        {card.livePosting ? <span className="ml-2 text-[11px] text-win">LIVE</span> : null}
                      </td>
                      <td className="py-2 font-mono">{wl(card)}</td>
                      <td className="py-2 font-mono">{pct(card.roi)}</td>
                      <td className="py-2 font-mono">{pct(card.clv)}</td>
                      <td className="py-2 font-mono">{fmt(card.brier)}</td>
                      <td className="py-2 font-mono">{card.sampleSize ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {group.map((card) => (
                <ModelTile key={`${card.sport}-${card.modelVersion}`} card={card} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-xl bg-surface px-5 py-4 shadow-border">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Why we passed</h2>
        <p className="mt-2 text-sm text-muted">Last 7 days of rejected opportunities. Passing is the product.</p>
        {(lab?.passReasons ?? []).length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(lab?.passReasons ?? []).map((row) => (
              <li key={row.reason} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted">{row.reason}</span>
                <span className="font-mono tabular-nums">{row.n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-subtle">No pass log yet. Run the desk.</p>
        )}
      </section>

      <section className="rounded-xl bg-surface px-5 py-4 shadow-border">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Calibration</h2>
        <p className="mt-2 text-sm text-muted">{desk.data.calibration?.note}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-[0.14em] text-subtle uppercase">
              <tr>
                <th className="py-2 font-medium">Bucket</th>
                <th className="py-2 font-medium">N</th>
                <th className="py-2 font-medium">Predicted</th>
                <th className="py-2 font-medium">Actual</th>
                <th className="py-2 font-medium">CLV</th>
              </tr>
            </thead>
            <tbody>
              {(desk.data.calibration?.buckets ?? []).map((b) => (
                <tr key={b.key} className="border-t border-border">
                  <td className="py-2">{b.key}</td>
                  <td className="py-2 font-mono">{b.decided}</td>
                  <td className="py-2 font-mono">{b.expectedWinRate == null ? "—" : `${(b.expectedWinRate * 100).toFixed(1)}%`}</td>
                  <td className="py-2 font-mono">{b.actualWinRate == null ? "—" : `${(b.actualWinRate * 100).toFixed(1)}%`}</td>
                  <td className="py-2 font-mono">{b.avgClv == null ? "—" : pct(b.avgClv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ModelTile({ card }: { card: ModelCard }) {
  const desk = useDesk();
  return (
    <article className="rounded-xl bg-surface p-4 shadow-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg tracking-wide">{card.modelName}</p>
          <p className="font-mono text-xs text-subtle">{card.modelVersion}</p>
        </div>
        <Badge tone={card.role === "champion" ? "win" : card.status === "candidate" ? "accent" : "muted"}>
          {card.status}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-muted">{card.livePosting ? "LIVE posting" : card.verified ? "Verified · paper until champion" : "Paper / shadow only"}</p>
      {card.drift?.flag ? <p className="mt-1 text-xs text-loss">{card.drift.note}</p> : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-subtle">Forward n</dt>
          <dd className="font-mono">{card.sampleSize ?? 0}</dd>
        </div>
        <div>
          <dt className="text-subtle">W-L</dt>
          <dd className="font-mono">{wl(card)}</dd>
        </div>
        <div>
          <dt className="text-subtle">Brier</dt>
          <dd className="font-mono">{fmt(card.brier)}</dd>
        </div>
        <div>
          <dt className="text-subtle">Units</dt>
          <dd className="font-mono">{fmt(card.units, 1)}</dd>
        </div>
        <div>
          <dt className="text-subtle">ROI</dt>
          <dd className="font-mono">{pct(card.roi)}</dd>
        </div>
        <div>
          <dt className="text-subtle">CLV</dt>
          <dd className="font-mono">{pct(card.clv)}</dd>
        </div>
      </dl>
      {card.lastPredictionAt ? (
        <p className="mt-2 text-[11px] text-subtle">Last prediction {card.lastPredictionAt.slice(0, 16)}</p>
      ) : null}
      {card.role !== "champion" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-subtle">{card.eligibleReasons[0] ?? "Not eligible."}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!card.eligible}
              onClick={() => desk.promote({ version: card.modelVersion, sport: card.sport })}
            >
              Mark candidate
            </Button>
            {!card.verified ? (
              <Button size="sm" variant="secondary" onClick={() => desk.verifyModel({ version: card.modelVersion, sport: card.sport })}>
                Verify
              </Button>
            ) : (
              <Button size="sm" onClick={() => desk.promoteChampion({ version: card.modelVersion, sport: card.sport })}>
                Set sport champion
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
