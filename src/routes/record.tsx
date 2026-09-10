"use client";

import { createFileRoute } from "@tanstack/react-router";
import { EmptyOfficial } from "@/components/site/empty-official";
import { PickCard } from "@/components/site/pick-card";
import { RecordStats } from "@/components/site/record-stats";
import { SiteShell } from "@/components/site/shell";
import { useOfficialBook } from "@/components/site/use-official-book";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "Verified record — BoatBoyz" },
      {
        name: "description",
        content: "The BoatBoyz public record lists official production locks only. Losses stay.",
      },
    ],
  }),
  component: RecordPage,
});

function RecordPage() {
  const book = useOfficialBook();
  const data = book.data;
  const empty = !data || data.empty;

  return (
    <SiteShell>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Public book</p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">Verified record</h1>
      <p className="mt-4 max-w-xl text-muted">
        Auto production locks after they are frozen and posted. Anything that is not an official lock stays off this page.
      </p>

      <div className="mt-8">
        {empty ? <EmptyOfficial /> : data ? <RecordStats record={data.record} /> : null}
      </div>

      {!empty && data ? (
        <div className="mt-10 space-y-4">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Graded tickets</h2>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted">Official locks are posted. Results post here after games grade.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.history.map((pick) => (
                <PickCard key={pick.id} pick={pick} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </SiteShell>
  );
}
