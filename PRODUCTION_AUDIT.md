# BoatBoyzPicks production audit — 2026-09-05

## Verdict

**Code hardening completed; production launch is NOT certified.** Keep `BOATBOYZ_LIVE_POSTING=false` and start with `PAPER_MODE=true`. The audited checkout is separate from the old local checkout, whose uncommitted work was preserved.

The original baseline was commit `c65d20f830df47296417a2829462c450a24bab97`, 226 passing tests. The audit adds database/transport/truth-gate coverage and removes obsolete worker tests. See the commit containing this report for the final version; verification counts are recorded below.

This is an operational/data-safety audit, not evidence that the models produce profitable or calibrated probabilities. Dedicated model coefficients were not retuned. V3 was not promoted.

## Production flow

GitHub Actions `*/10` schedule / workflow dispatch → authenticated POST `/api/cron/tick` → owner-token database lease (six minutes, five-minute Vercel invocation) → ESPN scan → V2 candidates → fresh DK checks for due candidates → global reranking → provisional PT daily queue → truth gate → database claim and immutable freeze → one Discord attempt → verified-final grading → durable result recap queue.

There is no Vercel cron entry, boot tick, webpage-triggered worker, or in-process interval. Run Now uses the same lease and pipeline. A colliding invocation cannot stamp cron success. Only a completed authenticated cron cycle updates the heartbeat. Browser loads and manual runs never do.

GitHub schedules are approximate, not an exact clock or uptime SLA. A lock collision is reported honestly; subsequent scheduled ticks continue. The workflow does not retry HTTP requests. Definite Discord rejection can be reconsidered by a later tick; uncertain acceptance cannot.

## Daily selection

Default target is **three total**, across the PT day of the game's start time. Saved operator settings take precedence over the initial environment default. Existing control range remains 1–6; the target is a ceiling, never a minimum.

The existing dedicated V2 models generate market candidates. The shared selector seals all candidates and orders by actual model-minus-no-vig edge, then confidence and a stable market tie-break. The old market-preference sorting multiplier was removed; prediction formulas, fitted coefficients and confidence weights were not tuned. The best eligible candidate per game enters the one slate-wide ranking, avoiding several correlated official bets on one game. Queued choices can rotate; posting/posted/graded/DELIVERY_UNKNOWN tickets consume the day's cap and cannot rotate. Manual and paper ledgers cannot consume official auto slots.

Before selecting the due card, fresh DK candidates are reranked together. A tick-local receipt expires after 60 seconds; an expired receipt passes until the next tick rather than sending a price from a differently ranked board. The sender runs the full truth gate again. Future stronger candidates may remain queued instead of filling slots with weaker earlier games. It cannot know future information; it ranks the currently available eligible slate. It may post 0, 1, 2 or 3.

## Sports and model readiness

| Sport | Code present | Official eligibility |
| --- | --- | --- |
| NFL | Dedicated v2-nfl | Existing route retained; full truth gate required |
| NCAAF | Dedicated v2-ncaaf | Existing route retained; full truth gate required |
| NBA | Dedicated v2-nba | Existing route retained; full truth gate required |
| WNBA | Dedicated v2-wnba | Existing route retained; full truth gate required |
| MLB | Dedicated v2-mlb | Both current starters and finite ERA inputs required near posting |
| NHL | Dedicated v2-nhl | Existing route retained; full truth gate required |
| UFC | Dedicated v2-ufc | Existing route retained; incomplete injury/final-score feeds will PASS/wait |
| NCAAB | Previously generic fallback | Disabled for official automation; dedicated validation needed |
| MLS / EPL | UI/manual support | Official automation disabled; three-way models unsupported |

Presence of a V2 function does not prove a production-ready data pipeline. Preflight deliberately reports model validation UNVERIFIED. No new sport was enabled. Live approval must include successful source coverage per enabled sport. UFC and college data coverage especially require observation before launch. Every configured league is included in the scan; scoreboard requests now request up to 1000 events rather than silently using the API's default page size.

## Data provenance and fresh DraftKings verification

- Schedule, participant identities, game status, records, expected starters, injury reports, weather and final scores: structured ESPN data, with fetch timestamps. Unknown schemas and missing fields are unavailable, not successful empty responses.
- Price, market, line and bookmaker timestamp: The Odds API's DraftKings bookmaker entry. ESPN lines can help form provisional candidates in free beta but never pass the official DK gate.
- Probability, confidence, edge and units: existing deterministic V2 calculation and stake rules. Confidence is separate from probability.
- No-vig probability: both opposing prices from the same current market. Edge is recomputed as `(model probability - no-vig probability) * 100`.

