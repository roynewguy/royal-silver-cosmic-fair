import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — BoatBoyz" },
      { name: "description", content: "BoatBoyz terms of use for the public site and member desk." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SiteShell>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Legal</p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">Terms of use</h1>
      <div className="mt-8 max-w-2xl space-y-5 text-sm leading-relaxed text-muted">
        <p>BoatBoyz provides sports-market opinions and a verified record of official production tickets. It is not a sportsbook, not a broker, and not investment advice.</p>
        <p>You must be at least 21. You are responsible for following the betting laws where you live.</p>
        <p>The public record includes only official auto production locks after they are frozen and posted. Simulated and internal tickets are not part of this agreement.</p>
        <p>Past results do not predict future results. We do not guarantee wins, units, or CLV.</p>
        <p>Membership billing, when enabled, will be processed by Whop. Until that integration is live, creating an account does not charge you and does not create a paid subscription.</p>
        <p>We may suspend accounts that abuse the desk, scrape tickets, or misrepresent BoatBoyz results.</p>
        <p>These terms are a product policy, not a substitute for legal advice. Last updated September 2026.</p>
      </div>
    </SiteShell>
  );
}
