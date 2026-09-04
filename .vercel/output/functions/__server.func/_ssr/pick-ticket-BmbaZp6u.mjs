import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { a as formatLine, c as relativeTo, i as formatKick, n as formatAmerican, t as cn } from "./utils-WDQvgBy0.mjs";
import { l as Copy, r as Send, u as Clock3 } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as Badge } from "./shell-BLP7sfsD.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/pick-ticket-BmbaZp6u.js
var import_jsx_runtime = require_jsx_runtime();
var buttonVariants = cva("inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,color] duration-150 ease-out enabled:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:opacity-90",
			secondary: "bg-surface-2 text-fg shadow-border hover:bg-surface",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface",
			danger: "bg-loss text-fg hover:opacity-90"
		},
		size: {
			sm: "h-9 rounded-sm px-3 text-sm",
			md: "h-11 rounded-md px-4 text-sm",
			lg: "h-12 rounded-md px-5 text-base",
			icon: "size-11 rounded-md"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, asChild, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
function resultTone(result) {
	if (result === "WIN") return "win";
	if (result === "LOSS") return "loss";
	if (result === "PUSH") return "push";
	return "muted";
}
function PickTicket({ pick, onPost, posting }) {
	const statusLabel = pick.result ?? (pick.status === "posted" ? "POSTED" : pick.status === "queued" ? "QUEUED" : pick.status.toUpperCase());
	async function copy() {
		const text = pick.discordMessage ?? `${pick.sport} · ${pick.selection}\n${pick.reason}`;
		await navigator.clipboard.writeText(text);
		toast.success("Copied pick copy.");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "overflow-hidden rounded-xl bg-surface p-2 shadow-border",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "ticket rounded-lg px-5 py-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-display text-xs tracking-[0.22em] text-ticket-ink/60 uppercase",
						children: [
							pick.sport,
							" · ",
							pick.market
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mt-1 font-display text-2xl leading-none tracking-wide text-ticket-ink",
						children: pick.selection
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-ticket-ink/70",
						children: pick.matchup
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: resultTone(pick.result),
					className: "shrink-0",
					children: statusLabel
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-ticket-ink/70",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Kick ", formatKick(pick.startAt)] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Post ", relativeTo(pick.postAt)] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [pick.units, "u"] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Conf ", pick.confidence] })
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "px-3 pt-3 pb-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm leading-relaxed text-muted",
					children: pick.reason
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock3, { className: "size-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						"Locked ",
						pick.market === "total" ? String(pick.lockedLine ?? "—") : formatLine(pick.lockedLine),
						" ",
						formatAmerican(pick.lockedOdds),
						" · ",
						pick.lockedOddsJson.book
					] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "secondary",
						size: "sm",
						onClick: copy,
						className: "min-h-11 flex-1 sm:flex-none",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), "Copy"]
					}), onPost && pick.status !== "graded" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "primary",
						size: "sm",
						onClick: onPost,
						disabled: posting,
						className: cn("min-h-11 flex-1 sm:flex-none"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "size-4" }), pick.status === "posted" ? "Send webhook" : "Post now"]
					}) : null]
				})
			]
		})]
	});
}
//#endregion
export { PickTicket as n, Button as t };