Exact matching requires league/sport key, normalized full home/away names in the correct orientation and a unique start time within 15 minutes. Multiple matches PASS; missing event identity PASS. Larger queued start movement PASS. Doubleheaders require distinct event identities/times. No substring team guessing.

Provider timestamps are preserved; fetching a cached/old quote does not make it fresh. Both sides and the exact spread/total must exist; inconsistent paired lines fail. A partial DK snapshot replaces the current market snapshot rather than relabeling ESPN markets as DraftKings. Missing odds never default to -110. The truth gate also requires fresh game data, a successfully fetched injury report, and both MLB starters with pitching inputs in the three-hour posting window. The model reruns with current starters, never the queued identity.

The frozen ticket includes game/league/teams/start/status, selected side/market/line/price, DK event metadata and timestamps, V2 version/probability/no-vig/raw market probabilities/edge/confidence/data quality/units, starter identities, source freshness and factual explanation. DB confirmation time and Discord message ID are stored after acceptance. Confirmed ticket identity, price, model fields and public graded results are protected by a database trigger.

Writeups are deterministic prose and short bullets from the current structured fields. No LLM is called by official selection/posting. No invented injury, weather, starter, score, game time or favorite claim is used to fill gaps. Existing research/replay tooling remains isolated.

## Discord architecture

| Setting | Responsibility | Fallback |
| --- | --- | --- |
| DISCORD_PICKS_WEBHOOK | #official-picks, automated official tickets | DISCORD_WEBHOOK_URL, then existing stored picks webhook |
| DISCORD_RESULTS_WEBHOOK | #results, settlement recaps | None |
| DISCORD_ALERT_WEBHOOK | Private #bot-health | Legacy OPERATOR_WEBHOOK_URL only |
| DISCORD_TEST_WEBHOOK | #test-lab previews and test notes | None |
| DISCORD_MANUAL_WEBHOOK | Optional separate operator-selected play feed | Test-lab only |

One `postWebhook` sender is shared. Alert/customer webhook identity collisions are rejected, including URL-query aliases. Results and tests do not fall back to picks. Manual tools cannot use the automated picks webhook. Webhook IDs are not Discord channel IDs: two different webhook IDs could still target the same channel. Verify destination channels and private permissions in Discord before launch. No live webhook values were exposed or changed in this audit.

Webhook presence is not a successful delivery. Preflight requires a recorded success to display delivery as READY. Test previews never produce an official ticket. Automatic records cannot be deleted through the operator delete-message utility; that utility is restricted to manual messages and retains the ticket record.

## Delivery and recovery

1. Atomic queued→posting claim, unique ticket identities, owner-token worker lease and daily cap.
2. Freeze official fields and exact Discord content in the database BEFORE the HTTP request.
3. Execute webhook with `wait=true` once; require a returned message ID.
4. Confirm the row without changing frozen decision fields.

Transport errors, Discord 5xx, missing acknowledgement, and DB failure after acceptance result in DELIVERY_UNKNOWN or a durable posting fence if the database itself is unavailable. Stale unfinished attempts become DELIVERY_UNKNOWN, not recyclable skipped picks. No automatic resend. Results use their own durable queued/sending/sent/unknown state on the same row and sender.

For DELIVERY_UNKNOWN: inspect the intended channel and frozen payload, preserve the ticket, and investigate the stored message ID/host logs. There is deliberately no blind resend button or automatic reconciliation that guesses delivery. Manual request IDs protect double clicks; retries preserve identity. If both Discord and PostgreSQL are unavailable, neither can prove delivery; leave the fence intact.

## Grading, record and CLV

Only fresh verified final events with matching identities and finite nonnegative scores can auto-grade. WIN/LOSS/PUSH use the frozen market, side, line and stake. Suspended games wait. Postponements/cancellations require sportsbook settlement review, since rules differ; they are never automatically called losses or blindly voided. Custom operator selections are marked NEEDS_MANUAL_GRADE. Advanced provides reviewed settlement with an evidence note; non-VOID settlement still requires a verified final score. Already graded results cannot be overwritten.

