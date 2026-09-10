import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/site/shell";
import { MONTHLY_PRICE_USD, PLAN_LABEL } from "@/lib/public/membership";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — BoatBoyz" },
      {
        name: "description",
        content: `BoatBoyz membership is $${MONTHLY_PRICE_USD.toFixed(2)} per month. Official locks, history, and the verified public record. Billing via Whop comes next.`,
      },
    ],
  }),
  component: PricingPage,
});

const included = [
  "Official production locks when the desk posts",
  "Member picks and graded history",
  "Public verified W-L-P record",
  "Frozen posted prices — no edited tickets",
  "Responsible-play tools and 21+ policy",
];

function PricingPage() {
  return (
    <SiteShell>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Membership</p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">One desk. One price.</h1>
      <p className="mt-4 max-w-xl text-muted">
        BoatBoyz does not sell packages, parlays, or mystery plays. You get the official book when production posts a lock.
      </p>

      <div className="mt-10 max-w-md rounded-xl bg-surface p-6 shadow-border">
        <p className="text-[11px] tracking-[0.18em] text-subtle uppercase">{PLAN_LABEL}</p>
        <p className="mt-3 font-display text-5xl tracking-wide">
          ${MONTHLY_PRICE_USD.toFixed(2)}
          <span className="ml-2 font-sans text-base font-medium text-muted">/ month</span>
        </p>
        <ul className="mt-6 space-y-3">
          {included.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-fg">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>
        <Button asChild className="mt-8 min-h-12 w-full">
          <Link to="/login">Create an account</Link>
        </Button>
        <p className="mt-4 text-sm text-muted">
          Membership billing will run through Whop. Checkout is not live yet — creating an account prepares your member desk.
        </p>
      </div>

      <p className="mt-10 max-w-xl text-sm text-subtle">
        Zero qualifying LOCKs means zero official plays that day. We will not invent tickets to fill a card. See{" "}
        <Link to="/responsible-play" className="text-accent underline-offset-2 hover:underline">
          responsible play
        </Link>
        .
      </p>
    </SiteShell>
  );
}
