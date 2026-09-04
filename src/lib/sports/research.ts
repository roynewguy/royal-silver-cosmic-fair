import type { GameCard } from "./types";

export type AiPlay = {
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
  const payload = candidates.slice(0, 6).map((g) => ({
    gameId: g.id,
    sport: g.sport,
    matchup: `${g.away.name} @ ${g.home.name}`,
    kick: g.startAt,
    records: { home: g.home.record, away: g.away.record },
    book: g.odds.book,
    oddsSource: g.odds.source,
    odds: {
      homeMl: g.odds.homeMl,
      awayMl: g.odds.awayMl,
      homeSpread: g.odds.homeSpread,
      total: g.odds.total,
    },
    ranked: g.rank,
    injuries: g.injuries,
    notes: g.notes,
    weather: g.weather,
    venue: g.venue,
  }));

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(16_000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 900,
        tools: [{ type: "web_search" }],
        messages: [
          {
            role: "system",
            content:
              "You are the senior handicapper for Picks Boat Boyz. Verify injuries, starters, pitchers, goalies, QBs, and weather with web search when possible. One play per sport or skip. Do not invent numbers. Reasons: 1-2 sentences, desk tone. Return JSON only.",
          },
          {
            role: "user",
            content: `Candidates (JSON). Keep or skip each. If a key injury/starter/weather kills the edge, skip. Return {"plays":[{"sport":"NFL","gameId":"...","market":"spread","selection":"...","side":"home","skip":false,"reason":"...","confidence":70}]}\n\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 422) return researchPlaysNoTools(apiKey, payload);
      return null;
    }
    return parsePlays(await res.json());
  } catch {
    return null;
  }
}

async function researchPlaysNoTools(apiKey: string, payload: unknown): Promise<AiPlay[] | null> {
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Senior handicapper. Use the supplied injuries/notes/weather. Skip thin edges. JSON only.",
          },
          {
            role: "user",
            content: `Return {"plays":[...]}\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    return parsePlays(await res.json());
  } catch {
    return null;
  }
}

function parsePlays(body: unknown): AiPlay[] | null {
  const text =
    (body as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { plays?: AiPlay[] };
    return Array.isArray(parsed.plays) ? parsed.plays : null;
  } catch {
    return null;
  }
}