Auto results all remain in the official record, including losses; paper is excluded, and manual/live are separately filterable. Manual tickets are excluded from auto caps, V2 calibration and posted-model warehouse writes. Recaps include the newly settled auto result in cumulative W-L-P, units and ROI. VOID does not inflate risked stake. Manual result labels distinguish them from auto.

Closing quotes are collected during the final 20 minutes before start using the same verified DK matcher. CLV uses the last verified pregame quote on the SAME market and line, in implied-probability points. This is an observed pregame closing proxy, not a guarantee of the exact last sportsbook quote. Missing quote or changed line produces missing CLV, never fabricated CLV. Games whose final data cannot be retrieved stay pending and alert the operator.

Paper uses the same scan/rank/queue/verify/truth/freeze/grade pipeline with a simulated delivery only. Historical replay remains a separate research approximation and must not be confused with production-equivalent forward paper observation.

## Required configuration

**GitHub Actions authentication:** the current main branch added signed GitHub OIDC, which is preserved. Only this repository tick workflow on main is accepted. No repository secrets are required with OIDC. Optional overrides: `APP_URL` (production origin, no path) and `CRON_SECRET` (exactly the deployed value).

**Vercel Production:** `DATABASE_URL` (persistent PostgreSQL), `CRON_SECRET`, `ODDS_API_KEY`, `BOATBOYZ_PIN`, `FREE_BETA_MODE`, `DAILY_PICK_TARGET`, `BOATBOYZ_LIVE_POSTING`, `PAPER_MODE`, plus the four separated webhook settings above. Optional manual webhook and legacy picks fallback are documented in `.env.example`. LLM keys are not required for official operation. No payment integration was added.

Use `FREE_BETA_MODE=true`, `DAILY_PICK_TARGET=3`, `PAPER_MODE=true`, `BOATBOYZ_LIVE_POSTING=false` for initial forward paper operation. Free beta reduces board-wide odds calls; it does not relax fresh-DK or truth gates. Do not promise continuous use fits a free Odds API quota: each verification consumes provider quota, and capacity must be measured. Exhaustion means PASS/private alert.

Keep Preview on a separate database with posting OFF and no production customer webhook. Builds apply migrations to their configured database; do not point an unreviewed preview at production. Existing production tickets are preserved. Migration 0024 fails visibly if pre-existing duplicates prevent uniqueness; inspect and reconcile evidence, never delete history to force it through.

## Health and preflight

RUNNING ≤15 minutes since a successful cron cycle; DELAYED >15–25; OFFLINE >25; NOT ARMED without a valid successful cron timestamp. Home shows last cron, next expected contact, last complete scan, confirmed post/grade, last critical error, and kill/paper status. Loading the page never records success.

Advanced shows database read evidence, ESPN/DK/API evidence, per-destination confirmed deliveries, truth gate, paper/kill switch and honest model validation state. Nominal expected ticks are 144 per rolling 24 hours. Durable counts include successful/failed cron cycles, ESPN/DK/Discord/DB failures, delivery-unknown, ambiguous matches, official/graded/pending tickets and stale-data passes. ESPN failures count affected scans, not individual HTTP requests. Counters begin at audit deployment; zero before observation is not proof of reliability. DB outage events also go to sanitized host logs because a broken DB cannot reliably record its own outage.

Private alerts require a configured, working alert webhook. A completely stopped scheduler cannot alert through itself; GitHub failure notifications and an external heartbeat watcher are still needed for independent outage detection. No second sports worker was added to solve monitoring.

## Cleanup evidence

Removed after reference searches:

- Root `use-desk.tsx`: duplicate; canonical provider remains `src/lib/desk/use-desk.tsx`.
- `src/components/desk/hq.tsx`, `channel.tsx`, `sport-rail.tsx`, `pick-ticket.tsx`: unused old desk surfaces; current Home/Slate/Record/Advanced and TicketCard remain.
- `src/lib/desk/worker-policy.ts` and its obsolete tests: removed interval/boot worker policy; scheduler/source regression tests replace it.
- `src/lib/sports/models/generic.ts`: no remaining imports; NCAAB fallback explicitly disabled.

Consolidated: SQL delivery claims into sql-locker; webhook resolution into discord-routing with one shared sender; result delivery into one outbox helper; health into the existing shared calculator plus evidence-based preflight. Removed dead bestPerSport/takeTopPlays and unused store lookups, duplicate dead-game grading, official LLM research selection, and server-only exports from the client API module. The latter caused a browser crypto/import error caught and fixed during visual verification. Login now refreshes server state after setting its session cookie.

