# BoatBoyz

One deterministic desk. Up to three qualifying automated plays across the Pacific Time slate. Every official result stays recorded.

**Launch is gated, not assumed.** New automated Discord picks default OFF. Start with `PAPER_MODE=true` and `BOATBOYZ_LIVE_POSTING=false`.

See [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) for the audit findings, exact environment configuration, deployment checklist, known limitations and recovery rules. The previous free-tier setup instructions were replaced because they assumed a single webhook and described obsolete worker behavior.

## Operator flow

- **HOME:** real automation heartbeat, current card, next action, Run now, posting switch state.
- **SLATE:** supported games, qualifying candidates, PASS reasons and manual posting.
- **RECORD:** automated results; separate manual/live filters. Paper never enters the public record.
- **ADVANCED:** preflight, data/model status, settings, paper/research, private logs, settlement review and manual tools.

## Development checks

```
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Use `.env.example` for variable names only. Do not put secrets in source code or GitHub commits. Production requires PostgreSQL; local PGlite is for development.
