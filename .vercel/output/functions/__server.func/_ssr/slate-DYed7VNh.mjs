import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { a as formatLine, i as formatKick, n as formatAmerican } from "./utils-WDQvgBy0.mjs";
import { n as DeskShell, r as useDesk, t as Badge } from "./shell-BLP7sfsD.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/slate-DYed7VNh.js
var import_jsx_runtime = require_jsx_runtime();
function SlatePage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlateBody, {}) });
}
function SlateBody() {
	const desk = useDesk();
	const sports = [...new Set(desk.data.games.map((g) => g.sport))];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs tracking-[0.22em] text-accent uppercase",
			children: "Odds board"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "mt-1 font-display text-4xl tracking-wide",
			children: "The slate"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 max-w-xl text-sm text-muted",
			children: "Live DraftKings numbers via ESPN. Ranked edges show on the right. No play is posted from here — the desk still has to lock it."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-6 space-y-8",
			children: [sports.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "Scan the desk to load today’s games."
			}) : null, sports.map((sport) => {
				const games = desk.data.games.filter((g) => g.sport === sport).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mb-3 font-display text-xl tracking-wide",
					children: sport
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto rounded-xl bg-surface shadow-border",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full min-w-[44rem] text-left text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-[11px] tracking-[0.14em] text-subtle uppercase",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-b border-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-4 py-3 font-medium",
										children: "Matchup"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-3 py-3 font-medium",
										children: "Kick"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-3 py-3 font-medium",
										children: "Spread"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-3 py-3 font-medium",
										children: "Total"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-3 py-3 font-medium",
										children: "ML"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "px-3 py-3 font-medium",
										children: "Rank"
									})
								]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: games.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-b border-border last:border-0",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "px-4 py-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [
											g.away.logo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
												src: g.away.logo,
												alt: "",
												className: "size-6 object-contain"
											}) : null,
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "text-fg",
												children: [
													g.away.abbr,
													" @ ",
													g.home.abbr
												]
											}),
											g.home.logo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
												src: g.home.logo,
												alt: "",
												className: "size-6 object-contain"
											}) : null,
											g.status === "in_progress" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
												tone: "accent",
												children: "LIVE"
											}) : null,
											g.status === "final" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "FINAL" }) : null
										]
									}), g.status !== "scheduled" && g.home.score != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 font-mono text-xs tabular-nums text-muted",
										children: [
											g.away.abbr,
											" ",
											g.away.score,
											" · ",
											g.home.abbr,
											" ",
											g.home.score
										]
									}) : null]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 font-mono text-xs text-muted tabular-nums",
									children: formatKick(g.startAt)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 font-mono text-xs tabular-nums",
									children: g.odds.homeSpread != null ? `${g.home.abbr} ${formatLine(g.odds.homeSpread)} ${formatAmerican(g.odds.homeSpreadOdds)}` : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 font-mono text-xs tabular-nums",
									children: g.odds.total != null ? `${g.odds.total} ${formatAmerican(g.odds.overOdds)}` : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3 font-mono text-xs tabular-nums",
									children: g.odds.homeMl != null ? `${g.home.abbr} ${formatAmerican(g.odds.homeMl)}` : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-3",
									children: g.rank ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-accent",
										children: g.rank.selection
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-xs text-subtle",
										children: [
											g.rank.edgePct.toFixed(1),
											"% · ",
											g.rank.confidence
										]
									})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-subtle",
										children: "Pass"
									})
								})
							]
						}, g.id)) })]
					})
				})] }, sport);
			})]
		})
	] });
}
//#endregion
export { SlatePage as component };
