# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

This is the GitHub home for the Grok-built desk. Scan the day’s slates, pull live odds, rank matchups, lock **one best play per sport** (or skip if nothing is sharp), post 2–3 hours before kick, freeze the exact line, then grade WIN / LOSS / PUSH.

**Repo:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

## You don’t need Git commands

Stay in Grok chat. Tell Grok to update **this** repo.

### Save the latest desk (Grok → GitHub)

- `push this to GitHub`
- `update royal-silver-cosmic-fair`

### Pull GitHub into the live desk (GitHub → Grok)

- `pull from GitHub`
- `use the GitHub version`

## Do not commit secrets

Keep these out of GitHub:

- Discord webhook URL
- operator PIN
- API keys

Those live in desk settings, not in this repo.

## Layout

| Path | What it is |
| --- | --- |
| `src/components/desk/` | HQ board, tickets, sport rail, channel |
| `src/lib/sports/` | ESPN odds, ranker, research, Discord, grading |
| `src/lib/desk/` | Scan / run desk / store |
| `migrations/0002_picks.sql` | Games, picks, logs |
| `src/routes/` | Board, slate, ledger |
