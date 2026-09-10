/**
 * Membership / entitlement seam for BoatBoyz.
 *
 * Billing is NOT live. Whop will own checkout later. Do not add Stripe.
 *
 * Flip `WHOP_ENFORCE` only after CEO wires Whop webhooks. Until then, a
 * signed-in member can open the dashboard shell; official picks still come
 * from the production book (which is empty until live launch).
 */

export const MONTHLY_PRICE_USD = 9.99;
export const PLAN_ID = "boatboyz-monthly";
export const PLAN_LABEL = "BoatBoyz Monthly";
export const MEMBERSHIP_PROVIDER = "whop" as const;

/**
 * When true, picks/history require an active Whop membership.
 * Keep false until CEO approves billing.
 */
export const WHOP_ENFORCE = false;

export type MembershipStatus = "none" | "active" | "past_due" | "canceled";

export type Membership = {
  userId: string;
  provider: "none" | "whop";
  status: MembershipStatus;
  planId: string | null;
  planLabel: string;
  externalId: string | null;
  currentPeriodEnd: string | null;
  entitled: boolean;
};

export function emptyMembership(userId: string): Membership {
  return {
    userId,
    provider: "none",
    status: "none",
    planId: null,
    planLabel: PLAN_LABEL,
    externalId: null,
    currentPeriodEnd: null,
    entitled: false,
  };
}

export function membershipFromRow(
  userId: string,
  row: {
    provider?: string | null;
    status?: string | null;
    plan_id?: string | null;
    external_id?: string | null;
    current_period_end?: string | Date | null;
  } | null,
): Membership {
  if (!row) return emptyMembership(userId);
  const provider = row.provider === "whop" ? "whop" : "none";
  const status: MembershipStatus =
    row.status === "active" || row.status === "past_due" || row.status === "canceled"
      ? row.status
      : "none";
  const period =
    row.current_period_end instanceof Date
      ? row.current_period_end.toISOString()
      : row.current_period_end ?? null;
  const entitled = provider === "whop" && status === "active";
  return {
    userId,
    provider,
    status,
    planId: row.plan_id ?? null,
    planLabel: PLAN_LABEL,
    externalId: row.external_id ?? null,
    currentPeriodEnd: period,
    entitled,
  };
}

export function canAccessPicks(membership: Membership): boolean {
  if (!WHOP_ENFORCE) return true;
  return membership.entitled;
}

export function membershipHeadline(membership: Membership): string {
  if (membership.entitled) return "Active";
  if (membership.status === "past_due") return "Past due";
  if (membership.status === "canceled") return "Canceled";
  return "Not connected";
}

export function membershipDetail(membership: Membership): string {
  if (membership.entitled) {
    return membership.currentPeriodEnd
      ? `Whop · renews ${new Date(membership.currentPeriodEnd).toLocaleDateString("en-US")}`
      : "Whop membership active.";
  }
  return "Membership billing will run through Whop. Checkout is not live yet.";
}