Historical migrations, research artifacts, template authentication and replay were retained because they still have consumers or preserve upgrade history. Three obsolete game-only/active-key uniqueness indexes were replaced with ledger-aware automatic identities; manual request identity remains separate. No broad data purge was performed.

## Verification and remaining launch blockers

Baseline: 226/226 tests. Audit: 234/234 passing tests at the last full check; typecheck passed; lint zero errors, one existing Fast Refresh warning. Final verification after the browser-only export/session fix also passed all three checks and the build. SQL tests apply all migrations in real PGlite PostgreSQL and verify racing claims, pre-send freeze, immutable losses, paper isolation, caps and DB-after-send failure. HTTP tests verify one request on 5xx/timeout/missing ID and definitive 429 behavior. Production build generated a 300-second Vercel function. Local browser showed NOT ARMED, kill switch OFF, PAPER MODE and non-fabricated preflight statuses.

Outstanding live checks:

1. Earlier GitHub runs lacked APP_URL/CRON_SECRET. The newer signed OIDC workflow removes that requirement; a successful unattended production cycle still needs live verification.
2. Four separated webhook destinations and private Discord permissions are not verified/configured here. No customer test or live bet was sent by this audit.
3. ESPN injury endpoint returned Access Denied from the audit environment; exact live data completeness must be demonstrated per league. Unknown schemas remain missing data. Do not turn on official posting merely to get messages.
4. Verify existing DB migration/data compatibility on an isolated production snapshot before promotion. Local SQL tests cannot certify the live database contents.
5. Run forward paper observation through scans, fresh quotes, frozen tickets, final grading and CLV; confirm Odds API quota meets the intended cadence.
6. Demonstrate independent private alerting for scheduler/DB outages. GitHub cron alone is not a complete unattended monitoring system.
7. No production credentials or active deployment session were available in the resumed browser. Deployment and actual live health remain unverified until authenticated access is restored.

**Explicit: V2 probability coefficients/weights were NOT retuned. V3 was NOT auto-promoted. Live production readiness must remain blocked until these observations succeed.**
# September 8 live connection repair

The saved Odds API key was applied with production redeployment of 492562b. The operator check verified a fresh DraftKings moneyline for Arizona at Kansas City. A full run delivered three messages to official-picks (channel 1545432221899296871), confirmed both in application logs and Discord: 1547026633263685644, 1547026634475831389, 1547026635906093060. Test delivery was separately observed in private test-lab (1545956146584490035). These deliveries prove transport, not complete model/data readiness.

That live run exposed a regression introduced by the later soft-floor changes: missing injuries and low data quality could bypass official checks. The truth gate now requires the same minimum edge, confidence, data quality, and injury freshness regardless of legacy queue tier. ESPN starter parsing now reads athlete.displayName instead of the probable role label. Placeholder identities are rejected at the final gate. Existing frozen tickets/messages are preserved and will continue through grading.

Validation: 258 tests passed; typecheck passed; lint has zero errors and one existing fast-refresh warning. No files removed. No V2 model weights changed. No V3 promotion. Injury-feed schema failures remain a launch blocker; missing context must produce PASS. Scheduled scanning and grading remain enabled.
# September 9 injury and Discord follow-up

ESPN's live response uses `injuries[]` team groups (id, displayName, injuries), rather than the previous `teams[]` assumption. The parser accepts this observed schema and the legacy schema; malformed or missing data remain unavailable. Repeated scheduled production scans after deployment completed without injury schema errors. Preflight now reflects a recent successful scan after recovery while retaining historical failure counts.

Official Discord messages have emoji sections for selection, sportsbook price, stake, model numbers, factual writeup, kickoff and verification time. Verification time comes from the odds capture, not the posting timestamp. MLB total writeups include both supplied pitchers/ERAs; no new external research or invented facts.

The optional `DISCORD_RECORD_WEBHOOK` must point to #public-record and be distinct from picks/results/alerts/test/manual. A singleton database entry stores the scoreboard message id. Creation is fenced before the POST; uncertain creation is not repeated. Subsequent ticks PATCH the same message only when the official auto record changes. Missing messages require operator review rather than automatic recreation. Scoring uses the existing immutable auto ledger; manual, live-manual and paper results are excluded. Migration 0025 creates the scoreboard state table. No V2 weights or V3 promotion changed.
