import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — BoatBoyz" },
      { name: "description", content: "How BoatBoyz handles account and membership data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteShell>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Legal</p>
      <h1 className="mt-2 font-display text-5xl tracking-wide">Privacy</h1>
      <div className="mt-8 max-w-2xl space-y-5 text-sm leading-relaxed text-muted">
        <p>We collect the account information you provide at sign-in: name, email, and the identity supplied by Google, X, or email/password.</p>
        <p>Member dashboards store a membership row so Whop entitlements can be attached later (provider, status, plan, period end). We do not store card numbers on BoatBoyz.</p>
        <p>Official picks on the public record are the product. They are not personal data.</p>
        <p>We do not sell your account information. Operator tools and research models are not shown to customers.</p>
        <p>When Whop billing is connected, Whop will process payment data under its own privacy policy.</p>
        <p>You can request account deletion by contacting the operator. Last updated September 2026.</p>
      </div>
    </SiteShell>
  );
}
