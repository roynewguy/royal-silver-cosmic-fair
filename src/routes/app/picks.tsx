"use client";

import { createFileRoute } from "@tanstack/react-router";
import { EmptyOfficial } from "@/components/site/empty-official";
import { PickCard } from "@/components/site/pick-card";
import { useOfficialBook } from "@/components/site/use-official-book";

export const Route = createFileRoute("/app/picks")({
  component: PicksPage,
});

function PicksPage() {
  const book = useOfficialBook();
  const live = book.data?.live ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Official card</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide">Current picks</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Posted production locks that have not graded yet.
        </p>
      </div>
      {live.length === 0 ? (
        <EmptyOfficial />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {live.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
