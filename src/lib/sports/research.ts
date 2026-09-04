import type { GameCard } from "./types";

type AiPlay = {
  sport: string;
  gameId: string;
  market: "spread" | "moneyline" | "total";
  selection: string;
  side: "home" | "away" | "over" | "under";
  skip: boolean;
  skipReason?: string;
  reason: string;
  confidence?: number;
};

export async function researchPlays(candidates: GameCard[]): Promise<AiPlay[] | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const payload = candidates.map((g) => ({
    gameId: g.id,
    sport: g.sport,
    matchup: `${g.away.abbr} @ ${g.home.abbr}`,
    kick: g.startAt,
    records: { home: g.home.record, away: g.away.record },
    odds: g.odds,
    ranked: g.rank,
  }));

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(14_000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "You are the senior handicapper for Picks Boat Boyz, a sharp sports betting Discord. One best play per sport, or skip. No guarantees, no hype, no parlays. Reasons are 1-2 sentences, desk tone.",
          },
          {
            role: "user",
            content: `Ranked candidates (JSON). For each sport, keep the ranked play, slightly rewrite the reason, or skip if the edge looks thin/public/trap. Return JSON only: {"plays":[{"sport":"NFL","gameId":"...","market":"spread","selection":"SEA -3.5 (-105)","side":"home","skip":false,"reason":"...","confidence":70}]}\n\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { plays?: AiPlay[] };
    return Array.isArray(parsed.plays) ? parsed.plays : null;
  } catch {
    return null;
  }
}
