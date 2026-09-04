import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { a as formatLine, i as formatKick, n as formatAmerican, s as profitFromOdds } from "./utils-WDQvgBy0.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/api-GEsvREdG.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var _0002_picks_default = "-- Picks Boat Boyz desk: unowned shared rows (no auth).\ncreate table if not exists desk_meta (\n  id integer primary key check (id = 1),\n  min_edge_pct double precision not null default 3.0,\n  min_confidence integer not null default 58,\n  post_lead_minutes integer not null default 150,\n  last_scan_at timestamptz,\n  last_desk_at timestamptz,\n  updated_at timestamptz not null default now()\n);\n\ninsert into desk_meta (id) values (1) on conflict do nothing;\n\ncreate table if not exists games (\n  id text primary key,\n  espn_id text not null,\n  sport text not null,\n  league text not null,\n  start_at timestamptz not null,\n  status text not null,\n  home_team text not null,\n  away_team text not null,\n  home_abbr text not null,\n  away_abbr text not null,\n  home_logo text,\n  away_logo text,\n  home_score integer,\n  away_score integer,\n  home_record text,\n  away_record text,\n  venue text,\n  odds_json text not null default '{}',\n  rank_json text,\n  updated_at timestamptz not null default now()\n);\n\ncreate index if not exists games_sport_start_idx on games (sport, start_at);\ncreate index if not exists games_status_idx on games (status);\n\ncreate table if not exists picks (\n  id serial primary key,\n  game_id text not null,\n  sport text not null,\n  league text not null,\n  matchup text not null,\n  market text not null,\n  selection text not null,\n  side text not null,\n  locked_line double precision,\n  locked_odds integer not null,\n  locked_odds_json text not null default '{}',\n  reason text not null,\n  research text,\n  confidence integer not null,\n  edge_pct double precision not null,\n  units double precision not null default 1,\n  status text not null,\n  result text,\n  profit_units double precision,\n  start_at timestamptz not null,\n  post_at timestamptz not null,\n  posted_at timestamptz,\n  graded_at timestamptz,\n  discord_message text,\n  skip_reason text,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists picks_sport_status_idx on picks (sport, status);\ncreate index if not exists picks_game_id_idx on picks (game_id);\ncreate index if not exists picks_post_at_idx on picks (post_at);\n\ncreate table if not exists desk_log (\n  id serial primary key,\n  kind text not null,\n  sport text,\n  message text not null,\n  created_at timestamptz not null default now()\n);\n\ncreate index if not exists desk_log_created_idx on desk_log (created_at desc);\n";
/**
* Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
* (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
*
* Applied files are keyed by BASENAME, so the same file applies once no matter
* which directory it is globbed from. That is what makes the auth schema safe to
* copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
* a database that already has `0001_auth.sql` will not re-run it.
*
* Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
* out of scope for both until it is copied up.
*/
/**
* The `_migrations` key for a migration path (or bare filename).
* @param {string} path
* @returns {string}
*/
function migrationName(path) {
	return path.split("/").pop() ?? path;
}
/**
* @param {string} path
* @returns {boolean}
*/
function isMigrationFile(path) {
	return path.endsWith(".sql");
}
/**
* Migrations in `paths` that are not yet in `applied`, in apply order.
* Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
* @param {Iterable<string>} paths
* @param {Iterable<string>} applied
* @returns {Array<{ name: string, path: string }>}
*/
function pendingMigrations(paths, applied) {
	const done = new Set(applied);
	return [...paths].filter(isMigrationFile).map((path) => ({
		name: migrationName(path),
		path
	})).sort((a, b) => a.name.localeCompare(b.name)).filter(({ name }) => !done.has(name));
}
var rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : void 0;
var databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : void 0;
/**
* Active backend: real **Neon** when `DATABASE_URL` is set (deployed / configured
* sandbox), otherwise a local embedded **PGLite** (Postgres compiled to WASM) so
* the app has a working database even with nothing configured — the live preview
* included. Swap in Neon later by just setting `DATABASE_URL`; no code changes.
*/
var dbSource = databaseUrl ? "neon" : "pglite";
/**
* Init state lives on globalThis as promises: dev HMR creates new instances of
* this module, and two instances racing module-level state would open a second
* pool or run two concurrent PGLite migration passes (whose duplicate
* `_migrations` insert rejects — and would get memoized, poisoning every later
* `getSql()`). A failed init clears its slot so the next call retries.
*/
var globalRef = globalThis;
/**
* Result-type parity: Postgres sends every value as text plus a type OID — the
* JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
* int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
* JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
* production return identical, JSON-safe shapes:
*   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
*                                   `::text` if you ever need huge integers)
*   date                         -> 'YYYY-MM-DD' string
*   interval                     -> Postgres interval text
* numeric already comes back as a string on both (arbitrary precision).
*/
var OID_INT8 = 20;
var OID_DATE = 1082;
var OID_INTERVAL = 1186;
var identity = (v) => v;
/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run) {
	const sql = (async (strings, ...values) => {
		let text = strings[0];
		for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
		return run(text, values);
	});
	sql.query = (text, params = []) => run(text, params);
	return sql;
}
function createNeonSql() {
	globalRef.__pgSqlPromise__ ??= (async () => {
		const { Pool, types } = await import("../_libs/pg.mjs").then((n) => n.t);
		types.setTypeParser(OID_INT8, Number);
		types.setTypeParser(OID_DATE, identity);
		types.setTypeParser(OID_INTERVAL, identity);
		const pool = new Pool({ connectionString: databaseUrl });
		return toSql(async (text, params) => {
			return (await pool.query(text, params)).rows;
		});
	})().catch((err) => {
		globalRef.__pgSqlPromise__ = void 0;
		throw err;
	});
	return globalRef.__pgSqlPromise__;
}
async function createPgliteSql() {
	globalRef.__pgliteInstance__ ??= (async () => {
		const { PGlite } = await import("../_libs/electric-sql__pglite.mjs").then((n) => n.t);
		const pg = new PGlite({ parsers: {
			[OID_INT8]: Number,
			[OID_DATE]: identity,
			[OID_INTERVAL]: identity
		} });
		await pg.waitReady;
		await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
		return pg;
	})().catch((err) => {
		globalRef.__pgliteInstance__ = void 0;
		throw err;
	});
	const pg = await globalRef.__pgliteInstance__;
	const migrate = async () => {
		const migrations = /* #__PURE__ */ Object.assign({ "/migrations/0002_picks.sql": _0002_picks_default });
		const done = (await pg.query("select name from _migrations")).rows.map((r) => r.name);
		for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) await pg.transaction(async (tx) => {
			await tx.exec(migrations[path]);
			await tx.query("insert into _migrations (name) values ($1)", [name]);
		});
	};
	const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve()).catch(() => void 0).then(migrate);
	globalRef.__pgliteMigrateChain__ = pass;
	await pass;
	return toSql(async (text, params) => {
		return (await pg.query(text, params)).rows;
	});
}
var sqlPromise = null;
async function createSql() {
	if (typeof window !== "undefined") throw new Error("@/lib/db is server-only — call getSql() from a createServerFn handler or a server route loader, never from client code.");
	return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}
