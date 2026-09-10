"use client";

import { createFileRoute } from "@tanstack/react-router";
import { EmptyOfficial } from "@/components/site/empty-official";
import { PickCard } from "@/components/site/pick-card";
import { RecordStats } from "@/components/site/record-stats";
import { useOfficialBook } from "@/components/site/use-official-book";

export const Route = createFileRoute("/app/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const book = useOfficialBook();
  const data = book.data;
  const history = data?.history ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Results</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide">History</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Graded official tickets. Losses stay on the book.</p>
      </div>
      {data && !data.empty ? <RecordStats record={data.record} /> : null}
      {history.length === 0 ? (
        <EmptyOfficial />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {history.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
