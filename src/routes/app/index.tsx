"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyOfficial } from "@/components/site/empty-official";
import { PickCard } from "@/components/site/pick-card";
import { RecordStats } from "@/components/site/record-stats";
import { useOfficialBook } from "@/components/site/use-official-book";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/")({
  component: MemberHome,
});

function MemberHome() {
  const user = useCurrentUser();
  const book = useOfficialBook();
  const data = book.data;
  const name = user?.displayName ?? "Member";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Member desk</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide">Welcome, {name}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          This desk reads official production tickets only. Until live launch is approved, the book stays empty on purpose.
        </p>
      </div>

      {data && !data.empty ? <RecordStats record={data.record} /> : <EmptyOfficial />}

      {data && data.live.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Current locks</h2>
            <Link to="/app/picks" className="text-sm text-accent">
              All picks
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.live.slice(0, 4).map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="secondary">
          <Link to="/app/picks">Current picks</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/record">Public record</Link>
        </Button>
      </div>
    </div>
  );
}
