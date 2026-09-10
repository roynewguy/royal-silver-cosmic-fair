"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getMyMembership } from "@/lib/public/api";
import { MONTHLY_PRICE_USD, membershipDetail, membershipHeadline } from "@/lib/public/membership";

export const Route = createFileRoute("/app/account")({
  component: AccountPage,
});

function AccountPage() {
  const user = useCurrentUser();
  const membership = useQuery({
    queryKey: ["membership"],
    queryFn: () => getMyMembership(),
  });
  const row = membership.data?.membership;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Account</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide">Your desk</h1>
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-border">
        <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">Profile</p>
        <p className="mt-2 font-display text-2xl tracking-wide">{user?.displayName ?? "Member"}</p>
        <p className="mt-1 text-sm text-muted">{user?.primaryEmail ?? "Signed in"}</p>
        <div className="mt-4">
          <UserButton />
        </div>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-border">
        <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">Membership</p>
        <p className="mt-2 font-display text-2xl tracking-wide">{row ? membershipHeadline(row) : "…"}</p>
        <p className="mt-2 max-w-lg text-sm text-muted">
          {row ? membershipDetail(row) : "Loading membership…"}
        </p>
        <p className="mt-4 font-mono text-sm tabular-nums text-accent">${MONTHLY_PRICE_USD.toFixed(2)} / month</p>
        <p className="mt-3 text-sm text-subtle">
          Whop checkout will attach here without changing the member desk. Stripe is not used.
        </p>
      </section>

      <p className="text-sm text-muted">
        <Link to="/responsible-play" className="text-accent underline-offset-2 hover:underline">
          Responsible play
        </Link>
        {" · "}
        <Link to="/terms" className="hover:text-fg">
          Terms
        </Link>
        {" · "}
        <Link to="/privacy" className="hover:text-fg">
          Privacy
        </Link>
      </p>
    </div>
  );
}