/**
* Get the shared, **server-only** SQL client. Neon when `DATABASE_URL` is set,
* otherwise the local PGLite fallback. Memoized — safe to call per request.
*
* Schema comes from `migrations/*.sql`, auto-applied before the first query on
* both backends — define tables there, never inline in server functions.
*/
function getSql() {
	sqlPromise ??= createSql().catch((err) => {
		sqlPromise = null;
		throw err;
	});
	return sqlPromise;
}
/**
* Finish DB bootstrap before the server handles traffic.
*
* - **PGLite** (preview / no `DATABASE_URL`): open the in-memory DB and apply
*   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
* - **Neon**: no-op (pool is created lazily on first query).
*
* Vite `configureServer` awaits this at dev startup; production imports of this
* module kick it off immediately (see bottom of file).
*/
function ensureDbReady() {
	if (dbSource !== "pglite") return Promise.resolve();
	return getSql().then(() => void 0);
}
var globalBoot = globalThis;
if (typeof window === "undefined" && dbSource === "pglite") globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
	globalBoot.__pgBootstrapPromise__ = void 0;
	console.error("[db] PGLite bootstrap failed:", err);
	throw err;
});
var LEAGUES = [
	{
		id: "nfl",
		sport: "NFL",
		espnSport: "football",
		espnLeague: "nfl",
		kind: "spread",
		homeAdv: .03,
		ptsPerWin: 28,
		daily: false,
		lookAheadDays: 8,
		avgTotal: 44.5
	},
	{
		id: "ncaaf",
		sport: "NCAAF",
		espnSport: "football",
		espnLeague: "college-football",
		kind: "spread",
		homeAdv: .035,
		ptsPerWin: 32,
		daily: false,
		lookAheadDays: 5,
		avgTotal: 52
	},
	{
		id: "mlb",
		sport: "MLB",
		espnSport: "baseball",
		espnLeague: "mlb",
		kind: "moneyline",
		homeAdv: .04,
		ptsPerWin: 3.2,
		daily: true,
		lookAheadDays: 2,
		avgTotal: 8.5
	},
	{
		id: "mls",
		sport: "MLS",
		espnSport: "soccer",
		espnLeague: "usa.1",
		kind: "moneyline",
		homeAdv: .08,
		ptsPerWin: 1.4,
		daily: true,
		lookAheadDays: 3,
		avgTotal: null
	},
	{
		id: "epl",
		sport: "EPL",
		espnSport: "soccer",
		espnLeague: "eng.1",
		kind: "moneyline",
		homeAdv: .08,
		ptsPerWin: 1.4,
		daily: true,
		lookAheadDays: 3,
		avgTotal: null
	},
	{
		id: "nhl",
		sport: "NHL",
		espnSport: "hockey",
		espnLeague: "nhl",
		kind: "moneyline",
		homeAdv: .045,
		ptsPerWin: 2.4,
		daily: true,
		lookAheadDays: 3,
		avgTotal: 6
	},
	{
		id: "nba",
		sport: "NBA",
		espnSport: "basketball",
		espnLeague: "nba",
		kind: "spread",
		homeAdv: .04,
		ptsPerWin: 18,
		daily: true,
		lookAheadDays: 3,
		avgTotal: 224
	},
	{
		id: "wnba",
		sport: "WNBA",
		espnSport: "basketball",
		espnLeague: "wnba",
		kind: "spread",
		homeAdv: .04,
		ptsPerWin: 16,
		daily: true,
		lookAheadDays: 3,
		avgTotal: 162
	},
	{
		id: "ncaab",
		sport: "NCAAB",
		espnSport: "basketball",
		espnLeague: "mens-college-basketball",
		kind: "spread",
		homeAdv: .05,
		ptsPerWin: 20,
		daily: true,
		lookAheadDays: 3,
		avgTotal: 142
	},
	{
		id: "ufc",
		sport: "UFC",
		espnSport: "mma",
		espnLeague: "ufc",
		kind: "moneyline",
		homeAdv: 0,
		ptsPerWin: 0,
		daily: false,
		lookAheadDays: 8,
		avgTotal: null
	}
];
var LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));
function parseAmerican(raw) {
	if (raw == null) return null;
	const s = String(raw).trim();
	if (!s) return null;
	if (/^even$/i.test(s)) return 100;
	if (/^off$/i.test(s) || s === "-" || s === "—") return null;
	const n = Number(s.replace(/^\+/, ""));
	if (!Number.isFinite(n) || n === 0) return null;
	return Math.round(n);
}
function parseLine(raw) {
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (raw == null) return null;
	const s = String(raw).trim().replace(/^[ou]/i, "");
	if (!s) return null;
	const n = Number(s.replace(/^\+/, ""));
	return Number.isFinite(n) ? n : null;
}
function impliedFromAmerican(odds) {
	if (odds < 0) return -odds / (-odds + 100);
	return 100 / (odds + 100);
}
function devig(a, b) {
	const ia = impliedFromAmerican(a);
	const ib = impliedFromAmerican(b);
	const s = ia + ib;
	if (s <= 0) return [.5, .5];
	return [ia / s, ib / s];
}
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
function parseWinPct(summary) {
	if (!summary) return null;
	const m = summary.match(/(\d+)\s*-\s*(\d+)/);
	if (!m) return null;
	const w = Number(m[1]);
	const t = w + Number(m[2]);
	if (t < 6) return null;
	return w / t;
}
function selectionLabel(args) {
	const { market, side, homeAbbr, awayAbbr, line, price } = args;
	const juice = formatAmerican(price);
	if (market === "moneyline") return `${side === "home" ? homeAbbr : awayAbbr} ML (${juice})`;
	if (market === "total") return `${side === "over" ? "Over" : "Under"} ${line ?? "—"} (${juice})`;
	return `${side === "home" ? homeAbbr : awayAbbr} ${formatLine(line)} (${juice})`;
}
function hasUsableOdds(odds) {
	return odds.homeMl != null || odds.awayMl != null || odds.homeSpread != null || odds.total != null;
}
function priceFor(odds, market, side) {
	if (market === "moneyline") return side === "home" ? odds.homeMl : odds.awayMl;
	if (market === "total") return side === "over" ? odds.overOdds : odds.underOdds;
	return side === "home" ? odds.homeSpreadOdds : odds.awaySpreadOdds;
}
function lineFor(odds, market, side) {
	if (market === "total") return odds.total;
	if (market === "spread") return side === "home" ? odds.homeSpread : odds.awaySpread;
	return null;
}
function nyDateKey(offsetDays) {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	});
	const shifted = new Date((/* @__PURE__ */ new Date()).getTime() + offsetDays * 864e5);
	return fmt.format(shifted).replaceAll("-", "");
}
function mapStatus(raw, state, completed) {
	if (completed) return "final";
	const s = (raw ?? state ?? "").toLowerCase();
	if (s.includes("final") || s.includes("complete")) return "final";
	if (s.includes("in_progress") || s.includes("in-progress") || state === "in") return "in_progress";
	return "scheduled";
}
function teamFrom(comp) {
	const scoreRaw = comp?.score;
	const score = scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);
	const record = comp?.records?.find((r) => r.type === "total")?.summary ?? comp?.records?.[0]?.summary ?? null;
	if (comp?.athlete) return {
		name: comp.athlete.displayName ?? "TBD",
		abbr: (comp.athlete.shortName ?? comp.athlete.displayName ?? "TBD").slice(0, 12),
		logo: comp.athlete.flag?.href ?? null,
		score: Number.isFinite(score) ? score : null,
		record
	};
	return {
		name: comp?.team?.displayName ?? "TBD",
		abbr: comp?.team?.abbreviation ?? "TBD",
		logo: comp?.team?.logo ?? null,
		score: Number.isFinite(score) ? score : null,
		record
	};
}
function parseOdds(raw) {
	const empty = {
		book: "—",
		details: null,
		homeMl: null,
		awayMl: null,
		homeSpread: null,
		awaySpread: null,
		homeSpreadOdds: null,
		awaySpreadOdds: null,
		total: null,
		overOdds: null,
		underOdds: null,
		openHomeSpread: null,
		openTotal: null,
		openHomeMl: null
	};
	if (!raw) return empty;
	const homeSpread = parseLine(raw.pointSpread?.home?.close?.line) ?? (typeof raw.spread === "number" ? raw.spread : null);
	const awaySpread = parseLine(raw.pointSpread?.away?.close?.line) ?? (homeSpread != null ? -homeSpread : null);
	return {
		book: raw.provider?.displayName ?? raw.provider?.name ?? "DraftKings",
		details: raw.details ?? null,
		homeMl: parseAmerican(raw.moneyline?.home?.close?.odds),
		awayMl: parseAmerican(raw.moneyline?.away?.close?.odds),
		homeSpread,
		awaySpread,
		homeSpreadOdds: parseAmerican(raw.pointSpread?.home?.close?.odds),
		awaySpreadOdds: parseAmerican(raw.pointSpread?.away?.close?.odds),
		total: parseLine(raw.total?.over?.close?.line) ?? parseLine(raw.overUnder),
		overOdds: parseAmerican(raw.total?.over?.close?.odds),
		underOdds: parseAmerican(raw.total?.under?.close?.odds),
		openHomeSpread: parseLine(raw.pointSpread?.home?.open?.line),
		openTotal: parseLine(raw.total?.over?.open?.line),
		openHomeMl: parseAmerican(raw.moneyline?.home?.open?.odds)
	};
}
function eventToGames(event, league) {
	const competitions = event.competitions ?? [];
	const cards = [];
	for (const comp of competitions) {
		const competitors = comp.competitors ?? [];
		const home = competitors.find((c) => c.homeAway === "home") ?? competitors[1];
		const away = competitors.find((c) => c.homeAway === "away") ?? competitors[0];
		if (!home && !away) continue;
		const espnId = String(comp.id ?? event.id ?? "");
		if (!espnId) continue;
		const startAt = comp.date ?? event.date;
		if (!startAt) continue;
		const status = mapStatus(comp.status?.type?.name ?? event.status?.type?.name, comp.status?.type?.state ?? event.status?.type?.state, comp.status?.type?.completed ?? event.status?.type?.completed);
		cards.push({
			id: `${league.id}:${espnId}`,
			espnId,
			sport: league.sport,
			league: league.id,
			startAt,
			status,
			home: teamFrom(home),
			away: teamFrom(away),
			venue: comp.venue?.fullName ?? null,
			odds: parseOdds(comp.odds?.[0]),
			rank: null
		});
	}
	return cards;
}
async function fetchJson(url) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 9e3);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "PicksBoatBoyzDesk/1.0"
			}
		});
		if (!res.ok) throw new Error(`ESPN ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}
function urlsFor(league) {
	const base = `https://site.api.espn.com/apis/site/v2/sports/${league.espnSport}/${league.espnLeague}/scoreboard`;
	const urls = [base];
	if (league.daily) for (let i = 0; i <= league.lookAheadDays; i += 1) urls.push(`${base}?dates=${nyDateKey(i)}`);
	return urls;
}
async function fetchLeagueSlate(league) {
	const urls = urlsFor(league);
	const results = await Promise.allSettled(urls.map((u) => fetchJson(u)));
	const byId = /* @__PURE__ */ new Map();
	for (const result of results) {
		if (result.status !== "fulfilled") continue;
		const payload = result.value;
		for (const event of payload.events ?? []) for (const game of eventToGames(event, league)) byId.set(game.id, game);
	}
	return [...byId.values()];
}
async function fetchAllSlates() {
	const settled = await Promise.allSettled(LEAGUES.map((l) => fetchLeagueSlate(l)));
	const games = [];
	settled.forEach((result) => {
		if (result.status === "fulfilled") games.push(...result.value);
	});
	return games;
}
function inWindow(game, days, now = Date.now()) {
	const t = new Date(game.startAt).getTime();
	if (Number.isNaN(t)) return false;
	const horizon = now + days * 864e5;
	const floor = now - 288e5;
	return t <= horizon && (t >= floor || game.status !== "scheduled");
}
var MIN_EDGE = .03;
var MIN_CONF = 58;
function modelHomeWin(game, league) {
	const hw = parseWinPct(game.home.record);
	const aw = parseWinPct(game.away.record);
	let p = .5 + league.homeAdv;
	if (hw != null && aw != null) p = .5 + (hw - aw) * .38 + league.homeAdv;
	return clamp(p, .18, .82);
}
function juiceImbalance(a, b) {
	if (a == null || b == null) return 0;
	return impliedFromAmerican(a) - impliedFromAmerican(b);
}
function spreadMoveBonus(game) {
	const open = game.odds.openHomeSpread;
	const now = game.odds.homeSpread;
	if (open == null || now == null) return 0;
	return clamp((open - now) * .008, -.02, .02);
}
function rankOne(game, league) {
	if (game.status !== "scheduled") return null;
	if (!hasUsableOdds(game.odds)) return null;
	const start = new Date(game.startAt).getTime();
	if (Number.isNaN(start) || start < Date.now() - 3e5) return null;
	const candidates = [];
	const modelHome = modelHomeWin(game, league);
	const modelAway = 1 - modelHome;
	const expectedMargin = (modelHome - .5) * league.ptsPerWin;
	if (game.odds.homeMl != null && game.odds.awayMl != null) {
		const [fairHome] = devig(game.odds.homeMl, game.odds.awayMl);
		const edgeHome = modelHome - fairHome;
		const edgeAway = modelAway - (1 - fairHome);
		const pickHome = edgeHome >= edgeAway;
		const edge = pickHome ? edgeHome : edgeAway;
		const side = pickHome ? "home" : "away";
		const price = pickHome ? game.odds.homeMl : game.odds.awayMl;
		if (!(Math.abs(price) >= 380 && league.kind === "moneyline") && Math.abs(price) < 900) candidates.push({
			market: "moneyline",
			side,
			selection: selectionLabel({
				market: "moneyline",
				side,
				homeAbbr: game.home.abbr,
				awayAbbr: game.away.abbr,
				line: null,
				price
			}),
			line: null,
			price,
			edgePct: edge * 100,
			confidence: 0,
			why: pickHome ? `${game.home.abbr} prices a touch short of the home-side model.` : `${game.away.abbr} is a number the desk will take versus ${game.home.abbr}.`
		});
	}
	if (league.kind === "spread" && game.odds.homeSpread != null && (game.odds.homeSpreadOdds != null || game.odds.awaySpreadOdds != null)) {
		const line = game.odds.homeSpread;
		if (Math.abs(line) <= 28) {
			const coverHome = expectedMargin - line;
			const homeDog = line > 0;
			const move = spreadMoveBonus(game);
			const juice = juiceImbalance(game.odds.homeSpreadOdds, game.odds.awaySpreadOdds) * .4;
			const edgeHome = coverHome / Math.max(8, league.ptsPerWin * .45) + move + juice + (homeDog ? .012 : 0);
			const pickHome = edgeHome >= 0;
			const edge = Math.abs(edgeHome);
			const side = pickHome ? "home" : "away";
			const price = (pickHome ? game.odds.homeSpreadOdds : game.odds.awaySpreadOdds) ?? -110;
			const playLine = pickHome ? game.odds.homeSpread : game.odds.awaySpread;
			candidates.push({
				market: "spread",
				side,
				selection: selectionLabel({
					market: "spread",
					side,
					homeAbbr: game.home.abbr,
					awayAbbr: game.away.abbr,
					line: playLine,
					price
				}),
				line: playLine,
				price,
				edgePct: edge * 100,
				confidence: 0,
				why: pickHome ? `${game.home.abbr} ${playLine} is a softer number than the projected margin.` : `${game.away.abbr} ${playLine} catches a line the model does not fully respect.`
			});
		}
	}
	if (league.avgTotal != null && game.odds.total != null && game.odds.overOdds != null && game.odds.underOdds != null) {
		const [fairOver] = devig(game.odds.overOdds, game.odds.underOdds);
		const adj = (game.odds.total < league.avgTotal - 1 ? .53 : game.odds.total > league.avgTotal + 1.5 ? .47 : .5) - fairOver - juiceImbalance(game.odds.overOdds, game.odds.underOdds) * .25;
		if (Math.abs(adj) > .025 && Math.abs(game.odds.total - league.avgTotal) >= 1) {
			const pickOver = adj > 0;
			const price = pickOver ? game.odds.overOdds : game.odds.underOdds;
			const side = pickOver ? "over" : "under";
			candidates.push({
				market: "total",
				side,
				selection: selectionLabel({
					market: "total",
					side,
					homeAbbr: game.home.abbr,
					awayAbbr: game.away.abbr,
					line: game.odds.total,
					price
				}),
				line: game.odds.total,
				price,
				edgePct: Math.abs(adj) * 100,
				confidence: 0,
				why: pickOver ? `Total sits under the sport's scoring baseline — slight Over lean.` : `Number is rich versus typical scoring — Under is the side.`
			});
		}
	}
	if (candidates.length === 0) return null;
	const preferred = league.kind;
	candidates.sort((a, b) => {
		const pref = (m) => m.market === preferred ? 1.18 : m.market === "total" ? .82 : 1;
		return b.edgePct * pref(b) - a.edgePct * pref(a);
	});
	const best = candidates[0];
	if (!best) return null;
	const conf = clamp(50 + best.edgePct * 4.2 + (parseWinPct(game.home.record) ? 4 : 0), 48, 88);
	if (best.edgePct < MIN_EDGE * 100 || conf < MIN_CONF) return null;
	return {
		...best,
		confidence: Math.round(conf)
	};
}
function rankGames(games) {
	return games.map((game) => {
		const league = LEAGUE_BY_ID[game.league];
		if (!league) return {
			...game,
			rank: null
		};
		return {
			...game,
			rank: rankOne(game, league)
		};
	});
}
function bestPerSport(games, minEdge = 3, minConf = 58) {
	const bySport = /* @__PURE__ */ new Map();
	for (const g of games) {
		const list = bySport.get(g.league) ?? [];
		list.push(g);
		bySport.set(g.league, list);
	}
	const out = [];
	for (const league of Object.values(LEAGUE_BY_ID)) {
		const slate = (bySport.get(league.id) ?? []).filter((g) => g.status === "scheduled");
		const playable = slate.filter((g) => g.rank && g.rank.edgePct >= minEdge && g.rank.confidence >= minConf);
		playable.sort((a, b) => (b.rank?.edgePct ?? 0) - (a.rank?.edgePct ?? 0));
		const top = playable[0];
		if (!top) out.push({
			pick: slate[0] ?? {
				league: league.id,
				sport: league.sport
			},
			skip: {
				league: league.id,
				sport: league.sport,
				active: slate.length > 0,
				gameCount: slate.length,
				skipped: true,
				skipReason: slate.length === 0 ? "No games in window." : slate.every((g) => !hasUsableOdds(g.odds)) ? "No listed odds — pass." : "No play meets the edge threshold."
			}
		});
		else out.push({
			pick: top,
			skip: {
				league: league.id,
				sport: league.sport,
				active: true,
				gameCount: slate.length,
				skipped: false,
				skipReason: null
			}
		});
	}
	return out;
}
function unitsFor(confidence) {
	if (confidence >= 80) return 2;
	if (confidence >= 72) return 1.5;
	return 1;
}
function gradePick(pick, game) {
	if (game.status !== "final") return null;
	const hs = game.home.score;
	const as = game.away.score;
	if (hs == null || as == null) return null;
	if (pick.market === "moneyline") {
		if (hs === as) return "PUSH";
		return hs > as === (pick.side === "home") ? "WIN" : "LOSS";
	}
	if (pick.market === "total") {
		const total = hs + as;
		const line = pick.lockedLine ?? game.odds.total;
		if (line == null) return null;
		if (total === line) return "PUSH";
		const wentOver = total > line;
		return pick.side === "over" === wentOver ? "WIN" : "LOSS";
	}
	const line = pick.lockedLine;
	if (line == null) return null;
	const margin = pick.side === "home" ? hs + line - as : as + line - hs;
	if (margin === 0) return "PUSH";
	return margin > 0 ? "WIN" : "LOSS";
}
function settle(pick, result) {
	return { profit: profitFromOdds(pick.lockedOdds, pick.units, result) };
}
function buildDiscordMessage(pick, game) {
	const lineBits = [];
	const odds = pick.lockedOddsJson;
	if (odds.homeSpread != null) lineBits.push(`${game?.home.abbr ?? "HOME"} ${formatLine(odds.homeSpread)}`);
	if (odds.total != null) lineBits.push(`O/U ${odds.total}`);
	if (odds.homeMl != null && odds.awayMl != null) lineBits.push(`ML ${formatAmerican(odds.homeMl)} / ${formatAmerican(odds.awayMl)}`);
	const locked = lineBits.length ? lineBits.join(" · ") : `${pick.selection}`;
	const kick = formatKick(pick.startAt);
	return [
		`**${pick.sport} · BEST PLAY**`,
		pick.selection,
		`${pick.matchup} · ${kick}`,
		`Locked at post: ${locked} (${odds.book ?? "book"})`,
		"",
		pick.reason,
		"",
		`_Confidence ${pick.confidence} · ${pick.units}u_`
	].join("\n");
}
function discordWebhookOk(url) {
	try {
		const u = new URL(url);
		if (u.protocol !== "https:") return false;
		const host = u.hostname.toLowerCase();
		if (host !== "discord.com" && host !== "discordapp.com") return false;
		return u.pathname.startsWith("/api/webhooks/");
	} catch {
		return false;
	}
}
async function postWebhook(url, content) {
	if (!discordWebhookOk(url)) return {
		ok: false,
		error: "Webhook URL is not a Discord webhook."
	};
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			username: "Boat Boyz Picks",
			content: content.slice(0, 1800)
		})
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		return {
			ok: false,
			error: `Discord ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`
		};
	}
	return { ok: true };
}
async function researchPlays(candidates) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return null;
	const payload = candidates.map((g) => ({
		gameId: g.id,
		sport: g.sport,
		matchup: `${g.away.abbr} @ ${g.home.abbr}`,
		kick: g.startAt,
		records: {
			home: g.home.record,
			away: g.away.record
		},
		odds: g.odds,
		ranked: g.rank
	}));
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			temperature: .3,
			max_tokens: 900,
			messages: [{
				role: "system",
				content: "You are the senior handicapper for Picks Boat Boyz, a sharp sports betting Discord. One best play per sport, or skip. No guarantees, no hype, no parlays. Reasons are 1-2 sentences, desk tone."
			}, {
				role: "user",
				content: `Ranked candidates (JSON). For each sport, keep the ranked play, slightly rewrite the reason, or skip if the edge looks thin/public/trap. Return JSON only: {"plays":[{"sport":"NFL","gameId":"...","market":"spread","selection":"SEA -3.5 (-105)","side":"home","skip":false,"reason":"...","confidence":70}]}\n\n${JSON.stringify(payload)}`
			}]
		})
	});
	if (!res.ok) return null;
	const match = ((await res.json()).choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[0]);
		return Array.isArray(parsed.plays) ? parsed.plays : null;
	} catch {
		return null;
	}
}
function iso(v) {
	if (v instanceof Date) return v.toISOString();
	if (typeof v === "string") {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? v : d.toISOString();
	}
	return String(v ?? "");
}
function num(v) {
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}
function numOrNull(v) {
	if (v == null || v === "") return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}
