"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanSearch, ShieldCheck, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyOfficial } from "@/components/site/empty-official";
import { RecordStats } from "@/components/site/record-stats";
import { SiteShell } from "@/components/site/shell";
import { useOfficialBook } from "@/components/site/use-official-book";
import { MONTHLY_PRICE_USD } from "@/lib/public/membership";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BoatBoyz — Official sports locks" },
      {
        name: "description",
        content:
          "BoatBoyz posts official production locks and keeps every result on a public verified record. $9.99/month.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const book = useOfficialBook();
  const record = book.data?.record;
  const empty = book.data?.empty !== false;

  return (
    <SiteShell>
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <p className="text-xs tracking-[0.22em] text-accent uppercase">Production desk</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-wide sm:text-6xl">
            Official locks.
            <br />
            Verified record.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
            BoatBoyz is a fail-closed sports desk. If a ticket is not frozen and posted by production, it is not a BoatBoyz play. Losses stay.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-12">
              <Link to="/login">Get access</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="min-h-12">
              <Link to="/record">View the record</Link>
            </Button>
          </div>
          <p className="mt-4 font-mono text-sm tabular-nums text-subtle">${MONTHLY_PRICE_USD.toFixed(2)} / month · Whop billing next</p>
        </div>
        <div className="ticket rotate-[-1.5deg] rounded-xl px-6 py-6 shadow-border">
          <p className="text-[11px] tracking-[0.2em] text-ticket-ink/50 uppercase">Sample lock</p>
          <p className="mt-3 font-display text-3xl tracking-wide text-ticket-ink">Production only</p>
          <p className="mt-2 text-sm text-ticket-ink/70">
            Posted price frozen. Result graded. Only official production locks.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-dashed border-ticket-ink/15 pt-4 font-mono text-sm text-ticket-ink">
            <div>
              <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Book</p>
              <p>Official</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Price</p>
              <p>Frozen</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Result</p>
              <p>Kept</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: ScanSearch,
            title: "Scan and qualify",
            body: "The desk scans the slate, ranks LOCK candidates, and passes when the market is incomplete or stale.",
          },
          {
            icon: Snowflake,
            title: "Freeze the ticket",
            body: "Official plays freeze the posted DraftKings price before they ever reach a customer.",
          },
          {
            icon: ShieldCheck,
            title: "Grade the book",
            body: "Wins, losses, pushes, and voids stay on the public record. Only official production locks appear here.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl bg-surface px-5 py-6 shadow-border">
            <item.icon className="size-5 text-accent" />
            <h2 className="mt-4 font-display text-xl tracking-wide">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.22em] text-accent uppercase">Public book</p>
            <h2 className="mt-1 font-display text-3xl tracking-wide">Verified record</h2>
          </div>
          <Link to="/record" className="hidden h-11 items-center text-sm text-accent sm:inline-flex">
            Full record
          </Link>
        </div>
        {empty ? <EmptyOfficial /> : record ? <RecordStats record={record} /> : <EmptyOfficial />}
      </section>
    </SiteShell>
  );
}
