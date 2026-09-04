# Picks Boat Boyz

Official desk for **#1 Picks Boat Boyz Picks**.

**GitHub:** [roynewguy/royal-silver-cosmic-fair](https://github.com/roynewguy/royal-silver-cosmic-fair)

Last synced from Grok: **2026-09-04**.

Scans the day’s slates, pulls live odds, ranks matchups, locks **one best play per sport** (or skips), posts 2–3 hours before kick with a short reason, freezes the exact line, then grades WIN / LOSS / PUSH.

## This repo is the main one

When you tell Grok `push this to GitHub`, it updates **this** repository.

## Desk loop

1. Scan active sports
2. Rank vs the market
3. Research the top of the card
4. Queue one play per sport (skip thin edges)
5. Auto-post to Discord when the 2–3h window hits
6. Freeze odds at post time
7. Grade WIN / LOSS / PUSH and roll the record

Webhook URL stays in desk settings, not in committed files.
