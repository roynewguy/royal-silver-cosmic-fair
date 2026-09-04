import { n as clsx } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/utils-WDQvgBy0.js
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function formatAmerican(odds) {
	if (odds == null || !Number.isFinite(odds)) return "—";
	if (odds > 0) return `+${Math.round(odds)}`;
	return String(Math.round(odds));
}
function formatLine(line) {
	if (line == null || !Number.isFinite(line)) return "";
	if (line > 0) return `+${line}`;
	return String(line);
}
function formatUnits(n) {
	const v = Number(n ?? 0);
	if (!Number.isFinite(v)) return "0.00u";
	return `${v > 0 ? "+" : ""}${v.toFixed(2)}u`;
}
function formatKick(iso, timeZone = "America/New_York") {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "TBD";
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	}).format(d);
}
function formatClock(iso, timeZone = "America/New_York") {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "numeric",
		minute: "2-digit"
	}).format(d);
}
function relativeTo(iso, now = Date.now()) {
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "";
	const diff = t - now;
	const mins = Math.round(Math.abs(diff) / 6e4);
	if (mins < 1) return diff >= 0 ? "now" : "just now";
	if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
	const days = Math.round(hours / 24);
	return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}
function profitFromOdds(american, units, result) {
	if (result === "PUSH") return 0;
	if (result === "LOSS") return -units;
	if (american < 0) return 100 / Math.abs(american) * units;
	return american / 100 * units;
}
//#endregion
export { formatLine as a, relativeTo as c, formatKick as i, formatAmerican as n, formatUnits as o, formatClock as r, profitFromOdds as s, cn as t };
