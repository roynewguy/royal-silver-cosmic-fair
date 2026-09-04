import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { f as useRouterState, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { o as formatUnits, t as cn } from "./utils-WDQvgBy0.mjs";
import { d as BookOpen, f as Anchor, i as Radio, s as LayoutGrid } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/shell-BLP7sfsD.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide", {
	variants: { tone: {
		muted: "bg-surface-2 text-muted",
		accent: "bg-accent/15 text-accent",
		win: "bg-win/15 text-win",
		loss: "bg-loss/15 text-loss",
		push: "bg-push/15 text-push",
		live: "bg-accent text-accent-fg"
	} },
	defaultVariants: { tone: "muted" }
});
function Badge({ className, tone, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badgeVariants({ tone }), className),
		...props
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var getDesk = createServerFn({ method: "GET" }).handler(createSsrRpc("af873d8ea92d52c8b1a52c6e0a9a43ab935c1729288377a5cbb9c8127834f434"));
var refreshBoard = createServerFn({ method: "POST" }).handler(createSsrRpc("1b7776b4f9e04482c7632a7052025742dd00e22f702bd38f1504feaaa11d54a4"));
var runDesk = createServerFn({ method: "POST" }).handler(createSsrRpc("ce08511ef8c6efb4bfd9d97c04e9e1bbae351b916eb475c623b5e8f1c5bec02c"));
var pushPick = createServerFn({ method: "POST" }).validator((input) => {
	const data = input;
	return {
		pickId: Number(data.pickId),
		webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl.trim() : ""
	};
}).handler(createSsrRpc("3cd1911a2822d1f6577303bd97d8ab192fef9e726414a0ee215a0c5eb06f4578"));
var empty = {
	record: {
		wins: 0,
		losses: 0,
		pushes: 0,
		units: 0,
		pending: 0
	},
	games: [],
	picks: [],
	scans: [],
	log: [],
	lastScanAt: null,
	lastDeskAt: null,
	minEdgePct: 3,
	minConfidence: 58,
	postLeadMinutes: 150
};
var DeskContext = (0, import_react.createContext)(null);
function useDeskController() {
	const qc = useQueryClient();
	const booted = (0, import_react.useRef)(false);
	const query = useQuery({
		queryKey: ["desk"],
		queryFn: () => getDesk(),
		refetchInterval: 6e4
	});
	const refresh = useMutation({
		mutationFn: () => refreshBoard(),
		onSuccess: (data) => {
			qc.setQueryData(["desk"], data);
		},
		onError: () => toast.error("Scan failed. Try again.")
	});
	const run = useMutation({
		mutationFn: () => runDesk(),
		onSuccess: (data) => {
			qc.setQueryData(["desk"], data);
			toast.success("Desk run complete.");
		},
		onError: () => toast.error("Desk run failed.")
	});
	const push = useMutation({
		mutationFn: (input) => pushPick({ data: input }),
		onSuccess: (res) => {
			if (!res.ok) {
				toast.error(res.error ?? "Post failed.");
				return;
			}
			if (res.state) qc.setQueryData(["desk"], res.state);
			toast.success("Posted to #picks.");
		},
		onError: () => toast.error("Post failed.")
	});
	(0, import_react.useEffect)(() => {
		if (booted.current) return;
		if (!query.isSuccess) return;
		booted.current = true;
		if (!query.data.lastScanAt && !refresh.isPending) refresh.mutate();
	}, [
		query.isSuccess,
		query.data?.lastScanAt,
		refresh
	]);
	return {
		data: query.data ?? empty,
		loading: query.isLoading,
		scanning: refresh.isPending,
		running: run.isPending,
		posting: push.isPending,
		refresh: () => refresh.mutate(),
		run: () => run.mutate(),
		push: (input) => push.mutate(input)
	};
}
function DeskProvider({ children }) {
	const value = useDeskController();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskContext.Provider, {
		value,
		children
	});
}
function useDesk() {
	const ctx = (0, import_react.useContext)(DeskContext);
	if (!ctx) throw new Error("useDesk must be used within DeskProvider");
	return ctx;
}
var nav = [
	{
		to: "/",
		label: "Desk",
		icon: Radio
	},
	{
		to: "/slate",
		label: "Slate",
		icon: LayoutGrid
	},
	{
		to: "/ledger",
		label: "Ledger",
		icon: BookOpen
	}
];
function DeskShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskShellInner, { children }) });
}
function DeskShellInner({ children }) {
	const { data } = useDesk();
	const record = data.record;
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const recordLine = `${record.wins}-${record.losses}-${record.pushes}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "harbor-grid min-h-dvh overflow-x-hidden bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-7xl min-w-0 items-center gap-3 px-4 py-3 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/",
							className: "flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Anchor, {
									className: "size-5",
									strokeWidth: 2.2
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block truncate font-display text-lg leading-tight tracking-wide text-fg",
									children: "PICKS BOAT BOYZ"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block text-xs tracking-[0.18em] text-muted uppercase",
									children: "#1 Picks"
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
							className: "ml-auto hidden items-center gap-1 sm:flex",
							children: nav.map((item) => {
								const active = pathname === item.to;
								const Icon = item.icon;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: item.to,
									className: cn("inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150", active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), item.label]
								}, item.to);
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex shrink-0 items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-surface px-3 py-2 shadow-border",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] tracking-[0.16em] text-subtle uppercase",
									children: "Record"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-mono text-sm tabular-nums text-fg",
									children: recordLine
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-surface px-3 py-2 shadow-border",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] tracking-[0.16em] text-subtle uppercase",
									children: "Units"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: cn("font-mono text-sm tabular-nums", record.units > 0 ? "text-win" : record.units < 0 ? "text-loss" : "text-fg"),
									children: formatUnits(record.units)
								})]
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-8",
				children
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-bg/95 backdrop-blur-sm sm:hidden",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-3",
					children: nav.map((item) => {
						const active = pathname === item.to;
						const Icon = item.icon;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: item.to,
							className: cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-accent" : "text-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-5" }), item.label]
						}, item.to);
					})
				})
			})
		]
	});
}
//#endregion
export { DeskShell as n, useDesk as r, Badge as t };
