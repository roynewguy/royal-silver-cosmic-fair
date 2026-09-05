import { getSql } from "@/lib/db";
import { accuracy, brier, type EvalRow } from "./evaluate.ts";
import { v2HomeProbability } from "./v2-prob.ts";

export type ModelSlice = {
  n: number;
  brier: number | null;
  accuracy: number | null;
  avgClv: number | null;
};

export type ShadowCompare = {
  league: string;
  n: number;
  v2: ModelSlice;
  v3: ModelSlice;
  note: string;
};

function slice(rows: EvalRow[], clvs: number[]): ModelSlice {
  return {
    n: rows.length,
    brier: rows.length ? brier(rows) : null,
    accuracy: rows.length ? accuracy(rows) : null,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}

export async function loadShadowCompare(league = "mlb"): Promise<ShadowCompare | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      v2_p: number | null;
      v2_side: string;
      v2_market: string;
      v2_clv: number | null;
      v3_p: number;
      v3_clv: number | null;
      home_win: number;
    }>`
      select
        p.model_probability as v2_p,
        p.side as v2_side,
        p.market as v2_market,
        p.clv as v2_clv,
        s.probability as v3_p,
        s.clv as v3_clv,
        case when s.result = 'home' then 1 else 0 end as home_win
      from research_shadow s
      join picks p on p.game_id = s.game_id
      where s.kind = 'canonical'
        and s.result is not null
        and p.model_version like 'v2-%'
        and p.status in ('posted','graded')
        and p.market = 'moneyline'
        and p.league = ${league}
        and p.model_probability is not null
    `;
    const v2: EvalRow[] = [];
    const v3: EvalRow[] = [];
    const v2clv: number[] = [];
    const v3clv: number[] = [];
    for (const r of rows) {
      const hp = v2HomeProbability({ market: r.v2_market, side: r.v2_side, modelProbability: r.v2_p });
      if (hp == null) continue;
      v2.push({ p: hp, y: r.home_win, stakePrice: null, closePrice: null });
      v3.push({ p: r.v3_p, y: r.home_win, stakePrice: null, closePrice: null });
      if (r.v2_clv != null) v2clv.push(Number(r.v2_clv));
      if (r.v3_clv != null) v3clv.push(Number(r.v3_clv));
    }
    return {
      league,
      n: v2.length,
      v2: slice(v2, v2clv),
      v3: slice(v3, v3clv),
      note: "Only games with both a V2 official moneyline probability and a frozen V3 canonical shadow. Not a promotion signal.",
    };
  } catch {
    return null;
  }
}
