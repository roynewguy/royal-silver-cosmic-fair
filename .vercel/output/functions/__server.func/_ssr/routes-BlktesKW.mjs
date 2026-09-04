import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { c as relativeTo, i as formatKick, r as formatClock, t as cn } from "./utils-WDQvgBy0.mjs";
import { a as Radar, c as Hash, n as Ship, o as LoaderCircle } from "../_libs/lucide-react.mjs";
import { n as DeskShell, r as useDesk, t as Badge } from "./shell-BLP7sfsD.mjs";
import { n as PickTicket, t as Button } from "./pick-ticket-BmbaZp6u.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BlktesKW.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg shadow-border", "placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70", className),
		...props
	});
}
function Skeleton({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("animate-pulse rounded-md bg-surface-2", className) });
}
function ChannelFeed({ picks, log }) {
	const posted = picks.filter((p) => p.status === "posted" || p.status === "graded");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex min-h-[28rem] flex-col overflow-hidden rounded-xl bg-bg-elevated shadow-border",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center gap-2 border-b border-border px-4 py-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hash, { className: "size-4 text-muted" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm font-medium text-fg",
				children: "picks"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-subtle",
				children: "Boat Boyz radio · auto-posts 2.5h before kick"
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "channel-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4",
			children: [
				posted.length === 0 && log.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "No posts yet. Run the desk to queue the board."
				}) : null,
				posted.map((pick) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "flex gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent font-display text-xs text-accent-fg",
						children: "BB"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-sm font-medium text-fg",
									children: "Boat Boyz Picks"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[11px] text-subtle tabular-nums",
									children: pick.postedAt ? formatClock(pick.postedAt) : relativeTo(pick.postAt)
								}),
								pick.result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: pick.result === "WIN" ? "win" : pick.result === "LOSS" ? "loss" : "push",
									children: pick.result
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: "accent",
									children: "LIVE"
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
							className: "mt-1 font-sans text-sm leading-relaxed whitespace-pre-wrap text-muted",
							children: pick.discordMessage ?? `${pick.sport} · ${pick.selection}\n${pick.reason}`
						})]
					})]
				}, pick.id)),
				log.slice(0, 8).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-subtle",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono tabular-nums",
							children: relativeTo(entry.createdAt)
						}),
						" · ",
						entry.sport ? `${entry.sport} · ` : "",
						entry.message
					]
				}, entry.id))
			]
		})]
	});
}
function SportRail({ scans, picks }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:flex lg:flex-col",
		children: scans.map((scan) => {
			const live = picks.find((p) => p.sport === scan.sport && (p.status === "queued" || p.status === "posted") && !p.result);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("min-w-[9.5rem] rounded-lg bg-surface px-3 py-3 shadow-border sm:min-w-0", live ? "ring-1 ring-accent/40" : ""),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display tracking-wide text-fg",
						children: scan.sport
					}), live ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: "accent",
						children: "PLAY"
					}) : scan.skipped ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: "muted",
						children: "SKIP"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: "muted",
						children: scan.gameCount
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-xs text-subtle",
					children: live ? live.selection : scan.skipReason ? scan.skipReason : `${scan.gameCount} on the board`
				})]
			}, scan.league);
		})
	});
}
var WEBHOOK_KEY = "boat-boyz-discord-webhook";
function DeskHq() {
	const desk = useDesk();
	const [webhook, setWebhook] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		try {
			setWebhook(localStorage.getItem(WEBHOOK_KEY) ?? "");
		} catch {}
	}, []);
	function saveWebhook(value) {
		setWebhook(value);
		try {
			if (value) localStorage.setItem(WEBHOOK_KEY, value);
			else localStorage.removeItem(WEBHOOK_KEY);
		} catch {}
	}
	const queued = desk.data.picks.filter((p) => p.status === "queued" || p.status === "posted");
	const busy = desk.scanning || desk.running;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs tracking-[0.22em] text-accent uppercase",
						children: "Command desk"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-1 font-display text-4xl tracking-wide text-fg sm:text-5xl",
						children: "Today's board"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-xl text-sm leading-relaxed text-muted",
						children: "Scan every live sport, rank the number, research the top of the card, and lock one play per sport. Thin edges get skipped. Odds freeze the moment a pick hits #picks."
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-2 sm:flex-row",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "secondary",
						onClick: () => desk.refresh(),
						disabled: busy,
						className: "min-h-12",
						children: [desk.scanning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: "size-4" }), "Scan odds"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => desk.run(),
						disabled: busy,
						className: "min-h-12",
						children: [desk.running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ship, { className: "size-4" }), "Run the desk"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, {
						label: "Last scan",
						value: desk.data.lastScanAt ? relativeTo(desk.data.lastScanAt) : "—"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, {
						label: "Post window",
						value: `${desk.data.postLeadMinutes / 60}h pre-kick`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meta, {
						label: "Edge floor",
						value: `${desk.data.minEdgePct}% · conf ${desk.data.minConfidence}`
					})
				]
			}),
			desk.loading || busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-28" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-28" })]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_22rem]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 space-y-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-sm tracking-[0.18em] text-muted uppercase",
							children: "Sports"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SportRail, {
							scans: desk.data.scans,
							picks: desk.data.picks
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-sm tracking-[0.18em] text-muted uppercase",
								children: "Best plays"
							}),
							queued.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl bg-surface px-5 py-8 shadow-border",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-display text-xl text-fg",
									children: "No locks queued"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-sm text-muted",
									children: "Hit Run the desk. Sports without a real edge stay dark."
								})]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-4",
								children: queued.map((pick) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PickTicket, {
									pick,
									posting: desk.posting,
									onPost: () => desk.push({
										pickId: pick.id,
										webhookUrl: webhook || void 0
									})
								}, pick.id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upcoming, { games: desk.data.games })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChannelFeed, {
							picks: desk.data.picks,
							log: desk.data.log
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl bg-surface p-4 shadow-border",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-medium text-fg",
									children: "Discord webhook"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-xs text-subtle",
									children: "Optional. Stored only on this device. Posts from the desk never save the URL."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									className: "mt-3",
									type: "password",
									autoComplete: "off",
									placeholder: "https://discord.com/api/webhooks/…",
									value: webhook,
									onChange: (e) => saveWebhook(e.target.value)
								})
							]
						})]
					})
				]
			})
		]
	});
}
function Meta({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface px-4 py-3 shadow-border",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[10px] tracking-[0.16em] text-subtle uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 font-mono text-sm break-words tabular-nums text-fg",
			children: value
		})]
	});
}
function Upcoming({ games }) {
	const upcoming = games.filter((g) => g.status === "scheduled").slice().sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)).slice(0, 8);
	if (upcoming.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: "mb-3 font-display text-sm tracking-[0.18em] text-muted uppercase",
		children: "Next kickoffs"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-border",
		children: upcoming.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "flex items-center gap-3 px-4 py-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TeamMark, {
					src: g.away.logo,
					name: g.away.abbr
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-subtle",
					children: "@"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TeamMark, {
					src: g.home.logo,
					name: g.home.abbr
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "truncate text-sm text-fg",
						children: [
							g.away.abbr,
							" @ ",
							g.home.abbr
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-subtle",
						children: [
							g.sport,
							" · ",
							formatKick(g.startAt)
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "max-w-[9rem] truncate font-mono text-xs text-muted tabular-nums sm:max-w-none",
					children: g.odds.details ?? "No line"
				})
			]
		}, g.id))
	})] });
}
function TeamMark({ src, name }) {
	if (!src) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-muted",
		children: name.slice(0, 2)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src,
		alt: "",
		className: "size-7 object-contain"
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskHq, {}) });
}
//#endregion
export { Home as component };