function jsonParse(raw, fallback) {
	if (raw && typeof raw === "object") return raw;
	if (typeof raw !== "string" || !raw) return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}
function gameFromRow(row) {
	return {
		id: row.id,
		espnId: row.espn_id,
		sport: row.sport,
		league: row.league,
		startAt: iso(row.start_at),
		status: row.status,
		home: {
			name: row.home_team,
			abbr: row.home_abbr,
			logo: row.home_logo,
			score: numOrNull(row.home_score),
			record: row.home_record
		},
		away: {
			name: row.away_team,
			abbr: row.away_abbr,
			logo: row.away_logo,
			score: numOrNull(row.away_score),
			record: row.away_record
		},
		venue: row.venue,
		odds: jsonParse(row.odds_json, {
			book: "—",
			details: null,
			homeMl: null,
			awayMl: null,
			homeSpread: null,
			awaySpread: null,
			homeSpreadOdds: null,
			awaySpreadOdds: null,
			total: null,
			overOdds: null,
			underOdds: null,
			openHomeSpread: null,
			openTotal: null,
			openHomeMl: null
		}),
		rank: jsonParse(row.rank_json, null)
	};
}
function pickFromRow(row) {
	return {
		id: num(row.id),
		gameId: row.game_id,
		sport: row.sport,
		league: row.league,
		matchup: row.matchup,
		market: row.market,
		selection: row.selection,
		side: row.side,
		lockedLine: numOrNull(row.locked_line),
		lockedOdds: Math.round(num(row.locked_odds)),
		lockedOddsJson: jsonParse(row.locked_odds_json, {
			book: "—",
			details: null,
			homeMl: null,
			awayMl: null,
			homeSpread: null,
			awaySpread: null,
			homeSpreadOdds: null,
			awaySpreadOdds: null,
			total: null,
			overOdds: null,
			underOdds: null,
			openHomeSpread: null,
			openTotal: null,
			openHomeMl: null
		}),
		reason: row.reason,
		research: row.research,
		confidence: Math.round(num(row.confidence)),
		edgePct: num(row.edge_pct),
		units: num(row.units),
		status: row.status,
		result: row.result ?? null,
		profitUnits: numOrNull(row.profit_units),
		startAt: iso(row.start_at),
		postAt: iso(row.post_at),
		postedAt: row.posted_at ? iso(row.posted_at) : null,
		gradedAt: row.graded_at ? iso(row.graded_at) : null,
		discordMessage: row.discord_message,
		skipReason: row.skip_reason,
		createdAt: iso(row.created_at),
		homeLogo: row.home_logo ?? null,
		awayLogo: row.away_logo ?? null,
		homeAbbr: row.home_abbr ?? null,
		awayAbbr: row.away_abbr ?? null,
		homeScore: numOrNull(row.home_score),
		awayScore: numOrNull(row.away_score),
		gameStatus: row.game_status ?? null
	};
}
async function upsertGames(games) {
	const sql = await getSql();
	for (const g of games) await sql`
      insert into games (
        id, espn_id, sport, league, start_at, status,
        home_team, away_team, home_abbr, away_abbr, home_logo, away_logo,
        home_score, away_score, home_record, away_record, venue, odds_json, rank_json, updated_at
      ) values (
        ${g.id}, ${g.espnId}, ${g.sport}, ${g.league}, ${g.startAt}, ${g.status},
        ${g.home.name}, ${g.away.name}, ${g.home.abbr}, ${g.away.abbr}, ${g.home.logo}, ${g.away.logo},
        ${g.home.score}, ${g.away.score}, ${g.home.record}, ${g.away.record}, ${g.venue},
        ${JSON.stringify(g.odds)}, ${g.rank ? JSON.stringify(g.rank) : null}, now()
      )
      on conflict (id) do update set
        status = excluded.status,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        home_record = excluded.home_record,
        away_record = excluded.away_record,
        odds_json = excluded.odds_json,
        rank_json = excluded.rank_json,
        venue = excluded.venue,
        updated_at = now()
    `;
}
async function loadGames() {
	return (await (await getSql())`
    select * from games
    where start_at > now() - interval '10 days'
    order by start_at asc
  `).map(gameFromRow);
}
async function loadPicks() {
	return (await (await getSql())`
    select p.*, g.home_logo, g.away_logo, g.home_abbr, g.away_abbr,
           g.home_score, g.away_score, g.status as game_status
    from picks p
    left join games g on g.id = p.game_id
    order by p.created_at desc
    limit 80
  `).map(pickFromRow);
}
async function loadRecord() {
	const r = (await (await getSql())`
    select
      count(*) filter (where result = 'WIN') as wins,
      count(*) filter (where result = 'LOSS') as losses,
      count(*) filter (where result = 'PUSH') as pushes,
      coalesce(sum(profit_units) filter (where result is not null), 0) as units,
      count(*) filter (where status in ('queued','posted') and result is null) as pending
    from picks
  `)[0];
	return {
		wins: num(r?.wins),
		losses: num(r?.losses),
		pushes: num(r?.pushes),
		units: num(r?.units),
		pending: num(r?.pending)
	};
}
async function loadLog() {
	return (await (await getSql())`select id, kind, sport, message, created_at from desk_log order by id desc limit 24`).map((r) => ({
		id: num(r.id),
		kind: r.kind,
		sport: r.sport,
		message: r.message,
		createdAt: iso(r.created_at)
	}));
}
async function addLog(kind, message, sport) {
	const sql = await getSql();
	await sql`insert into desk_log (kind, sport, message) values (${kind}, ${sport ?? null}, ${message})`;
	await sql`delete from desk_log where id < (select coalesce(max(id), 0) - 200 from desk_log)`;
}
async function touchScan(kind) {
	const sql = await getSql();
	if (kind === "desk") await sql`update desk_meta set last_scan_at = now(), last_desk_at = now(), updated_at = now() where id = 1`;
	else await sql`update desk_meta set last_scan_at = now(), updated_at = now() where id = 1`;
}
async function loadMeta() {
	const r = (await (await getSql())`select last_scan_at, last_desk_at, min_edge_pct, min_confidence, post_lead_minutes from desk_meta where id = 1`)[0];
	return {
		lastScanAt: r?.last_scan_at ? iso(r.last_scan_at) : null,
		lastDeskAt: r?.last_desk_at ? iso(r.last_desk_at) : null,
		minEdgePct: num(r?.min_edge_pct) || 3,
		minConfidence: Math.round(num(r?.min_confidence) || 58),
		postLeadMinutes: Math.round(num(r?.post_lead_minutes) || 150)
	};
}
function scansFrom(games, picks) {
	return LEAGUES.map((league) => {
		const slate = games.filter((g) => g.league === league.id);
		const live = picks.find((p) => p.sport === league.sport && (p.status === "queued" || p.status === "posted") && !p.result);
		const scheduled = slate.filter((g) => g.status === "scheduled");
		if (live) return {
			league: league.id,
			sport: league.sport,
			active: true,
			gameCount: scheduled.length,
			skipped: false,
			skipReason: null
		};
		if (scheduled.length === 0) return {
			league: league.id,
			sport: league.sport,
			active: slate.length > 0,
			gameCount: slate.length,
			skipped: true,
			skipReason: "No games in window."
		};
		const ranked = scheduled.filter((g) => g.rank);
		return {
			league: league.id,
			sport: league.sport,
			active: true,
			gameCount: scheduled.length,
			skipped: ranked.length === 0,
			skipReason: ranked.length === 0 ? "No strong play." : null
		};
	});
}
async function readDesk() {
	const [games, picks, record, log, meta] = await Promise.all([
		loadGames(),
		loadPicks(),
		loadRecord(),
		loadLog(),
		loadMeta()
	]);
	return {
		record,
		games,
		picks,
		scans: scansFrom(games, picks),
		log,
		lastScanAt: meta.lastScanAt,
		lastDeskAt: meta.lastDeskAt,
		minEdgePct: meta.minEdgePct,
		minConfidence: meta.minConfidence,
		postLeadMinutes: meta.postLeadMinutes
	};
}
async function livePickForSport(sport) {
	const rows = await (await getSql())`
    select * from picks
    where sport = ${sport} and status in ('queued','posted') and result is null
    order by created_at desc
    limit 1
  `;
	return rows[0] ? pickFromRow(rows[0]) : null;
}
async function pickByGame(gameId) {
	const rows = await (await getSql())`
    select * from picks
    where game_id = ${gameId} and status in ('queued','posted','graded')
    order by created_at desc
    limit 1
  `;
	return rows[0] ? pickFromRow(rows[0]) : null;
}
function postAtFor(startAt, leadMinutes) {
	const t = new Date(startAt).getTime() - leadMinutes * 6e4;
	return new Date(t).toISOString();
}
async function gradeOpenPicks(games) {
	const sql = await getSql();
	const open = await sql`
    select id, game_id, market, side, locked_line, locked_odds, units, status
    from picks
    where result is null and status in ('queued','posted')
  `;
	const byId = new Map(games.map((g) => [g.id, g]));
	let graded = 0;
	const now = Date.now();
	for (const row of open) {
		const game = byId.get(row.game_id);
		if (!game) continue;
		const start = new Date(game.startAt).getTime();
		if (row.status === "queued" && start <= now) {
			await sql`
        update picks
        set status = 'skipped', skip_reason = 'Game started before the post window.'
        where id = ${row.id}
      `;
			await addLog("skip", "Missed the post window — game already underway.", game.sport);
			continue;
		}
		const fake = {
			id: row.id,
			gameId: row.game_id,
			sport: game.sport,
			league: game.league,
			matchup: `${game.away.abbr} @ ${game.home.abbr}`,
			market: row.market,
			selection: "",
			side: row.side,
			lockedLine: row.locked_line,
			lockedOdds: row.locked_odds,
			lockedOddsJson: game.odds,
			reason: "",
			research: null,
			confidence: 0,
			edgePct: 0,
			units: Number(row.units),
			status: "posted",
			result: null,
			profitUnits: null,
			startAt: game.startAt,
			postAt: game.startAt,
			postedAt: null,
			gradedAt: null,
			discordMessage: null,
			skipReason: null,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			homeLogo: null,
			awayLogo: null,
			homeAbbr: game.home.abbr,
			awayAbbr: game.away.abbr,
			homeScore: game.home.score,
			awayScore: game.away.score,
			gameStatus: game.status
		};
		const result = gradePick(fake, game);
		if (!result) continue;
		const { profit } = settle(fake, result);
		await sql`
      update picks
      set status = 'graded', result = ${result}, profit_units = ${profit}, graded_at = now()
      where id = ${row.id}
    `;
		await addLog("grade", `${fake.matchup} ${result}${profit >= 0 ? ` +${profit.toFixed(2)}u` : ` ${profit.toFixed(2)}u`}`, game.sport);
		graded += 1;
	}
	return graded;
}
async function flushDuePosts(games, leadMinutes) {
	const sql = await getSql();
	const due = await sql`
    select id, game_id from picks
    where status = 'queued' and post_at <= now() and start_at > now()
  `;
	const byId = new Map(games.map((g) => [g.id, g]));
	let posted = 0;
	for (const row of due) {
		const game = byId.get(row.game_id);
		const pick = (await sql`select * from picks where id = ${row.id}`)[0];
		if (!pick) continue;
		const odds = game?.odds;
		const market = pick.market;
		const side = pick.side;
		const lockedOdds = odds ? priceFor(odds, market, side) ?? pick.locked_odds : pick.locked_odds;
		const lockedLine = odds ? lineFor(odds, market, side) : pick.locked_line;
		const selection = game && odds ? selectionLabel({
			market,
			side,
			homeAbbr: game.home.abbr,
			awayAbbr: game.away.abbr,
			line: lockedLine,
			price: lockedOdds
		}) : pick.selection;
		const asRow = {
			id: pick.id,
			gameId: row.game_id,
			sport: pick.sport,
			league: pick.league,
			matchup: pick.matchup,
			market,
			selection,
			side,
			lockedLine,
			lockedOdds,
			lockedOddsJson: odds ?? {
				book: "—",
				details: null,
				homeMl: null,
				awayMl: null,
				homeSpread: null,
				awaySpread: null,
				homeSpreadOdds: null,
				awaySpreadOdds: null,
				total: null,
				overOdds: null,
				underOdds: null,
				openHomeSpread: null,
				openTotal: null,
				openHomeMl: null
			},
			reason: pick.reason,
			research: null,
			confidence: pick.confidence,
			edgePct: pick.edge_pct,
			units: pick.units,
			status: "posted",
			result: null,
			profitUnits: null,
			startAt: String(pick.start_at),
			postAt: String(pick.post_at),
			postedAt: (/* @__PURE__ */ new Date()).toISOString(),
			gradedAt: null,
			discordMessage: null,
			skipReason: null,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			homeLogo: game?.home.logo ?? null,
			awayLogo: game?.away.logo ?? null,
			homeAbbr: game?.home.abbr ?? null,
			awayAbbr: game?.away.abbr ?? null,
			homeScore: null,
			awayScore: null,
			gameStatus: game?.status ?? "scheduled"
		};
		const message = buildDiscordMessage(asRow, game);
		await sql`
      update picks set
        status = 'posted',
        posted_at = now(),
        selection = ${selection},
        locked_odds = ${lockedOdds},
        locked_line = ${lockedLine},
        locked_odds_json = ${JSON.stringify(asRow.lockedOddsJson)},
        discord_message = ${message}
      where id = ${pick.id}
    `;
		await addLog("post", `Posted ${selection} · ${pick.matchup}`, pick.sport);
		posted += 1;
	}
	return posted;
}
async function refreshInternal() {
	const ranked = rankGames((await fetchAllSlates()).filter((g) => {
		return inWindow(g, LEAGUE_BY_ID[g.league]?.lookAheadDays ?? 3);
	}));
	await upsertGames(ranked);
	await (await getSql())`delete from games where start_at < now() - interval '14 days'`;
	await touchScan("scan");
	const games = await loadGames();
	await flushDuePosts(games, (await (await import("./store-CHv-TSu1.mjs")).loadMeta()).postLeadMinutes);
	await gradeOpenPicks(games);
	await addLog("scan", `Scanned ${ranked.length} games across the board.`);
	return games;
}
var getDesk_createServerFn_handler = createServerRpc({
	id: "af873d8ea92d52c8b1a52c6e0a9a43ab935c1729288377a5cbb9c8127834f434",
	name: "getDesk",
	filename: "src/lib/desk/api.ts"
}, (opts) => getDesk.__executeServer(opts));
var getDesk = createServerFn({ method: "GET" }).handler(getDesk_createServerFn_handler, async () => {
	return readDesk();
});
var refreshBoard_createServerFn_handler = createServerRpc({
	id: "1b7776b4f9e04482c7632a7052025742dd00e22f702bd38f1504feaaa11d54a4",
	name: "refreshBoard",
	filename: "src/lib/desk/api.ts"
}, (opts) => refreshBoard.__executeServer(opts));
var refreshBoard = createServerFn({ method: "POST" }).handler(refreshBoard_createServerFn_handler, async () => {
	await refreshInternal();
	return readDesk();
});
var runDesk_createServerFn_handler = createServerRpc({
	id: "ce08511ef8c6efb4bfd9d97c04e9e1bbae351b916eb475c623b5e8f1c5bec02c",
	name: "runDesk",
	filename: "src/lib/desk/api.ts"
}, (opts) => runDesk.__executeServer(opts));
var runDesk = createServerFn({ method: "POST" }).handler(runDesk_createServerFn_handler, async () => {
	const games = await refreshInternal();
	const meta = await (await import("./store-CHv-TSu1.mjs")).loadMeta();
	const decisions = bestPerSport(games, meta.minEdgePct, meta.minConfidence);
	const candidates = decisions.filter((d) => !d.skip.skipped && d.pick.rank).map((d) => d.pick);
	const ai = candidates.length ? await researchPlays(candidates) : null;
	const sql = await getSql();
	for (const decision of decisions) {
		if (decision.skip.skipped) {
			await addLog("skip", `${decision.skip.sport}: ${decision.skip.skipReason}`, decision.skip.sport);
			continue;
		}
		const game = decision.pick;
		const rank = game.rank;
		if (!rank) continue;
		const existingGame = await pickByGame(game.id);
		if (existingGame && (existingGame.status === "posted" || existingGame.status === "graded")) continue;
		const live = await livePickForSport(game.sport);
		if (live && live.status === "posted") continue;
		const aiPlay = ai?.find((p) => p.gameId === game.id || p.sport === game.sport);
		if (aiPlay?.skip) {
			await addLog("skip", `${game.sport}: ${aiPlay.skipReason ?? "Desk passed."}`, game.sport);
			if (live && live.status === "queued") await sql`update picks set status = 'skipped', skip_reason = ${aiPlay.skipReason ?? "Desk passed."} where id = ${live.id}`;
			continue;
		}
		const reason = (aiPlay?.reason ?? rank.why).trim().slice(0, 420);
		const confidence = Math.round(aiPlay?.confidence ?? rank.confidence);
		const units = unitsFor(confidence);
		const postAt = postAtFor(game.startAt, meta.postLeadMinutes);
		const matchup = `${game.away.abbr} @ ${game.home.abbr}`;
		const snapshot = JSON.stringify(game.odds);
		if (live && live.status === "queued") await sql`
        update picks set
          game_id = ${game.id},
          league = ${game.league},
          matchup = ${matchup},
          market = ${rank.market},
          selection = ${rank.selection},
          side = ${rank.side},
          locked_line = ${rank.line},
          locked_odds = ${rank.price},
          locked_odds_json = ${snapshot},
          reason = ${reason},
          research = ${ai ? reason : null},
          confidence = ${confidence},
          edge_pct = ${rank.edgePct},
          units = ${units},
          start_at = ${game.startAt},
          post_at = ${postAt}
        where id = ${live.id}
      `;
		else await sql`
        insert into picks (
          game_id, sport, league, matchup, market, selection, side,
          locked_line, locked_odds, locked_odds_json, reason, research,
          confidence, edge_pct, units, status, start_at, post_at
        ) values (
          ${game.id}, ${game.sport}, ${game.league}, ${matchup}, ${rank.market}, ${rank.selection}, ${rank.side},
          ${rank.line}, ${rank.price}, ${snapshot}, ${reason}, ${ai ? reason : null},
          ${confidence}, ${rank.edgePct}, ${units}, 'queued', ${game.startAt}, ${postAt}
        )
      `;
		await addLog("research", `${game.sport} ${rank.selection} queued · posts ${postAt}`, game.sport);
	}
	await touchScan("desk");
	await flushDuePosts(await loadGames(), meta.postLeadMinutes);
	return readDesk();
});
var pushPick_createServerFn_handler = createServerRpc({
	id: "3cd1911a2822d1f6577303bd97d8ab192fef9e726414a0ee215a0c5eb06f4578",
	name: "pushPick",
	filename: "src/lib/desk/api.ts"
}, (opts) => pushPick.__executeServer(opts));
var pushPick = createServerFn({ method: "POST" }).validator((input) => {
	const data = input;
	return {
		pickId: Number(data.pickId),
		webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : ""
	};
}).handler(pushPick_createServerFn_handler, async ({ data }) => {
	const sql = await getSql();
	const pick = (await sql`select id, discord_message, selection, matchup, sport, status from picks where id = ${data.pickId}`)[0];
	if (!pick) return {
		ok: false,
		error: "Pick not found."
	};
	const content = pick.discord_message ?? `${pick.sport} · ${pick.selection}\n${pick.matchup}`;
	if (pick.status === "queued") {
		await sql`update picks set status = 'posted', posted_at = now(), discord_message = ${content} where id = ${pick.id}`;
		await addLog("post", `Manual post ${pick.selection} · ${pick.matchup}`, pick.sport);
	}
	if (data.webhookUrl) {
		const sent = await postWebhook(data.webhookUrl, content);
		if (!sent.ok) return {
			ok: false,
			error: sent.error ?? "Webhook failed."
		};
	}
	return {
		ok: true,
		state: await readDesk()
	};
});
//#endregion
export { loadLog as a, loadRecord as c, readDesk as d, scansFrom as f, getDesk_createServerFn_handler, loadGames as i, pickByGame as l, upsertGames as m, gameFromRow as n, loadMeta as o, touchScan as p, pushPick_createServerFn_handler, livePickForSport as r, refreshBoard_createServerFn_handler, runDesk_createServerFn_handler, loadPicks as s, addLog as t, pickFromRow as u };
