import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { sqlLocker } from "./sql-locker.ts";
import { sendOnce, type CompletePayload } from "./post-pipeline.ts";
import type { Sql } from "../db.ts";

const body: Omit<CompletePayload, "discordMessageId"> = {
  freezeJson: JSON.stringify({ gameId: "nba:test", modelVersion: "v2-nba", lockedOdds: 125 }),
  discordMessage: "test", selection: "HOME ML", market: "moneyline", side: "home",
  lockedOdds: 125, lockedLine: null, lockedOddsJson: "{}", edgePct: 5,
  confidence: 65, units: 1, modelVersion: "v2-nba", modelProbability: 0.55,
  modelEdge: 5, postedOdds: 125, selectedOdds: 135,
};

test("production SQL: migrations, concurrent claim, pre-send freeze, acknowledgement failure and immutable history", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../../../migrations/", import.meta.url);
    for (const f of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(f, dir), "utf8"));
    }
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, "");
      return (await db.query(query, values)).rows;
    }) as Sql;
    const add = async (key: string, ledger = "official", source = "auto") => {
      const result = await db.query<{id:number}>(`insert into picks
        (game_id,sport,league,matchup,market,selection,side,locked_odds,reason,confidence,edge_pct,status,start_at,post_at,official_key,ledger,pick_source)
        values ($4,'NBA','nba','AWAY @ HOME','moneyline','HOME ML','home',135,'facts',65,5,'queued',now(),now(),$1,$2,$3) returning id`,[key,ledger,source,`nba:${key}`]);
      return result.rows[0].id;
    };
    const id = await add("first");
    const store = sqlLocker(sql);
    let messages = 0;
    const send = async () => {
      const frozen = await db.query<{freeze_json:string;locked_odds:number}>("select freeze_json,locked_odds from picks where id=$1",[id]);
      assert.equal(frozen.rows[0].freeze_json, body.freezeJson);
      assert.equal(frozen.rows[0].locked_odds,125);
      messages++;
      return { ok:true, id:"discord-confirmed" };
    };
    const results = await Promise.all([sendOnce(id,store,send,body),sendOnce(id,store,send,body)]);
    assert.equal(messages,1);
    assert.equal(results.filter(r=>r.sent).length,1);
    await assert.rejects(db.query("update picks set locked_odds=-110 where id=$1",[id]),/immutable/);
    await assert.rejects(db.query("delete from picks where id=$1",[id]),/cannot be deleted/);
    await db.query("update picks set status='graded', result='LOSS',profit_units=-1,graded_at=now() where id=$1",[id]);
    await assert.rejects(db.query("update picks set result='WIN' where id=$1",[id]),/immutable/);
    // Same game/key in paper cannot collide with official history.
    await add("first","paper");
    const uncertain = await add("unknown");
    let attempts = 0;
    const accepted = async () => { attempts++; return {ok:true,id:"accepted-before-db-failure"}; };
    const failing = {...store, complete: async () => { throw new Error("database acknowledgement unavailable"); }};
    const failed = await sendOnce(uncertain,failing,accepted,body);
    assert.equal(failed.uncertain,true);
    assert.equal(await store.status(uncertain),"delivery_unknown");
    await sendOnce(uncertain,store,accepted,body);
    assert.equal(attempts,1);
    // The lease and global daily limit are enforced by the real SQL claim.
    await db.exec("update desk_meta set worker_lock_token='owner',worker_lock_until=now()+interval '6 minutes' where id=1");
    const capped = await add("capped");
    assert.equal(await sqlLocker(sql,{workerToken:"wrong",target:3,ledger:"official"}).claim(capped),null);
    assert.equal(await sqlLocker(sql,{workerToken:"owner",target:2,ledger:"official"}).claim(capped),null);
    assert.ok(await sqlLocker(sql,{workerToken:"owner",target:3,ledger:"official"}).claim(capped));
  } finally { await db.close(); }
});
