import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { o as formatUnits } from "./utils-WDQvgBy0.mjs";
import { n as DeskShell, r as useDesk } from "./shell-AbXw1nMH.mjs";
import { n as PickTicket } from "./pick-ticket-DxqAr9pp.mjs";
import { a as ResponsiveContainer, i as Area, n as YAxis, o as Tooltip, r as XAxis, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ledger-tfOwSpmp.js
var import_jsx_runtime = require_jsx_runtime();
function LedgerPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LedgerBody, {}) });
}
function LedgerBody() {
	const desk = useDesk();
	const graded = desk.data.picks.filter((p) => p.result).slice().sort((a, b) => +new Date(a.gradedAt ?? a.createdAt) - +new Date(b.gradedAt ?? b.createdAt));
	let running = 0;
	const chart = graded.map((p) => {
		running += p.profitUnits ?? 0;
		return {
			name: p.matchup,
			units: Number(running.toFixed(2))
		};
	});
	const bySport = /* @__PURE__ */ new Map();
	for (const pick of graded) {
		const row = bySport.get(pick.sport) ?? {
			w: 0,
			l: 0,
			p: 0,
			u: 0
		};
		if (pick.result === "WIN") row.w += 1;
		else if (pick.result === "LOSS") row.l += 1;
		else row.p += 1;
		row.u += pick.profitUnits ?? 0;
		bySport.set(pick.sport, row);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs tracking-[0.22em] text-accent uppercase",
			children: "Book"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "mt-1 font-display text-4xl tracking-wide",
			children: "Ledger"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 max-w-xl text-sm text-muted",
			children: "Graded WIN / LOSS / PUSH against the number locked at post. The running record updates itself."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-6 grid gap-3 sm:grid-cols-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
					label: "Wins",
					value: String(desk.data.record.wins)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
					label: "Losses",
					value: String(desk.data.record.losses)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
					label: "Pushes",
					value: String(desk.data.record.pushes)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
					label: "Units",
					value: formatUnits(desk.data.record.units),
					hot: desk.data.record.units
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-6 h-56 rounded-xl bg-surface p-4 shadow-border",
			children: chart.length < 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex h-full items-center justify-center text-sm text-muted",
				children: "Grade a few plays and the curve fills in."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
				width: "100%",
				height: "100%",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
					data: chart,
					margin: {
						left: 0,
						right: 8,
						top: 8,
						bottom: 0
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
							id: "unitsFill",
							x1: "0",
							y1: "0",
							x2: "0",
							y2: "1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
								offset: "0%",
								stopColor: "var(--color-accent)",
								stopOpacity: .35
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
								offset: "100%",
								stopColor: "var(--color-accent)",
								stopOpacity: 0
							})]
						}) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
							dataKey: "name",
							hide: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
							width: 40,
							tick: {
								fill: "var(--color-muted)",
								fontSize: 11
							},
							axisLine: false,
							tickLine: false
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, { contentStyle: {
							background: "var(--color-surface)",
							border: "1px solid var(--color-border)",
							borderRadius: 8,
							color: "var(--color-fg)"
						} }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
							type: "monotone",
							dataKey: "units",
							stroke: "var(--color-accent)",
							fill: "url(#unitsFill)",
							strokeWidth: 2
						})
					]
				})
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
			children: [...bySport.entries()].map(([sport, row]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg bg-surface px-4 py-3 shadow-border",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display tracking-wide",
					children: sport
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 font-mono text-sm tabular-nums text-muted",
					children: [
						row.w,
						"-",
						row.l,
						"-",
						row.p,
						" · ",
						formatUnits(row.u)
					]
				})]
			}, sport))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-8 space-y-4",
			children: desk.data.picks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "No tickets yet."
			}) : desk.data.picks.map((pick) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PickTicket, { pick }, pick.id))
		})
	] });
}
function Stat({ label, value, hot }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface px-4 py-3 shadow-border",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[10px] tracking-[0.16em] text-subtle uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: `mt-1 font-mono text-lg tabular-nums ${hot == null ? "text-fg" : hot > 0 ? "text-win" : hot < 0 ? "text-loss" : "text-fg"}`,
			children: value
		})]
	});
}
//#endregion
export { LedgerPage as component };
